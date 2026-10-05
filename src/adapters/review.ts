import type { App } from "obsidian";
import { dependency, executeCommand, versionOf } from "./dependencies";
import { FlowError } from "../core/model";
interface ReviewSettings {
  flashcardTags?: string[];
  multilineCardSeparator?: string;
  multilineReversedCardSeparator?: string;
  multilineCardEndMarker?: string;
  clozePatterns?: string[];
  singleLineCardSeparator?: string;
  singleLineReversedCardSeparator?: string;
  dataStore?: string;
  convertFoldersToDecks?: boolean;
  convertBoldTextToClozes?: boolean;
  convertCurlyBracketsToClozes?: boolean;
}
interface ReviewPlugin {
  settings?: ReviewSettings;
  dataManager?: {
    syncLock?: boolean;
    isInitialized?: boolean;
    settingsManager?: { settings?: ReviewSettings };
    sync?: () => Promise<void>;
    osrCore?: { reviewableDeckTree?: unknown };
  };
  uiManager?: { updateStatusBar?: () => Promise<void> };
}
export class ReviewAdapter {
  constructor(private app: App) {}
  private plugin(): ReviewPlugin | undefined {
    return dependency(this.app, "obsidian-spaced-repetition") as
      | ReviewPlugin
      | undefined;
  }
  get enabled(): boolean {
    return !!this.plugin();
  }
  get version(): string {
    return versionOf(this.plugin());
  }
  get settings(): ReviewSettings | null {
    try {
      const p = this.plugin();
      return p?.dataManager?.settingsManager?.settings ?? p?.settings ?? null;
    } catch {
      return null;
    }
  }
  get separator(): string {
    return this.settings?.multilineCardSeparator ?? "?";
  }
  requirePublish(deckTag: string, question: string, answer: string): void {
    const settings = this.settings;
    if (!this.enabled || !settings)
      throw new FlowError(
        "unsupported",
        "Install and enable Spaced Repetition before publishing. You can save a draft now.",
      );
    if (settings.dataStore && settings.dataStore !== "NOTES")
      throw new FlowError(
        "unsupported",
        "This storage format is not supported for publishing. Save a draft and keep your SR configuration.",
      );
    const tags = settings.flashcardTags ?? ["#flashcards"];
    if (
      !settings.convertFoldersToDecks &&
      !tags.some(
        (root) =>
          deckTag === root.replace(/^#/, "") ||
          deckTag.startsWith(root.replace(/^#/, "") + "/"),
      )
    )
      throw new FlowError(
        "invalid",
        "This deck is not recognized by SR. Choose a deck under an existing SR flashcard tag in Study Flow settings.",
      );
    if (
      (settings.singleLineCardSeparator &&
        settings.singleLineCardSeparator !== "::") ||
      (settings.singleLineReversedCardSeparator &&
        settings.singleLineReversedCardSeparator !== ":::")
    )
      throw new FlowError(
        "unsupported",
        "Custom inline card syntax is not yet supported for publishing. Save a draft; existing cards remain intact.",
      );
    if (
      settings.multilineCardEndMarker ||
      settings.clozePatterns?.some(
        (pattern) => pattern !== "==[123;;]answer[;;hint]==",
      )
    )
      throw new FlowError(
        "unsupported",
        "Custom card end markers or cloze patterns are not yet supported for publishing. Save a draft; keep your SR settings.",
      );
    if (/<!--(?:SR:| study-flow:)/.test(question + answer))
      throw new FlowError(
        "invalid",
        "Reserved scheduling/editing markers cannot be part of a question or answer.",
      );
    if (/^(?:```|~~~)/m.test(question + answer))
      throw new FlowError(
        "unsupported",
        "Fenced code blocks need a plain text card in this version. Save a draft or use inline code.",
      );
    const reversed = settings.multilineReversedCardSeparator;
    if (
      reversed &&
      reversed !== this.separator + this.separator &&
      (question + "\n" + answer)
        .split("\n")
        .some((line) => line.trim() === reversed)
    )
      throw new FlowError(
        "unsupported",
        "A line in this card matches your SR reversed-card separator. Save a draft or rephrase that line.",
      );
    if (
      (settings.convertBoldTextToClozes && /\*\*/.test(question + answer)) ||
      (settings.convertCurlyBracketsToClozes && /[{}]/.test(question + answer))
    )
      throw new FlowError(
        "unsupported",
        "SR would interpret this text as additional cloze cards. Save a draft or remove the cloze formatting before publishing.",
      );
  }
  stats(): { new: number; due: number } | null {
    try {
      const manager = this.plugin()?.dataManager;
      if (manager?.syncLock || manager?.isInitialized === false) return null;
      const root = manager?.osrCore?.reviewableDeckTree;
      if (!root) return null;
      const seen = new Set<unknown>(),
        newItems = new Set<unknown>(),
        dueItems = new Set<unknown>();
      const visit = (value: unknown): boolean => {
        if (!value || typeof value !== "object" || seen.has(value))
          return false;
        seen.add(value);
        const deck = value as {
          newRepItems?: unknown;
          dueRepItems?: unknown;
          subdecks?: unknown;
        };
        if (
          !Array.isArray(deck.newRepItems) ||
          !Array.isArray(deck.dueRepItems) ||
          !Array.isArray(deck.subdecks)
        )
          return false;
        deck.newRepItems.forEach((item) => newItems.add(item));
        for (const item of deck.dueRepItems) {
          // SR keeps scheduled future cards in this array too.
          if (
            !item ||
            typeof item !== "object" ||
            typeof (item as { isDue?: unknown }).isDue !== "boolean"
          )
            return false;
          if ((item as { isDue: boolean }).isDue) dueItems.add(item);
        }
        return deck.subdecks.every(visit);
      };
      return visit(root) ? { new: newItems.size, due: dueItems.size } : null;
    } catch {
      return null;
    }
  }
  async refresh(): Promise<void> {
    await this.plugin()?.dataManager?.sync?.();
    await this.plugin()?.uiManager?.updateStatusBar?.();
  }
  async start(): Promise<void> {
    if (!this.enabled)
      throw new FlowError(
        "unsupported",
        "Install and enable Spaced Repetition to review.",
      );
    await this.refresh();
    if (
      !executeCommand(
        this.app,
        "obsidian-spaced-repetition:srs-review-flashcards",
      )
    )
      throw new FlowError(
        "unsupported",
        "Open the Spaced Repetition review command from the command palette.",
      );
  }
}
