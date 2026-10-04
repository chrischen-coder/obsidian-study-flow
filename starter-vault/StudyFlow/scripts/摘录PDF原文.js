function hasSummary(value) {
  return String(value ?? "").replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, "").length > 0;
}

function askForSummary(app, obsidian, pdfFile, selection) {
  return new Promise((resolve) => {
    class SummaryModal extends obsidian.Modal {
      onOpen() {
        this.setTitle("写下理解后保存");
        this.modalEl.style.width = "660px";
        this.modalEl.style.maxWidth = "95vw";
        const { contentEl } = this;
        contentEl.createEl("p", { text: `${pdfFile.basename} · 第 ${selection.page} 页` });
        contentEl.createEl("strong", { text: "选中的原文" });
        const original = contentEl.createEl("blockquote", { text: selection.text });
        Object.assign(original.style, { maxHeight: "160px", overflowY: "auto", whiteSpace: "pre-wrap", userSelect: "text" });
        const label = contentEl.createEl("label", { text: "我的小结（必填）" });
        label.style.fontWeight = "600";
        const hint = contentEl.createEl("p", { text: "用自己的话写下你的理解，可以举个例子，或说明还有哪里没想明白。" });
        hint.style.color = "var(--text-muted)";
        const input = contentEl.createEl("textarea", {
          attr: { rows: "6", placeholder: "我对这个知识点的理解是……", "aria-label": "我的小结（必填）", required: "true" },
        });
        input.id = `pdf-study-summary-${Date.now()}`;
        label.htmlFor = input.id;
        Object.assign(input.style, { width: "100%", minHeight: "150px", resize: "vertical" });
        const option = contentEl.createEl("label");
        const memory = option.createEl("input", { attr: { type: "checkbox" } });
        option.appendText(" 同时生成记忆卡片（答案使用上面的小结）");
        const question = contentEl.createEl("textarea", {
          attr: { rows: "2", placeholder: "复习时要问自己的问题，例如：主动回忆为什么比重读更有用？", "aria-label": "记忆卡片的问题" },
        });
        Object.assign(question.style, { width: "100%", display: "none", marginTop: "8px" });
        const state = contentEl.createEl("p", { text: "请先写小结，才能保存。", attr: { "aria-live": "polite" } });
        state.style.color = "var(--text-muted)";
        const actions = contentEl.createDiv({ cls: "modal-button-container" });
        const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
        const save = actions.createEl("button", { text: "保存原文和小结", cls: "mod-cta", attr: { type: "button" } });
        save.disabled = true;
        const validate = () => {
          question.style.display = memory.checked ? "block" : "none";
          save.disabled = !hasSummary(input.value) || (memory.checked && !hasSummary(question.value));
          state.textContent = save.disabled ? "请填写小结；勾选建卡时还要填写问题。" : "保存摘录；勾选后还会生成可间隔复习的问答卡。";
        };
        input.addEventListener("input", validate);
        question.addEventListener("input", validate);
        memory.addEventListener("change", validate);
        cancel.addEventListener("click", () => this.close());
        save.addEventListener("click", () => {
          // Validate again at commit time; whitespace and invisible characters are not a summary.
          if (!hasSummary(input.value) || (memory.checked && !hasSummary(question.value))) {
            save.disabled = true;
            input.focus();
            return;
          }
          this.result = {
            summary: input.value.replace(/\r\n?/g, "\n").trim(),
            createMemory: memory.checked,
            question: question.value.trim(),
          };
          this.close();
        });
        input.focus();
      }

      onClose() {
        this.contentEl.empty();
        resolve(this.result ?? null);
      }
    }
    new SummaryModal(app).open();
  });
}

module.exports = async ({ app, quickAddApi, obsidian }) => {
  const helperPath = app.vault.adapter.getFullPath("StudyFlow/scripts/PDF学习工具.js");
  const {
    chooseCategory,
    createStudyNote,
    findStudyNoteForPdf,
    getTotalPagesFromView,
    refreshShelf,
    recordFromKnownValues,
    formatLocalDate,
  } = require(helperPath);

  const pdfFile = app.workspace.getActiveFile();
  const view = app.workspace.activeLeaf?.view;
  if (!pdfFile || pdfFile.extension.toLowerCase() !== "pdf") {
    new obsidian.Notice("请先打开 PDF，并选中一段原文。", 5000);
    return;
  }

  // Read the live PDF selection directly; clipboard text may belong to an older selection.
  const pdfPlus = app.plugins?.plugins?.["pdf-plus"];
  if (!pdfPlus) {
    new obsidian.Notice("请先安装并启用 PDF++，再保存选区。", 6000);
    return;
  }
  let selection;
  try {
    selection = pdfPlus?.lib?.copyLink?.getTemplateVariables({ color: "记忆" });
  } catch (_) {
    selection = null;
  }

  if (selection?.file?.path !== pdfFile.path || !selection.text?.trim()
    || !selection.subpath?.includes("selection=")) {
    new obsidian.Notice("请先在当前 PDF 里拖动选中原文，再点左侧「保存划线」。", 6000);
    return;
  }

  // Snapshot the original selection before the dialog takes focus away from the PDF.
  selection = { text: selection.text.trim(), subpath: selection.subpath, page: selection.page };
  const source = `${pdfFile.path}${selection.subpath}`;
  const input = await askForSummary(app, obsidian, pdfFile, selection);
  const summary = input?.summary;
  if (!hasSummary(summary)) {
    new obsidian.Notice("已取消，本次没有保存。", 4000);
    return;
  }
  const cards = require(app.vault.adapter.getFullPath("StudyFlow/scripts/错题卡工具.js"));
  const deckTag = input.createMemory ? await cards.chooseDeck(quickAddApi, null, app) : null;
  if (input.createMemory && !deckTag) {
    new obsidian.Notice("已取消选择卡组，本次没有保存。", 4000);
    return;
  }
  const quotedSummary = `> ${summary.replace(/\n/g, "\n> ")}`;
  const excerpt = `> [!PDF|记忆] [[${source}|p.${selection.page}]]\n> ${selection.text.replace(/\r?\n/g, "\n> ")}\n>\n> **我的小结：**\n${quotedSummary}`;
  const selectionParams = new URLSearchParams(selection.subpath.slice(1));
  let noteFile = findStudyNoteForPdf(app, pdfFile);
  let extraRecord = null;
  if (!noteFile) {
    const category = await chooseCategory(quickAddApi, app);
    if (!category) {
      new obsidian.Notice("没有学习卡且未选择分类，本次没有摘录。", 5000);
      return;
    }
    const totalPages = getTotalPagesFromView(view);
    noteFile = (await createStudyNote(app, pdfFile, category, totalPages)).file;
    extraRecord = recordFromKnownValues(noteFile, {
      category: category.value, pdfPath: pdfFile.path, page: 1,
      totalPages, day: formatLocalDate(),
      link: `[[${pdfFile.path}#page=1|从第 1 页继续]]`,
    });
  }

  let result = "unchanged";
  await app.vault.process(noteFile, (content) => {
    const sameSelection = (link) => {
      const target = link.split("|")[0];
      const hash = target.indexOf("#");
      if (hash < 0) return false;
      const linkedFile = app.metadataCache.getFirstLinkpathDest(target.slice(0, hash), noteFile.path);
      const params = new URLSearchParams(target.slice(hash + 1));
      return linkedFile?.path === pdfFile.path
        && params.get("page") === selectionParams.get("page")
        && params.get("selection") === selectionParams.get("selection");
    };
    // Keep an existing quote, including any manually added notes; append the new understanding.
    const callouts = [...content.matchAll(/^> \[!PDF(?:\|[^\]\r\n]+)?\][^\r\n]*(?:\r?\n>[^\r\n]*)*/gm)];
    const existing = callouts.find(([block]) =>
      [...block.split("\n")[0].matchAll(/\[\[([^\]]+)\]\]/g)].some(([, link]) => sameSelection(link)));
    if (existing) {
      const block = existing[0].replace(/\r\n/g, "\n").trimEnd();
      const labels = ["我的小结", "补充小结"];
      if (labels.some((label) => `${block}\n`.includes(`> **${label}：**\n${quotedSummary}\n`))) return content;
      const label = block.includes("> **我的小结：**") ? "补充小结" : "我的小结";
      const updated = `${existing[0].trimEnd()}\n>\n> **${label}：**\n${quotedSummary}`;
      result = "supplemented";
      return content.slice(0, existing.index) + updated + content.slice(existing.index + existing[0].length);
    }
    result = "added";
    const heading = /^## 摘录与理解[ \t]*$/m.exec(content);
    if (!heading) return `${content.trimEnd()}\n\n## 摘录与理解\n\n${excerpt}\n`;
    const start = heading.index + heading[0].length;
    const nextHeading = /\n## /.exec(content.slice(start));
    const end = nextHeading ? start + nextHeading.index : content.length;
    return `${content.slice(0, end).trimEnd()}\n\n${excerpt}\n\n${content.slice(end).trimStart()}`;
  });
  if (result !== "unchanged") await refreshShelf(app, extraRecord);
  if (input.createMemory) {
    try {
      const card = await cards.createCard(app, { question: input.question, answer: summary, deckTag, source, type: "PDF记忆卡片" });
      await cards.refreshReviewData(app);
      new obsidian.Notice(card.created ? "摘录已保存，记忆卡片已生成。继续留在 PDF 阅读。" : "摘录已保存，相同记忆卡片已存在。", 6000);
    } catch (error) {
      console.error("Study Flow: 摘录已保存，建卡失败", error);
      new obsidian.Notice("摘录已保存，但建卡失败。请检查配置后重试；不会重复保存同一摘录。", 8000);
    }
    return;
  }
  new obsidian.Notice(result === "unchanged"
    ? "这段原文和相同的小结已经保存，无需重复记录。"
    : `${result === "supplemented" ? "已补充小结" : "原文和小结已保存"}到「${noteFile.basename}」。点左侧「背诵摘录」即可查看。`, 6000);
};
Object.defineProperty(module.exports, "hasSummary", { value: hasSummary });
