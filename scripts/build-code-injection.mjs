import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const checkOnly = args[0] === '--check';
if (checkOnly) args.shift();

const sourcePath = path.resolve(args[0] || 'site-styles-search.js');
const outputPath = path.resolve(args[1] || 'site-styles-search.html');
const source = readFileSync(sourcePath, 'utf8').trimEnd();
const expected = `<script>\n${source}\n</script>\n`;

if (checkOnly) {
  const actual = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
  if (actual !== expected) {
    process.stderr.write('Code Injection HTML is out of date. Run npm run build:code-injection.\n');
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, expected);
}
