#!/usr/bin/env node
// Closed-vault installation; merge only this workflow's choices and required settings.
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../starter-vault');
function json(file, fallback) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; }
function planInstall(destination) {
  const root = path.resolve(destination);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('目标必须是已存在的 Obsidian 库目录');
  const changes = [];
  function add(relative, content) {
    const target = path.join(root, relative);
    // A symlink could redirect writes outside the selected vault; fail before writing.
    let current = target;
    while (current.startsWith(root + path.sep)) {
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`拒绝通过符号链接安装：${relative}`);
      current = path.dirname(current);
    }
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) changes.push({ relative, target, content });
  }
  const config = 'StudyFlow/config.json';
  if (!fs.existsSync(path.join(root, config))) add(config, fs.readFileSync(path.join(source, config), 'utf8'));
  for (const name of fs.readdirSync(path.join(source, 'StudyFlow/scripts'))) {
    add('StudyFlow/scripts/' + name, fs.readFileSync(path.join(source, 'StudyFlow/scripts', name), 'utf8'));
  }
  const qaPath = '.obsidian/plugins/quickadd/data.json';
  const qa = json(path.join(root, qaPath), {});
  const incoming = json(path.join(source, qaPath), {});
  const newChoices = incoming.choices;
  const ids = new Set(newChoices.map(x => x.id));
  for (const item of qa.choices || []) {
    if (!ids.has(item.id) && newChoices.some(x => x.name === item.name)) throw new Error(`QuickAdd 已有同名入口「${item.name}」，请先改名，再安装`);
  }
  qa.choices = [...(qa.choices || []).filter(x => !ids.has(x.id)), ...newChoices];
  qa.enableUriCallbacks = true;
  add(qaPath, JSON.stringify(qa, null, 2) + '\n');
  const pdfPath = '.obsidian/plugins/pdf-plus/data.json';
  const pdf = json(path.join(root, pdfPath), {});
  Object.assign(pdf, { autoCopy: false, autoFocus: false, autoPaste: false });
  pdf.colors = { ...pdf.colors, ...json(path.join(source, pdfPath), {}).colors };
  add(pdfPath, JSON.stringify(pdf, null, 2) + '\n');
  const srPath = '.obsidian/plugins/obsidian-spaced-repetition/data.json';
  const sr = json(path.join(root, srPath), {});
  const oldSettings = sr.settings || {};
  if (oldSettings.multilineCardSeparator && oldSettings.multilineCardSeparator !== '?') {
    throw new Error('Spaced Repetition 使用自定义多行分隔符，安装会影响旧卡片；请先在独立示例库体验');
  }
  sr.settings = { ...oldSettings, flashcardTags: [...new Set([...(oldSettings.flashcardTags || []), '#flashcards'])], multilineCardSeparator: '?' };
  add(srPath, JSON.stringify(sr, null, 2) + '\n');
  // Users install/enable plugins in Obsidian themselves. Do not edit their enablement list.
  const home = 'StudyFlow-开始.md';
  if (!fs.existsSync(path.join(root, home))) add(home, fs.readFileSync(path.join(source, '00_开始.md'), 'utf8'));
  return changes;
}
function install(destination, { dryRun = false } = {}) {
  const changes = planInstall(destination);
  if (dryRun || !changes.length) return { changes: changes.map(x => x.relative), backup: null };
  const root = path.resolve(destination);
  const backupRoot = path.join(root, '.study-flow-backups');
  if (fs.existsSync(backupRoot) && fs.lstatSync(backupRoot).isSymbolicLink()) throw new Error('备份目录不能是符号链接');
  const backup = path.join(backupRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  if (fs.existsSync(backup)) throw new Error('备份目录已存在，请稍后重试');
  const manifest = [];
  fs.mkdirSync(backup, { recursive: true });
  for (const item of changes) {
    const existed = fs.existsSync(item.target);
    if (existed) {
      const copy = path.join(backup, item.relative);
      fs.mkdirSync(path.dirname(copy), { recursive: true });
      fs.copyFileSync(item.target, copy);
    }
    manifest.push({ relative: item.relative, existed });
  }
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const item of changes) {
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.writeFileSync(item.target, item.content);
  }
  return { changes: changes.map(x => x.relative), backup };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args[0]) { console.error('用法：node tools/install.cjs "/path/to/vault" [--dry-run]'); process.exitCode = 1; }
  else {
    try { console.log(JSON.stringify(install(args[0], { dryRun: args.includes('--dry-run') }), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
module.exports = { planInstall, install };
