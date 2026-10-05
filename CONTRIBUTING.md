# Contributing / 参与贡献

欢迎修 bug、改善上手文档、补充系统兼容性和翻译。先用独立示例库重现，避免把个人笔记、题库和插件账户配置带进提交。

```sh
npm ci
npm run check
npm test
npm run package
```

开发需要 Node 20+。严格 TypeScript 检查、旧工作流测试、原生数据与集成测试由 CI 在 macOS / Windows / Linux 执行。改 PDF 集成时，请验证真实选区、取消不写入、重复摘录、两份 PDF 进度隔离和原文回链。改卡片格式时，必须验证固定 SR 原生解析器及实际评分后编辑不丢调度。用原创 PDF 制作截图，不要提交个人 `.obsidian` 配置。

原生代码在 `src/`，模型、存储和服务在 `src/core/`；PDF++ / SR 内部接口只放在适配器。旧脚本在 `starter-vault/StudyFlow/scripts/`，配置在 `StudyFlow/config.json`。保持旧脚本路径与 `api.v1` 兼容。内部接口边界写进 `docs/compatibility.md`，架构见 `docs/architecture.md`。新增依赖说明用途和许可证；固定上游测试样本保留其许可证及来源，不进入安装包。

Three install archives and SHA-256 checksums are built into `dist/`. Keep package allowlists strict: only our plugin code, original example content and required documentation. No third-party plugin binaries, personal notes, credentials or workspace state.

英文旧流程教程已有独立贡献 PR；原生功能说明写在 `docs/native-guide.en.md`，避免覆盖贡献者正在修改的旧教程。

PR 请写明触发场景、修改后行为和验证结果。评分算法的问题交给 Spaced Repetition 上游；PDF 阅读器本身的问题交给 PDF++ 上游，并附最小复现。
