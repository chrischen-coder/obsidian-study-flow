module.exports = async ({ app, quickAddApi, obsidian, variables }) => {
  const helperPath = app.vault.adapter.getFullPath("StudyFlow/scripts/错题卡工具.js");
  const { chooseDeck, displayDeck, refreshReviewData } = require(helperPath);
  const file = app.workspace.getActiveFile();

  if (!file || file.extension !== "md") {
    new obsidian.Notice("请先打开要修改分类的卡片笔记。", 5000);
    return;
  }

  const deckTag = await chooseDeck(quickAddApi, variables?.分类, app);
  if (!deckTag) {
    new obsidian.Notice("没有选择新分类，本次没有修改。", 4000);
    return;
  }

  const content = await app.vault.read(file);
  const tagPattern = /(^|\n)#flashcards(?:\/[^\s#]+)+(?=\s|$)/;
  let updated;

  if (tagPattern.test(content)) {
    updated = content.replace(tagPattern, `$1#${deckTag}`);
  } else {
    const title = /^# .+$/m.exec(content);
    if (!title) {
      new obsidian.Notice("这篇笔记没有标题，无法自动放置卡组标签。", 5000);
      return;
    }
    const insertionPoint = title.index + title[0].length;
    updated = `${content.slice(0, insertionPoint)}\n\n#${deckTag}${content.slice(insertionPoint)}`;
  }

  await app.vault.modify(file, updated);
  await refreshReviewData(app);
  new obsidian.Notice(`已移动到：${displayDeck(deckTag)}`, 5000);
};
