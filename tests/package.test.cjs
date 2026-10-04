const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{starterFiles,makeZip}=require('../tools/package.cjs');
test('starter archive includes scripts and hidden config, excludes third-party code and personal files',()=>{
 const entries=starterFiles();assert.ok(entries.some(x=>x.name.endsWith('/00_开始.md')));assert.ok(entries.some(x=>x.name.includes('/.obsidian/plugins/quickadd/data.json')));
 assert.ok(entries.some(x=>x.name.endsWith('主动回忆示例.pdf')));assert.ok(!entries.some(x=>/main\.js|workspace|apiKey/.test(x.name)));
 for(const item of entries.filter(x=>x.name.endsWith('.json'))){const text=item.data.toString();JSON.parse(text);assert.ok(!/apiKey|知行书房|chenwenke|15_软考/.test(text));}
 assert.equal(makeZip(entries).readUInt32LE(0),0x04034b50);
});
test('QuickAdd macro steps all point to distributed scripts',()=>{
 const root=path.resolve(__dirname,'../starter-vault');const data=JSON.parse(fs.readFileSync(path.join(root,'.obsidian/plugins/quickadd/data.json')));
 const ids=new Set();for(const choice of data.choices){assert.ok(!ids.has(choice.id));ids.add(choice.id);for(const step of choice.macro.commands)assert.ok(fs.existsSync(path.join(root,step.path)));}
});
