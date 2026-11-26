// Token Launch Radar entrypoint (Node 22+, standard library only, zero network).
// Reads /input/snapshot.json (or --input <file|dir>), computes implied pre-token valuations
// and costed farming playbooks via lib/model.ts, writes board.json, data.js, dashboard/,
// screenshots/, and sealed dossier.json to /output (or MAKEFUN_OUTPUT_DIR / --output).

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const VALID_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function cliArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${flag}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const prefix = `--${flag}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit === undefined ? fallback : hit.slice(prefix.length);
}

function copyDirectoryFiles(srcDir: string, dstDir: string): string[] {
  if (!existsSync(srcDir)) return [];
  mkdirSync(dstDir, { recursive: true });
  const names = readdirSync(srcDir).sort();
  const copied: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = join(srcDir, name);
    if (!statSync(full).isFile()) continue;
    copyFileSync(full, join(dstDir, name));
    copied.push(name);
  }
  return copied;
}

const inputSpec = cliArg('input', '/input');
const snapshotPath = inputSpec.endsWith('.json') ? inputSpec : join(inputSpec, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(`token-launch-radar: snapshot not found at ${snapshotPath}\n`);
  process.exit(2);
}

const outputDir = cliArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const gateErr = boardIssue(board, snapshot);
if (gateErr !== null) {
  process.stderr.write(`token-launch-radar: board failed gate validation: ${gateErr}\n`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputDir, 'data.js'), dataScript(radar));

const prepareOnly = process.argv.includes('--prepare');
const dashFiles = copyDirectoryFiles(join(ROOT_DIR, 'dashboard'), join(outputDir, 'dashboard'));
const shotFiles = copyDirectoryFiles(join(ROOT_DIR, 'screenshots'), join(outputDir, 'screenshots'));

if (prepareOnly) {
  process.stdout.write(`token-launch-radar: prepared ${board.length} rows + ${dashFiles.length} dashboard files in ${outputDir}\n`);
  process.exit(0);
}

if (shotFiles.length < 3) {
  process.stderr.write(`token-launch-radar: expected 3-4 screenshots, found ${shotFiles.length}\n`);
  process.exit(1);
}
for (const shot of shotFiles) {
  if (!VALID_IMAGE_NAME.test(shot)) {
    process.stderr.write(`token-launch-radar: invalid screenshot filename: ${shot}\n`);
    process.exit(1);
  }
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

process.stdout.write(
  `token-launch-radar: scored ${board.length} pre-token protocols (${radar.watchlist_covered}/${radar.watchlist_count} watchlist, ${radar.early_size} emerging, ${radar.live_size} tokenized peers excluded)\n` +
    `token-launch-radar: wrote board.json, data.js, ${dashFiles.length} dashboard files, ${shotFiles.length} screenshots, dossier.json (${dossier.length} bytes)\n`,
);
