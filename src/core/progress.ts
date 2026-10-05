import type { ProgressSnapshot } from './model';
interface Scheduler { set(callback:()=>void,delay:number):unknown; clear(timer:unknown):void; }
const scheduler:Scheduler={set:(cb,delay)=>setTimeout(cb,delay),clear:timer=>clearTimeout(timer as ReturnType<typeof setTimeout>)};
export class ProgressQueue {
  private pending=new Map<string,{snapshot:ProgressSnapshot;timer:unknown}>();
  private observed=new Map<string,string>();
  private disposed=false;
  constructor(private save:(snapshot:ProgressSnapshot)=>Promise<unknown>,private onError:(error:unknown)=>void,private clock:Scheduler=scheduler) {}
  observe(snapshot:ProgressSnapshot):void {
    if(this.disposed)return;
    const key=JSON.stringify([snapshot.page,snapshot.totalPages]);
    if(this.observed.get(snapshot.pdfPath)===key)return;
    this.observed.set(snapshot.pdfPath,key);
    const old=this.pending.get(snapshot.pdfPath);if(old)this.clock.clear(old.timer);
    const timer=this.clock.set(()=>{void this.flush(snapshot.pdfPath);},1500);
    this.pending.set(snapshot.pdfPath,{snapshot:{...snapshot},timer});
  }
  async flush(path?:string):Promise<void> {
    const entries=path?[...this.pending].filter(([key])=>key===path):[...this.pending];
    for(const[key,value]of entries){this.pending.delete(key);this.clock.clear(value.timer);try{await this.save(value.snapshot);}catch(e){this.observed.delete(key);this.onError(e);}}
  }
  async dispose():Promise<void>{this.disposed=true;await this.flush();this.observed.clear();}
}
