module.exports = async ({ app, quickAddApi, obsidian }) => {
  const native = app.plugins?.plugins?.["study-flow"]?.api?.v1;
  if (typeof native?.createStudyNote === "function") return native.createStudyNote();
  const helperPath = app.vault.adapter.getFullPath("StudyFlow/scripts/PDF学习工具.js");
  const {
    chooseCategory,
    choosePdf,
    createStudyNote,
    findStudyNoteForPdf,
    formatLocalDate,
    getFrontmatter,
    getTotalPagesFromView,
    recordFromKnownValues,
    refreshShelf,
  } = require(helperPath);

  const pdfFile = await choosePdf(app, quickAddApi);
  if (!pdfFile) {
    new obsidian.Notice("库里还没有 PDF，或本次没有选择。", 5000);
    return;
  }

  const existing = findStudyNoteForPdf(app, pdfFile);
  if (existing) {
    await app.workspace.getLeaf(false).openFile(existing);
    new obsidian.Notice("这份 PDF 已有学习卡，已经为你打开。", 4000);
    return;
  }

  const category = await chooseCategory(quickAddApi, app);
  if (!category) {
    new obsidian.Notice("没有选择分类，本次没有新建。", 4000);
    return;
  }

  const activeView = app.workspace.activeLeaf?.view;
  const totalPages = app.workspace.getActiveFile()?.path === pdfFile.path
    ? getTotalPagesFromView(activeView)
    : 0;
  const result = await createStudyNote(app, pdfFile, category, totalPages);
  const frontmatter = getFrontmatter(app, result.file);
  const extraRecord = Object.keys(frontmatter).length
    ? { file: result.file, frontmatter }
    : recordFromKnownValues(result.file, {
      category: category.value,
      pdfPath: pdfFile.path,
      page: 1,
      totalPages,
      day: formatLocalDate(),
      link: `[[${pdfFile.path}#page=1|从第 1 页继续]]`,
    });

  await refreshShelf(app, extraRecord);
  await app.workspace.getLeaf(false).openFile(result.file);
  new obsidian.Notice(`已建立：${pdfFile.basename} 学习卡`, 5000);
};
