import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const builderPath = path.join(projectRoot, 'scripts', 'build-code-injection.mjs');

test('builds a complete HTML script block from a JavaScript source file', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'site-styles-injection-'));
  const sourcePath = path.join(fixtureRoot, 'source.js');
  const outputPath = path.join(fixtureRoot, 'output.html');

  try {
    writeFileSync(sourcePath, "window.siteStylesSearchReady = true;\n");

    const result = spawnSync(process.execPath, [builderPath, sourcePath, outputPath], {
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(outputPath, 'utf8'),
      '<script>\nwindow.siteStylesSearchReady = true;\n</script>\n',
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('check mode rejects a stale Code Injection file', () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'site-styles-injection-'));
  const sourcePath = path.join(fixtureRoot, 'source.js');
  const outputPath = path.join(fixtureRoot, 'output.html');

  try {
    writeFileSync(sourcePath, "window.siteStylesSearchReady = true;\n");
    writeFileSync(outputPath, '<script>\nwindow.stale = true;\n</script>\n');

    const result = spawnSync(
      process.execPath,
      [builderPath, '--check', sourcePath, outputPath],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Code Injection HTML is out of date/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
