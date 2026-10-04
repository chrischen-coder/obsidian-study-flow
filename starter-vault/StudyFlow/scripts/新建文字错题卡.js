module.exports = async ({ app, quickAddApi, obsidian, variables }) => {
  const helper = require(app.vault.adapter.getFullPath("StudyFlow/scripts/错题卡工具.js"));
  const deckTag = await helper.chooseDeck(quickAddApi, variables?.分类, app);
  if (!deckTag) return;
  let initial = variables?.题目;
  if (initial == null) {
    initial = app.workspace.activeLeaf?.view?.editor?.getSelection?.();
    if (!initial) {
      try { initial = require("electron").clipboard.readText(); } catch (_) { initial = ""; }
    }
    initial = await quickAddApi.wideInputPrompt("题目（可修改复制的文字）", "输入要回忆的问题", initial || "");
  }
  const question = String(initial ?? "").trim();
  if (!helper.hasText(question)) return;
  const answer = String(variables?.答案 ?? await quickAddApi.wideInputPrompt("答案", "输入正确答案或关键判断") ?? "").trim();
  if (!helper.hasText(answer)) return;
  const { file } = await helper.createCard(app, { question, answer, deckTag, type: "文字错题卡" });
  await app.workspace.getLeaf(false).openFile(file);
  await helper.refreshReviewData(app);
  new obsidian.Notice(`已生成文字错题卡：${helper.displayDeck(deckTag)}`, 5000);
};
