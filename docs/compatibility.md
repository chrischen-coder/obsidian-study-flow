# 兼容范围 / Compatibility

v0.2 验证基线：2026-10-05。完整证据与复现步骤见 [validation-v0.2.md](validation-v0.2.md)。

| 组件 | 基线 | 范围 |
| --- | --- | --- |
| Obsidian | 1.13.7，macOS | 实际插件安装、工作台、采集、阅读、制卡与复习 |
| PDF++ | 0.40.31 | 当前文档选区快照、页码、选区回跳 |
| Spaced Repetition | 1.15.4 | 原生复习、评分、已复习卡片编辑 |
| QuickAdd | 2.30.0 | 旧流程基线；v0.2 不要求安装，转接与回退由自动测试覆盖 |
| Node | 20.20.2 | 开发与本地测试；安装使用不需要 |
| Windows / Linux | CI Node 20 | 构建与文件测试；应用界面未验收 |

Desktop capture is verified in macOS only. Windows/Linux application interaction is unverified. Mobile capture is not provided; synced Markdown cards and attachments can be reviewed through mobile SR.

## SR 格式与调度

- 支持普通正向多行问答卡、默认或自定义多行分隔符、标签卡组和文件夹卡组。
- 发布前检查 SR 已启用、卡组匹配与 NOTES 存储。草稿的问答只在 frontmatter，不参与 SR 解析。
- 保留 SM-2 与 FSRS 的调度注释字节；实际应用已验证默认 SM-2，FSRS 保留由自动测试覆盖。本项目不实现或重新计算调度。
- 自定义行内分隔符、结束标记、自定义挖空模式、会触发额外挖空的格式与独立代码围栏暂不支持发布；仍可存草稿。
- 不覆盖第三方设置。SR 私有对象不兼容或正在同步时不展示猜测统计；已调度但未到期的卡片不计作到期卡。

使用固定的 [SR 1.15.4 原生解析器测试样本](../tests/fixtures/sr-1.15.4/README.md) 验证正文。其 MIT 来源与许可证单独保留，仅用于开发测试，不进入插件安装包。

## 接口边界

| 集成 | 使用方式与降级 |
| --- | --- |
| Obsidian | 官方 Plugin、ItemView、Modal、Setting、Vault / Vault.process 与事件注册；内部插件注册表和命令执行集中隔离 |
| PDF++ | `lib.copyLink.getTemplateVariables({})`；验证文件身份、页码、选区与原文，接口不可用时拒绝采集并说明原因 |
| PDF.js | 当前 reader 的页码与总页数；可用时订阅 `pagechanging` / `updateviewarea`，同时定时观察；关闭时移除监听 |
| SR | 读取 `dataManager.settingsManager.settings`，回退旧 settings；同步后读卡组树，按 `isDue` 统计真正到期项；调用原生复习命令 |
| Electron | 仅桌面剪贴板与截图入口；其他模型与 Markdown 服务不依赖 Electron |

PDF++ / SR 升级后需要再次在独立练习库完成实际验收。缺失插件不会移除已有学习文件；依赖恢复入口在配置页。PDF 缺失保留摘录快照，重新关联修复引用。

## 旧工作流

`StudyFlow/scripts/` 保持路径和宏变量兼容，原生插件启用时调用 `api.v1`。旧版 v0.1 的 macOS 验收与截图保留在 [旧教程](guide.md)、[旧架构](legacy-architecture.md)。旧命令行安装器会合并旧流程所需的第三方配置；原生安装不运行它。

官方参考：[Obsidian Views](https://docs.obsidian.md/Plugins/User+interface/Views)、[Vault](https://docs.obsidian.md/Plugins/Vault)、[PDF++](https://ryotaushio.github.io/obsidian-pdf-plus/)、[SR](https://stephenmwangi.com/obsidian-spaced-repetition/flashcards/reviewing/)、[QuickAdd](https://quickadd.obsidian.guide/docs/UserScripts/)。
