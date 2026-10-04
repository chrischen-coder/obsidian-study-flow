# Contributing / 参与贡献

欢迎修 bug、改善上手文档、补充系统兼容性和翻译。先用独立示例库重现，避免把个人笔记、题库和插件账户配置带进提交。

```sh
npm test
npm run package
```

测试无需 npm install：只使用 Node 18+ 内置模块。改 PDF 集成时，请同时验证 PDF++ 的真实选区、取消不写入、重复摘录、勾选建卡和原文回链。用本项目原创 PDF 制作截图；不要提交整个个人 `.obsidian` 目录。

主要代码：`starter-vault/StudyFlow/scripts/`。配置在 `StudyFlow/config.json`。保持脚本路径稳定，避免安装后的 QuickAdd 宏失去引用。PDF++ 内部接口的兼容边界必须写进 `docs/compatibility.md`。新增依赖须说明用途和许可证。

PR 请写明触发场景、修改后行为和验证结果。评分算法的问题交给 Spaced Repetition 上游；PDF 阅读器本身的问题交给 PDF++ 上游，并附最小复现。
