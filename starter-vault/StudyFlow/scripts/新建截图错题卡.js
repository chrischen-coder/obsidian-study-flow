module.exports = async ({ app, quickAddApi, obsidian, variables }) => {
  const helper = require(app.vault.adapter.getFullPath("StudyFlow/scripts/错题卡工具.js"));
  const config = require(app.vault.adapter.getFullPath("StudyFlow/scripts/配置工具.js")).loadConfig(app);
  const image = require("electron").clipboard.readImage();
  if (image.isEmpty()) {
    new obsidian.Notice("剪贴板里没有图片。先截图到剪贴板或复制图片，再运行“截图变错题卡”。", 7000);
    return;
  }
  const deckTag = await helper.chooseDeck(quickAddApi, variables?.分类, app);
  if (!deckTag) return;
  const answer = String(variables?.答案 ?? await quickAddApi.wideInputPrompt("一句话答案", "输入正确答案或关键判断") ?? "").trim();
  if (!helper.hasText(answer)) return;
  const { stamp } = helper.formatLocalDate();
  const title = "截图错题";
  const path = helper.uniquePath(app, config.attachmentFolder, `${stamp}-错题`, "png");
  await helper.ensureFolder(app, config.attachmentFolder);
  const png = image.toPNG();
  const attachment = await app.vault.createBinary(path, png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength));
  let file;
  try {
    ({ file } = await helper.createCard(app, { title, question: `![[${path}]]\n这题的正确答案或关键判断是什么？`, answer, deckTag, type: "截图错题卡" }));
  } catch (error) {
    await app.vault.delete(attachment);
    throw error;
  }
  await app.workspace.getLeaf(false).openFile(file);
  await helper.refreshReviewData(app);
  new obsidian.Notice(`已生成截图错题卡：${helper.displayDeck(deckTag)}`, 5000);
};
