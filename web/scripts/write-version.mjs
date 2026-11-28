// Writes /version.json next to the built app, from package.json's version, so
// anyone can check which version is deployed: GET /version.json.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const out = new URL('../dist/web/browser/version.json', import.meta.url);
writeFileSync(out, JSON.stringify({ version, builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`version.json: ${version}`);
