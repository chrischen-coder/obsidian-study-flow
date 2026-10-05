# 图片来源与复现

## v0.2 原生插件

`v0.2/01-setup.png`、`02-capture.png`、`03-inbox-card.png`、`04-sr-review.png` 与 `05-workbench-en.png` 均来自独立原生测试库的真实 Obsidian 窗口；没有拼接或用概念图冒充应用截图。

使用 Obsidian 1.13.7 / PDF++ 0.40.31 / SR 1.15.4，macOS。打开本项目原创双语 PDF：在侧栏保存真实选区，到收件箱填写自己的理解、预览并发布，再从工作台进入 SR 显示答案。`05-workbench-en.png` 展示实际切换后的英文界面。

窗口内的两份 PDF、学习文件和卡片均是本项目原创练习数据，没有个人笔记、账户配置或外部教材。新示例 ZIP 不包含测试生成的卡片、第三方插件二进制或测试库状态。

## v0.1 旧工作流

`workflow.svg` / `workflow.png` 和 `example-question.svg` 是本项目原创材料，按 MIT 许可证开放。SVG 由 `tools/build_visuals.cjs` 生成，PNG 渲染可选使用 sharp；普通用户不需要运行生成工具。

`pdf-memory.png`、`pdf-excerpt.png`、`review.png` 和 `screenshot-card.png` 来自独立测试库中的真实 Obsidian 桌面窗口。版本与验证范围见 [兼容性记录](../compatibility.md)。PDF 内容取自仓库附带的原创 `主动回忆示例.pdf`；题目图像由 `example-question.svg` 渲染。测试库未使用个人笔记或外部教材。

截图建卡测试先将原创题目图像放入测试剪贴板，再运行建卡宏；测试用注入代码没有收录到发布脚本。公开脚本直接读取用户当前图像剪贴板。文档截图展示界面与产物，不代表各操作系统的截图快捷键均已完成验证。

复现 PDF 截图：打开示例 PDF，选中第一段原文，写小结，勾选建卡并填写问题；保存后进入 Spaced Repetition 显示答案。保存第 2 页阅读进度，再打开对应摘录笔记，即可复现其余阅读截图。
