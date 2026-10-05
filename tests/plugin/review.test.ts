import test from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import { ReviewAdapter } from "../../src/adapters/review";
function adapter(
  settings: object,
  tree: unknown = { newRepItems: [], dueRepItems: [], subdecks: [] },
) {
  let synced = 0,
    command = "";
  const plugin = {
    manifest: { version: "1.15.4" },
    dataManager: {
      syncLock: false,
      settingsManager: { settings },
      osrCore: { reviewableDeckTree: tree },
      sync: async () => {
        synced++;
      },
    },
  };
  return {
    plugin,
    review: new ReviewAdapter({
      plugins: { plugins: { "obsidian-spaced-repetition": plugin } },
      commands: {
        executeCommandById: (id: string) => {
          command = id;
          return true;
        },
      },
    } as unknown as App),
    state: () => ({ synced, command }),
  };
}
test("SR adapter respects custom multiline and folder decks without changing third-party settings", async () => {
  const settings = {
      flashcardTags: ["#my-cards"],
      multilineCardSeparator: ";;",
      dataStore: "NOTES",
      clozePatterns: ["==[123;;]answer[;;hint]=="],
    },
    before = structuredClone(settings);
  const { review, state } = adapter(settings);
  assert.equal(review.separator, ";;");
  review.requirePublish("my-cards/topic", "question", "answer");
  assert.throws(() =>
    review.requirePublish("flashcards/topic", "question", "answer"),
  );
  await review.start();
  assert.deepEqual(state(), {
    synced: 1,
    command: "obsidian-spaced-repetition:srs-review-flashcards",
  });
  assert.deepEqual(settings, before);
  adapter({ ...settings, convertFoldersToDecks: true }).review.requirePublish(
    "folder/topic",
    "question",
    "answer",
  );
});
test("SR adapter rejects unknown storage/syntax and returns unknown counts for changed interfaces", () => {
  for (const extra of [
    { dataStore: "DATABASE" },
    { singleLineCardSeparator: "--" },
    { multilineCardEndMarker: "END" },
    { clozePatterns: ["custom-pattern"] },
    { convertBoldTextToClozes: true },
  ])
    assert.throws(() =>
      adapter({
        flashcardTags: ["#flashcards"],
        ...extra,
      }).review.requirePublish("flashcards/topic", "**question**", "answer"),
    );
  assert.equal(adapter({}, {}).review.stats(), null);
  assert.equal(new ReviewAdapter({} as App).stats(), null);
  const syncing = adapter({});
  syncing.plugin.dataManager.syncLock = true;
  assert.equal(syncing.review.stats(), null);
  const n = {},
    d = { isDue: true };
  assert.deepEqual(
    adapter(
      {},
      {
        newRepItems: [n],
        dueRepItems: [d, { isDue: false }],
        subdecks: [{ newRepItems: [n, {}], dueRepItems: [d], subdecks: [] }],
      },
    ).review.stats(),
    { new: 2, due: 1 },
  );
});
