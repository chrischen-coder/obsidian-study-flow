#!/usr/bin/env node
// Dependency-free ZIP (stored entries) with CRC32; include only the starter allowlist.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=path.join(root,'starter-vault');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=table[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function starterFiles(){
 const entries=[];
 function visit(dir){for(const name of fs.readdirSync(dir).sort()){
  const file=path.join(dir,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw new Error('Symlink in starter');
  if(stat.isDirectory())visit(file);else{
   const relative=path.relative(source,file).split(path.sep).join('/');
   const allowed=relative.startsWith('StudyFlow/')||relative.startsWith('03_PDF/')||relative==='00_开始.md'
    ||/^\.obsidian\/(app|community-plugins)\.json$/.test(relative)||/^\.obsidian\/plugins\/[^/]+\/data\.json$/.test(relative);
   if(!allowed)continue;
   if(/(^|\/)(main\.js|manifest\.json|styles\.css|workspace.*\.json|\.DS_Store)$/.test(relative))throw new Error('Private/plugin file in ZIP');
   entries.push({name:'Obsidian-Study-Flow/'+relative,data:fs.readFileSync(file)});
  }
 }}visit(source);return entries;
}
function makeZip(entries){
 const locals=[],central=[];let offset=0;
 for(const{name,data}of entries){const nameBytes=Buffer.from(name),crc=crc32(data);
  const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt16LE(0x800,6);head.writeUInt16LE(0x21,12);
  head.writeUInt32LE(crc,14);head.writeUInt32LE(data.length,18);head.writeUInt32LE(data.length,22);head.writeUInt16LE(nameBytes.length,26);
  locals.push(head,nameBytes,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);
  c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nameBytes.length,28);c.writeUInt32LE(offset,42);
  central.push(c,nameBytes);offset+=head.length+nameBytes.length+data.length;
 }
 const centralLength=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralLength,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,...central,end]);
}
function build(){const entries=starterFiles();entries.push({name:'Obsidian-Study-Flow/LICENSE',data:fs.readFileSync(path.join(root,'LICENSE'))},{name:'Obsidian-Study-Flow/NOTICE',data:fs.readFileSync(path.join(root,'NOTICE'))});
 const buffer=makeZip(entries),dir=path.join(root,'dist');fs.mkdirSync(dir,{recursive:true});
 const filename=`obsidian-study-flow-starter-v${version}.zip`;fs.writeFileSync(path.join(dir,filename),buffer);
 fs.writeFileSync(path.join(dir,'SHA256SUMS'),`${crypto.createHash('sha256').update(buffer).digest('hex')}  ${filename}\n`);
 console.log(`${entries.length} files, ${buffer.length} bytes: ${filename}`);return path.join(dir,filename);
}
if(require.main===module)build();module.exports={starterFiles,makeZip,build};
