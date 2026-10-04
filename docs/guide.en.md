# Screenshot and clipboard quickstart

First [install the starter vault](install.md), open it in Obsidian, and enable QuickAdd, PDF++ and Spaced Repetition. In the command palette (`Ctrl+P` on Windows/Linux or `Cmd+P` on macOS), search for the QuickAdd commands below. Their command names remain in Chinese so you can match them to the vault.

## Turn a screenshot into a flashcard

1. Capture the question and any necessary choices **to the clipboard**. On Windows, `Win+Shift+S` opens Snipping Tool; on macOS, use `Ctrl+Cmd+Shift+4`; on Linux, use a screenshot tool that copies the image to the clipboard. If your tool only saves a file, copy the image itself before continuing.
2. In Obsidian, run **QuickAdd: 截图变错题卡** (Screenshot to flashcard).
3. Choose a deck and enter the answer in the prompt. This workflow does not read or recognize text in the image; you provide the answer yourself.
4. The image is saved as a vault attachment and used as the card's front. Your answer is the back. The generated title does not include the answer.
5. Open the Spaced Repetition review view to review the card.

![A screenshot-created card in the review view](images/screenshot-card.png)

The screenshot must not already reveal the answer: anything visible on the front will also be visible while you try to recall it. The image above is an existing project screenshot; operating-system shortcut behavior has not been verified end to end on every platform.

## Turn copied text into a flashcard

1. Copy text from a webpage, PDF, or another app. You can also select text in a Markdown note; the current Markdown selection takes priority over clipboard text.
2. Run **QuickAdd: 复制变错题卡** (Copied text to flashcard). The copied text is placed in an editable question prompt; revise it into a question that tests recall.
3. Choose a deck and enter the answer, then save. The question and answer are your input; the workflow does not generate either one.
4. Review the card in Spaced Repetition.

To type a question from scratch, run **QuickAdd: 文字变错题卡** (Text to flashcard) instead. It uses the same card creation flow. Canceling a prompt or leaving the question or answer empty creates no card.

Clipboard text only pre-fills the question prompt. Review and edit it before saving, especially when copied text is a passage rather than a question.

## What has been checked

The project documents testing the screenshot-card flow by placing an original exercise image on the clipboard, then verifying the PNG attachment, card front, and answer review. Clipboard text prefill was also verified. The operating-system screenshot shortcuts have not been tested end to end on all platforms, so shortcut behavior may vary. See [compatibility notes](compatibility.md) for the current verification record.
