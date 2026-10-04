# 兼容性与验证记录

发布基线：2026-10-04，v0.1.0。

| 组件 | 本次实际验证版本 | 来源 |
| --- | --- | --- |
| Obsidian | 1.13.7 / macOS | 已安装桌面应用 |
| QuickAdd | 2.30.0 | 官方 GitHub Release |
| PDF++ | 0.40.31 | 官方 GitHub Release |
| Spaced Repetition | 1.15.4 | 官方 GitHub Release |
| Node | 20.20.2 | 开发测试；普通使用不需要 |

版本记录在 `dependencies.json`。测试用第三方代码仅下载到独立临时库，没有打包进仓库或 ZIP。

## 验证方式

在独立示例库中，用真实 Obsidian 操作验证 PDF 选区 → 小结 → 勾选建卡 → 复习显示答案 → 评分写调度 → 原文回链 → 保存页码和续读。截图建卡使用本项目原创题目图像注入测试剪贴板，验证 PNG 落盘、卡片正面显示和答案评分；本次没有完成操作系统截图快捷键的端到端验证。复制建卡已验证从剪贴板带入题目输入框。

文档截图均来自独立库，材料为原创 PDF 和练习题。来源与复现方式见 [图片说明](images/README.md)。

18 项自动测试覆盖取消、空输入、选区文件不匹配、摘录与卡片去重、文件名冲突、书架刷新、进度链接、已有库安装合并、备份、重复安装、恢复前冲突检查及路径限制。执行 `npm test`。

Windows / Linux 采用相同的 Electron 桌面接口，尚未完成应用内验证。手机端建卡不支持；可同步 Markdown 和附件，再用手机端 Spaced Repetition 复习。Web Clipper 模板已通过 JSON 结构检查，未完成扩展 UI 验证。

## 内部接口

- PDF++：`lib.copyLink.getTemplateVariables({ color: "记忆" })`，必须含当前文件和 selection。
- Obsidian PDF 视图：`view.getState().page`；总页数从 viewer 子对象读取，尚未加载则记 0；滚动位置从 PDF.js `_location` 读取，缺失则退回页码。
- Spaced Repetition：共享 helper 可尝试 `dataManager.sync` 刷新；不可用时保留已保存卡片，由文件事件 / 重新进入复习发现。
- 左栏按钮依赖文件列表的 `.nav-files-container`，因此更换文件列表实现的插件或未来 UI 更新可能需要适配；命令面板入口仍可使用。

升级依赖后请先在示例库跑完整流程。遇到兼容问题可附版本、原创示例复现步骤提交 Issue。

官方参考：[QuickAdd 用户脚本](https://quickadd.obsidian.guide/docs/UserScripts/)、[PDF++ 文档](https://ryotaushio.github.io/obsidian-pdf-plus/)、[Spaced Repetition 源码与文档](https://github.com/st3v3nmw/obsidian-spaced-repetition)。
