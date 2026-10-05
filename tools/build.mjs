import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('build/plugin', { recursive: true });
await build({
  entryPoints: ['src/main.ts'], bundle: true, format: 'cjs', platform: 'browser',
  target: 'es2022', external: ['obsidian', 'electron'], outfile: 'build/plugin/main.js',
  sourcemap: false, logLevel: 'info'
});
for (const file of ['manifest.json', 'styles.css', 'LICENSE']) await copyFile(file, `build/plugin/${file}`);
