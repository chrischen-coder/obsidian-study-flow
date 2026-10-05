import { App, TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { type VaultPort, type FileInfo, FlowError, validPath } from '../core/model';
export const obsidianYaml = { parse: (text: string): unknown => parseYaml(text), stringify: (data: object): string => stringifyYaml(data) };
export class ObsidianVault implements VaultPort {
  constructor(private app: App) {}
  list(): FileInfo[] {
    return this.app.vault.getFiles().map(file => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return { path: file.path, knownKind: typeof fm?.study_flow_kind === 'string' ? fm.study_flow_kind : undefined,
        legacy: typeof fm?.['类型'] === 'string' && ['PDF学习','PDF记忆卡片','截图错题卡','文字错题卡','记忆卡片'].includes(fm['类型']) };
    });
  }
  exists(path: string): boolean { return this.app.vault.getAbstractFileByPath(path) instanceof TFile; }
  private file(path: string): TFile {
    const file = this.app.vault.getAbstractFileByPath(validPath(path));
    if (!(file instanceof TFile)) throw new FlowError('missing', `File not found: ${path}`);
    return file;
  }
  async read(path: string): Promise<string> { return this.app.vault.read(this.file(path)); }
  async folder(path: string): Promise<void> {
    const parts = validPath(path).split('/'); parts.pop(); let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing && !(existing instanceof TFolder)) throw new FlowError('invalid', `Not a folder: ${current}`);
      if (!existing) { try { await this.app.vault.createFolder(current); } catch (e) { if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw e; } }
    }
  }
  async create(path: string,text: string): Promise<void> { await this.folder(path); await this.app.vault.create(path,text); }
  async process(path: string,transform: (text: string)=>string): Promise<void> { await this.app.vault.process(this.file(path),transform); }
  async createBinary(path: string,bytes: ArrayBuffer): Promise<void> { await this.folder(path); await this.app.vault.createBinary(path,bytes); }
  async remove(path: string): Promise<void> { await this.app.vault.trash(this.file(path),false); }
}
