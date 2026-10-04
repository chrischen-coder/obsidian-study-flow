# 安装与恢复

## 方式一：独立示例库（推荐）

1. 从 [Releases](https://github.com/chrischen-coder/obsidian-study-flow/releases/latest) 下载 starter ZIP，解压到一个普通本地文件夹。
2. 在 Obsidian 仓库管理页选择「打开本地仓库」，选 **Obsidian-Study-Flow**。请选这个文件夹本身；`StudyFlow` 只是里面的脚本目录。
3. 打开「设置 → 第三方插件 → 浏览」，依次搜索 **QuickAdd、PDF++、Spaced Repetition**，每个插件都点「安装」与「启用」。
4. 重启 Obsidian，以便 QuickAdd 的启动宏添加「保存划线 / 背诵摘录」按钮。
5. 打开 `00_开始.md`。先复制一句问题，运行「复制变错题卡」，写答案，再运行 Spaced Repetition 的复习卡片命令。

ZIP 包含隐藏的 `.obsidian` 配置目录。若自行复制文件，请一并复制隐藏文件；只有脚本文件还不会出现 QuickAdd 入口。源码下载用户也可直接打开仓库内的 `starter-vault`，操作相同。

普通用户无需安装 Node。这个库没有第三方插件的 `main.js`，插件代码由社区市场安装。

## 方式二：接入已有库

需要 Node.js 18+，请下载完整仓库源码。先安装三款依赖插件，**关闭目标库的 Obsidian 窗口**，避免插件把内存中的旧设置写回磁盘。不要把示例库的整个 `.obsidian` 目录盖到自己的库上。

在项目根目录执行（将路径换成你自己的库路径）：

```sh
node tools/install.cjs "/path/to/your/vault" --dry-run
node tools/install.cjs "/path/to/your/vault"
```

预览列出拟修改文件。正式安装会：

- 放入 `StudyFlow/scripts`，首次提供 `StudyFlow/config.json`；已有配置保留。
- 合并本项目的 QuickAdd 宏，保留其他宏和 AI 配置；开启 QuickAdd URI 入口。
- 为 PDF++ 添加颜色，关闭自动复制、自动聚焦和自动粘贴，确保保存目标明确。
- 为 Spaced Repetition 添加 `#flashcards` 标签与 `?` 多行分隔符，保留复习调度和其他设置。
- 写入 `StudyFlow-开始.md`，并将修改前的文件备份到目标库的 `.study-flow-backups/时间戳`。

安装工具不会安装插件或改动插件启用清单。重新打开目标库后，确认三款依赖已启用。

原创练习 PDF 仅随示例库提供。已有库体验 PDF 流程时，可打开自己的 PDF，或将源码中的 `starter-vault/03_PDF/主动回忆示例.pdf` 复制到库内 `03_PDF` 目录。

同名但不同 ID 的宏会阻止安装，避免悄悄替换现有流程；先给旧入口改名即可。若已有卡片使用自定义多行分隔符，工具也会停止，请先用示例库体验。重复安装会更新本项目脚本与宏，保留用户配置；本项目文件的手动修改请先另存。

## 恢复安装前状态

先关闭目标库，使用安装结果返回的备份目录执行：

```sh
node tools/restore.cjs "/path/to/your/vault" "/path/to/your/vault/.study-flow-backups/时间戳" --dry-run
node tools/restore.cjs "/path/to/your/vault" "/path/to/your/vault/.study-flow-backups/时间戳"
```

恢复工具只处理该次安装清单中的脚本和设置：原有文件恢复备份，安装新增文件移到备份目录的 `removed-after-restore`，便于找回。你后来创建的记忆卡片、PDF、摘录和附件不在安装清单里，会保留。

## 自定义分类与目录

编辑库内 `StudyFlow/config.json`，保留合法 JSON：

```json
{
  "cardFolder": "我的学习/记忆卡片",
  "attachmentFolder": "我的学习/附件",
  "shelfPath": "我的学习/PDF书架.md",
  "decks": [{ "label": "英语 / 语法", "tag": "flashcards/英语/语法" }],
  "pdfCategories": [
    { "label": "英语", "value": "英语", "folder": "我的学习/PDF", "tag": "学习/英语" }
  ]
}
```

保存后下一次运行就会读取新配置。目录必须是库内相对路径。输出目录会自动建立；已生成文件不会因配置变化自动移动。书架扫描带 `类型: PDF学习` 属性的笔记，可以汇总旧学习卡。

若使用 Web Clipper，另改它的模板路径与卡组。已有卡片的卡组标签，可用「修改当前卡片分类」更新。
