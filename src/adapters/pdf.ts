import type { App, WorkspaceLeaf, View, TFile } from 'obsidian';
import { FlowError, type SelectionSnapshot, type ProgressSnapshot } from '../core/model';
import { dependency } from './dependencies';
interface EventBus { on?: (name:string, callback:(event:unknown)=>void)=>void; off?: (name:string, callback:(event:unknown)=>void)=>void; _on?: (name:string, callback:(event:unknown)=>void)=>void; _off?: (name:string, callback:(event:unknown)=>void)=>void; }
interface Child {
  file?: TFile;
  pdfViewer?: { pagesCount?: number; eventBus?: EventBus; pdfViewer?: { currentPageNumber?: number; pagesCount?: number }; pdfDocument?: { numPages?: number } };
}
type PdfView = View & { file?: TFile; viewer?: { child?: Child }; getState: () => { page?: number; file?: string } };
interface PdfPlus { lib?: { copyLink?: { getTemplateVariables?: (params:object)=>{file?:TFile;child?:Child;page?:number;pageCount?:number;subpath?:string;text?:string}|null } }; }
export class PdfReader {
  private lastLeaf: WorkspaceLeaf | null = null;
  constructor(private app: App) {}
  currentLeaf(): WorkspaceLeaf | null {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (leaf?.view.getViewType() === 'pdf') { this.lastLeaf=leaf; return leaf; }
    if (leaf?.view.getViewType() === 'study-flow-workbench' && this.lastLeaf && this.app.workspace.getLeavesOfType('pdf').includes(this.lastLeaf)) return this.lastLeaf;
    return null;
  }
  snapshot(leaf: WorkspaceLeaf | null = this.currentLeaf()): ProgressSnapshot | null {
    if (!leaf || leaf.view.getViewType() !== 'pdf') return null;
    const view=leaf.view as PdfView, file=view.file;
    if (!file || file.extension.toLowerCase() !== 'pdf') return null;
    const child=view.viewer?.child, viewer=child?.pdfViewer;
    const page=viewer?.pdfViewer?.currentPageNumber ?? view.getState().page;
    if (typeof page !== 'number' || !Number.isInteger(page) || page<1) return null;
    return { pdfPath:file.path,title:file.basename,page,totalPages:viewer?.pagesCount ?? viewer?.pdfViewer?.pagesCount ?? viewer?.pdfDocument?.numPages ?? 0,subpath:`#page=${page}` };
  }
  selection(): SelectionSnapshot {
    const snapshot=this.snapshot();
    if (!snapshot) throw new FlowError('invalid','Open a PDF and select some text first.');
    const plugin=dependency(this.app,'pdf-plus') as PdfPlus|undefined;
    if (!plugin?.lib?.copyLink?.getTemplateVariables) throw new FlowError('unsupported','Install and enable PDF++ to capture PDF selections.');
    let selection: ReturnType<NonNullable<NonNullable<NonNullable<PdfPlus['lib']>['copyLink']>['getTemplateVariables']>>;
    try { selection=plugin.lib.copyLink.getTemplateVariables({}); } catch { throw new FlowError('unsupported','PDF++ selection API is unavailable. Your saved excerpts are safe.'); }
    if (selection?.file?.path!==snapshot.pdfPath || !selection.text?.trim() || !selection.subpath?.includes('selection=') || !Number.isInteger(selection.page)) throw new FlowError('invalid','Select text in the current PDF first; the clipboard is not used.');
    return {...snapshot,page:selection.page!,totalPages:selection.pageCount ?? snapshot.totalPages,subpath:selection.subpath,text:selection.text.trim()};
  }
  listen(leaf: WorkspaceLeaf, callback:()=>void): (()=>void)|null {
    const bus=(leaf.view as PdfView).viewer?.child?.pdfViewer?.eventBus;
    const on=bus?.on ?? bus?._on, off=bus?.off ?? bus?._off;
    if (!bus || !on || !off) return null;
    on.call(bus,'pagechanging',callback); on.call(bus,'updateviewarea',callback);
    return ()=>{off.call(bus,'pagechanging',callback);off.call(bus,'updateviewarea',callback);};
  }
}
