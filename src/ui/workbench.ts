import {
  ItemView,
  WorkspaceLeaf,
  PluginSettingTab,
  Setting,
  Notice,
  setIcon,
  type ViewStateResult,
} from "obsidian";
import type StudyFlowPlugin from "../main";
import { settingsFrom, validateSettings, type Settings } from "../core/model";
import { dependency, versionOf } from "../adapters/dependencies";
export const VIEW = "study-flow-workbench";
export type TabName = "reading" | "inbox" | "cards" | "review";
export function action(
  parent: HTMLElement,
  text: string,
  callback: () => Promise<unknown> | void,
  p: StudyFlowPlugin,
  primary = false,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    text,
    cls: primary ? "mod-cta" : "",
  });
  button.type = "button";
  button.addEventListener("mousedown", (e) => e.preventDefault());
  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await callback();
    } catch (e) {
      p.error(e);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}
export class Workbench extends ItemView {
  tab: TabName = "reading";
  bookId = "";
  private search = "";
  private state = "";
  private category = "";
  private limit = 100;
  private unsubscribe?: () => void;
  private timer?: number;
  private closed = false;
  private configuring = false;
  constructor(
    leaf: WorkspaceLeaf,
    private plugin: StudyFlowPlugin,
  ) {
    super(leaf);
  }
  getViewType(): string {
    return VIEW;
  }
  getDisplayText(): string {
    return "Study Flow";
  }
  getIcon(): string {
    return "graduation-cap";
  }
  getState(): { [key: string]: unknown } {
    return { tab: this.tab, bookId: this.bookId };
  }
  async setState(
    state: { [key: string]: unknown },
    result: ViewStateResult,
  ): Promise<void> {
    if (["reading", "inbox", "cards", "review"].includes(String(state.tab)))
      this.tab = state.tab as TabName;
    this.bookId = typeof state.bookId === "string" ? state.bookId : "";
    await super.setState(state, result);
    this.render();
  }
  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.addClass("study-flow");
    this.unsubscribe = this.plugin.service.index.subscribe(() => {
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.render(), 100);
    });
    this.render();
  }
  async onClose(): Promise<void> {
    this.closed = true;
    this.unsubscribe?.();
    if (this.timer) window.clearTimeout(this.timer);
    this.contentEl.empty();
  }
  render(): void {
    if (this.closed || this.configuring) return;
    const p = this.plugin,
      t = p.t.bind(p),
      root = this.contentEl;
    const focused = root.contains(root.ownerDocument.activeElement)
      ? (root.ownerDocument.activeElement as HTMLInputElement)
      : null;
    const focusLabel = focused?.getAttribute("aria-label"),
      caret = focused?.selectionStart;
    root.empty();
    const header = root.createDiv({ cls: "sf-header" }),
      mark = header.createDiv({ cls: "sf-mark" });
    setIcon(mark, "graduation-cap");
    const title = header.createDiv();
    title.createEl("strong", { text: "Study Flow" });
    title.createEl("small", { text: "by crown · v0.2" });
    const configure = () => {
      this.configuring = true;
      const done = () => {
        this.configuring = false;
        this.render();
      };
      if (p.settings.onboardingDone) {
        root.empty();
        action(root, t("返回工作台", "Back to workbench"), done, p);
      }
      new Configuration(root, p, done).render();
    };
    action(header, t("设置", "Settings"), configure, p).addClass("sf-quiet");
    if (!p.ready) {
      root.createEl("p", {
        text: t("正在整理学习索引…", "Indexing your learning files…"),
      });
      return;
    }
    if (!p.settings.onboardingDone) {
      root.createEl("h2", {
        text: t("把阅读变成自己的知识", "Turn reading into knowledge"),
      });
      root.createEl("p", {
        text: t(
          "先保存原文，稍后补理解和制卡。学习资料保存在你的笔记库中。",
          "Capture first, understand and make cards later. Your learning files stay in your vault.",
        ),
      });
      configure();
      return;
    }
    const nav = root.createDiv({ cls: "sf-nav" });
    for (const [id, zh, en] of [
      ["reading", "继续阅读", "Reading"],
      ["inbox", "摘录收件箱", "Inbox"],
      ["cards", "记忆卡片", "Cards"],
      ["review", "今日复习", "Review"],
    ] as const) {
      const button = action(
        nav,
        t(zh, en),
        async () => {
          this.tab = id;
          this.state = "";
          this.limit = 100;
          if (id === "review") await p.review.refresh();
          this.render();
        },
        p,
      );
      button.setAttribute("aria-pressed", String(this.tab === id));
    }
    const pdf = p.reader.snapshot(),
      capture = root.createDiv({ cls: "sf-capture" });
    capture.createEl("small", {
      text: pdf
        ? t("当前资料", "Current PDF")
        : t("阅读时先收集", "Capture while reading"),
    });
    capture.createEl("strong", {
      text:
        pdf?.title ??
        t("打开 PDF，选中一段原文", "Open a PDF and select some text"),
    });
    action(
      capture,
      t("保存 PDF 选区", "Capture PDF selection"),
      () => p.capturePdf(),
      p,
      true,
    );
    const list = root.createDiv({ cls: "sf-list" });
    try {
      if (this.tab === "reading") this.reading(list);
      else if (this.tab === "inbox") this.inbox(list);
      else if (this.tab === "cards") this.cards(list);
      else this.review(list);
    } catch (e) {
      list.createEl("p", {
        cls: "sf-warning",
        text: e instanceof Error ? e.message : String(e),
      });
    }
    const issues = p.service.index.issues;
    if (issues.size) {
      const box = root.createDiv({ cls: "sf-warning" });
      box.createEl("p", {
        text: t(
          `${issues.size} 个文件需要检查，原文件仍保留。`,
          `${issues.size} files need attention; their originals are preserved.`,
        ),
      });
      for (const [path, message] of [...issues].slice(0, 5)) {
        action(box, path, () => p.openPath(path), p);
        box.createEl("small", { text: message });
      }
    }
    const footer = root.createDiv({ cls: "sf-footer" });
    action(
      footer,
      t("升级旧数据", "Upgrade legacy data"),
      () => p.previewUpgrade(),
      p,
    );
    action(footer, t("刷新书架", "Refresh library"), () => p.rebuildIndex(), p);
    const legacy = p.legacyPlan;
    if (
      legacy &&
      legacy.changes.some((c) => !p.service.index.records.has(c.path))
    ) {
      const box = root.createDiv({ cls: "sf-warning" });
      box.createEl("p", {
        text: t(
          `发现旧资料：${legacy.books} 本 PDF、${legacy.excerpts} 条摘录、${legacy.cards} 张卡片。先预览再升级。`,
          `Legacy learning: ${legacy.books} books, ${legacy.excerpts} excerpts and ${legacy.cards} cards. Preview before upgrading.`,
        ),
      });
      for (const file of legacy.changes
        .filter((c) => c.before !== null)
        .slice(0, 5))
        action(box, file.path, () => p.openPath(file.path), p);
      action(
        box,
        t("预览与备份升级", "Preview and back up upgrade"),
        () => p.previewUpgrade(),
        p,
      );
    }
    if (focusLabel) {
      const input = Array.from(
        root.querySelectorAll<HTMLInputElement>("input[aria-label]"),
      ).find((el) => el.getAttribute("aria-label") === focusLabel);
      if (input) {
        input.focus();
        if (caret !== null && caret !== undefined)
          input.setSelectionRange(caret, caret);
      }
    }
  }
  private reading(parent: HTMLElement): void {
    const p = this.plugin,
      t = p.t.bind(p);
    parent.createEl("h3", { text: t("最近阅读", "Recently read") });
    const books = p.service.index.books();
    if (!books.length) {
      const empty = parent.createDiv({ cls: "sf-empty" });
      empty.createEl("h3", {
        text: t("开始第一份学习资料", "Start your first reading"),
      });
      empty.createEl("p", {
        text: t(
          "把 PDF 放进笔记库。选中原文后点保存，理解可以稍后再写。",
          "Add a PDF to the vault. Capture a passage now and write your understanding later.",
        ),
      });
    }
    for (const book of books.slice(0, this.limit)) {
      const row = parent.createDiv({ cls: "sf-book" }),
        cover = row.createDiv({ cls: "sf-book-cover" });
      setIcon(cover, "book-open");
      cover.createEl("small", { text: `p.${book.page}` });
      const body = row.createDiv({ cls: "sf-book-body" });
      body.createEl("h4", { text: book.title });
      body.createEl("small", {
        text: `${book.category} · ${book.page}${book.totalPages ? " / " + book.totalPages : ""} · ${book.status === "done" ? t("已读完", "Finished") : book.status === "paused" ? t("暂停", "Paused") : t("阅读中", "Reading")}`,
      });
      const progress = body.createEl("progress");
      progress.max = book.totalPages || 1;
      progress.value = book.totalPages ? book.page : 0;
      progress.setAttribute("aria-label", t("阅读进度", "Reading progress"));
      const buttons = body.createDiv({ cls: "sf-actions" });
      action(
        buttons,
        t("继续阅读", "Continue"),
        () => p.openSource(book),
        p,
        true,
      );
      const count = p.service.index
        .excerpts()
        .filter((e) => e.bookId === book.id).length;
      action(
        buttons,
        t(`摘录 ${count}`, `Excerpts ${count}`),
        () => {
          this.tab = "inbox";
          this.bookId = book.id;
          this.render();
        },
        p,
      );
      action(
        buttons,
        t("学习笔记", "Study note"),
        () => p.openPath(book.path),
        p,
      );
      if (!p.service.vault.exists(book.pdfPath))
        action(
          buttons,
          t("重新关联 PDF", "Relink PDF"),
          () => p.relinkBook(book),
          p,
        );
      action(
        buttons,
        book.status === "done"
          ? t("重新阅读", "Read again")
          : t("标记读完", "Mark finished"),
        () =>
          p.service.setBookStatus(
            book.id,
            book.status === "done" ? "reading" : "done",
          ),
        p,
      );
    }
    if (books.length > this.limit)
      action(
        parent,
        t("查看更多", "Show more"),
        () => {
          this.limit += 100;
          this.render();
        },
        p,
      );
    const start = parent.createDiv({ cls: "sf-add" });
    start.createEl("h4", { text: t("打开学习资料", "Open a PDF") });
    const files = p.app.vault
      .getFiles()
      .filter((f) => f.extension.toLowerCase() === "pdf")
      .sort((a, b) => a.basename.localeCompare(b.basename));
    if (files.length) {
      const select = start.createEl("select", {
        attr: { "aria-label": t("选择 PDF", "Choose PDF") },
      });
      for (const file of files)
        select.createEl("option", {
          text: file.basename,
          attr: { value: file.path },
        });
      action(
        start,
        t("打开 PDF", "Open PDF"),
        () => p.openPath(select.value),
        p,
      );
    } else
      start.createEl("p", {
        text: t(
          "把 PDF 拖入笔记库后，它会出现在这里。",
          "Drag a PDF into the vault to see it here.",
        ),
      });
    const inputs = parent.createDiv({ cls: "sf-actions" });
    action(
      inputs,
      t("复制变卡片", "Clipboard to card"),
      () => p.createManual("text"),
      p,
    );
    action(
      inputs,
      t("截图变卡片", "Screenshot to card"),
      () => p.createManual("screenshot"),
      p,
    );
  }
  private filters(
    parent: HTMLElement,
    list: HTMLElement,
    render: () => void,
  ): void {
    const p = this.plugin,
      t = p.t.bind(p),
      filters = parent.createDiv({ cls: "sf-filters" }),
      search = filters.createEl("input", {
        attr: {
          type: "search",
          placeholder: t("搜索学习内容", "Search learning content"),
          "aria-label": t("搜索学习内容", "Search learning content"),
        },
      });
    search.value = this.search;
    search.addEventListener("input", () => {
      this.search = search.value;
      this.limit = 100;
      list.empty();
      render();
    });
    const book = filters.createEl("select", {
      attr: { "aria-label": t("按书本筛选", "Filter by book") },
    });
    book.createEl("option", {
      text: t("全部资料", "All books"),
      attr: { value: "" },
    });
    for (const item of p.service.index.books())
      book.createEl("option", { text: item.title, attr: { value: item.id } });
    book.value = this.bookId;
    book.addEventListener("change", () => {
      this.bookId = book.value;
      this.limit = 100;
      list.empty();
      render();
    });
    const category = filters.createEl("select", {
      attr: { "aria-label": t("按分类筛选", "Filter by category") },
    });
    category.createEl("option", {
      text: t("全部分类", "All categories"),
      attr: { value: "" },
    });
    for (const c of p.settings.pdfCategories)
      category.createEl("option", { text: c.label, attr: { value: c.value } });
    category.value = this.category;
    category.addEventListener("change", () => {
      this.category = category.value;
      this.limit = 100;
      list.empty();
      render();
    });
    const state = filters.createEl("select", {
      attr: { "aria-label": t("按整理状态筛选", "Filter by status") },
    });
    const states =
      this.tab === "inbox"
        ? [
            ["inbox", "待理解", "To understand"],
            ["understood", "已写理解", "Understood"],
            ["archived", "已归档", "Archived"],
          ]
        : [
            ["draft", "草稿", "Draft"],
            ["active", "已发布", "Published"],
          ];
    for (const [value, zh, en] of [["", "全部状态", "All statuses"], ...states])
      state.createEl("option", {
        text: t(zh ?? "", en ?? ""),
        attr: { value: value ?? "" },
      });
    state.value = this.state;
    state.addEventListener("change", () => {
      this.state = state.value;
      this.limit = 100;
      list.empty();
      render();
    });
  }
  private inbox(parent: HTMLElement): void {
    const p = this.plugin,
      t = p.t.bind(p);
    parent.createEl("h3", { text: t("摘录收件箱", "Excerpt inbox") });
    parent.createEl("p", {
      cls: "sf-muted",
      text: t(
        "用自己的话解释，再把值得记住的内容做成卡片。",
        "Explain it in your own words, then make cards for what matters.",
      ),
    });
    const form = parent.createDiv(),
      list = parent.createDiv();
    const render = () => {
      const excerpts = p.service.index
        .excerpts()
        .filter(
          (e) =>
            (!this.bookId || e.bookId === this.bookId) &&
            (!this.state || e.state === this.state) &&
            (!this.category ||
              (
                p.service.index.get(e.bookId) as
                  | { category?: string }
                  | undefined
              )?.category === this.category) &&
            `${e.quote} ${e.reflection}`
              .toLowerCase()
              .includes(this.search.toLowerCase()),
        );
      if (!excerpts.length)
        list.createDiv({
          cls: "sf-empty",
          text: t(
            "还没有匹配的摘录。保存一段 PDF 原文，从这里开始整理。",
            "No matching excerpts. Capture a PDF passage to start.",
          ),
        });
      for (const e of excerpts.slice(0, this.limit)) {
        const box = list.createDiv({ cls: "sf-excerpt" }),
          book = p.service.index.get(e.bookId);
        box.createEl("small", {
          text: `${book?.kind === "book" ? book.title : t("资料", "Source")} · p.${e.page} · ${e.state === "understood" ? t("已写理解", "Understood") : e.state === "archived" ? t("已归档", "Archived") : t("待理解", "To understand")}`,
        });
        box.createEl("blockquote", { text: e.quote });
        if (e.reflection)
          box.createEl("p", { text: e.reflection, cls: "sf-understanding" });
        const cards = p.service.index
          .cards()
          .filter((c) => c.excerptId === e.id);
        if (cards.length)
          box.createEl("small", {
            text: t(
              `关联 ${cards.length} 张卡片`,
              `Linked to ${cards.length} cards`,
            ),
          });
        const buttons = box.createDiv({ cls: "sf-actions" });
        action(
          buttons,
          t("写理解", "Write understanding"),
          () => p.editExcerpt(e.id),
          p,
          true,
        );
        action(buttons, t("建卡", "Make a card"), () => p.newCard(e.id), p);
        action(buttons, t("原文", "Source"), () => p.openSource(e), p);
        action(buttons, t("笔记", "Note"), () => p.openPath(e.path), p);
      }
      if (excerpts.length > this.limit)
        action(
          list,
          t("查看更多", "Show more"),
          () => {
            this.limit += 100;
            list.empty();
            render();
          },
          p,
        );
    };
    this.filters(form, list, render);
    render();
  }
  private cards(parent: HTMLElement): void {
    const p = this.plugin,
      t = p.t.bind(p);
    parent.createEl("h3", { text: t("记忆卡片", "Memory cards") });
    const form = parent.createDiv(),
      list = parent.createDiv();
    const render = () => {
      const cards = p.service.index
        .cards()
        .filter(
          (c) =>
            (!this.bookId || c.bookId === this.bookId) &&
            (!this.state || c.status === this.state) &&
            (!this.category ||
              (
                p.service.index.get(c.bookId) as
                  | { category?: string }
                  | undefined
              )?.category === this.category) &&
            `${c.question} ${c.answer}`
              .toLowerCase()
              .includes(this.search.toLowerCase()),
        );
      if (!cards.length)
        list.createDiv({
          cls: "sf-empty",
          text: t(
            "从摘录、复制文字或截图创建第一张卡片。",
            "Make a card from an excerpt, copied text or screenshot.",
          ),
        });
      for (const c of cards.slice(0, this.limit)) {
        const box = list.createDiv({ cls: "sf-card" });
        box.createEl("small", {
          text: `${c.status === "draft" ? t("草稿", "Draft") : t("已发布", "Published")} · ${c.deckTag}`,
        });
        box.createEl("p", {
          text: c.question || t("还没填写问题", "Question not written yet"),
        });
        const buttons = box.createDiv({ cls: "sf-actions" });
        action(
          buttons,
          t("编辑与预览", "Edit and preview"),
          () => p.editCard(c.id),
          p,
          true,
        );
        action(
          buttons,
          t("卡片文件", "Card file"),
          () => p.openPath(c.path),
          p,
        );
        if (c.excerptId)
          action(
            buttons,
            t("摘录与理解", "Excerpt"),
            () => p.editExcerpt(c.excerptId),
            p,
          );
      }
      if (cards.length > this.limit)
        action(
          list,
          t("查看更多", "Show more"),
          () => {
            this.limit += 100;
            list.empty();
            render();
          },
          p,
        );
    };
    this.filters(form, list, render);
    render();
  }
  private review(parent: HTMLElement): void {
    const p = this.plugin,
      t = p.t.bind(p),
      stats = p.review.stats();
    parent.createEl("h3", { text: t("今日复习", "Today’s review") });
    const box = parent.createDiv({ cls: "sf-review" });
    setIcon(box.createDiv({ cls: "sf-review-icon" }), "brain");
    box.createEl("h2", {
      text: stats
        ? t(
            `${stats.due} 张到期 · ${stats.new} 张新卡`,
            `${stats.due} due · ${stats.new} new`,
          )
        : t("回忆，让知识留下来", "Recall what you learned"),
    });
    box.createEl("p", {
      text: t(
        "进入 SR 原生复习，选择卡组、回忆、查看答案并评分。",
        "Open native SR review, choose a deck, recall, reveal and rate.",
      ),
    });
    box.createEl("small", {
      text: t(
        "统计范围：全部 SR 卡组；未就绪时不显示数量。",
        "Counts cover all SR decks and are hidden when unavailable.",
      ),
    });
    action(box, t("开始复习", "Start review"), () => p.startReview(), p, true);
    action(
      box,
      t("刷新统计", "Refresh counts"),
      async () => {
        await p.review.refresh();
        this.render();
      },
      p,
    );
    if (!p.review.enabled)
      action(
        parent,
        t("安装 Spaced Repetition", "Install Spaced Repetition"),
        () => {
          window.open("obsidian://show-plugin?id=obsidian-spaced-repetition");
        },
        p,
      );
  }
}
export class Configuration {
  private draft: Settings;
  constructor(
    private parent: HTMLElement,
    private plugin: StudyFlowPlugin,
    private onSaved: () => void,
  ) {
    this.draft = structuredClone(plugin.settings);
  }
  render(): void {
    const p = this.plugin,
      t = p.t.bind(p),
      root = this.parent.createDiv({ cls: "sf-configuration" });
    root.createEl("h3", { text: t("配置学习工作台", "Set up your workbench") });
    const deps = root.createDiv({ cls: "sf-dependencies" });
    for (const [id, name] of [
      ["pdf-plus", "PDF++"],
      ["obsidian-spaced-repetition", "Spaced Repetition"],
    ] as const) {
      const plugin = dependency(p.app, id),
        row = deps.createDiv({
          cls: plugin ? "sf-dependency sf-ok" : "sf-dependency",
        });
      row.createEl("strong", { text: name });
      row.createEl("small", {
        text: plugin
          ? t(`已启用 ${versionOf(plugin)}`, `Enabled ${versionOf(plugin)}`)
          : t("未启用", "Not enabled"),
      });
      if (!plugin)
        action(
          row,
          t("打开安装页", "Open install page"),
          () => {
            window.open(`obsidian://show-plugin?id=${id}`);
          },
          p,
        );
    }
    root.createEl("p", {
      cls: "sf-muted",
      text: t(
        "PDF++ 用于选区定位，SR 用于复习，QuickAdd 是可选入口。",
        "PDF++ locates selections; SR handles review; QuickAdd is optional.",
      ),
    });
    new Setting(root).setName(t("界面语言", "Language")).addDropdown((d) =>
      d
        .addOption("auto", t("跟随 Obsidian", "Follow Obsidian"))
        .addOption("zh", "中文")
        .addOption("en", "English")
        .setValue(this.draft.language)
        .onChange((v) => {
          this.draft.language = v as Settings["language"];
        }),
    );
    new Setting(root)
      .setName(t("默认 PDF 分类", "Default PDF category"))
      .addDropdown((d) => {
        this.draft.pdfCategories.forEach((c) => d.addOption(c.value, c.label));
        d.setValue(this.draft.defaultCategory).onChange((v) => {
          this.draft.defaultCategory = v;
        });
      });
    new Setting(root)
      .setName(t("默认卡组", "Default deck"))
      .addDropdown((d) => {
        this.draft.decks.forEach((c) => d.addOption(c.tag, c.label));
        d.setValue(this.draft.defaultDeck).onChange((v) => {
          this.draft.defaultDeck = v;
        });
      });
    new Setting(root)
      .setName(t("自动保存阅读进度", "Save reading progress automatically"))
      .setDesc(
        t(
          "只记录已经开始学习的 PDF，读完状态由你确认。",
          "Tracks PDFs you have started learning; you mark them finished.",
        ),
      )
      .addToggle((d) =>
        d.setValue(this.draft.autoProgress).onChange((v) => {
          this.draft.autoProgress = v;
        }),
      );
    const advanced = root.createEl("details");
    advanced.createEl("summary", {
      text: t("目录、分类与卡组", "Folders, categories and decks"),
    });
    for (const [key, zh, en] of [
      ["excerptFolder", "摘录目录", "Excerpt folder"],
      ["cardFolder", "卡片目录", "Card folder"],
      ["attachmentFolder", "图片目录", "Image folder"],
      ["shelfPath", "书架文件", "Library file"],
    ] as const)
      new Setting(advanced).setName(t(zh, en)).addText((input) =>
        input.setValue(this.draft[key]).onChange((v) => {
          this.draft[key] = v;
        }),
      );
    advanced.createEl("p", {
      text: t(
        "修改目录只影响新文件，已有资料继续保留。",
        "Folder changes affect new files; existing files remain accessible.",
      ),
      cls: "sf-muted",
    });
    const categories = advanced.createDiv();
    categories.createEl("h4", { text: t("PDF 分类", "PDF categories") });
    this.draft.pdfCategories.forEach((c, i) => {
      const row = categories.createDiv({ cls: "sf-config-row" });
      new Setting(row)
        .setName(t("分类名称", "Category name"))
        .addText((input) =>
          input.setValue(c.label).onChange((v) => {
            c.label = v;
          }),
        );
      new Setting(row)
        .setName(t("输出目录", "Output folder"))
        .addText((input) =>
          input.setValue(c.folder).onChange((v) => {
            c.folder = v;
          }),
        );
      new Setting(row).setName(t("分类标签", "Category tag")).addText((input) =>
        input.setValue(c.tag).onChange((v) => {
          c.tag = v;
        }),
      );
      action(
        row,
        t("移除", "Remove"),
        () => {
          this.draft.pdfCategories.splice(i, 1);
          this.draft.defaultCategory = this.draft.pdfCategories[0]?.value ?? "";
          root.remove();
          this.render();
        },
        p,
      );
    });
    action(
      categories,
      t("新增分类", "Add category"),
      () => {
        const value = `category-${crypto.randomUUID().slice(0, 6)}`;
        this.draft.pdfCategories.push({
          label: t("新分类", "New category"),
          value,
          folder: `02_PDF学习/${value}`,
          tag: `学习/${value}`,
        });
        root.remove();
        this.render();
      },
      p,
    );
    const decks = advanced.createDiv();
    decks.createEl("h4", { text: t("复习卡组", "Review decks") });
    const roots = p.review.settings?.flashcardTags;
    if (roots?.length)
      decks.createEl("small", {
        text: t(
          `SR 识别的标签：${roots.join(", ")}`,
          `SR flashcard tags: ${roots.join(", ")}`,
        ),
      });
    this.draft.decks.forEach((d, i) => {
      const row = decks.createDiv({ cls: "sf-config-row" });
      new Setting(row).setName(t("卡组名称", "Deck name")).addText((input) =>
        input.setValue(d.label).onChange((v) => {
          d.label = v;
        }),
      );
      new Setting(row).setName(t("卡组标签", "Deck tag")).addText((input) =>
        input.setValue(d.tag).onChange((v) => {
          if (this.draft.defaultDeck === d.tag) this.draft.defaultDeck = v;
          d.tag = v;
        }),
      );
      action(
        row,
        t("移除", "Remove"),
        () => {
          this.draft.decks.splice(i, 1);
          this.draft.defaultDeck = this.draft.decks[0]?.tag ?? "";
          root.remove();
          this.render();
        },
        p,
      );
    });
    action(
      decks,
      t("新增卡组", "Add deck"),
      () => {
        this.draft.decks.push({
          label: t("新卡组", "New deck"),
          tag: `${roots?.[0]?.replace(/^#/, "") ?? "flashcards"}/deck-${this.draft.decks.length + 1}`,
        });
        root.remove();
        this.render();
      },
      p,
    );
    const buttons = root.createDiv({ cls: "sf-actions" });
    if (p.service.vault.exists("StudyFlow/config.json"))
      action(
        buttons,
        t("导入旧配置", "Import legacy settings"),
        async () => {
          this.draft = settingsFrom({
            ...p.settings,
            ...JSON.parse(await p.service.vault.read("StudyFlow/config.json")),
          });
          root.remove();
          this.render();
          new Notice(
            t(
              "已载入旧配置，请检查后保存。",
              "Legacy settings loaded. Check them before saving.",
            ),
          );
        },
        p,
      );
    action(
      buttons,
      t("保存并打开工作台", "Save and open workbench"),
      async () => {
        validateSettings(this.draft);
        await p.saveSettings({ ...this.draft, onboardingDone: true });
        p.notice("配置已保存。", "Settings saved.");
        this.onSaved();
      },
      p,
      true,
    );
  }
}
export class StudyFlowSettings extends PluginSettingTab {
  constructor(
    app: StudyFlowPlugin["app"],
    private plugin: StudyFlowPlugin,
  ) {
    super(app, plugin);
  }
  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("study-flow");
    new Configuration(this.containerEl, this.plugin, () =>
      this.display(),
    ).render();
    action(
      this.containerEl,
      this.plugin.t("预览旧数据升级", "Preview legacy upgrade"),
      () => this.plugin.previewUpgrade(),
      this.plugin,
    );
    action(
      this.containerEl,
      this.plugin.t("恢复升级备份", "Restore upgrade backup"),
      () => this.plugin.restoreUpgrade(),
      this.plugin,
    );
  }
}
