// MIT License. Read on each run, so configuration edits apply immediately.
function validatePath(value) {
  if (typeof value !== "string" || !value || value !== value.trim()
    || value.startsWith("/") || /[\\:#|\[\]\r\n]/.test(value)
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`请使用库内相对路径（不含 ..、反斜杠或链接符号）：${value}`);
  }
  return value;
}
function validateConfig(config) {
  for (const key of ["cardFolder", "attachmentFolder", "shelfPath"]) validatePath(config[key]);
  if (!config.shelfPath.endsWith(".md")) throw new Error("shelfPath 必须是 .md 文件");
  for (const key of ["decks", "pdfCategories"]) {
    if (!Array.isArray(config[key]) || !config[key].length) throw new Error(`${key} 不能为空`);
    for (const item of config[key]) {
      if (!item.label || !/^[^\s#\[\]|]+(?:\/[^\s#\[\]|]+)*$/.test(item.tag)) throw new Error(`${key} 的标签无效`);
      if (key === "decks" && !item.tag.startsWith("flashcards/")) throw new Error("卡组必须以 flashcards/ 开头");
      if (key === "pdfCategories") {
        validatePath(item.folder);
        if (!item.value) throw new Error("PDF 分类缺少 value");
      }
    }
  }
  return config;
}
function loadConfig(app) {
  if (typeof app.vault.adapter.getFullPath !== "function") throw new Error("Study Flow 的建卡功能需要桌面版 Obsidian。");
  const fs = require("fs");
  return validateConfig(JSON.parse(fs.readFileSync(app.vault.adapter.getFullPath("StudyFlow/config.json"), "utf8")));
}
module.exports = { loadConfig, validateConfig, validatePath };
