const test = require("node:test"),
  assert = require("node:assert/strict");
const cases = [
  ["新建文字错题卡", "captureText"],
  ["新建截图错题卡", "captureScreenshot"],
  ["摘录PDF原文", "capturePdf"],
  ["保存PDF阅读进度", "saveProgress"],
  ["新建PDF学习卡", "createStudyNote"],
  ["打开PDF摘录", "openExcerpts"],
  ["修改当前卡片分类", "changeDeck"],
  ["PDF学习按钮", "openWorkbench"],
];
test("old QuickAdd paths call api.v1 and preserve question/answer/category variables", async () => {
  for (const [name, method] of cases) {
    let calls = 0,
      received;
    const variables = { 题目: "问题", 答案: "答案", 分类: "考试/数据库" };
    const script = require(`../starter-vault/StudyFlow/scripts/${name}.js`);
    const app = {
      plugins: {
        plugins: {
          "study-flow": {
            api: {
              v1: {
                [method]: async (v) => {
                  calls++;
                  received = v;
                  return {
                    status: "created",
                    id: "stable",
                    path: "card.md",
                    warnings: [],
                  };
                },
              },
            },
          },
        },
      },
    };
    const result = await script({ app, variables });
    assert.equal(calls, 1);
    assert.equal(result.id, "stable");
    if (["captureText", "captureScreenshot", "changeDeck"].includes(method))
      assert.equal(received, variables);
  }
});
test("native save failure propagates without falling through and duplicating a legacy write", async () => {
  const script = require("../starter-vault/StudyFlow/scripts/新建文字错题卡.js");
  await assert.rejects(
    () =>
      script({
        app: {
          plugins: {
            plugins: {
              "study-flow": {
                api: {
                  v1: {
                    captureText: async () => {
                      throw Error("save failed");
                    },
                  },
                },
              },
            },
          },
        },
      }),
    /save failed/,
  );
});
