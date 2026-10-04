const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '../starter-vault'), scripts = path.join(root,'StudyFlow/scripts');
const cards=require(path.join(scripts,'错题卡工具.js')), pdf=require(path.join(scripts,'PDF学习工具.js'));
const config=require(path.join(scripts,'配置工具.js'));
function mockApp() {
 const files=new Map();
 const app={
  vault:{adapter:{getFullPath:n=>path.join(root,n)},getAbstractFileByPath:n=>files.get(n)?.file,
   getFiles:()=>[...files.values()].map(x=>x.file).filter(x=>x.extension),
   getMarkdownFiles:()=>[...files.values()].map(x=>x.file).filter(x=>x.extension==='md'),
   createFolder:async n=>{files.set(n,{file:{path:n},content:''});},
   create:async(n,content)=>{assert.ok(!files.has(n));const file={path:n,basename:path.basename(n,path.extname(n)),extension:path.extname(n).slice(1)};files.set(n,{file,content});return file;},
   read:async f=>files.get(f.path).content,modify:async(f,c)=>{files.get(f.path).content=c;},
   process:async(f,cb)=>{files.get(f.path).content=cb(files.get(f.path).content);}},
  metadataCache:{getFileCache:f=>{
   const fm={};for(const line of ((files.get(f.path)?.content||'').match(/^---\n([\s\S]*?)\n---/)?.[1]||'').split('\n')){
    const m=/^([^ :]+): (.*)$/.exec(line);if(!m)continue;try{fm[m[1]]=JSON.parse(m[2]);}catch{fm[m[1]]=m[2];}}
   return{frontmatter:fm};},getFirstLinkpathDest:n=>files.get(n)?.file},
  workspace:{getActiveFile:()=>null,getLeaf:()=>({openFile:async()=>{}})},plugins:{plugins:{},getPlugin:()=>null}};
 return {app,files};
}
function modalEnvironment(values){
 const controls=[];
 class El{constructor(tag,options={}){Object.assign(this,{tag,options,style:{},value:'',checked:false,events:{}});controls.push(this);}
  createEl(t,o){return new El(t,o);}createDiv(o){return new El('div',o);}addEventListener(n,f){this.events[n]=f;}appendText(){}focus(){}empty(){}}
 class Modal{constructor(){this.contentEl=new El('div');this.modalEl={style:{}};}setTitle(){}
  open(){this.onOpen();if(!values)return this.close();const s=controls.find(x=>x.options.attr?.['aria-label']==='我的小结（必填）');s.value=values.summary;
   controls.find(x=>x.options.attr?.type==='checkbox').checked=!!values.createMemory;
   controls.find(x=>x.options.attr?.['aria-label']==='记忆卡片的问题').value=values.question||'';s.events.input();
   const save=controls.find(x=>x.options.text==='保存原文和小结');if(save.disabled)this.close();else save.events.click();}
  close(){this.onClose();}}
 return{Modal,Notice:class{}};
}
test('portable config rejects escaping and ambiguous paths',()=>{
 config.validateConfig(JSON.parse(fs.readFileSync(path.join(root,'StudyFlow/config.json'))));
 for(const p of ['../secret','/tmp/output','A/../B','C:\\file','A#page','A//B'])assert.throws(()=>config.validatePath(p));
});
test('paragraphs cannot split cards; screenshot header cannot reveal answer',()=>{
 const text=cards.buildCard({title:'截图错题',question:'![[a.png]]\n问题',answer:'第一段\n\n第二段\n?',deckTag:'flashcards/概念'});
 assert.equal(text.split('\n').filter(x=>x==='?').length,1);assert.match(text,/第一段\n<br>\n第二段/);
 assert.equal(text.split('\n').find(x=>x.startsWith('# ')),'# 截图错题');
 assert.throws(()=>cards.buildCard({question:'Q',answer:'\u200b ',deckTag:'flashcards/概念'}));
});
test('source cards deduplicate; manual cards safely handle filename collisions',async()=>{
 const{app}=mockApp(),options={question:'为什么？',answer:'理解',deckTag:'flashcards/读书',source:'03_PDF/demo.pdf#page=1&selection=0,0,0,20'};
 const a=await cards.createCard(app,options),b=await cards.createCard(app,options);assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(a.file.path,b.file.path);
 assert.match(await app.vault.read(a.file),/来源：\[\[03_PDF/);for(let i=0;i<2;i++)await cards.createCard(app,{...options,source:''});
 assert.equal(app.vault.getMarkdownFiles().length,3);
});
test('cancelled text card creates no files',async()=>{
 const{app,files}=mockApp();await require(path.join(scripts,'新建文字错题卡.js'))({app,obsidian:{Notice:class{}},variables:{题目:'Q',答案:'A'},quickAddApi:{suggester:async()=>null}});assert.equal(files.size,0);
});
test('one study note per PDF; shelf uses supplied fresh progress',async()=>{
 const{app}=mockApp(),file=await app.vault.create('03_PDF/demo.pdf','pdf');
 const category={value:'读书',folder:'02_PDF学习/读书',tag:'学习/读书'},first=await pdf.createStudyNote(app,file,category,20);
 assert.equal((await pdf.createStudyNote(app,file,category,20)).created,false);
 await pdf.refreshShelf(app,pdf.recordFromKnownValues(first.file,{category:'读书',pdfPath:file.path,page:8,totalPages:20,day:'2026-10-04',link:'[[03_PDF/demo.pdf#page=8]]'}));
 assert.match(await app.vault.read(app.vault.getAbstractFileByPath('02_PDF学习/PDF书架.md')),/8 \/ 20（40%）/);
});
async function selectedPdf(){
 const{app}=mockApp(),file=await app.vault.create('03_PDF/demo.pdf','pdf');app.workspace.getActiveFile=()=>file;app.workspace.activeLeaf={view:{}};
 app.plugins.plugins['pdf-plus']={lib:{copyLink:{getTemplateVariables:()=>({file,text:'原文',page:1,subpath:'#page=1&selection=0,0,0,20&color=记忆'})}}};return{app,file};
}
test('PDF checkbox makes one source-linked card; repeated save deduplicates excerpt and card',async()=>{
 const{app,file}=await selectedPdf(),script=require(path.join(scripts,'摘录PDF原文.js'));
 for(let i=0;i<2;i++)await script({app,quickAddApi:{suggester:async(_labels,values)=>values[0]},obsidian:modalEnvironment({summary:'理解',createMemory:true,question:'为什么？'})});
 assert.equal(app.vault.getMarkdownFiles().filter(x=>x.path.startsWith('01_记忆卡片/')).length,1);
 assert.equal((await app.vault.read(pdf.findStudyNoteForPdf(app,file))).match(/\*\*我的小结：\*\*/g).length,1);
});
test('blank summary, blank checked question and cancellation do not write',async()=>{
 for(const values of [null,{summary:' \u200b '},{summary:'理解',createMemory:true,question:' '}]){
  const{app}=await selectedPdf();await require(path.join(scripts,'摘录PDF原文.js'))({app,quickAddApi:{},obsidian:modalEnvironment(values)});assert.equal(app.vault.getMarkdownFiles().length,0);}
});
test('wrong PDF selection does not write even with a valid summary',async()=>{
 const{app}=await selectedPdf();app.plugins.plugins['pdf-plus'].lib.copyLink.getTemplateVariables=()=>({file:{path:'other.pdf'},text:'旧选区',subpath:'#page=1&selection=0,0,0,2'});
 await require(path.join(scripts,'摘录PDF原文.js'))({app,quickAddApi:{},obsidian:modalEnvironment({summary:'理解'})});assert.equal(app.vault.getMarkdownFiles().length,0);
});
test('PDF progress belongs to active PDF, without clipboard dependence',async()=>{
 const{app,file}=await selectedPdf();app.workspace.activeLeaf={view:{getState:()=>({page:2}),viewer:{child:{pdfViewer:{pagesCount:2,_location:{pageNumber:2,left:0,top:500}}}}}};
 app.fileManager={processFrontMatter:async(note,cb)=>{const fm=app.metadataCache.getFileCache(note).frontmatter;cb(fm);const text=await app.vault.read(note);
  await app.vault.modify(note,text.replace(/^---\n[\s\S]*?\n---/,'---\n'+Object.entries(fm).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---'));}};
 await require(path.join(scripts,'保存PDF阅读进度.js'))({app,quickAddApi:{suggester:async(_labels,v)=>v[0]},obsidian:{Notice:class{}}});
 const text=await app.vault.read(pdf.findStudyNoteForPdf(app,file));assert.match(text,/demo.pdf#page=2&offset=0,500,0/);assert.match(text,/已读完/);
});
