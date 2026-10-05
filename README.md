# Obsidian Study Flow · by crown

**阅读 PDF → 一键摘录 → 写下理解 → 制卡 → 间隔复习 → 返回原文。**

[English](README.en.md) · [原生插件上手](docs/native-guide.md) · [构建安装包](https://github.com/crown-sports/obsidian-study-flow/actions) · [架构](docs/architecture.md)

Study Flow v0.2 将原来的 QuickAdd 学习流程升级为轻量桌面插件：阅读时先保存原文，整理时再写理解和制卡。每本 PDF、每条摘录和每张卡片都是可编辑的 Markdown，使用稳定 ID 关联。保留 crown 品牌，界面支持中文和英文。

```mermaid
flowchart LR
  A[PDF 选区] --> B[摘录收件箱]
  B --> C[自己的理解]
  C --> D[卡片草稿与预览]
  D --> E[SR 原生复习]
  E --> A
```

## 五分钟开始

v0.2 目前是功能 PR 交付的预览版本，尚未正式发布或上架社区市场。

1. 从对应 PR 的通过验证的 [Actions 运行](https://github.com/crown-sports/obsidian-study-flow/actions) 下载构建 artifact，解压后选择 `obsidian-study-flow-example-v0.2.0.zip`。
2. 解压，将 `Study-Flow-Example` 作为 Obsidian 新库打开，启用 **Study Flow**。
3. 从社区市场安装并启用 **PDF++**、**Spaced Repetition**。工作台显示依赖状态，并提供安装入口。
4. 点击 🎓，保存默认配置。打开原创示例 PDF，选中文字，运行 **Study Flow: 保存 PDF 选区**。
5. 打开“摘录收件箱”，写理解、保存草稿、预览并发布，再进入“今日复习”。

普通用户无需 Node、JSON 配置或 API Key。已有库安装只需把插件 ZIP 中的 `study-flow` 文件夹放进 `.obsidian/plugins/`；具体步骤见 [中英文教程](docs/native-guide.md)。第三方插件由用户自行安装，安装包不包含它们的二进制。

![真实 Obsidian 上手配置](docs/images/v0.2/01-setup.png)

## 阅读与整理可以分开

| 场景 | 行为 |
| --- | --- |
| 阅读中发现重点 | 立即快照真实 PDF 选区，直接保存，无需先写小结；相同原文重复摘录返回已有文件 |
| 整理积累的摘录 | 按资料、分类、状态筛选，写理解，一条摘录可以建立多张卡片 |
| 还没想好问题 | 保存草稿；草稿不会被 SR 识别为复习卡 |
| 发布与复习 | 校验问题和答案，预览后发布；使用 SR 原生评分与调度 |
| 修改已复习卡片 | 原位编辑问题、答案、卡组，保留路径、ID 和 SM-2 / FSRS 调度注释 |
| 继续阅读 | 自动记录已开始学习的 PDF 页码，切换时刷新；读完状态由你确认 |
| 核对原文 | 背面提供选区、页码与摘录链接；PDF 缺失时仍可查看原文快照并重新关联 |
| 截图、复制、旧宏 | 保留原有入口，增加原生预览与保存；取消不写文件，失败清理新附件 |

![PDF 阅读与快速摘录](docs/images/v0.2/02-capture.png)

![收件箱制卡与预览](docs/images/v0.2/03-inbox-card.png)

![SR 原生复习、来源与评分](docs/images/v0.2/04-sr-review.png)

## 本地文件，组合已有能力

| 组件 | 职责 |
| --- | --- |
| Study Flow | 工作台、采集、理解、草稿与发布、Markdown 存储、索引、迁移与恢复 |
| [PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus) | PDF 选区与定位 |
| [Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) | 卡片解析、原生复习与调度 |
| [QuickAdd](https://github.com/chhoumann/quickadd)（可选） | 保留旧宏，启用原生插件时通过 `api.v1` 转接 |

Markdown 是数据来源；索引可重建，配置通过界面管理。旧数据升级先预览并备份，恢复前检查后续编辑和复习冲突。本项目不修改第三方插件设置。v0.2 不包含 OCR、AI 制卡或图像遮挡。

真实应用验收使用 macOS / Obsidian 1.13.7 / PDF++ 0.40.31 / SR 1.15.4；Windows、Linux 的构建与文件验证由 CI 执行，应用操作尚未验收。手机端通过同步 Markdown 和附件使用 SR 复习。详见 [验证记录](docs/validation-v0.2.md) 与 [兼容范围](docs/compatibility.md)。

## 开发与参与

需要 Node 20+：

```sh
npm ci
npm run check
npm test
npm run package
```

`dist/` 生成原生插件、原生示例库、旧 QuickAdd 示例库三个 ZIP 与 `SHA256SUMS`。源码在 `src/`；旧脚本路径 `StudyFlow/scripts/` 保持稳定。

- [项目架构、数据格式与 API](docs/architecture.md)
- [原生插件中文教程](docs/native-guide.md) · [English tutorial](docs/native-guide.en.md)
- [旧 QuickAdd 图文教程](docs/guide.md) · [旧安装与恢复](docs/install.md)
- [贡献指南](CONTRIBUTING.md) · [MIT](LICENSE) · [上游致谢](NOTICE)
- [可选 Web Clipper 模板](web-clipper/README.md)

欢迎真实使用反馈、Issue、PR、翻译与兼容性测试。示例和截图仅使用原创练习资料，没有个人库内容或收费教材。
