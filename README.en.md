# Obsidian Study Flow · by crown

**v0.2: Read a PDF → capture → understand → draft and publish → spaced review → return to the source.**

[中文](README.md) · [Native plugin guide](docs/native-guide.en.md) · [Build artifacts](https://github.com/crown-sports/obsidian-study-flow/actions) · [Architecture](docs/architecture.md)

The native desktop plugin has an English and Chinese workbench. Each book overview, excerpt and card is an independent Markdown file with a stable ID. Capture without interrupting reading, organize excerpts later, and publish only after previewing a meaningful question and answer. Reviewed cards keep their paths, IDs and scheduling comments when edited.

v0.2 is a feature-PR preview; no formal release or community listing has been published yet. Download a passing PR Actions artifact and open the extracted `Study-Flow-Example` vault, or copy the plugin ZIP’s `study-flow` folder into an existing vault’s `.obsidian/plugins/`. Enable Study Flow, install **PDF++** and **Spaced Repetition** from Community Plugins, then save the workbench defaults. No Node, JSON editing, QuickAdd or API key is needed for native use.

![Native setup](docs/images/v0.2/01-setup.png)

![Capture while reading](docs/images/v0.2/02-capture.png)

![Inbox and card preview](docs/images/v0.2/03-inbox-card.png)

![Native SR review](docs/images/v0.2/04-sr-review.png)

Drafts stay outside SR; publication checks both sides. The workbench opens SR’s native review UI, records reading progress and provides selection/page links back to PDFs. Screenshot and text capture remain available. Legacy upgrades offer previews, backups and conflict-aware restoration; existing QuickAdd macros forward to `api.v1` when the native plugin is enabled.

Local processing, with OCR, AI card generation and image occlusion reserved for later versions. Actual application validation covers macOS, Obsidian 1.13.7, PDF++ 0.40.31 and SR 1.15.4. Windows/Linux build and file tests run in CI; their application UI is unverified. See the [validation record](docs/validation-v0.2.md) and [compatibility](docs/compatibility.md). Mobile users can review synced Markdown and attachments with SR.

Developers need Node 20+: `npm ci`, `npm run check`, `npm test`, `npm run package`. Packages include our native plugin, an original example vault, a separate legacy starter and SHA-256 checksums. Third-party plugin binaries are installed separately.

## Legacy QuickAdd workflow (v0.1)

**Screenshots, copied text and PDF selections → your understanding → Markdown flashcards → spaced review.**

[中文](README.md) · [Download legacy starter vault](https://github.com/crown-sports/obsidian-study-flow/releases/latest)

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

Configure legacy paths and decks in `starter-vault/StudyFlow/config.json`. Keep the `StudyFlow/scripts` path unchanged. Native development and packaging use the Node 20+ commands above.

See [installation](docs/install.md), [architecture](docs/architecture.md), [compatibility](docs/compatibility.md) and [contributing](CONTRIBUTING.md). Thanks to [QuickAdd](https://github.com/chhoumann/quickadd), [PDF++](https://github.com/RyotaUshio/obsidian-pdf-plus) and [Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) maintainers. Our code and original demo material are MIT; see [NOTICE](NOTICE).
