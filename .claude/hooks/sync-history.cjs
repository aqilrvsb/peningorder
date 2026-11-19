// Keeps a copy of this project's Claude Code conversation history inside the project folder.
//
// Claude Code saves conversations under ~/.claude/projects/<project-folder-name>/ (transcripts,
// tool results, memory). This script copies that folder into <project>/.claude-history so the
// history sits next to the code and can be carried to another computer.
//
//   Sync (runs automatically as a Stop hook, see .claude/settings.json):
//     node .claude/hooks/sync-history.cjs
//   Restore on another computer (after copying the .claude-history folder into the project):
//     node .claude/hooks/sync-history.cjs --restore
//   then open the project in Claude Code and pick the conversation from /resume (or Past Conversations).
//
// Only new or changed files are copied, transcripts (.jsonl, append-only) by appending the new part.
// Nothing is ever deleted on the receiving side, and restore never overwrites a newer local file.
// .claude-history holds private data (customer details, pasted keys): it is in .gitignore and must
// never be committed — this repo is public.
const fs = require('fs');
const path = require('path');
const os = require('os');

const restore = process.argv.includes('--restore');

function readHookInput() {
  if (restore || process.stdin.isTTY) return {};
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

const input = readHookInput();
const projectDir = restore
  ? path.resolve(__dirname, '..', '..')
  : process.env.CLAUDE_PROJECT_DIR || input.cwd || path.resolve(__dirname, '..', '..');
const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
// Claude Code names the folder after the project path with every non-alphanumeric character as '-'.
const encoded = projectDir.replace(/[^a-zA-Z0-9]/g, '-');
let historyDir = path.join(projectsRoot, encoded);
if (!restore && input.transcript_path && path.dirname(path.dirname(input.transcript_path)) === projectsRoot) {
  historyDir = path.dirname(input.transcript_path);
}
const backupDir = path.join(projectDir, '.claude-history');
const [src, dst] = restore ? [backupDir, historyDir] : [historyDir, backupDir];

const CHUNK = 8 * 1024 * 1024;
const TAIL = 64 * 1024;

function readRange(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const n = fs.readSync(fd, buf, 0, length, start);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

// The destination is an older copy of the same append-only file when its last bytes match.
function isPrefix(s, d, dSize) {
  const len = Math.min(TAIL, dSize);
  return readRange(s, dSize - len, len).equals(readRange(d, dSize - len, len));
}

function appendRange(s, d, from, to) {
  const fdIn = fs.openSync(s, 'r');
  const fdOut = fs.openSync(d, 'a');
  try {
    const buf = Buffer.alloc(CHUNK);
    for (let pos = from; pos < to;) {
      const n = fs.readSync(fdIn, buf, 0, Math.min(CHUNK, to - pos), pos);
      if (n <= 0) break;
      fs.writeSync(fdOut, buf, 0, n);
      pos += n;
    }
  } finally { fs.closeSync(fdIn); fs.closeSync(fdOut); }
}

const stats = { copied: 0, appended: 0, skipped: 0 };

function syncFile(s, d) {
  const ss = fs.statSync(s);
  let ds = null;
  try { ds = fs.statSync(d); } catch { /* not there yet */ }
  if (ds && ds.size === ss.size && Math.abs(ds.mtimeMs - ss.mtimeMs) < 2000) { stats.skipped++; return; }
  if (restore && ds && ds.mtimeMs > ss.mtimeMs) { stats.skipped++; return; } // local copy is newer
  fs.mkdirSync(path.dirname(d), { recursive: true });
  if (ds && d.endsWith('.jsonl') && ds.size > 0 && ds.size < ss.size && isPrefix(s, d, ds.size)) {
    appendRange(s, d, ds.size, ss.size);
    stats.appended++;
  } else {
    fs.copyFileSync(s, d);
    stats.copied++;
  }
  fs.utimesSync(d, ss.atime, ss.mtime);
}

function walk(dirS, dirD) {
  for (const e of fs.readdirSync(dirS, { withFileTypes: true })) {
    const s = path.join(dirS, e.name);
    const d = path.join(dirD, e.name);
    if (e.isDirectory()) walk(s, d);
    else if (e.isFile()) {
      try { syncFile(s, d); } catch (err) { process.stderr.write(`sync-history: ${s}: ${err.message}\n`); }
    }
  }
}

try {
  if (!fs.existsSync(src)) {
    if (restore) console.error(`Nothing to restore: ${src} not found. Copy the .claude-history folder into the project first.`);
    process.exit(0);
  }
  walk(src, dst);
  if (restore || process.stdin.isTTY) {
    console.log(`${restore ? 'Restored' : 'Synced'} ${src} -> ${dst}: ${stats.copied} copied, ${stats.appended} appended, ${stats.skipped} unchanged.`);
  }
} catch (err) {
  process.stderr.write(`sync-history: ${err.message}\n`);
}
process.exit(0);
