import { type Book, type Excerpt, type Card, digest, FlowError, safeName, validPath } from './model';
import { frontmatter, serialize, unwrapLink, START, END, parseRecord } from './markdown';
import { LearningService } from './service';
export interface UpgradeChange { path: string; before: string | null; after: string; label: string; }
export interface UpgradePlan { changes: UpgradeChange[]; skipped: string[]; books: number; excerpts: number; cards: number; }
export class LegacyUpgrade {
  constructor(private service: LearningService) {}
  async preview(): Promise<UpgradePlan> {
    const { vault, yaml, settings } = this.service;
    const plan: UpgradePlan = { changes: [], skipped: [], books: 0, excerpts: 0, cards: 0 };
    const books: Book[] = [...this.service.index.books()];
    for (const info of vault.list().filter(f => !f.path.startsWith('StudyFlow/upgrade-backups/') && f.path.endsWith('.md') && (f.legacy || f.path.startsWith(settings().cardFolder + '/') || settings().pdfCategories.some(c => f.path.startsWith(c.folder + '/'))))) {
      const text = await vault.read(info.path);
      let data: { [key: string]: unknown }, body: string;
      try { ({ data, body } = frontmatter(text, yaml)); } catch { plan.skipped.push(info.path); continue; }
      if (data.study_flow_id) continue;
      if (data['类型'] === 'PDF学习') {
        const pdfPath = unwrapLink(data['PDF文件']);
        if (!pdfPath) { plan.skipped.push(info.path); continue; }
        const id = 'legacy-' + (await digest([info.path, pdfPath])).slice(0,24);
        const book: Book = { id, kind: 'book', path: info.path, revision: '', pdfPath, title: info.path.split('/').pop()?.replace(/-学习卡(?:-\d+)?\.md$/, '') ?? 'PDF',
          category: String(data['分类'] ?? settings().defaultCategory), page: Math.max(1, Number(data['当前页']) || 1), totalPages: Number(data['总页数']) || 0,
          lastReadAt: String(data['上次阅读'] ?? ''), status: data['状态'] === '已读完' ? 'done' : data['状态'] === '暂停' ? 'paused' : 'reading' };
        books.push(book); plan.books++;
        plan.changes.push({ path: book.path, before: text, after: serialize(book, yaml, text), label: 'book' });
        const blocks = [...body.matchAll(/^> \[!PDF(?:\|[^\]\r\n]+)?\][^\r\n]*(?:\r?\n>[^\r\n]*)*/gm)];
        for (const match of blocks) {
          const lines = match[0].replace(/\r\n/g, '\n').split('\n');
          const target = /\[\[([^|\]]+)/.exec(lines[0] ?? '')?.[1];
          const subpath = target?.slice(target.indexOf('#')) ?? '';
          const params = new URLSearchParams(subpath.replace(/^#/, ''));
          if (!target || !subpath.includes('selection=') || unwrapLink(target) !== pdfPath) { plan.skipped.push(`${info.path}: excerpt`); continue; }
          const summaryAt = lines.findIndex(line => /^> \*\*我的小结：\*\*/.test(line));
          const quote = lines.slice(1, summaryAt < 0 ? undefined : summaryAt).map(line => line.replace(/^> ?/, '')).join('\n').trim();
          const reflection = summaryAt < 0 ? '' : lines.slice(summaryAt + 1).map(line => line.replace(/^> ?/, '')).join('\n').trim();
          const page = Number(params.get('page')) || 1;
          const fingerprint = await digest([id, page, params.get('selection'), quote]);
          const excerptId = 'legacy-' + fingerprint.slice(0,24);
          const excerpt: Excerpt = { id: excerptId, kind: 'excerpt', path: `${settings().excerptFolder}/${safeName(book.title)}-p${page}-${fingerprint.slice(0,8)}.md`, revision: '',
            bookId: id, quote, reflection, page, subpath, fingerprint, state: reflection ? 'understood' : 'inbox', createdAt: book.lastReadAt, updatedAt: book.lastReadAt, legacySource: info.path };
          if (vault.exists(excerpt.path)) { const existing = parseRecord(excerpt.path, await vault.read(excerpt.path), yaml); if (existing?.id !== excerpt.id) throw new FlowError('conflict', 'Upgrade output already exists.'); continue; }
          if (!plan.changes.some(c => c.path === excerpt.path)) { plan.excerpts++; plan.changes.push({ path: excerpt.path, before: null, after: serialize(excerpt, yaml), label: 'excerpt' }); }
        }
      } else if (['PDF记忆卡片','文字错题卡','截图错题卡','记忆卡片'].includes(String(data['类型']))) {
        const lines = body.split('\n'), separators = lines.map((line,i) => line.trim() === '?' ? i : -1).filter(i => i >= 0);
        const tagAt = lines.findIndex(line => /^#flashcards\/[^\s]+$/.test(line.trim()));
        if (separators.length !== 1 || tagAt < 0) { plan.skipped.push(info.path); continue; }
        const at = separators[0]!;
        let qStart = tagAt + 1; while (!lines[qStart]?.trim() && qStart < at) qStart++;
        let qEnd = at; while (!lines[qEnd - 1]?.trim() && qEnd > qStart) qEnd--;
        const sourceAt = lines.findIndex((line,i) => i > at && /^(?:来源|Source)[:：]/.test(line));
        const scheduleAt = lines.findIndex((line,i) => i > at && /<!--(?:SR:| study-flow:)/.test(line));
        let aEnd = Math.min(...[sourceAt, scheduleAt, lines.length].filter(i => i >= 0));
        while (aEnd > at + 1 && (!lines[aEnd - 1]?.trim() || lines[aEnd - 1] === '<br>')) aEnd--;
        if (qEnd <= qStart || aEnd <= at + 1) { plan.skipped.push(info.path); continue; }
        const id = 'legacy-' + (await digest([info.path])).slice(0,24);
        const source = sourceAt >= 0 ? /\[\[([^|\]]+)/.exec(lines[sourceAt] ?? '')?.[1] ?? '' : '';
        Object.assign(data, { study_flow_schema: 1, study_flow_kind: 'card', study_flow_id: id, study_flow_state: 'active', study_flow_card_type: data['类型'] === '截图错题卡' ? 'screenshot' : data['类型'] === 'PDF记忆卡片' ? 'pdf' : 'text',
          study_flow_deck: lines[tagAt]?.trim().slice(1), study_flow_source: source, study_flow_separator: '?', study_flow_created_at: String(data['创建日期'] ?? ''), study_flow_updated_at: String(data['创建日期'] ?? '') });
        const wrapped = [START, ...lines.slice(0,qStart), '<!-- study-flow:question:start -->', ...lines.slice(qStart,qEnd), '<!-- study-flow:question:end -->', ...lines.slice(qEnd,at+1),
          '<!-- study-flow:answer:start -->', ...lines.slice(at+1,aEnd), '<!-- study-flow:answer:end -->', ...lines.slice(aEnd), END].join('\n');
        plan.changes.push({ path: info.path, before: text, after: `---\n${yaml.stringify(data).trimEnd()}\n---\n${wrapped}`, label: 'card' }); plan.cards++;
      }
    }
    // Associate existing PDF cards with books/excerpts without changing their answers or schedules.
    for (const change of plan.changes.filter(c => c.label === 'card')) {
      const parsed = parseRecord(change.path, change.after, yaml) as Card;
      const book = books.find(b => parsed.source.startsWith(b.pdfPath + '#'));
      if (!book) continue;
      const { data, body } = frontmatter(change.after, yaml);
      data.study_flow_book = book.id;
      const params = new URLSearchParams(parsed.source.slice(parsed.source.indexOf('#')+1));
      const excerpt = plan.changes.filter(c => c.label === 'excerpt').map(c => parseRecord(c.path,c.after,yaml) as Excerpt)
        .find(e => e.bookId === book.id && new URLSearchParams(e.subpath.slice(1)).get('selection') === params.get('selection') && e.page === Number(params.get('page')));
      if (excerpt) { data.study_flow_excerpt = excerpt.id; data.study_flow_excerpt_path = excerpt.path; }
      change.after = `---\n${yaml.stringify(data).trimEnd()}\n---\n${body}`;
    }
    return plan;
  }
  async apply(plan: UpgradePlan): Promise<string> {
    const { vault } = this.service;
    for (const change of plan.changes) {
      if (change.before === null ? vault.exists(change.path) : !vault.exists(change.path) || await vault.read(change.path) !== change.before) throw new FlowError('conflict', 'Files changed after preview. Preview the upgrade again.');
    }
    const folder = `StudyFlow/upgrade-backups/${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}`;
    for (const change of plan.changes) if (change.before !== null) await vault.create(`${folder}/${change.path}`, change.before);
    await vault.create(`${folder}/manifest.json`, JSON.stringify(plan.changes.map(c => ({ path: c.path, existed: c.before !== null, after: c.after })), null, 2));
    for (const change of plan.changes) {
      if (change.before === null) await vault.create(change.path, change.after);
      else await vault.process(change.path, current => { if (current !== change.before) throw new FlowError('conflict', 'File changed during upgrade. Backups are available.'); return change.after; });
      await this.service.index.refresh(change.path);
    }
    await this.service.refreshShelf();
    return folder;
  }
  async restore(folder: string): Promise<void> {
    const { vault } = this.service;
    validPath(folder);
    if (!folder.startsWith('StudyFlow/upgrade-backups/')) throw new FlowError('invalid', 'Choose a Study Flow upgrade backup.');
    const manifest: unknown = JSON.parse(await vault.read(`${folder}/manifest.json`));
    if (!Array.isArray(manifest)) throw new FlowError('invalid', 'Invalid upgrade backup.');
    const changes = manifest as { path: string; existed: boolean; after: string }[];
    for (const change of changes) {
      validPath(change.path);
      if (typeof change.existed !== 'boolean' || typeof change.after !== 'string') throw new FlowError('invalid', 'Invalid upgrade backup entry.');
      if (vault.exists(change.path)) {
        const current = await vault.read(change.path);
        const original = change.existed ? await vault.read(`${folder}/${change.path}`) : null;
        if (current !== change.after && current !== original) throw new FlowError('conflict', 'A learning file changed after upgrade. Restore would overwrite it.');
      }
    }
    for (const change of changes) {
      if (change.existed) {
        const original = await vault.read(`${folder}/${change.path}`);
        if (vault.exists(change.path)) await vault.process(change.path, current => { if (current !== change.after && current !== original) throw new FlowError('conflict','File changed during restore.'); return original; });
        else await vault.create(change.path, original);
      } else if (vault.exists(change.path)) await vault.remove(change.path);
      await this.service.index.refresh(change.path);
    }
    await this.service.refreshShelf();
  }
}
