import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from 'yaml';
import { LearningService } from '../../src/core/service';
import { LegacyUpgrade } from '../../src/core/migration';
import { DEFAULT_SETTINGS, type VaultPort, type Settings, type Card, type Excerpt, FlowError, validPath } from '../../src/core/model';
import { frontmatter, parseRecord, serialize, END } from '../../src/core/markdown';
export class MemoryVault implements VaultPort {
  files = new Map<string,string>(); reads = 0; failCreate = ''; failProcess = ''; processes = new Map<string,Promise<void>>();
  list() { return [...this.files].map(([path,text]) => ({ path, legacy: /类型: (?:PDF学习|.*错题卡|PDF记忆卡片)/.test(text), knownKind: /study_flow_kind: (\w+)/.exec(text)?.[1] })); }
  exists(path: string) { return this.files.has(path); }
  async read(path: string) { this.reads++; const text = this.files.get(path); if (text === undefined) throw Error('missing'); return text; }
  async create(path: string,text: string) { if (path === this.failCreate || this.exists(path)) throw Error('create failed'); this.files.set(path,text); }
  async process(path: string, transform: (text: string) => string) {
    const prior = this.processes.get(path) ?? Promise.resolve();
    const operation = prior.catch(() => {}).then(async () => { if (path === this.failProcess) throw Error('process failed'); this.files.set(path,transform(await this.read(path))); });
    this.processes.set(path,operation); await operation;
  }
  async createBinary(path: string,_bytes: ArrayBuffer) { await this.create(path,'binary'); }
  async remove(path: string) { this.files.delete(path); }
}
const yaml = { parse, stringify };
function environment() { const vault = new MemoryVault(), settings = structuredClone(DEFAULT_SETTINGS); return { vault, settings, service: new LearningService(vault,yaml,()=>settings) }; }
const selection = { pdfPath: '03_PDF/demo.pdf', title: 'demo', page: 2, totalPages: 12, subpath: '#page=2&selection=0,0,1,4', text: '主动回忆的原文。' };
test('concurrent capture creates one book and one excerpt; changed source keeps a new snapshot', async () => {
  const { service } = environment();
  const [a,b] = await Promise.all([service.capture(selection),service.capture(selection)]);
  assert.equal(a.id,b.id); assert.equal(service.index.books().length,1); assert.equal(service.index.excerpts().length,1);
  await service.capture({...selection,text:'修订后的原文'}); assert.equal(service.index.excerpts().length,2);
});
test('invalid selection and malformed paths fail before writing', async () => {
  const { vault, service } = environment();
  for (const path of ['../secret','C:/data','A//B','CON/file','folder./a']) assert.throws(()=>validPath(path));
  await assert.rejects(()=>service.capture({...selection,subpath:'#page=4&selection=0,0,1,4'}),FlowError);
  assert.equal(vault.files.size,0);
});
test('reflection preserves freeform notes and rejects an external editing conflict', async () => {
  const { vault,service } = environment(), saved = await service.capture(selection);
  const first = await service.read(saved.id) as Excerpt;
  await vault.process(first.path, text=>text+'\n## 自由笔记\n保留我。\n');
  await service.saveReflection(first.id,'自己的理解',first.revision);
  assert.match(await vault.read(first.path),/保留我/);
  await assert.rejects(()=>service.saveReflection(first.id,'过时的编辑',first.revision), e=>e instanceof FlowError && e.code==='conflict');
  assert.equal((await service.read(first.id) as Excerpt).reflection,'自己的理解');
});
test('draft questions are frontmatter only; publishing validates fields and reads custom separators', async () => {
  const { service,vault } = environment(); const card=service.newCard(); card.question='==不要复习的草稿==\n::\n?';
  await service.saveCard(card);
  const text=await vault.read(card.path), body=frontmatter(text,yaml).body;
  assert.doesNotMatch(body,/#flashcards|==|::|\n\?\n/);
  await assert.rejects(()=>service.saveCard({...card,status:'active'}),FlowError);
  const parsed=await service.read(card.id) as Card;
  await service.saveCard({...parsed,status:'active',answer:'答案',separator:';;'},parsed.revision);
  assert.match(await vault.read(card.path),/\n;;\n/);
});
test('editing a reviewed card retains ID, file, free text and SM2/FSRS schedule bytes', async () => {
  for (const schedule of ['<!--SR:!2026-10-07,4,250-->','<!--SR:!FSRS,2026-10-07T08:00:00.000Z,4,5.2,4.1,2,0,0,2026-10-03T08:00:00.000Z-->']) {
    const { service,vault }=environment(); const result=await service.capture(selection);
    const excerpt=await service.read(result.id) as Excerpt;
    const card={...service.newCard(excerpt),question:'问题',answer:'答案',status:'active' as const};
    await service.saveCard(card);
    const editing=await service.read(card.id) as Card;
    await vault.process(card.path,text=>text.replace(END,`${schedule}\n\n${END}`)+'\n保留额外笔记');
    await service.saveCard({...editing,question:'改过的问题',answer:'改过的答案',deckTag:'flashcards/新分类'},editing.revision);
    const after=await service.read(card.id) as Card;
    assert.equal(after.path,card.path); assert.equal(after.id,card.id); assert.equal(after.schedule,schedule);
    assert.match(await vault.read(card.path),/保留额外笔记/);
    const body=frontmatter(await vault.read(card.path),yaml).body;
    assert.ok(body.indexOf('来源 / Source')>body.indexOf('\n?\n'));
    assert.match(body,/摘录与理解/);
  }
});
test('automatic progress stays with its captured PDF and never marks a book finished', async () => {
  const { service }=environment();
  await service.ensureBook(selection); const other={...selection,pdfPath:'03_PDF/other.pdf',title:'other'}; await service.ensureBook(other);
  await Promise.all([service.saveProgress({...selection,page:12}),service.saveProgress({...other,page:8})]);
  assert.equal(service.index.books().find(b=>b.pdfPath===selection.pdfPath)?.page,12);
  assert.equal(service.index.books().find(b=>b.pdfPath===other.pdfPath)?.page,8);
  assert.equal(service.index.books().find(b=>b.pdfPath===selection.pdfPath)?.status,'reading');
  assert.equal(await service.saveProgress({...selection,pdfPath:'03_PDF/not-started.pdf'}),null);
});
test('PDF rename repairs book and card source without changing schedule', async()=>{
  const { service }=environment(); const result=await service.capture(selection), excerpt=await service.read(result.id) as Excerpt;
  const card={...service.newCard(excerpt),status:'active' as const,question:'问题',answer:'答案',schedule:'<!--SR:!2026-10-07,4,250-->'};
  await service.saveCard(card); await service.renamePdf(selection.pdfPath,'03_PDF/renamed.pdf');
  const changed=await service.read(card.id) as Card;
  assert.match(changed.source,/^03_PDF\/renamed.pdf#/); assert.equal(changed.schedule,card.schedule);
});
function legacy(vault:MemoryVault) {
  vault.files.set('02_PDF学习/读书/demo-学习卡.md','---\n类型: PDF学习\nPDF文件: "[[03_PDF/demo.pdf]]"\n分类: 读书\n当前页: 2\n总页数: 12\n---\n# demo\n\n> [!success] 继续阅读\n> [[03_PDF/demo.pdf#page=2]]\n\n## 摘录与理解\n\n> [!PDF|记忆] [[03_PDF/demo.pdf#page=2&selection=0,0,1,4|p.2]]\n> 主动回忆的原文。\n>\n> **我的小结：**\n> 我的理解\n\n## 自由笔记\n保留这个段落。');
  vault.files.set('01_记忆卡片/legacy.md','---\n类型: PDF记忆卡片\n创建日期: "2026-10-04"\n---\n# 中性标题\n\n#flashcards/读书/要点\n\n问题\n?\n答案\n<br>\n来源：[[03_PDF/demo.pdf#page=2&selection=0,0,1,4|回到原文]]\n<!--SR:!2026-10-07,4,250-->\n');
}
test('upgrade preview writes nothing; repeated upgrade and restoration preserve originals',async()=>{
  const { service,vault }=environment(); legacy(vault); const originals=new Map(vault.files), upgrade=new LegacyUpgrade(service);
  const plan=await upgrade.preview(); assert.deepEqual([plan.books,plan.excerpts,plan.cards],[1,1,1]); assert.deepEqual(vault.files,originals);
  const backup=await upgrade.apply(plan); assert.equal((await upgrade.preview()).changes.length,0);
  assert.match(await vault.read('01_记忆卡片/legacy.md'),/<!--SR:!2026-10-07,4,250-->/);
  assert.match(await vault.read('02_PDF学习/读书/demo-学习卡.md'),/保留这个段落/);
  assert.equal(service.index.cards()[0]?.excerptId,service.index.excerpts()[0]?.id);
  await upgrade.restore(backup); for(const [path,text] of originals) assert.equal(await vault.read(path),text);
  assert.equal(service.index.excerpts().length,0);
});
test('upgrade and restore preflight every file before changing anything',async()=>{
  const { service,vault }=environment(); legacy(vault); const upgrade=new LegacyUpgrade(service), plan=await upgrade.preview();
  vault.files.set('01_记忆卡片/legacy.md',vault.files.get('01_记忆卡片/legacy.md')+'\nlater edit');
  await assert.rejects(()=>upgrade.apply(plan),FlowError); assert.ok(![...vault.files.keys()].some(p=>p.startsWith('StudyFlow/upgrade-backups/')));
  const backup=await upgrade.apply(await upgrade.preview()); const bookBefore=await vault.read('02_PDF学习/读书/demo-学习卡.md');
  vault.files.set('01_记忆卡片/legacy.md',vault.files.get('01_记忆卡片/legacy.md')+'\nnew edit');
  await assert.rejects(()=>upgrade.restore(backup),FlowError); assert.equal(await vault.read('02_PDF学习/读书/demo-学习卡.md'),bookBefore);
});
test('1,000 excerpt index: updating one file reads only that file; disposed listeners stay silent',async()=>{
  const { service,vault }=environment(); const now='2026-10-05';
  for(let i=0;i<1000;i++) { const e:Excerpt={id:String(i),kind:'excerpt',revision:'',path:`02_PDF学习/摘录/${i}.md`,bookId:'book',page:1,subpath:'#page=1&selection=0,0,0,1',quote:'原文',reflection:'',state:'inbox',fingerprint:String(i),createdAt:now,updatedAt:now}; vault.files.set(e.path,serialize(e,yaml)); }
  await service.index.initialize(); assert.equal(service.index.excerpts().length,1000);
  const reads=vault.reads; await service.index.refresh('02_PDF学习/摘录/20.md'); assert.equal(vault.reads-reads,1);
  let callbacks=0;service.index.subscribe(()=>callbacks++);service.index.dispose();await service.index.refresh('02_PDF学习/摘录/20.md');assert.equal(callbacks,0);
});
