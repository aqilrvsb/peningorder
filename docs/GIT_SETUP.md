# Git setup: a project that works plug-and-play on any laptop

**For:** a Claude Code session in another project, setting up git so the project can be committed directly on its portable drive, pushed to GitHub, and used on any laptop just by plugging the drive in. This is the setup the peningorder repo uses.

**When it's done:**
- the project folder itself is the git repo, and commits go straight to the drive;
- secrets are never committed;
- on a new laptop, git works as soon as the project is opened, with no "dubious ownership" error and no wrong identity;
- the only thing left to do per laptop is a one-time GitHub sign-in on the first push.

## Ground rules for the AI

- Make each change in a separate step and show `git status` before every commit. Never run `git add -A` blind on a repo's first commit.
- **Never commit secrets.** That includes `.env*` files, keys, tokens, service-account JSON, `.claude-history/`, database dumps and customer exports. Check before the first push, because a pushed secret has to be treated as leaked even after you delete it.
- Make new GitHub repos **private** unless the user explicitly asks for a public one.
- Never force-push, rewrite published history, or skip hooks unless the user asks.
- Never store a GitHub token on the drive or in the repo. Credentials stay in each laptop's Git Credential Manager.

## 1. Check what exists

```
git rev-parse --is-inside-work-tree   # "true" = already a repo
git remote -v                         # is it connected to GitHub?
git status -sb
```

**If the output says `detected dubious ownership`:** the repo exists but was created on another laptop. Do step 6 first, or run the command git prints, then continue.

**If there's no repo yet:** run `git init -b main`.

## 2. `.gitignore` before the first commit

Make sure `.gitignore` contains at least the following, plus whatever the stack needs:

```
node_modules/
dist/
build/
.env
.env.*
!.env.example
*.log
.vercel/
.claude-history/
```

Then look for secrets that are tracked already or are about to be added:

```
git status --porcelain --untracked-files=all
git ls-files | grep -iE '\.env|secret|credential|service-account|\.pem$|\.key$|dump|backup'
git grep -nIE '(sk_live_|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|eyJhbGciOi|-----BEGIN [A-Z ]*PRIVATE KEY)' -- . ':!*.lock'
```

**If anything sensitive shows up:**
1. Add it to `.gitignore`.
2. If it's already tracked, run `git rm --cached <file>`.
3. Tell the user. If the file was ever pushed, the key must be rotated.

## 3. Identity and line endings inside the repo

Store these in the repo's own `.git/config`. That file lives on the drive, so every laptop commits with the same name and email and sees the same line endings.

```
git config --local user.name  "<github username>"
git config --local user.email "<github email>"
git config --local core.autocrlf true      # Windows: avoids "every file changed" on another laptop
```

Take the name and email from `git config --global user.name` and `git config --global user.email` on the laptop the user already works on, or ask the user.

## 4. Connect to GitHub

Create a **private** repository with no README; it must be empty.

**If `gh auth status` shows that `gh` is signed in:**

```
gh repo create <name> --private --source . --remote origin
```

**Otherwise:**
1. Ask the user to create the repo at https://github.com/new (Private, no README) and send the URL.
2. Run:
   ```
   git remote add origin https://github.com/<user>/<name>.git
   ```

If `origin` already exists, check it with `git remote -v` instead of adding it again.

## 5. First commit and push

```
git add -A
git status            # read it: nothing from step 2's danger list may be staged
git commit -m "Initial commit"
git push -u origin main
```

On a laptop that has never pushed before, Git Credential Manager opens the browser to sign in to GitHub once.

Afterwards, `git status -sb` must show `## main...origin/main` with nothing ahead or behind.

## 6. Plug-and-play on other laptops (portable NTFS drive)

**Why this is needed:**
- On a laptop whose Windows user didn't create the files, git refuses the repo with `detected dubious ownership`.
- The fix is that laptop's **global** `safe.directory` list. Git won't read that list from the repo, so it can't travel with the drive.
- The two pieces below add the entry automatically.

**a. Claude Code hook (automatic).**

Add <https://raw.githubusercontent.com/aqilrvsb/peningorder/main/.claude/hooks/laptop-setup.cjs> as `.claude/hooks/laptop-setup.cjs`.

Then merge this hook into `.claude/settings.json`. Read the file first, keep everything already in it, and append to an existing `SessionStart` array:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "node -e \"require(process.env.CLAUDE_PROJECT_DIR + '/.claude/hooks/laptop-setup.cjs')\"", "timeout": 60 } ] }
    ]
  }
}
```

What the hook does:
- When Claude Code opens the project, it runs git.
- If git complains about ownership, it adds the exact path git suggests to that laptop's global `safe.directory`.
- Otherwise it does nothing.
- If `git` isn't on `PATH`, it uses `<drive>\Software\Git\cmd\git.exe`.

**b. One-click fallback for a laptop without Git or Node.** Claude Code hooks need Node, so they can't run on such a laptop. Add two files:
- <https://raw.githubusercontent.com/aqilrvsb/peningorder/main/.claude/hooks/setup-laptop.ps1> as `.claude/hooks/setup-laptop.ps1`;
- <https://raw.githubusercontent.com/aqilrvsb/peningorder/main/SETUP-LAPTOP-BARU.cmd> as `SETUP-LAPTOP-BARU.cmd` in the project root.

When the user double-clicks the `.cmd` once on a new laptop, it:
- uses that laptop's Git and Node if they're installed;
- otherwise adds `<drive>\Software\Git\cmd` and `<drive>\Software\NODE JS` to the user `PATH`;
- trusts the folder in git;
- restores the Claude history, if `.claude/hooks/sync-history.cjs` is present.

If the drive keeps Git or Node somewhere else, adjust the two paths in `setup-laptop.ps1`.

**c. Optional: carry the conversation history too.** See [CLAUDE_HISTORY_SYNC.md](CLAUDE_HISTORY_SYNC.md).

Commit the new files: `.claude/hooks/*`, `.claude/settings.json` and `SETUP-LAPTOP-BARU.cmd`.

## 7. Verify

```
git status -sb                                   # clean, ## main...origin/main
git config --local --list | grep -E 'user\.|autocrlf'
git ls-remote origin -h refs/heads/main          # reaches GitHub
```

Simulate a new laptop without touching the real global config. This uses git's own test switch and a temporary HOME:

```
mkdir -p /tmp/newlaptop
HOME=/tmp/newlaptop USERPROFILE=/tmp/newlaptop GIT_TEST_ASSUME_DIFFERENT_OWNER=1 git status   # expect: dubious ownership
echo '{"hook_event_name":"SessionStart"}' | HOME=/tmp/newlaptop USERPROFILE=/tmp/newlaptop GIT_TEST_ASSUME_DIFFERENT_OWNER=1 CLAUDE_PROJECT_DIR="$PWD" node .claude/hooks/laptop-setup.cjs
HOME=/tmp/newlaptop USERPROFILE=/tmp/newlaptop GIT_TEST_ASSUME_DIFFERENT_OWNER=1 git status   # expect: works
rm -rf /tmp/newlaptop
```

## Using it on another laptop

1. Plug in the drive and open the project folder in VS Code with Claude Code.
2. Trust the folder when asked. Git then works.
3. If the laptop has no Git or Node, double-click `SETUP-LAPTOP-BARU.cmd` once.
4. On the first `git push`, sign in to GitHub in the browser once.

## Prompt to paste into another project's Claude Code

> Read https://raw.githubusercontent.com/aqilrvsb/peningorder/main/docs/GIT_SETUP.md and set up git in this project exactly as it describes: check what exists, .gitignore and a secret scan before the first commit, repo-local identity and autocrlf, a PRIVATE GitHub repo, first push, then the plug-and-play pieces (laptop-setup hook, setup-laptop.ps1 and SETUP-LAPTOP-BARU.cmd). Show me git status before each commit and run the verification at the end.
