import { Plugin, ItemView, WorkspaceLeaf, PluginSettingTab, Setting } from 'obsidian';
import { I18n, type Language } from './i18n';
const VIEW = 'study-flow-workbench';
export default class StudyFlowPlugin extends Plugin {
  language: Language = 'auto';
  i18n = new I18n();
  async onload(): Promise<void> {
    const data: unknown = await this.loadData();
    if (data && typeof data === 'object' && 'language' in data && ['auto', 'zh', 'en'].includes(String(data.language))) this.language = data.language as Language;
    this.i18n.language = this.language;
    this.registerView(VIEW, leaf => new Workbench(leaf, this));
    this.addCommand({ id: 'open-workbench', name: this.i18n.text('打开学习工作台', 'Open learning workbench'), callback: () => this.openWorkbench() });
    this.addRibbonIcon('book-open', 'Study Flow', () => this.openWorkbench());
    this.addSettingTab(new Settings(this.app, this));
  }
  async openWorkbench(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(VIEW)[0] ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW });
    await this.app.workspace.revealLeaf(leaf);
  }
}
class Workbench extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: StudyFlowPlugin) { super(leaf); }
  getViewType(): string { return VIEW; }
  getDisplayText(): string { return 'Study Flow'; }
  getIcon(): string { return 'book-open'; }
  async onOpen(): Promise<void> {
    this.contentEl.addClass('study-flow');
    this.contentEl.createEl('h2', { text: this.plugin.i18n.text('学习工作台', 'Learning workbench') });
  }
}
class Settings extends PluginSettingTab {
  constructor(app: StudyFlowPlugin['app'], private plugin: StudyFlowPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl).setName('语言 / Language').addDropdown(dropdown => dropdown
      .addOption('auto', '自动 / Automatic').addOption('zh', '中文').addOption('en', 'English')
      .setValue(this.plugin.language).onChange(async value => {
        this.plugin.language = value as Language;
        this.plugin.i18n.language = this.plugin.language;
        await this.plugin.saveData({ language: this.plugin.language });
      }));
  }
}
