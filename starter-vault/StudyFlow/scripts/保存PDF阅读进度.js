module.exports = async ({ app, quickAddApi, obsidian }) => {
  const helperPath = app.vault.adapter.getFullPath("StudyFlow/scripts/PDF学习工具.js");
  const {
    basicPageLink,
    buildProgressBlock,
    chooseCategory,
    createStudyNote,
    findStudyNoteForPdf,
    formatLocalDate,
    formatLocalDateTime,
    getFrontmatter,
    getTotalPagesFromView,
    insertAfterHeading,
    recordFromKnownValues,
    refreshShelf,
    replaceProgressBlock,
    withContinueLabel,
  } = require(helperPath);

  const pdfFile = app.workspace.getActiveFile();
  const view = app.workspace.activeLeaf?.view;
  if (!pdfFile || pdfFile.extension.toLowerCase() !== "pdf") {
    new obsidian.Notice("请先打开正在阅读的 PDF，再保存进度。", 5000);
    return;
  }

  const state = typeof view?.getState === "function" ? view.getState() : {};
  const page = Number(state?.page);
  if (!Number.isInteger(page) || page < 1) {
    new obsidian.Notice("没有读取到当前页，请点一下 PDF 页面后再试。", 5000);
    return;
  }

  // Build from the current PDF view; never trust old clipboard content.
  const child = view?.viewer?.child;
  const viewer = child?.pdfViewer?.pdfViewer ?? child?.pdfViewer;
  const currentLocation = viewer?._location;
  let link = basicPageLink(pdfFile, page);
  if (currentLocation?.pageNumber === page
    && Number.isFinite(currentLocation.left) && Number.isFinite(currentLocation.top)) {
    link = `[[${pdfFile.path}#page=${page}&offset=${currentLocation.left},${currentLocation.top},0|从第 ${page} 页继续]]`;
  }

  let noteFile = findStudyNoteForPdf(app, pdfFile);
  let category = null;
  if (!noteFile) {
    category = await chooseCategory(quickAddApi, app);
    if (!category) {
      new obsidian.Notice("没有学习卡且未选择分类，本次没有保存。", 5000);
      return;
    }
    noteFile = (await createStudyNote(app, pdfFile, category, getTotalPagesFromView(view))).file;
  }

  const oldFrontmatter = getFrontmatter(app, noteFile);
  const detectedTotal = getTotalPagesFromView(view);
  const totalPages = detectedTotal || Number(oldFrontmatter?.["总页数"] ?? 0);
  const day = formatLocalDate();
  const percent = totalPages > 0 ? Math.min(100, Math.round((page / totalPages) * 100)) : 0;

  await app.fileManager.processFrontMatter(noteFile, (frontmatter) => {
    frontmatter["当前页"] = page;
    frontmatter["总页数"] = totalPages;
    frontmatter["完成度"] = percent;
    frontmatter["上次阅读"] = day;
    frontmatter["续读链接"] = link;
    if (totalPages > 0 && page >= totalPages) frontmatter["状态"] = "已读完";
  });

  let content = await app.vault.read(noteFile);
  content = replaceProgressBlock(content, buildProgressBlock(link, page, totalPages, day));
  content = insertAfterHeading(
    content,
    "## 阅读记录",
    `- ${formatLocalDateTime()} · 读到第 ${page} 页${totalPages > 0 ? `，完成 ${percent}%` : ""}。`
  );
  await app.vault.modify(noteFile, content);

  const updatedFrontmatter = {
    ...oldFrontmatter,
    "类型": "PDF学习",
    "状态": totalPages > 0 && page >= totalPages ? "已读完" : (oldFrontmatter?.["状态"] ?? "阅读中"),
    "分类": oldFrontmatter?.["分类"] ?? category?.value ?? "待分类",
    "PDF文件": `[[${pdfFile.path}]]`,
    "当前页": page,
    "总页数": totalPages,
    "完成度": percent,
    "上次阅读": day,
    "续读链接": link,
  };
  await refreshShelf(app, Object.keys(updatedFrontmatter).length
    ? { file: noteFile, frontmatter: updatedFrontmatter }
    : recordFromKnownValues(noteFile, {
      category: category?.value ?? "待分类",
      pdfPath: pdfFile.path,
      page,
      totalPages,
      day,
      link,
    }));

  new obsidian.Notice(`进度已保存：第 ${page} 页${totalPages > 0 ? ` / ${totalPages}` : ""}`, 5000);
};
