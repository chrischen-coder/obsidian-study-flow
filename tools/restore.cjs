#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
function restore(destination,backupDirectory,{dryRun=false}={}){
 const root=fs.realpathSync(destination),backup=fs.realpathSync(backupDirectory);
 if(!backup.startsWith(path.join(root,'.study-flow-backups')+path.sep))throw new Error('备份必须位于目标库的 .study-flow-backups 中');
 const items=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
 const seen=new Set();
 const plan=items.map(item=>{
  if(typeof item.relative!=='string'||path.isAbsolute(item.relative)||item.relative.split(/[\\/]/).some(x=>x==='..'||x===''))throw new Error('Invalid backup manifest');
  if(seen.has(item.relative))throw new Error('Duplicate backup entry');seen.add(item.relative);
  const target=path.join(root,item.relative);let current=target;
  while(current.startsWith(root+path.sep)){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Refusing symlink');current=path.dirname(current);}
  const removed=path.join(backup,'removed-after-restore',item.relative);
  if(fs.existsSync(removed))throw new Error('该备份已经恢复过，请检查 removed-after-restore');
  if(item.existed&&!fs.existsSync(path.join(backup,item.relative)))throw new Error('备份文件不完整');return{...item,target,removed};
 });
 if(!dryRun)for(const item of plan){
  if(fs.existsSync(item.target)){fs.mkdirSync(path.dirname(item.removed),{recursive:true});fs.renameSync(item.target,item.removed);}
  if(item.existed){fs.mkdirSync(path.dirname(item.target),{recursive:true});fs.copyFileSync(path.join(backup,item.relative),item.target);}
 }
 return plan.map(x=>({relative:x.relative,action:x.existed?'restore':'move-to-backup'}));
}
if(require.main===module){const[r,b]=process.argv.slice(2);try{if(!r||!b)throw new Error('用法：node tools/restore.cjs vault backup [--dry-run]');console.log(JSON.stringify(restore(r,b,{dryRun:process.argv.includes('--dry-run')}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={restore};
