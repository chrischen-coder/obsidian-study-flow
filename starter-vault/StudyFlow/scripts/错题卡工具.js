function normalizeDeck(value) {
  const segments = String(value ?? "").trim().replace(/^#?flashcards\/?/i, "")
    .replace(/[>＞\\]/g, "/").split("/")
    .map((part) => part.trim().replace(/[\s#\[\](){}?*|:]/g, "")).filter(Boolean);
  return segments.length ? `flashcards/${segments.join("/")}` : null;
}
async function chooseDeck(quickAddApi, preset, app) {
  if (preset) return normalizeDeck(preset);
  const { decks } = require(app.vault.adapter.getFullPath("StudyFlow/scripts/配置工具.js")).loadConfig(app);
  const selected = await quickAddApi.suggester(
    [...decks.map((item) => item.label), "自定义分类…"],
    [...decks.map((item) => item.tag), "__custom__"], "选择复习卡组"
  );
  if (!selected) return null;
  return selected === "__custom__"
    ? normalizeDeck(await quickAddApi.inputPrompt("自定义分类", "用 / 分层，例如：考试/数据库")) : selected;
}
function displayDeck(tag) { return tag.replace(/^flashcards\//, "").replaceAll("/", " / "); }
function formatLocalDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return { day, stamp: `${day}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` };
}
function safeFilePart(value, fallback = "记忆卡片") {
  return String(value ?? "").trim().replace(/[\\/:*?"<>|#[\]^]/g, " ").replace(/\s+/g, " ").slice(0, 48) || fallback;
}
function uniquePath(app, folder, basename, extension) {
  let suffix = 1;
  let path = `${folder}/${basename}.${extension}`;
  while (app.vault.getAbstractFileByPath(path)) path = `${folder}/${basename}-${++suffix}.${extension}`;
  return path;
}
async function ensureFolder(app, path) {
  let current = "";
  for (const part of path.split("/")) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) await app.vault.createFolder(current);
  }
}
function hasText(value) { return String(value ?? "").replace(/[\s\u200B-\u200D\u2060\uFEFF]/gu, "").length > 0; }
// Blank paragraphs and lone separators must not accidentally end/split an SR card.
function cardText(value) {
  return String(value).replace(/\r\n?/g, "\n").trim().split("\n")
    .map((line) => /^\s*$/.test(line) ? "<br>" : /^\s*\?\??\s*$/.test(line) ? `\\${line.trim()}` : line).join("\n");
}
function buildCard({ question, answer, deckTag, type = "记忆卡片", source = "", fingerprint = "", title }) {
  if (!hasText(question) || !hasText(answer)) throw new Error("题目和答案不能为空");
  if (!/^flashcards\/[^\s#|\[\]]+$/.test(deckTag)) throw new Error("卡组标签无效");
  const { day } = formatLocalDate();
  return ["---", `类型: ${JSON.stringify(type)}`, `创建日期: "${day}"`, "---", "",
    `# ${title || safeFilePart(question)}`, "", `#${deckTag}`, "", cardText(question), "?",
    cardText(answer), ...(source ? ["<br>", `来源：[[${source}|回到原文]]`] : []), "",
    ...(fingerprint ? [`<!-- study-flow:${fingerprint} -->`, ""] : [])].join("\n");
}
async function createCard(app, options) {
  const config = require(app.vault.adapter.getFullPath("StudyFlow/scripts/配置工具.js")).loadConfig(app);
  const fingerprint = options.source ? require("crypto").createHash("sha256")
    .update(JSON.stringify([options.source, options.question.trim(), options.answer.trim()])).digest("hex") : "";
  if (fingerprint) {
    for (const file of app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${config.cardFolder}/`))) {
      if ((await app.vault.read(file)).includes(`<!-- study-flow:${fingerprint} -->`)) return { file, created: false };
    }
  }
  const content = buildCard({ ...options, fingerprint });
  await ensureFolder(app, config.cardFolder);
  const { stamp } = formatLocalDate();
  const file = await app.vault.create(uniquePath(app, config.cardFolder,
    `${stamp}-${safeFilePart(options.title || options.question)}`, "md"), content);
  return { file, created: true };
}
async function refreshReviewData(app) {
  // Optional optimization. File events also let upstream SR discover cards.
  try {
    const plugin = app.plugins.getPlugin("obsidian-spaced-repetition");
    await plugin?.dataManager?.sync?.();
    await plugin?.uiManager?.updateStatusBar?.();
  } catch (error) { console.warn("Study Flow: 已保存卡片；请运行 SR 复习命令刷新", error); }
}
module.exports = { normalizeDeck, chooseDeck, displayDeck, formatLocalDate, safeFilePart,
  uniquePath, ensureFolder, hasText, cardText, buildCard, createCard, refreshReviewData };
