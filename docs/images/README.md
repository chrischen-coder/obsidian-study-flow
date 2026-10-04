# 图片来源与复现

`workflow.svg` / `workflow.png` 和 `example-question.svg` 是本项目原创材料，按 MIT 许可证开放。SVG 由 `tools/build_visuals.cjs` 生成，PNG 渲染可选使用 sharp；普通用户不需要运行生成工具。

`pdf-memory.png`、`pdf-excerpt.png`、`review.png` 和 `screenshot-card.png` 来自独立测试库中的真实 Obsidian 桌面窗口。版本与验证范围见 [兼容性记录](../compatibility.md)。PDF 内容取自仓库附带的原创 `主动回忆示例.pdf`；题目图像由 `example-question.svg` 渲染。测试库未使用个人笔记或外部教材。

截图建卡测试先将原创题目图像放入测试剪贴板，再运行建卡宏；测试用注入代码没有收录到发布脚本。公开脚本直接读取用户当前图像剪贴板。文档截图展示界面与产物，不代表各操作系统的截图快捷键均已完成验证。

复现 PDF 截图：打开示例 PDF，选中第一段原文，写小结，勾选建卡并填写问题；保存后进入 Spaced Repetition 显示答案。保存第 2 页阅读进度，再打开对应摘录笔记，即可复现其余阅读截图。
