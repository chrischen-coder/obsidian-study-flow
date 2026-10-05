import test from 'node:test';import assert from 'node:assert/strict';
import type { App, WorkspaceLeaf } from 'obsidian';
import { PdfReader } from '../../src/adapters/pdf';import { ProgressQueue } from '../../src/core/progress';
function leaf(path:string,page=1){return {view:{getViewType:()=> 'pdf',file:{path,extension:'pdf',basename:path},getState:()=>({page}),viewer:{child:{pdfViewer:{pagesCount:10,pdfViewer:{currentPageNumber:page}}}}}} as unknown as WorkspaceLeaf;}
test('PDF snapshot validates selection against the active PDF and never reads the clipboard',()=>{
 const a=leaf('a.pdf'),b=leaf('b.pdf');let active=a;let selected='b.pdf';
 const app={workspace:{getMostRecentLeaf:()=>active,getLeavesOfType:()=>[a,b]},plugins:{plugins:{'pdf-plus':{lib:{copyLink:{getTemplateVariables:()=>({file:{path:selected},page:1,text:'原文',subpath:'#page=1&selection=0,0,0,2'})}}}}}} as unknown as App;
 const reader=new PdfReader(app);assert.throws(()=>reader.selection());selected='a.pdf';assert.equal(reader.selection().pdfPath,'a.pdf');active=b;assert.throws(()=>reader.selection());
});
test('progress queue waits 1.5 seconds, binds values to each PDF and clears all timers',async()=>{
 let id=0;const callbacks=new Map<number,()=>void>(),delays:number[]=[];const saved:{pdfPath:string;page:number}[]=[];
 const queue=new ProgressQueue(async s=>{saved.push(s);},()=>{}, {set:(cb,delay)=>{delays.push(delay);callbacks.set(++id,cb);return id;},clear:timer=>{callbacks.delete(timer as number);}});
 const a={pdfPath:'a.pdf',title:'a',page:2,totalPages:10,subpath:'#page=2'};
 queue.observe(a);queue.observe({...a,page:3});queue.observe({...a,pdfPath:'b.pdf',page:8});
 assert.deepEqual(delays,[1500,1500,1500]);assert.equal(saved.length,0);assert.equal(callbacks.size,2);
 await queue.flush('a.pdf');assert.deepEqual(saved.map(s=>[s.pdfPath,s.page]),[['a.pdf',3]]);
 await queue.dispose();assert.equal(callbacks.size,0);assert.deepEqual(saved.map(s=>[s.pdfPath,s.page]),[['a.pdf',3],['b.pdf',8]]);
 queue.observe(a);assert.equal(callbacks.size,0);
});
test('PDF event subscriptions remove both listeners and fail closed when internals differ',()=>{
 const events=new Map<string,()=>void>(),a=leaf('a.pdf');
 const raw=a.view as unknown as {viewer:{child:{pdfViewer:{eventBus:unknown}}}};
 raw.viewer.child.pdfViewer.eventBus={on:(name:string,cb:()=>void)=>events.set(name,cb),off:(name:string)=>events.delete(name)};
 const reader=new PdfReader({} as App),cleanup=reader.listen(a,()=>{});assert.equal(events.size,2);cleanup?.();assert.equal(events.size,0);
 raw.viewer.child.pdfViewer.eventBus={};assert.equal(reader.listen(a,()=>{}),null);
});
