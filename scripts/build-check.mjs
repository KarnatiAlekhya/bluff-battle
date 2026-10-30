import { readFileSync, existsSync } from 'node:fs';
const required = ['src/index.html', 'src/app.js', 'src/styles.css', 'netlify/functions/game.ts', 'netlify.toml'];
for (const file of required) {
  if (!existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`Missing ${file}`);
}
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
if (!html.includes('/app.js') || !html.includes('/styles.css')) throw new Error('Frontend entrypoints missing');
console.log('Bluff Battle package structure check passed.');
