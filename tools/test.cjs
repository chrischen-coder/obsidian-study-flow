const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const legacy = fs.readdirSync('tests').filter(n => n.endsWith('.test.cjs')).map(n => `tests/${n}`);
const native = fs.existsSync('tests/plugin') ? fs.readdirSync('tests/plugin').filter(n => n.endsWith('.test.ts')).map(n => `tests/plugin/${n}`) : [];
for (const args of [['--test', ...legacy], ...(native.length ? [['--import', 'tsx', '--test', ...native]] : [])]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
