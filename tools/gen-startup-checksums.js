#!/usr/bin/env node

/*
 * Regenerates services/startup-checksums.json: the SHA-256 of every version of
 * services/startup.sh that has ever been committed to this repository.
 *
 * The service uses this list to decide whether a startup script found on the
 * TV is one of ours (safe to overwrite with the bundled one) or has been
 * modified by the user (warn instead).
 *
 * Usage: npm run startup-checksums   (or: node tools/gen-startup-checksums.js [--check])
 *
 * --check exits non-zero if the committed file is out of date (used in CI).
 * Requires full git history (not a shallow clone).
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const scriptPath = 'services/startup.sh';
const outputPath = path.join(root, 'services', 'startup-checksums.json');

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

const isShallow = fs.existsSync(path.join(git('rev-parse', '--git-dir').trim(), 'shallow'));
if (isShallow) {
  console.error('[!] This is a shallow clone; the generated list would be incomplete. Run `git fetch --unshallow` first.');
  process.exit(2);
}

// Oldest first, so the output is stable and append-only.
const log = git('log', '--reverse', '--format=%H%x00%as%x00%s', '--', scriptPath)
  .split('\n')
  .filter((line) => line.length)
  .map((line) => {
    const [commit, date, subject] = line.split('\0');
    return { commit, date, subject };
  });

const seen = new Set();
const entries = [];
for (const { commit, date, subject } of log) {
  let contents;
  try {
    contents = execFileSync('git', ['show', `${commit}:${scriptPath}`], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    // File did not exist at this commit (e.g. deleted).
    continue;
  }
  const hash = sha256(contents);
  if (seen.has(hash)) continue;
  seen.add(hash);
  entries.push({ sha256: hash, commit: commit.slice(0, 12), date, subject });
}

// Keep entries that were added by hand (e.g. variants shipped by an installer
// rather than this repo) when regenerating.
let manual = [];
if (fs.existsSync(outputPath)) {
  try {
    manual = JSON.parse(fs.readFileSync(outputPath, 'utf8')).filter((e) => e.manual === true && !seen.has(e.sha256));
  } catch (err) {
    console.warn(`[!] Could not parse existing ${outputPath}: ${err.message}`);
  }
}

// 4-space indent to match .editorconfig / prettier for JSON files in this repo.
const output = `${JSON.stringify([...entries, ...manual], null, 4)}\n`;

if (process.argv.includes('--check')) {
  // Compare content, not bytes, so a formatter touching the file is not a failure.
  let current = null;
  try {
    current = JSON.stringify(JSON.parse(fs.readFileSync(outputPath, 'utf8')));
  } catch {
    // missing or unparsable -> out of date
  }
  if (current !== JSON.stringify([...entries, ...manual])) {
    console.error(`[!] ${path.relative(root, outputPath)} is out of date. Run: npm run startup-checksums`);
    process.exit(1);
  }
  console.info(`[ ] ${path.relative(root, outputPath)} is up to date (${entries.length + manual.length} entries)`);
} else {
  fs.writeFileSync(outputPath, output);
  console.info(`[ ] Wrote ${path.relative(root, outputPath)} (${entries.length} from history, ${manual.length} manual)`);
}
