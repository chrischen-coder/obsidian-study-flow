const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const{install,planInstall}=require('../tools/install.cjs');
function temp(t){const p=fs.mkdtempSync(path.join(os.tmpdir(),'study-flow-test-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));return p;}
function write(r,p,d){const f=path.join(r,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d));}
function read(r,p){return JSON.parse(fs.readFileSync(path.join(r,p)));}
test('dry run writes nothing; repeated installation is idempotent',t=>{
 const r=temp(t);assert.ok(install(r,{dryRun:true}).changes.length);assert.deepEqual(fs.readdirSync(r),[]);const result=install(r);
 assert.ok(fs.existsSync(path.join(result.backup,'manifest.json')));assert.equal(install(r).changes.length,0);
});
test('keeps existing macros, provider configuration, SR settings and schedules',t=>{
 const r=temp(t),qa='.obsidian/plugins/quickadd/data.json',sr='.obsidian/plugins/obsidian-spaced-repetition/data.json';
 write(r,qa,{choices:[{id:'own',name:'My macro'}],ai:{provider:'untouched'}});write(r,sr,{settings:{flashcardTags:['#custom'],algorithm:'FSRS'},scheduleData:{x:123}});
 const result=install(r);assert.equal(read(r,qa).choices[0].name,'My macro');assert.equal(read(r,qa).ai.provider,'untouched');assert.deepEqual(read(r,sr).scheduleData,{x:123});
 assert.deepEqual(read(r,sr).settings.flashcardTags,['#custom','#flashcards']);assert.equal(read(r,sr).settings.algorithm,'FSRS');assert.equal(read(result.backup,qa).choices.length,1);
 assert.ok(!fs.existsSync(path.join(r,'.obsidian/community-plugins.json')));
});
test('same-name macros and custom SR separators abort before writing',t=>{
 for(const data of[{plugin:'quickadd',value:{choices:[{id:'other',name:'截图变错题卡'}]}},{plugin:'obsidian-spaced-repetition',value:{settings:{multilineCardSeparator:'%%'}}}]){
  const r=temp(t);write(r,`.obsidian/plugins/${data.plugin}/data.json`,data.value);assert.throws(()=>planInstall(r));assert.ok(!fs.existsSync(path.join(r,'StudyFlow')));}
});
test('symlinks cannot redirect install writes outside selected vault',t=>{
 const r=temp(t),outside=temp(t);fs.symlinkSync(outside,path.join(r,'StudyFlow'),'dir');assert.throws(()=>install(r));assert.deepEqual(fs.readdirSync(outside),[]);
});
test('restore returns old settings and keeps cards created after install',t=>{
 const r=temp(t),qa='.obsidian/plugins/quickadd/data.json';write(r,qa,{choices:[{id:'mine',name:'Original'}]});const result=install(r);
 write(r,'01_记忆卡片/keep.md',{text:'learning data'});const{restore}=require('../tools/restore.cjs');
 assert.ok(restore(r,result.backup,{dryRun:true}).length);assert.ok(fs.existsSync(path.join(r,'StudyFlow/config.json')));
 restore(r,result.backup);assert.equal(read(r,qa).choices[0].name,'Original');assert.ok(fs.existsSync(path.join(r,'01_记忆卡片/keep.md')));
 assert.ok(!fs.existsSync(path.join(r,'StudyFlow/config.json')));assert.ok(fs.existsSync(path.join(result.backup,'removed-after-restore/StudyFlow/config.json')));
});
test('backup symlink is rejected before writes',t=>{
 const r=temp(t),outside=temp(t);fs.symlinkSync(outside,path.join(r,'.study-flow-backups'),'dir');assert.throws(()=>install(r));assert.ok(!fs.existsSync(path.join(r,'StudyFlow')));
});
test('restore detects a later conflict before changing any earlier file',t=>{
 const r=temp(t),qa='.obsidian/plugins/quickadd/data.json';write(r,qa,{choices:[{id:'mine',name:'Original'}]});
 const result=install(r),manifest=read(result.backup,'manifest.json');
 write(result.backup,'removed-after-restore/'+manifest.at(-1).relative,{conflict:true});
 const before=fs.readFileSync(path.join(r,qa),'utf8');const{restore}=require('../tools/restore.cjs');
 assert.throws(()=>restore(r,result.backup),/已经恢复/);
 assert.equal(fs.readFileSync(path.join(r,qa),'utf8'),before);assert.ok(fs.existsSync(path.join(r,'StudyFlow/config.json')));
});
