import {
  Plugin,
  Notice,
  TFile,
  MarkdownView,
  getLanguage,
  type WorkspaceLeaf,
} from "obsidian";
import { I18n } from "./i18n";
import {
  settingsFrom,
  validateSettings,
  type Settings,
  type Card,
  type Excerpt,
  type Book,
  type SaveResult,
  FlowError,
} from "./core/model";
import { LearningService } from "./core/service";
import { LegacyUpgrade, type UpgradePlan } from "./core/migration";
import { ProgressQueue } from "./core/progress";
import { AttachmentSession } from "./core/attachment";
import { ObsidianVault, obsidianYaml } from "./adapters/vault";
import { PdfReader } from "./adapters/pdf";
import { ReviewAdapter } from "./adapters/review";
import { dependency } from "./adapters/dependencies";
import {
  Workbench,
  StudyFlowSettings,
  VIEW,
  type TabName,
} from "./ui/workbench";
import {
  CardEditor,
  ExcerptEditor,
  UpgradeModal,
  RestoreModal,
  RelinkModal,
} from "./ui/editors";
export interface LegacyVariables {
  题目?: unknown;
  答案?: unknown;
  分类?: unknown;
}
export default class StudyFlowPlugin extends Plugin {
  declare settings: Settings;
  service!: LearningService;
  upgrade!: LegacyUpgrade;
  reader!: PdfReader;
  review!: ReviewAdapter;
  i18n = new I18n("auto", getLanguage());
  ready = false;
  legacyPlan?: UpgradePlan;
  private progress!: ProgressQueue;
  private pdfSubscriptions = new Map<WorkspaceLeaf, () => void>();
  private disposed = false;
  readonly api = {
    v1: {
      openWorkbench: () => this.openWorkbench(),
      capturePdf: () => this.capturePdf(),
      captureText: (v?: LegacyVariables) => this.createManual("text", v),
      captureScreenshot: (v?: LegacyVariables) =>
        this.createManual("screenshot", v),
      saveProgress: () => this.saveProgress(),
      openExcerpts: () => this.openExcerpts(),
      createStudyNote: () => this.startCurrentBook(),
      changeDeck: (v?: LegacyVariables) => this.editCurrentCard(v),
    },
  };
  async onload(): Promise<void> {
    try {
      this.settings = settingsFrom(await this.loadData());
    } catch (e) {
      this.settings = settingsFrom(null);
      this.error(e);
    }
    this.i18n.language = this.settings.language;
    this.service = new LearningService(
      new ObsidianVault(this.app),
      obsidianYaml,
      () => this.settings,
    );
    this.upgrade = new LegacyUpgrade(this.service);
    this.reader = new PdfReader(this.app);
    this.review = new ReviewAdapter(this.app);
    this.progress = new ProgressQueue(
      (s) => this.service.saveProgress(s),
      (e) => this.error(e),
    );
    this.registerView(VIEW, (leaf) => new Workbench(leaf, this));
    this.addRibbonIcon(
      "graduation-cap",
      this.t("学习工作台", "Learning workbench"),
      () => {
        void this.openWorkbench();
      },
    );
    const command = (
      id: string,
      zh: string,
      en: string,
      callback: () => Promise<unknown>,
    ) =>
      this.addCommand({
        id,
        name: this.t(zh, en),
        callback: () => {
          void callback().catch((e) => this.error(e));
        },
      });
    command("open-workbench", "打开学习工作台", "Open learning workbench", () =>
      this.openWorkbench(),
    );
    command(
      "open-workbench-tab",
      "在标签页打开学习工作台",
      "Open learning workbench in a tab",
      () => this.openWorkbench("reading", "", true),
    );
    command("capture-pdf", "保存 PDF 选区", "Capture PDF selection", () =>
      this.capturePdf(),
    );
    command(
      "capture-text",
      "复制或选中文字变卡片",
      "Clipboard or selected text to card",
      () => this.createManual("text"),
    );
    command("capture-screenshot", "截图变卡片", "Screenshot to card", () =>
      this.createManual("screenshot"),
    );
    command(
      "save-progress",
      "保存 PDF 阅读进度",
      "Save PDF reading progress",
      () => this.saveProgress(),
    );
    command(
      "start-review",
      "开始间隔复习",
      "Start spaced repetition review",
      () => this.startReview(),
    );
    command(
      "upgrade-legacy",
      "预览旧数据升级",
      "Preview legacy data upgrade",
      () => this.previewUpgrade(),
    );
    command(
      "restore-upgrade",
      "恢复升级备份",
      "Restore an upgrade backup",
      () => this.restoreUpgrade(),
    );
    command("rebuild-index", "重建学习索引", "Rebuild learning index", () =>
      this.rebuildIndex(),
    );
    this.addSettingTab(new StudyFlowSettings(this.app, this));
    this.registerObsidianProtocolHandler("study-flow", (params) => {
      void this.openWorkbench(
        params.book ? "inbox" : "reading",
        params.book ?? "",
      ).catch((e) => this.error(e));
    });
    const refresh = (file: TFile) => {
      if (
        file.extension === "md" &&
        !file.path.startsWith("StudyFlow/upgrade-backups/")
      ) {
        const previous = this.service.index.records.get(file.path);
        void (async () => {
          await this.service.index.refresh(file.path);
          const current = this.service.index.records.get(file.path);
          if (
            previous?.kind === "book" &&
            current?.kind === "book" &&
            previous.pdfPath !== current.pdfPath
          ) {
            await this.service.repairBookLinks(current);
            await this.service.refreshShelf();
          }
        })().catch((e) => this.error(e));
      }
    };
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) refresh(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) refresh(file);
      }),
    );
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.registerEvent(
      this.app.vault.on("delete", (file) =>
        this.service.index.remove(file.path),
      ),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const managed = this.service.index.records.has(oldPath);
        if (file instanceof TFile && file.extension === "md" && managed)
          void this.service
            .renameLearningFile(oldPath, file.path)
            .catch((e) => this.error(e));
        else {
          this.service.index.remove(oldPath);
          if (file instanceof TFile && file.extension === "md") refresh(file);
        }
        if (file instanceof TFile && file.extension === "pdf")
          void this.service
            .renamePdf(oldPath, file.path)
            .catch((e) => this.error(e));
      }),
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        void this.progress.flush();
        this.observePdfs();
        this.renderViews();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.observePdfs()),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        void this.progress.flush();
        this.observePdfs();
      }),
    );
    this.registerInterval(window.setInterval(() => this.observePdfs(), 1000));
    this.app.workspace.onLayoutReady(() => {
      void this.initialize().catch((e) => this.error(e));
    });
  }
  async initialize(): Promise<void> {
    await this.service.index.initialize();
    if (this.disposed) return;
    this.ready = true;
    this.observePdfs();
    this.renderViews();
    if (!this.settings.onboardingDone) await this.openWorkbench();
    if (
      this.service.vault
        .list()
        .some(
          (f) =>
            f.legacy &&
            !f.knownKind &&
            !f.path.startsWith("StudyFlow/upgrade-backups/"),
        )
    ) {
      this.legacyPlan = await this.upgrade.preview();
      if (!this.disposed) this.renderViews();
    }
  }
  t(zh: string, en: string): string {
    return this.i18n.text(zh, en);
  }
  notice(zh: string, en: string): void {
    new Notice(this.t(zh, en), 5000);
  }
  error(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const translations: [RegExp, string][] = [
      [/Install and enable PDF\+\+/, "请先安装并启用 PDF++，再保存选区。"],
      [
        /Open a PDF|Select text in the current PDF/,
        "请先在当前 PDF 中拖动选中原文。",
      ],
      [
        /Install and enable Spaced Repetition/,
        "请先安装并启用 Spaced Repetition；你仍可保存卡片草稿。",
      ],
      [
        /edited elsewhere|identity changed|changed after preview/,
        "文件已有新的修改，你的输入已保留。请比较最新内容后再保存。",
      ],
      [
        /Upgrade this legacy PDF note/,
        "这份 PDF 已有旧版学习笔记。请先在工作台预览升级，会备份原内容。",
      ],
    ];
    new Notice(
      this.i18n.chinese
        ? (translations.find(([pattern]) => pattern.test(message))?.[1] ??
          `操作未完成：${message}`)
        : message,
      8000,
    );
    console.warn("Study Flow:", error);
  }
  async saveSettings(settings: Settings): Promise<void> {
    validateSettings(settings);
    await this.saveData(settings);
    this.settings = structuredClone(settings);
    this.i18n.language = settings.language;
    await this.service.index.initialize();
    this.renderViews();
  }
  async openWorkbench(
    tab: TabName = "reading",
    bookId = "",
    inTab = false,
  ): Promise<void> {
    const leaf =
      this.app.workspace
        .getLeavesOfType(VIEW)
        .find((l) =>
          inTab
            ? l.getRoot() === this.app.workspace.rootSplit
            : l.getRoot() !== this.app.workspace.rootSplit,
        ) ??
      (inTab
        ? this.app.workspace.getLeaf("tab")
        : this.app.workspace.getRightLeaf(false));
    if (!leaf) return;
    await leaf.setViewState({
      type: VIEW,
      state: { tab, bookId },
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);
  }
  renderViews(): void {
    this.app.workspace.getLeavesOfType(VIEW).forEach((leaf) => {
      if (leaf.view instanceof Workbench) leaf.view.render();
    });
  }
  private async requireReady(): Promise<boolean> {
    if (!this.ready)
      throw new FlowError(
        "unsupported",
        "Study Flow is still indexing your learning files.",
      );
    if (!this.settings.onboardingDone) {
      await this.openWorkbench();
      return false;
    }
    return true;
  }
  async capturePdf(): Promise<SaveResult | null> {
    if (!this.ready)
      throw new FlowError(
        "unsupported",
        "Study Flow is still indexing your learning files.",
      );
    if (!this.settings.onboardingDone) {
      await this.openWorkbench();
      return null;
    }
    const snapshot = this.reader.selection();
    const result = await this.service.capture(snapshot);
    this.notice(
      result.status === "unchanged"
        ? "这段原文已在收件箱。"
        : "已保存到摘录收件箱，继续阅读。",
      result.status === "unchanged"
        ? "This excerpt is already in your inbox."
        : "Saved to the excerpt inbox. Keep reading.",
    );
    result.warnings.forEach((w) => new Notice(w));
    return result;
  }
  private observePdfs(): void {
    if (this.disposed) return;
    const leaves = this.app.workspace.getLeavesOfType("pdf");
    for (const [leaf, cleanup] of this.pdfSubscriptions)
      if (!leaves.includes(leaf)) {
        cleanup();
        this.pdfSubscriptions.delete(leaf);
      }
    for (const leaf of leaves) {
      const observe = () => {
        if (
          this.settings.autoProgress &&
          this.settings.onboardingDone &&
          leaf === this.reader.currentLeaf()
        ) {
          const s = this.reader.snapshot(leaf);
          if (s) this.progress.observe(s);
        }
      };
      if (!this.pdfSubscriptions.has(leaf)) {
        const cleanup = this.reader.listen(leaf, observe);
        if (cleanup) this.pdfSubscriptions.set(leaf, cleanup);
      }
      observe();
    }
  }
  async saveProgress(): Promise<SaveResult | null> {
    if (!(await this.requireReady())) return null;
    const s = this.reader.snapshot();
    if (!s) throw new FlowError("invalid", "Open a PDF first.");
    const saved = await this.service.saveProgress(s, true);
    this.notice("阅读进度已保存。", "Reading progress saved.");
    return saved;
  }
  async startCurrentBook(): Promise<SaveResult | null> {
    if (!this.reader.snapshot()) {
      await this.openWorkbench("reading");
      return null;
    }
    const saved = await this.saveProgress();
    await this.openWorkbench("reading");
    return saved;
  }
  async openExcerpts(): Promise<void> {
    if (!(await this.requireReady())) return;
    const snapshot = this.reader.snapshot(),
      file = this.app.workspace.getActiveFile(),
      record = file ? this.service.index.records.get(file.path) : undefined;
    const book = snapshot
      ? await this.service.ensureBook(snapshot)
      : record?.kind === "book"
        ? record
        : record
          ? this.service.index.get(record.bookId)
          : undefined;
    await this.openWorkbench("inbox", book?.id ?? "");
  }
  async startReview(): Promise<void> {
    await this.review.start();
    this.renderViews();
  }
  async openPath(path: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile))
      throw new FlowError(
        "missing",
        "The file is missing. Its saved excerpt may still be available.",
      );
    await this.app.workspace.getLeaf("tab").openFile(f);
  }
  async openSource(record: Book | Excerpt | Card): Promise<void> {
    const book =
        record.kind === "book" ? record : this.service.index.get(record.bookId),
      path =
        book?.kind === "book"
          ? book.pdfPath
          : record.kind === "card"
            ? (record.source.split("#")[0] ?? "")
            : (record.pdfPath ?? "");
    const page =
      record.kind === "book"
        ? record.page
        : record.kind === "excerpt"
          ? record.page
          : Number(
              new URLSearchParams(record.source.split("#")[1] ?? "").get(
                "page",
              ),
            ) || 1;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (record.kind === "excerpt") {
        new ExcerptEditor(this.app, this, record).open();
        this.notice(
          "PDF 已缺失，仍可查看保存的原文快照。",
          "PDF is missing; your source snapshot is available.",
        );
        return;
      }
      if (record.kind === "card" && record.excerptId) {
        await this.editExcerpt(record.excerptId);
        this.notice(
          "PDF 已缺失，已打开摘录快照。",
          "PDF is missing; opened the source snapshot.",
        );
        return;
      }
      throw new FlowError(
        "missing",
        "PDF is missing. Relink the book in its Markdown note.",
      );
    }
    const subpath =
      record.kind === "excerpt"
        ? record.subpath
        : record.kind === "card"
          ? record.source.slice(record.source.indexOf("#"))
          : `#page=${page}`;
    if (dependency(this.app, "pdf-plus") && subpath.includes("selection=")) {
      try {
        await this.app.workspace.openLinkText(
          path + subpath,
          record.path,
          "tab",
        );
        return;
      } catch {
        /* Page fallback. */
      }
    }
    await this.app.workspace.openLinkText(
      `${path}#page=${page}`,
      record.path,
      "tab",
    );
    if (record.kind !== "book")
      this.notice(
        "已回到原文页码，精确选区可在启用 PDF++ 后打开。",
        "Opened the source page; enable PDF++ for the exact selection.",
      );
  }
  async editExcerpt(id: string): Promise<void> {
    const r = await this.service.read(id);
    if (r.kind === "excerpt") new ExcerptEditor(this.app, this, r).open();
  }
  async editCard(id: string): Promise<SaveResult | null> {
    const r = await this.service.read(id);
    return r.kind === "card" ? this.cardEditor(r) : null;
  }
  async newCard(id: string): Promise<SaveResult | null> {
    const r = await this.service.read(id);
    return r.kind === "excerpt"
      ? this.cardEditor(this.service.newCard(r))
      : null;
  }
  cardEditor(
    card: Card,
    attachment?: AttachmentSession,
    image?: string,
  ): Promise<SaveResult | null> {
    return new Promise((resolve) => {
      new CardEditor(this.app, this, card, resolve, attachment, image).open();
    });
  }
  async editCurrentCard(
    variables: LegacyVariables = {},
  ): Promise<SaveResult | null> {
    const file = this.app.workspace.getActiveFile(),
      r = file ? this.service.index.records.get(file.path) : undefined;
    if (r?.kind !== "card")
      throw new FlowError(
        "invalid",
        "Open a Study Flow card first. Legacy cards can be upgraded from the workbench.",
      );
    const card = (await this.service.read(r.id)) as Card;
    if (typeof variables["分类"] === "string")
      card.deckTag = this.legacyDeck(variables["分类"]);
    return this.cardEditor(card);
  }
  private legacyDeck(value: string): string {
    const tag = value.trim().replace(/^#/, "");
    return (
      this.settings.decks.find((d) => d.label === tag)?.tag ??
      (tag.startsWith("flashcards/") ||
      this.settings.decks.some((d) => d.tag === tag)
        ? tag
        : `flashcards/${tag}`)
    );
  }
  async createManual(
    type: "text" | "screenshot",
    variables: LegacyVariables = {},
  ): Promise<SaveResult | null> {
    if (!(await this.requireReady())) return null;
    const card = this.service.newCard();
    card.cardType = type;
    if (typeof variables["分类"] === "string")
      card.deckTag = this.legacyDeck(variables["分类"]);
    if (typeof variables["答案"] === "string") card.answer = variables["答案"];
    if (type === "text") {
      const editor =
        this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      const e = require("electron") as {
        clipboard: { readText: () => string };
      };
      card.question =
        typeof variables["题目"] === "string"
          ? variables["题目"]
          : editor?.getSelection() || e.clipboard.readText();
      return this.cardEditor(card);
    }
    const e = require("electron") as {
      clipboard: {
        readImage: () => {
          isEmpty: () => boolean;
          toPNG: () => Uint8Array;
          toDataURL: () => string;
        };
      };
    };
    const image = e.clipboard.readImage();
    if (image.isEmpty())
      throw new FlowError(
        "invalid",
        "Copy a screenshot/image to the clipboard first.",
      );
    const path = `${this.settings.attachmentFolder}/${new Date().toISOString().slice(0, 10)}-截图-${card.id.slice(0, 8)}.png`;
    card.question = `![[${path}]]\n${typeof variables["题目"] === "string" ? variables["题目"] : this.t("这题的正确答案或关键判断是什么？", "What is the correct answer or key judgement?")}`;
    return this.cardEditor(
      card,
      new AttachmentSession(
        this.service.vault,
        path,
        new Uint8Array(image.toPNG()).buffer,
      ),
      image.toDataURL(),
    );
  }
  async previewUpgrade(): Promise<void> {
    this.legacyPlan = await this.upgrade.preview();
    new UpgradeModal(this.app, this, this.legacyPlan).open();
  }
  async restoreUpgrade(): Promise<void> {
    new RestoreModal(this.app, this).open();
  }
  async rebuildIndex(): Promise<void> {
    await this.service.index.initialize();
    for (const book of this.service.index.books())
      await this.service.repairBookLinks(book);
    await this.service.refreshShelf();
    this.notice(
      "学习索引和书架已刷新。",
      "Learning index and library refreshed.",
    );
  }
  relinkBook(book: Book): void {
    new RelinkModal(this.app, this, book).open();
  }
  onunload(): void {
    this.disposed = true;
    this.app.workspace.detachLeavesOfType(VIEW);
    for (const cleanup of this.pdfSubscriptions.values()) cleanup();
    this.pdfSubscriptions.clear();
    void this.progress
      ?.dispose()
      .catch((e) => console.warn("Study Flow: final progress save", e));
    this.service?.index.dispose();
  }
}
