# Claude Code conversation history inside the project folder

**For:** a Claude Code session in any project that should keep its conversations inside the project folder, so the full history can be resumed on another computer.

## What it does

By default Claude Code saves a project's conversations only on the current computer, under `~/.claude/projects/<project-path-with-dashes>/`. That folder holds:
- the transcripts (`<session-id>.jsonl`);
- subagent and tool results (`<session-id>/`);
- the project's auto-memory (`memory/`).

This setup mirrors that folder into `<project>/.claude-history` in both directions, using three hooks:

| Hook | Direction | Purpose |
|---|---|---|
| `SessionStart` | `.claude-history` → this computer | When Claude Code opens the project, any newer history (for example from another laptop) is restored. |
| `Stop` (async) | this computer → `.claude-history` | After every reply, new conversation is copied. Usually takes under 0.3 s. |
| `SessionEnd` | this computer → `.claude-history` | One last copy when the session closes. |

**Sync rules**
- Only new or changed files are copied. A transcript is append-only, so only its new bytes are appended.
- The newer copy always wins, and nothing is ever deleted.
- If two copies of the same transcript have diverged, the one being replaced is kept as `<name>.jsonl.<time>.bak`.

**Using it across computers**
- If the project lives on a portable drive, plug the drive into the other laptop and open the project in Claude Code. The whole conversation then shows in **Past Conversations** (`/resume`).
- If the project does not live on a portable drive, copy the `.claude-history` folder into the project on the other computer. The `SessionStart` hook restores it on the next start.

## Set it up (instructions for the AI)

Do these steps in the project root.

### 1. Add the script

Download the script to `.claude/hooks/sync-history.cjs`:
<https://raw.githubusercontent.com/aqilrvsb/peningorder/main/.claude/hooks/sync-history.cjs>

- Keep the `.cjs` extension. It makes the script run as CommonJS even when `package.json` has `"type": "module"`.
- The script has no project-specific values. It finds the paths through `CLAUDE_PROJECT_DIR` and the hook input.

### 2. Add the hooks

Merge these hooks into `.claude/settings.json`.
- Read the file first. Keep every existing setting and hook, and append to existing hook arrays rather than replacing them.
- The command works in both Git Bash and PowerShell.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node -e \"require(process.env.CLAUDE_PROJECT_DIR + '/.claude/hooks/sync-history.cjs')\"", "timeout": 300, "statusMessage": "Restoring conversation history from .claude-history" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node -e \"require(process.env.CLAUDE_PROJECT_DIR + '/.claude/hooks/sync-history.cjs')\"", "async": true, "timeout": 300 } ] }
    ],
    "SessionEnd": [
      { "hooks": [ { "type": "command", "command": "node -e \"require(process.env.CLAUDE_PROJECT_DIR + '/.claude/hooks/sync-history.cjs')\"", "timeout": 120 } ] }
    ]
  }
}
```

### 3. Keep the history out of git

Add the following to `.gitignore` **before** the first copy exists:

```
# Claude Code conversation history copy (private: customer data, keys). Never commit.
.claude-history/
```

Check it with `git check-ignore -v .claude-history/x`. Transcripts contain everything said in the chat, including pasted passwords and API keys, so they must never be pushed. This matters most when the repo is public.

### 4. Make the first copy and check it

```
node .claude/hooks/sync-history.cjs
```

The script prints `Synced … : N copied …`. The `.jsonl` in `.claude-history` must then be the same size as the one in `~/.claude/projects/<project>/`.

Run the command a second time. It should report `unchanged`, or `appended` for the transcript that is currently being written.

### 5. Keep transcripts long-term

Claude Code deletes transcripts after 30 days by default. In `~/.claude/settings.json`, set `"cleanupPeriodDays": 3650`, merging it with the existing settings.

### 6. Commit and tell the user

Commit `.claude/hooks/sync-history.cjs`, `.claude/settings.json` and `.gitignore`. Never commit `.claude-history`.

The new hooks start running from the next reply. If they don't, the user opens `/hooks` once or restarts Claude Code.

## Requirements

- **Node.js** must be on `PATH` on every computer that uses the project.
- A computer that opens the project for the first time must **trust** the folder; Claude Code asks once. Project hooks don't run until then.
- On another computer, keep the project at the same path if possible (for example the same drive letter). The history folder name comes from the project path. The script works it out on each computer, so a different path still restores, but into a differently named folder.

## Manual commands

```
node .claude/hooks/sync-history.cjs            # this computer → .claude-history
node .claude/hooks/sync-history.cjs --restore  # .claude-history → this computer
```

## Prompt to paste into another project's Claude Code

> Read https://raw.githubusercontent.com/aqilrvsb/peningorder/main/docs/CLAUDE_HISTORY_SYNC.md and set up conversation history sync in this project exactly as it describes (script, hooks merged into .claude/settings.json, .gitignore first, first copy, check, cleanupPeriodDays). Then confirm the .jsonl sizes match.
