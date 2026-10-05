const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const {
  starterFiles,
  pluginFiles,
  exampleFiles,
  makeZip,
} = require("../tools/package.cjs");
const os = require("node:os");
test("starter archive includes scripts and hidden config, excludes third-party code and personal files", () => {
  const entries = starterFiles();
  assert.ok(entries.some((x) => x.name.endsWith("/00_开始.md")));
  assert.ok(
    entries.some((x) =>
      x.name.includes("/.obsidian/plugins/quickadd/data.json"),
    ),
  );
  assert.ok(entries.some((x) => x.name.endsWith("主动回忆示例.pdf")));
  assert.ok(!entries.some((x) => /main\.js|workspace|apiKey/.test(x.name)));
  for (const item of entries.filter((x) => x.name.endsWith(".json"))) {
    const text = item.data.toString();
    JSON.parse(text);
    assert.ok(!/apiKey|知行书房|chenwenke|15_软考/.test(text));
  }
  assert.equal(makeZip(entries).readUInt32LE(0), 0x04034b50);
});
test("QuickAdd macro steps all point to distributed scripts", () => {
  const root = path.resolve(__dirname, "../starter-vault");
  const data = JSON.parse(
    fs.readFileSync(path.join(root, ".obsidian/plugins/quickadd/data.json")),
  );
  const ids = new Set();
  for (const choice of data.choices) {
    assert.ok(!ids.has(choice.id));
    ids.add(choice.id);
    for (const step of choice.macro.commands)
      assert.ok(fs.existsSync(path.join(root, step.path)));
  }
});
test("native packages allow only Study Flow binaries and original example content", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "study-flow-package-"));
  try {
    const version = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../package.json")),
    ).version;
    for (const [name, text] of Object.entries({
      "main.js": "own plugin",
      "manifest.json": JSON.stringify({ id: "study-flow", version }),
      "styles.css": "own styles",
      LICENSE: "MIT",
      "data.json": "private settings",
    }))
      fs.writeFileSync(path.join(folder, name), text);
    const plugin = pluginFiles(folder);
    assert.equal(plugin.length, 4);
    assert.ok(!plugin.some((e) => e.name.endsWith("data.json")));
    const example = exampleFiles(plugin);
    assert.ok(example.some((e) => e.name.endsWith("/00_开始.md")));
    assert.ok(example.some((e) => e.name.endsWith("主动回忆示例.pdf")));
    assert.ok(
      example
        .filter((e) => e.name.includes("/.obsidian/plugins/"))
        .every((e) => e.name.includes("/study-flow/")),
    );
    assert.ok(!example.some((e) => /workspace|upgrade-backups/.test(e.name)));
    fs.writeFileSync(
      path.join(folder, "manifest.json"),
      JSON.stringify({ id: "third-party", version }),
    );
    assert.throws(() => pluginFiles(folder));
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
