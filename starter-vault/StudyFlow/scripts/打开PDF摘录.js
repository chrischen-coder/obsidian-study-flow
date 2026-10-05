function resolvePdf(app) {
  const active = app.workspace.getActiveFile();
  if (active?.extension?.toLowerCase() === "pdf") return active;
  if (active?.extension === "md") {
    const fm = app.metadataCache.getFileCache(active)?.frontmatter;
    if (fm?.类型 === "PDF学习") {
      const link = String(fm.PDF文件 ?? "").replace(/^!?\[\[|\]\]$/g, "").split("|")[0].split("#")[0];
      const pdf = app.metadataCache.getFirstLinkpathDest(link, active.path);
      if (pdf?.extension?.toLowerCase() === "pdf") return pdf;
    }
  }
  for (const path of app.workspace.getLastOpenFiles()) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file?.extension?.toLowerCase() === "pdf") return file;
  }
  return app.workspace.getLeavesOfType("pdf").map((leaf) => leaf.view.file).find(Boolean) ?? null;
}

module.exports = async ({ app, quickAddApi, obsidian }) => {
  const native = app.plugins?.plugins?.["study-flow"]?.api?.v1;
  if (typeof native?.openExcerpts === "function") return native.openExcerpts();
  const helper = require(app.vault.adapter.getFullPath("StudyFlow/scripts/PDF学习工具.js"));
  const pdf = resolvePdf(app);
  if (!pdf) {
    new obsidian.Notice("先点开一份 PDF，再点「背诵摘录」。", 5000);
    return;
  }
  let note = helper.findStudyNoteForPdf(app, pdf);
  if (!note) {
    const category = await helper.chooseCategory(quickAddApi, app);
    if (!category) return;
    const pdfView = app.workspace.getLeavesOfType("pdf").find((leaf) => leaf.view.file?.path === pdf.path)?.view;
    const totalPages = helper.getTotalPagesFromView(pdfView);
    note = (await helper.createStudyNote(app, pdf, category, totalPages)).file;
    await helper.refreshShelf(app, helper.recordFromKnownValues(note, {
      category: category.value, pdfPath: pdf.path, page: 1, totalPages,
      day: helper.formatLocalDate(), link: helper.basicPageLink(pdf, 1),
    }));
    new obsidian.Notice("摘录页已准备好。回到 PDF 选中文字，点左侧「保存划线」，写下小结后保存。", 6000);
  }
  const leaf = app.workspace.getLeavesOfType("markdown").find((item) => item.view.file?.path === note.path)
    ?? app.workspace.getLeaf("split", "vertical");
  await leaf.openFile(note, {
    active: true, state: { mode: "preview" }, eState: { subpath: "#摘录与理解" },
  });
  await app.workspace.revealLeaf(leaf);
};

// Non-enumerable so QuickAdd treats this file as one runnable script.
Object.defineProperty(module.exports, "resolvePdf", { value: resolvePdf });
