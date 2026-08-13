# Brancla: Git Dead Branch Sweeper

> **Sync local database with GitHub/GitLab to safely sweep dead remote branches without losing unmerged work.**

---

## The Pain

Remote Git branches get deleted automatically when Pull Requests / Merge Requests are merged on GitHub or GitLab. But on developer local machines, hundreds of dead tracking and local topic branches accumulate.

Deleting them manually using `git branch -d` or `git branch -D` is stressful:

- Standard `git branch -d` rejects deletion if PRs were squashed or rebased.
- `git branch -D` force-deletes, risking total loss of unmerged commits, un-pushed code, or active work.

## The Solution: Brancla

**Brancla** tracks repository branches in a local SQLite database, queries GitHub / GitLab APIs for PR/MR status, checks remote branch existence, detects squashed merges, and assigns a safety score (0-100%) to every branch.

Before deleting any branch, Brancla automatically creates a **git safety ref** (`refs/brancla/backups/...`), making every deletion **100% reversible** with 1-click restore!

---

## Two Formats

### 1. Interactive CLI Tool (`brancla`)

Native terminal application built in Go using Cobra & Bubbletea TUI.

- **Commands**:
  - `brancla scan [path]` — Scan repo & sync remote PR statuses
  - `brancla list [path]` — View branch safety scores & reasons
  - `brancla clean [path] [-i]` — Interactive TUI branch selector with checkboxes
  - `brancla clean --safe-only` — Auto-delete 100% safe dead branches
  - `brancla restore <branch>` — Restore deleted branch from local backup ref
  - `brancla server` — Start REST API daemon for Desktop & VS Code extension

### 2. Standalone VS Code Extension Sidebar (`vscode/`)

Dedicated VS Code Sidebar view integrated into the Activity Bar.

- **Features**: Workspace branch tree view, 1-click "Clean Dead Branches", automatic background sync with local Brancla daemon.
- **Commands**:
  - `Brancla: Scan Workspace for Dead Branches`
  - `Brancla: Clean Dead Branches Safely`
  - `Brancla: Restore Deleted Branch`

---

## Safety Engine Rules

| Status               | Score | Description                                               | Action                    |
| :------------------- | :---- | :-------------------------------------------------------- | :------------------------ |
| `SAFE_TO_DELETE`     | 100%  | PR Merged on GitHub/GitLab & Remote branch deleted        | Auto-selected for cleanup |
| `SAFE_SQUASH_MERGED` | 95%   | Commits squashed & merged into default branch             | Auto-selected for cleanup |
| `WARNING_CLOSED_PR`  | 60%   | PR closed without merge; remote branch deleted            | Warning flag              |
| `WARNING_UNMERGED`   | 35%   | Dead on remote, but has unpushed local commit(s)          | Warning flag              |
| `PROTECTED`          | 0%    | Branch is `main`, `master`, `dev`, `staging`, `release/*` | Protected (Cannot delete) |
| `CURRENT`            | 0%    | Currently checked out branch                              | Protected (Cannot delete) |

---

## Repository Architecture

```
brancla/
├── core/                   # Go Core Engine & Daemon Server
│   ├── cmd/brancla/        # CLI Entry Point & Bubbletea TUI
│   ├── git/                # Git Scanner & Ref Backup/Restore Helper
│   ├── internal/database/  # SQLite DB Layer (~/.brancla/brancla.db)
│   ├── internal/safety/    # Safety Assessment Rules & Scoring
│   ├── providers/          # GitHub & GitLab REST API Providers
│   └── server/             # Local Daemon REST API (http://127.0.0.1:47382)
└── vscode/                 # Standalone VS Code Extension Sidebar
```

---

## License

MIT
