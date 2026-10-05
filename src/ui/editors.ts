import { App, Modal, Component, MarkdownRenderer, Notice } from "obsidian";
import type StudyFlowPlugin from "../main";
import {
  type Excerpt,
  type Book,
  type Card,
  type SaveResult,
  FlowError,
  hasText,
} from "../core/model";
import type { UpgradePlan } from "../core/migration";
import type { AttachmentSession } from "../core/attachment";
import { action } from "./workbench";
function compareEdits(
  parent: HTMLElement,
  latest: string,
  draft: string,
  p: StudyFlowPlugin,
): void {
  let start = 0,
    end = 0;
  while (
    start < latest.length &&
    start < draft.length &&
    latest[start] === draft[start]
  )
    start++;
  while (
    end < latest.length - start &&
    end < draft.length - start &&
    latest[latest.length - end - 1] === draft[draft.length - end - 1]
  )
    end++;
  for (const [text, name, tag] of [
    [latest, p.t("文件最新内容", "Latest file"), "del"],
    [draft, p.t("你的输入", "Your input"), "ins"],
  ] as const) {
    parent.createEl("small", { text: name });
    const block = parent.createEl("blockquote");
    block.createSpan({ text: text.slice(0, start) });
    block.createEl(tag, {
      text: text.slice(start, end ? text.length - end : text.length),
    });
    block.createSpan({ text: end ? text.slice(-end) : "" });
  }
}
function textarea(
  parent: HTMLElement,
  label: string,
  value: string,
  rows: number,
): HTMLTextAreaElement {
  const wrapper = parent.createDiv({ cls: "sf-field" }),
    id = `sf-${crypto.randomUUID()}`;
  wrapper.createEl("label", { text: label, attr: { for: id } });
  const input = wrapper.createEl("textarea", {
    attr: { id, rows: String(rows), "aria-label": label },
  });
  input.value = value;
  return input;
}
export class ExcerptEditor extends Modal {
  private input!: HTMLTextAreaElement;
  private status!: HTMLElement;
  private conflict!: HTMLElement;
  private saving = false;
  constructor(
    app: App,
    private p: StudyFlowPlugin,
    private excerpt: Excerpt,
  ) {
    super(app);
  }
  onOpen(): void {
    const p = this.p,
      t = p.t.bind(p),
      root = this.contentEl;
    root.addClass("study-flow", "sf-editor");
    this.setTitle(t("理解这段原文", "Understand this excerpt"));
    root.createEl("small", { text: `p.${this.excerpt.page}` });
    root.createEl("blockquote", {
      text: this.excerpt.quote,
      cls: "sf-original",
    });
    this.input = textarea(
      root,
      t("我的理解", "My understanding"),
      this.excerpt.reflection,
      6,
    );
    this.input.placeholder = t(
      "用自己的话解释，举个例子，或记下没想明白的地方。",
      "Explain it in your own words, give an example, or record what is still unclear.",
    );
    this.status = root.createEl("p", {
      cls: "sf-muted",
      attr: { "aria-live": "polite" },
    });
    this.conflict = root.createDiv({ cls: "sf-conflict" });
    const buttons = root.createDiv({ cls: "sf-actions" });
    action(
      buttons,
      t("保存理解", "Save understanding"),
      () => this.save(),
      p,
      true,
    );
    action(
      buttons,
      t("保存理解并建卡", "Save and make a card"),
      async () => {
        if (await this.save()) {
          const id = this.excerpt.id;
          this.close();
          await p.newCard(id);
        }
      },
      p,
    );
    action(
      buttons,
      t("原文", "Source"),
      async () => {
        this.close();
        await p.openSource(this.excerpt);
      },
      p,
    );
    action(
      buttons,
      t(
        this.excerpt.state === "archived" ? "取消归档" : "归档",
        this.excerpt.state === "archived" ? "Unarchive" : "Archive",
      ),
      () => this.save(this.excerpt.state !== "archived"),
      p,
    );
    action(buttons, t("取消", "Cancel"), () => this.close(), p);
  }
  private async save(
    archived = this.excerpt.state === "archived",
  ): Promise<boolean> {
    if (this.saving) return false;
    this.saving = true;
    try {
      await this.p.service.saveReflection(
        this.excerpt.id,
        this.input.value,
        this.excerpt.revision,
        archived,
      );
      this.excerpt = (await this.p.service.read(this.excerpt.id)) as Excerpt;
      this.status.textContent = this.p.t(
        "理解已保存。",
        "Understanding saved.",
      );
      this.conflict.empty();
      return true;
    } catch (e) {
      this.p.error(e);
      this.status.textContent = e instanceof Error ? e.message : String(e);
      if (e instanceof FlowError && e.code === "conflict") {
        const latest = (await this.p.service.read(this.excerpt.id)) as Excerpt;
        this.conflict.empty();
        this.conflict.createEl("strong", {
          text: this.p.t(
            "文件里已有新的理解，你的输入保留在上方。",
            "The file has newer understanding. Your input is kept above.",
          ),
        });
        compareEdits(
          this.conflict,
          latest.reflection,
          this.input.value,
          this.p,
        );
        action(
          this.conflict,
          this.p.t("载入最新内容", "Load latest"),
          () => {
            this.excerpt = latest;
            this.input.value = latest.reflection;
            this.conflict.empty();
          },
          this.p,
        );
        action(
          this.conflict,
          this.p.t("使用我的输入保存", "Save my input"),
          async () => {
            this.excerpt = latest;
            await this.save();
          },
          this.p,
        );
      }
      return false;
    } finally {
      this.saving = false;
    }
  }
  close(): void {
    if (!this.saving) super.close();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
export class CardEditor extends Modal {
  private question!: HTMLTextAreaElement;
  private answer!: HTMLTextAreaElement;
  private deck!: HTMLSelectElement;
  private state!: HTMLElement;
  private conflict!: HTMLElement;
  private preview!: HTMLElement;
  private component = new Component();
  private result: SaveResult | null = null;
  private saving = false;
  constructor(
    app: App,
    private p: StudyFlowPlugin,
    private card: Card,
    private resolve: (result: SaveResult | null) => void,
    private attachment?: AttachmentSession,
    private image?: string,
  ) {
    super(app);
  }
  onOpen(): void {
    const p = this.p,
      t = p.t.bind(p),
      root = this.contentEl;
    root.addClass("study-flow", "sf-editor");
    this.modalEl.addClass("sf-modal");
    this.setTitle(t("编辑记忆卡片", "Edit memory card"));
    this.component.load();
    root.createEl("p", {
      cls: "sf-muted",
      text: t(
        "先回忆问题，再查看答案。来源只出现在背面。",
        "Recall the question before revealing the answer. Sources appear on the back.",
      ),
    });
    if (this.image)
      root.createEl("img", {
        cls: "sf-image-preview",
        attr: { src: this.image, alt: t("本次截图", "Captured screenshot") },
      });
    this.question = textarea(
      root,
      t("问题", "Question"),
      this.card.question,
      3,
    );
    this.answer = textarea(root, t("答案", "Answer"), this.card.answer, 5);
    const label = root.createEl("label", {
      text: t("复习卡组", "Review deck"),
    });
    this.deck = label.createEl("select", {
      attr: { "aria-label": t("复习卡组", "Review deck") },
    });
    for (const d of p.settings.decks)
      this.deck.createEl("option", { text: d.label, attr: { value: d.tag } });
    if (!p.settings.decks.some((d) => d.tag === this.card.deckTag))
      this.deck.createEl("option", {
        text: this.card.deckTag,
        attr: { value: this.card.deckTag },
      });
    this.deck.value = this.card.deckTag;
    this.state = root.createEl("p", {
      cls: "sf-muted",
      attr: { "aria-live": "polite" },
    });
    this.conflict = root.createDiv({ cls: "sf-conflict" });
    this.preview = root.createDiv({ cls: "sf-preview" });
    const buttons = root.createDiv({ cls: "sf-actions" });
    action(buttons, t("预览", "Preview"), () => this.renderPreview(), p);
    if (this.card.status === "draft")
      action(buttons, t("保存草稿", "Save draft"), () => this.save(false), p);
    const publish = action(
      buttons,
      this.card.status === "active"
        ? t("保存修改", "Save changes")
        : t("发布到复习", "Publish for review"),
      () => this.save(true),
      p,
      true,
    );
    const validate = () => {
      publish.disabled =
        !hasText(this.question.value) || !hasText(this.answer.value);
      this.state.textContent = publish.disabled
        ? t(
            "发布前请填写问题和答案；也可以先存草稿。",
            "Add a question and answer before publishing, or save a draft.",
          )
        : t(
            "准备好后预览，再确认发布。",
            "Preview the card, then publish when ready.",
          );
    };
    this.question.addEventListener("input", validate);
    this.answer.addEventListener("input", validate);
    validate();
    action(buttons, t("取消", "Cancel"), () => this.close(), p);
  }
  private async renderPreview(): Promise<void> {
    this.component.unload();
    this.component = new Component();
    this.component.load();
    this.preview.empty();
    this.preview.createEl("small", {
      text: this.p.t("正面 · 先回忆", "Front · recall first"),
    });
    const front = this.preview.createDiv({ cls: "sf-preview-front" });
    if (this.image)
      front.createEl("img", {
        cls: "sf-image-preview",
        attr: { src: this.image, alt: this.p.t("本次截图", "Screenshot") },
      });
    await MarkdownRenderer.render(
      this.app,
      this.image
        ? this.question.value.replace(/!\[\[[^\]]+\]\]/, "")
        : this.question.value,
      front,
      this.card.path,
      this.component,
    );
    const back = this.preview.createEl("details");
    back.createEl("summary", { text: this.p.t("显示答案", "Reveal answer") });
    const answer = back.createDiv({ cls: "sf-preview-back" });
    await MarkdownRenderer.render(
      this.app,
      this.answer.value,
      answer,
      this.card.path,
      this.component,
    );
    if (this.card.source)
      answer.createEl("small", {
        text: this.p.t(
          "发布后的卡片背面包含原文和摘录链接。",
          "Published card backs include source and excerpt links.",
        ),
      });
  }
  private async save(active: boolean): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      if (active)
        this.p.review.requirePublish(
          this.deck.value,
          this.question.value,
          this.answer.value,
        );
      const next = {
        ...this.card,
        question: this.question.value,
        answer: this.answer.value,
        deckTag: this.deck.value,
        status: active ? ("active" as const) : ("draft" as const),
        separator: active ? this.p.review.separator : this.card.separator,
      };
      const write = () =>
        this.p.service.saveCard(next, this.card.revision || undefined);
      this.result = this.attachment
        ? await this.attachment.save(write)
        : await write();
      if (active) {
        try {
          await this.p.review.refresh();
        } catch {
          this.result.warnings.push(
            "Card saved; open the SR review command to refresh.",
          );
        }
      }
      this.p.notice(
        active
          ? "卡片已发布，复习进度保持。"
          : "草稿已保存，确认发布后才进入复习。",
        active
          ? "Card published; review progress preserved."
          : "Draft saved. It will enter review only after publishing.",
      );
      this.result.warnings.forEach((w) => new Notice(w));
      this.saving = false;
      this.close();
    } catch (e) {
      this.p.error(e);
      this.state.textContent = e instanceof Error ? e.message : String(e);
      if (e instanceof FlowError && e.code === "conflict") {
        const latest = (await this.p.service.read(this.card.id)) as Card;
        this.conflict.empty();
        this.conflict.createEl("strong", {
          text: this.p.t(
            "文件已有新修改，你的输入保留在上方。",
            "The file has newer changes. Your input is kept above.",
          ),
        });
        compareEdits(
          this.conflict,
          `${latest.question}\n\n${latest.answer}`,
          `${this.question.value}\n\n${this.answer.value}`,
          this.p,
        );
        action(
          this.conflict,
          this.p.t("载入最新内容", "Load latest"),
          () => {
            this.card = latest;
            this.question.value = latest.question;
            this.answer.value = latest.answer;
            this.deck.value = latest.deckTag;
            this.conflict.empty();
          },
          this.p,
        );
        action(
          this.conflict,
          this.p.t("使用我的输入保存", "Save my input"),
          async () => {
            this.card = latest;
            await this.save(active);
          },
          this.p,
        );
      }
    } finally {
      this.saving = false;
    }
  }
  close(): void {
    if (!this.saving) super.close();
  }
  onClose(): void {
    this.component.unload();
    void this.attachment?.cancel().catch((e) => this.p.error(e));
    this.contentEl.empty();
    this.resolve(this.result);
  }
}
export class UpgradeModal extends Modal {
  private busy = false;
  constructor(
    app: App,
    private p: StudyFlowPlugin,
    private plan: UpgradePlan,
  ) {
    super(app);
  }
  onOpen(): void {
    const root = this.contentEl,
      p = this.p,
      t = p.t.bind(p);
    root.addClass("study-flow", "sf-editor");
    this.setTitle(t("旧数据升级预览", "Legacy upgrade preview"));
    root.createEl("p", {
      text: t(
        `${this.plan.books} 本学习笔记 · ${this.plan.excerpts} 条摘录 · ${this.plan.cards} 张卡片`,
        `${this.plan.books} books · ${this.plan.excerpts} excerpts · ${this.plan.cards} cards`,
      ),
    });
    root.createEl("p", {
      text: t(
        "先备份原文件，再增加稳定 ID 并整理摘录。卡片原答案和 SR 调度信息保留。",
        "Back up originals, add stable IDs and organize excerpts. Existing answers and SR scheduling information are preserved.",
      ),
    });
    for (const c of this.plan.changes
      .filter((c) => c.before !== null)
      .slice(0, 15))
      action(root, c.path, () => p.openPath(c.path), p);
    if (this.plan.skipped.length)
      root.createEl("p", {
        text:
          t(
            `有 ${this.plan.skipped.length} 项无法确定格式，保持原样：`,
            `${this.plan.skipped.length} ambiguous items are left unchanged: `,
          ) + this.plan.skipped.join(", "),
      });
    const buttons = root.createDiv({ cls: "sf-actions" });
    if (this.plan.changes.length)
      action(
        buttons,
        t("备份并升级", "Back up and upgrade"),
        async () => {
          this.busy = true;
          try {
            const folder = await p.upgrade.apply(this.plan);
            new Notice(
              t(
                `升级完成，备份在 ${folder}`,
                `Upgrade complete. Backup: ${folder}`,
              ),
              8000,
            );
            this.busy = false;
            this.close();
            p.renderViews();
          } finally {
            this.busy = false;
          }
        },
        p,
        true,
      );
    else
      root.createEl("p", {
        text: t("没有需要升级的旧数据。", "No legacy data needs upgrading."),
      });
    action(buttons, t("取消", "Cancel"), () => this.close(), p);
  }
  close(): void {
    if (!this.busy) super.close();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
export class RestoreModal extends Modal {
  constructor(
    app: App,
    private p: StudyFlowPlugin,
  ) {
    super(app);
  }
  onOpen(): void {
    const p = this.p,
      t = p.t.bind(p),
      root = this.contentEl;
    root.addClass("study-flow");
    this.setTitle(t("恢复升级备份", "Restore upgrade backup"));
    root.createEl("p", {
      text: t(
        "升级后有新编辑或复习记录时，会停止恢复以保留它们。",
        "Restore stops if files have newer edits or reviews, preserving those changes.",
      ),
    });
    const folders = p.service.vault
      .list()
      .filter(
        (f) =>
          f.path.startsWith("StudyFlow/upgrade-backups/") &&
          f.path.endsWith("/manifest.json"),
      )
      .map((f) => f.path.slice(0, -"/manifest.json".length));
    if (!folders.length) {
      root.createEl("p", {
        text: t("没有升级备份。", "No upgrade backups found."),
      });
      return;
    }
    const select = root.createEl("select", {
      attr: { "aria-label": t("选择升级备份", "Choose upgrade backup") },
    });
    for (const folder of folders.sort().reverse())
      select.createEl("option", { text: folder, attr: { value: folder } });
    action(
      root,
      t("恢复原文件", "Restore originals"),
      async () => {
        await p.upgrade.restore(select.value);
        p.notice(
          "原文件已恢复，新学习资料保留。",
          "Originals restored; unrelated learning files preserved.",
        );
        this.close();
      },
      p,
      true,
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
export class RelinkModal extends Modal {
  private busy = false;
  constructor(
    app: App,
    private p: StudyFlowPlugin,
    private book: Book,
  ) {
    super(app);
  }
  onOpen(): void {
    const p = this.p,
      t = p.t.bind(p),
      root = this.contentEl;
    root.addClass("study-flow");
    this.setTitle(t("重新关联 PDF", "Relink PDF"));
    root.createEl("p", {
      text: t(
        "选择库内的原资料或替代版本。已有原文快照保留；旧选区坐标可能不适用于新版本。",
        "Choose the original or a replacement PDF. Source snapshots remain; old selection coordinates may not match a new edition.",
      ),
    });
    const select = root.createEl("select", {
      attr: { "aria-label": t("选择替代 PDF", "Choose replacement PDF") },
    });
    select.createEl("option", {
      text: t("请选择 PDF", "Choose a PDF"),
      attr: { value: "" },
    });
    for (const file of p.app.vault
      .getFiles()
      .filter((f) => f.extension.toLowerCase() === "pdf"))
      select.createEl("option", {
        text: file.path,
        attr: { value: file.path },
      });
    const save = action(
      root,
      t("保存关联", "Save link"),
      async () => {
        this.busy = true;
        try {
          const result = await p.service.relinkBook(this.book.id, select.value);
          result.warnings.forEach((w) => new Notice(w));
          this.busy = false;
          this.close();
        } finally {
          this.busy = false;
        }
      },
      p,
      true,
    );
    save.disabled = true;
    select.addEventListener("change", () => {
      save.disabled = !select.value;
    });
    action(root, t("取消", "Cancel"), () => this.close(), p);
  }
  close(): void {
    if (!this.busy) super.close();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
