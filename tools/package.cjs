#!/usr/bin/env node
// Dependency-free ZIP (stored entries) with CRC32; include only the starter allowlist.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  source = path.join(root, "starter-vault");
const version = JSON.parse(
  fs.readFileSync(path.join(root, "package.json")),
).version;
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function starterFiles() {
  const entries = [];
  function visit(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name),
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error("Symlink in starter");
      if (stat.isDirectory()) visit(file);
      else {
        const relative = path.relative(source, file).split(path.sep).join("/");
        const allowed =
          relative.startsWith("StudyFlow/") ||
          relative.startsWith("03_PDF/") ||
          relative === "00_开始.md" ||
          /^\.obsidian\/(app|community-plugins)\.json$/.test(relative) ||
          /^\.obsidian\/plugins\/[^/]+\/data\.json$/.test(relative);
        if (!allowed) continue;
        if (
          /(^|\/)(main\.js|manifest\.json|styles\.css|workspace.*\.json|\.DS_Store)$/.test(
            relative,
          )
        )
          throw new Error("Private/plugin file in ZIP");
        entries.push({
          name: "Obsidian-Study-Flow/" + relative,
          data: fs.readFileSync(file),
        });
      }
    }
  }
  visit(source);
  return entries;
}
function makeZip(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name),
      crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBytes.length, 26);
    locals.push(head, nameBytes, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBytes.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBytes);
    offset += head.length + nameBytes.length + data.length;
  }
  const centralLength = central.reduce((n, b) => n + b.length, 0),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
function pluginFiles(folder = path.join(root, "build/plugin")) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(folder, "manifest.json")),
  );
  if (manifest.id !== "study-flow" || manifest.version !== version)
    throw Error("Unexpected native plugin manifest");
  return ["main.js", "manifest.json", "styles.css", "LICENSE"].map((name) => {
    const file = path.join(folder, name);
    if (fs.lstatSync(file).isSymbolicLink())
      throw Error("Symlink in native plugin");
    return { name: "study-flow/" + name, data: fs.readFileSync(file) };
  });
}
function exampleFiles(plugin = pluginFiles()) {
  const prefix = "Study-Flow-Example/";
  const entries = plugin.map((entry) => ({
    name: prefix + ".obsidian/plugins/" + entry.name,
    data: entry.data,
  }));
  entries.push(
    {
      name: prefix + ".obsidian/community-plugins.json",
      data: Buffer.from('["study-flow"]\n'),
    },
    {
      name: prefix + ".obsidian/app.json",
      data: Buffer.from('{"alwaysUpdateLinks":true}\n'),
    },
  );
  entries.push(
    {
      name: prefix + "00_开始.md",
      data: fs.readFileSync(path.join(root, "docs/example-start.md")),
    },
    {
      name: prefix + "03_PDF/主动回忆示例.pdf",
      data: fs.readFileSync(path.join(source, "03_PDF/主动回忆示例.pdf")),
    },
  );
  for (const name of ["LICENSE", "NOTICE"])
    entries.push({
      name: prefix + name,
      data: fs.readFileSync(path.join(root, name)),
    });
  return entries;
}
function build() {
  const entries = starterFiles();
  for (const name of ["LICENSE", "NOTICE"])
    entries.push({
      name: "Obsidian-Study-Flow/" + name,
      data: fs.readFileSync(path.join(root, name)),
    });
  const packages = [
      [`obsidian-study-flow-plugin-v${version}.zip`, pluginFiles()],
      [`obsidian-study-flow-example-v${version}.zip`, exampleFiles()],
      [`obsidian-study-flow-starter-v${version}.zip`, entries],
    ],
    dir = path.join(root, "dist");
  fs.mkdirSync(dir, { recursive: true });
  const checksums = [];
  for (const [filename, files] of packages) {
    const buffer = makeZip(files);
    fs.writeFileSync(path.join(dir, filename), buffer);
    checksums.push(
      `${crypto.createHash("sha256").update(buffer).digest("hex")}  ${filename}`,
    );
    console.log(`${files.length} files, ${buffer.length} bytes: ${filename}`);
  }
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), checksums.join("\n") + "\n");
  return path.join(dir, packages[0][0]);
}
if (require.main === module) build();
module.exports = { starterFiles, pluginFiles, exampleFiles, makeZip, build };
