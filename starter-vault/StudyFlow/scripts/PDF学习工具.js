const LEGACY_PROGRESS_START = "<!-- PDF_PROGRESS_START -->";
const LEGACY_PROGRESS_END = "<!-- PDF_PROGRESS_END -->";
const SHELF_HEADING = "## 正在阅读";


function pad(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalDateTime(date = new Date()) {
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function safeFilePart(value, fallback = "PDF学习卡") {
  return String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|#[\]^]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80) || fallback;
}

function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unwrapWikiLink(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  const match = trimmed.match(/^!?\[\[([^\]]+)\]\]$/);
  const inner = match ? match[1] : trimmed;
  return inner.split("|")[0].split("#")[0];
}

function basicPageLink(pdfFile, page = 1) {
  return `[[${pdfFile.path}#page=${page}|从第 ${page} 页继续]]`;
}

function withContinueLabel(link, page) {
  const match = String(link ?? "").trim().match(/^!?\[\[([^\]]+)\]\]$/);
  if (!match) return String(link ?? "").trim();
  const target = match[1].split("|")[0];
  return `[[${target}|从第 ${page} 页继续]]`;
}

function buildProgressBlock(link, page, totalPages, day) {
  const totalText = totalPages > 0 ? ` / 共 ${totalPages} 页` : "";
  const percentText = totalPages > 0
    ? ` · ${Math.min(100, Math.round((page / totalPages) * 100))}%`
    : "";
  return [
    "> [!success] 继续阅读",
    `> ${withContinueLabel(link, page)}`,
    ">",
    `> 当前进度：第 ${page} 页${totalText}${percentText} · ${day}`,
  ].join("\n");
}

function replaceProgressBlock(content, block) {
  const lines = content.split("\n");
  const legacyStart = lines.findIndex((line) => line.trim() === LEGACY_PROGRESS_START);
  if (legacyStart >= 0) {
    const legacyEnd = lines.findIndex((line, index) => index >= legacyStart && line.trim() === LEGACY_PROGRESS_END);
    if (legacyEnd >= legacyStart) {
      return [
        ...lines.slice(0, legacyStart),
        ...block.split("\n"),
        ...lines.slice(legacyEnd + 1),
      ].join("\n");
    }
  }

  const calloutStart = lines.findIndex((line) => line.trim() === "> [!success] 继续阅读");
  if (calloutStart < 0) return `${content.trimEnd()}\n\n${block}\n`;

  let calloutEnd = calloutStart + 1;
  while (calloutEnd < lines.length && /^\s*>/.test(lines[calloutEnd])) calloutEnd += 1;
  return [
    ...lines.slice(0, calloutStart),
    ...block.split("\n"),
    ...lines.slice(calloutEnd),
  ].join("\n");
}

function insertAfterHeading(content, heading, insertion) {
  const headingPattern = new RegExp(`(^|\\n)${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*\\n`);
  const match = headingPattern.exec(content);
  if (!match) return `${content.trimEnd()}\n\n${heading}\n\n${insertion.trim()}\n`;
  const index = match.index + match[0].length;
  const rest = content.slice(index).replace(/^\s*\n/, "");
  return `${content.slice(0, index)}\n${insertion.trim()}\n${rest}`;
}

async function ensureFolder(app, path) {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

async function choosePdf(app, quickAddApi) {
  const pdfFiles = app.vault.getFiles()
    .filter((file) => file.extension.toLowerCase() === "pdf")
    .sort((a, b) => a.basename.localeCompare(b.basename, "zh-CN"));

  if (pdfFiles.length === 0) return null;

  const activeFile = app.workspace.getActiveFile();
  if (activeFile?.extension.toLowerCase() === "pdf") return activeFile;
  if (pdfFiles.length === 1) return pdfFiles[0];

  return quickAddApi.suggester(
    pdfFiles.map((file) => `${file.basename}  ·  ${file.parent?.path ?? ""}`),
    pdfFiles,
    "选择要学习的 PDF"
  );
}

async function chooseCategory(quickAddApi, app) {
  const { pdfCategories: CATEGORY_OPTIONS } = require(app.vault.adapter.getFullPath("StudyFlow/scripts/配置工具.js")).loadConfig(app);
  const selected = await quickAddApi.suggester(
    CATEGORY_OPTIONS.map(({ label }) => label),
    CATEGORY_OPTIONS,
    "这份 PDF 属于哪类学习？"
  );
  return selected ?? null;
}

function getTotalPagesFromView(view) {
  const candidates = [
    view?.viewer?.child?.pdfViewer?.pagesCount,
    view?.viewer?.child?.pdfViewer?.pdfViewer?.pagesCount,
    view?.viewer?.child?.pdfViewer?.pdfDocument?.numPages,
    view?.viewer?.child?.pdfDocument?.numPages,
  ];
  return candidates.find((value) => Number.isInteger(value) && value > 0) ?? 0;
}

function getFrontmatter(app, file) {
  return app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

function findStudyNoteForPdf(app, pdfFile) {
  return app.vault.getMarkdownFiles().find((file) => {
    const frontmatter = getFrontmatter(app, file);
    return frontmatter?.["类型"] === "PDF学习"
      && unwrapWikiLink(frontmatter?.["PDF文件"]) === pdfFile.path;
  }) ?? null;
}

function uniqueNotePath(app, folder, basename) {
  let suffix = 1;
  let path = `${folder}/${basename}.md`;
  while (app.vault.getAbstractFileByPath(path)) {
    suffix += 1;
    path = `${folder}/${basename}-${suffix}.md`;
  }
  return path;
}

function buildStudyNote(pdfFile, category, totalPages = 0) {
  const day = formatLocalDate();
  const link = basicPageLink(pdfFile, 1);
  const progress = totalPages > 0 ? Math.round(100 / totalPages) : 0;
  return [
    "---",
    "类型: PDF学习",
    "状态: 阅读中",
    `分类: ${yamlString(category.value)}`,
    `PDF文件: ${yamlString(`[[${pdfFile.path}]]`)}`,
    "当前页: 1",
    `总页数: ${totalPages}`,
    `完成度: ${progress}`,
    `上次阅读: ${day}`,
    `续读链接: ${yamlString(link)}`,
    "tags:",
    "  - 学习/PDF",
    `  - ${yamlString(category.tag)}`,
    "cssclasses:",
    "  - pdf-study-note",
    "---",
    "",
    `# ${pdfFile.basename}`,
    "",
    buildProgressBlock(link, 1, totalPages, day),
    "",
    "## 本轮目标",
    "",
    "- [ ] 写下本轮准备读到的页码或章节。",
    "",
    "## 摘录与理解",
    "",
    "## 易错点",
    "",
    "> [!failure] 只记录会让你在考试中失分的判断",
    "> ",
    "",
    "## 要追问",
    "",
    "> [!question] 还没想明白的问题",
    "> ",
    "",
    "## 准备做成复习卡片",
    "",
    "## 阅读记录",
    "",
    `- ${formatLocalDateTime()} · 建立学习卡，从第 1 页开始。`,
    "",
  ].join("\n");
}

async function createStudyNote(app, pdfFile, category, totalPages = 0) {
  const existing = findStudyNoteForPdf(app, pdfFile);
  if (existing) return { file: existing, created: false };

  await ensureFolder(app, category.folder);
  const basename = `${safeFilePart(pdfFile.basename)}-学习卡`;
  const path = uniqueNotePath(app, category.folder, basename);
  const file = await app.vault.create(path, buildStudyNote(pdfFile, category, totalPages));
  return { file, created: true };
}

function normalizeDate(value) {
  if (value instanceof Date) return formatLocalDate(value);
  return String(value ?? "").slice(0, 10);
}

async function refreshShelf(app, extraRecord = null) {
  const config = require(app.vault.adapter.getFullPath("StudyFlow/scripts/配置工具.js")).loadConfig(app);
  const SHELF_PATH = config.shelfPath;
  const records = app.vault.getMarkdownFiles()
    .map((file) => ({ file, frontmatter: getFrontmatter(app, file) }))
    .filter(({ frontmatter }) => frontmatter?.["类型"] === "PDF学习");

  if (extraRecord) {
    const index = records.findIndex(({ file }) => file.path === extraRecord.file.path);
    if (index >= 0) records[index] = extraRecord;
    else records.push(extraRecord);
  }

  records.sort((a, b) => {
    const aDate = normalizeDate(a.frontmatter?.["上次阅读"]);
    const bDate = normalizeDate(b.frontmatter?.["上次阅读"]);
    return bDate.localeCompare(aDate) || a.file.basename.localeCompare(b.file.basename, "zh-CN");
  });

  const cards = records.map(({ file, frontmatter }) => {
    const title = file.basename.replace(/-学习卡(?:-\d+)?$/, "");
    const current = Number(frontmatter?.["当前页"] ?? 1);
    const total = Number(frontmatter?.["总页数"] ?? 0);
    const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : Number(frontmatter?.["完成度"] ?? 0);
    const progress = total > 0 ? `${current} / ${total}（${percent}%）` : `第 ${current} 页`;
    const continueLink = frontmatter?.["续读链接"] || basicPageLink({ path: unwrapWikiLink(frontmatter?.["PDF文件"]) }, current);
    const notePath = file.path.replace(/\.md$/, "");
    const status = String(frontmatter?.["状态"] ?? "阅读中");
    const metadata = status === "已读完" ? "done" : status === "暂停" ? "paused" : "reading";
    return [
      `> [!pdf-book|${metadata}] [[${notePath}|${title}]]`,
      `> **${frontmatter?.["分类"] ?? "待分类"}** · ${status} · 进度 ${progress} · ${normalizeDate(frontmatter?.["上次阅读"])} · ${withContinueLabel(continueLink, current)}`,
    ].join("\n");
  });

  const generated = cards.length
    ? cards.join("\n\n")
    : "> [!pdf-empty] 还没有学习资料\n> 把 PDF 放入 `03_PDF`，再运行“新建 PDF 学习卡”。";

  let shelf = app.vault.getAbstractFileByPath(SHELF_PATH);
  if (!shelf) {
    await ensureFolder(app, SHELF_PATH.split("/").slice(0, -1).join("/"));
    shelf = await app.vault.create(SHELF_PATH, [
      "---",
      "aliases:",
      "  - PDF书架",
      "cssclasses:",
      "  - knowledge-palace",
      "  - pdf-library",
      "---",
      "",
      "# PDF 书架",
      "",
      "> [!pdf-intro] 固定路线",
      "> 原文件放入 `03_PDF`；从书架开始阅读；结束前保存进度。",
      "",
      "## 常用操作",
      "",
      "> [!pdf-actions]",
      "> [新建学习卡](obsidian://quickadd?choice=%E6%96%B0%E5%BB%BAPDF%E5%AD%A6%E4%B9%A0%E5%8D%A1) [保存阅读进度](obsidian://quickadd?choice=%E4%BF%9D%E5%AD%98PDF%E9%98%85%E8%AF%BB%E8%BF%9B%E5%BA%A6) [摘录原文](obsidian://quickadd?choice=%E6%91%98%E5%BD%95PDF%E5%8E%9F%E6%96%87)",
      "",
      SHELF_HEADING,
      "",
      generated,
      "",
      "## 使用说明",
      "",
      "- [[00_开始|PDF 学习说明]]",
      "",
    ].join("\n"));
    return shelf;
  }

  const content = await app.vault.read(shelf);
  const headingStart = content.indexOf(SHELF_HEADING);
  let updated;
  if (headingStart >= 0) {
    const bodyStart = content.indexOf("\n", headingStart) + 1;
    const nextHeading = content.indexOf("\n## ", bodyStart);
    const bodyEnd = nextHeading >= 0 ? nextHeading : content.length;
    updated = `${content.slice(0, bodyStart)}\n${generated}\n${content.slice(bodyEnd)}`;
  } else {
    const oldStartMarker = "<!-- PDF_SHELF_START -->";
    const oldEndMarker = "<!-- PDF_SHELF_END -->";
    const oldStart = content.indexOf(oldStartMarker);
    const oldEnd = content.indexOf(oldEndMarker);
    if (oldStart >= 0 && oldEnd >= oldStart) {
      updated = `${content.slice(0, oldStart)}${SHELF_HEADING}\n\n${generated}${content.slice(oldEnd + oldEndMarker.length)}`;
    } else {
      const instructions = content.indexOf("## 使用说明");
      const section = `${SHELF_HEADING}\n\n${generated}\n\n`;
      updated = instructions >= 0
        ? `${content.slice(0, instructions)}${section}${content.slice(instructions)}`
        : `${content.trimEnd()}\n\n${section}`;
    }
  }
  if (updated !== content) await app.vault.modify(shelf, updated);
  return shelf;
}

function recordFromKnownValues(file, values) {
  return {
    file,
    frontmatter: {
      "类型": "PDF学习",
      "状态": values.status ?? "阅读中",
      "分类": values.category,
      "PDF文件": `[[${values.pdfPath}]]`,
      "当前页": values.page,
      "总页数": values.totalPages,
      "完成度": values.totalPages > 0 ? Math.min(100, Math.round((values.page / values.totalPages) * 100)) : 0,
      "上次阅读": values.day,
      "续读链接": values.link,
    },
  };
}

module.exports = {
  ensureFolder,
  buildStudyNote,
  basicPageLink,
  buildProgressBlock,
  chooseCategory,
  choosePdf,
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
};
