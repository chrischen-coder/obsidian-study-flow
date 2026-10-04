# Obsidian Study Flow

**Screenshots, copied text and PDF selections → your understanding → Markdown flashcards → spaced review.**

[中文](README.md) · [Download starter vault](https://github.com/chrischen-coder/obsidian-study-flow/releases/latest) · [Screenshot and clipboard quickstart](docs/guide.en.md)

![Workflow diagram](docs/images/workflow.svg)

A desktop QuickAdd workflow kit built on **QuickAdd**, **PDF++** and **Spaced Repetition**. It publishes the glue scripts and configurations that connect capture, reading and review. Commands and prompts are currently in Chinese.

1. Download the starter ZIP from Releases and unzip it.
2. Open `Obsidian-Study-Flow` as a vault in Obsidian.
3. Install and enable QuickAdd, PDF++ and Spaced Repetition from Community Plugins. Restart Obsidian.
4. Open `00_开始.md` and create a card, or try the original sample PDF.

No Node.js, AI service or API key is required for this route. Plugin binaries are installed separately and are not redistributed.

Capture a screenshot to the clipboard, enter an answer and create an image question. Copied text is offered as an editable question. For PDFs, select text, click **保存划线**, and write a summary. Check **同时生成记忆卡片** to create a question-and-answer card whose answer is your summary. Source links return to the selected passage. Saving progress records the current page and, when available, the scroll position.

![PDF-to-card dialog](docs/images/pdf-memory.png)

![Spaced review with source link](docs/images/review.png)

Study notes hold excerpts and progress; flashcards test recall. Plain excerpts do not enter spaced review automatically. The kit does not perform OCR or generate answers. Desktop capture is the supported target; synchronized Markdown cards can be reviewed on mobile using Spaced Repetition. Windows/Linux capture has not yet been verified in-app.

Configure paths and decks in `starter-vault/StudyFlow/config.json`. Keep the `StudyFlow/scripts` path unchanged. Developer checks need Node 18+ only: `npm test` and `npm run package`.

See [installation](docs/install.md), [architecture](docs/architecture.md), [compatibility](docs/compatibility.md) and [contributing](CONTRIBUTING.md). Thanks to [QuickAdd](https://github.com/chhoumann/quickadd), [PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus) and [Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) maintainers. Our code and original demo material are MIT; see [NOTICE](NOTICE).
