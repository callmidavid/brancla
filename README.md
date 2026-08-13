# Brancla: Git Dead Branch Sweeper

> **Sync local database with GitHub/GitLab to safely sweep dead remote branches without losing unmerged work.**

<p align="center">
  <img src="vscode/media/icon.png" alt="Brancla" width="96">
</p>

![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?logo=go&logoColor=white)
![VS Code](https://img.shields.io/badge/VS%20Code-Extension-0078d7?logo=visualstudiocode&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-gold)
![PRs](https://img.shields.io/badge/PRs-Welcome-brightgreen)

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

## Quick Start

### Install the CLI

Requires [Go 1.21+](https://go.dev/dl/).

```bash
# from anywhere
go install github.com/callmidavid/brancla/core/cmd/brancla@latest

# or build from source
git clone https://github.com/callmidavid/brancla.git
cd brancla
go build -o brancla ./core/cmd/brancla
./brancla --help
```

### Start the daemon

The VS Code extension needs the Brancla daemon running in the background. It auto-starts `brancla server` if it's on your `PATH`, or you can start it manually:

```bash
brancla server
# 🚀 Brancla Daemon REST API listening on http://127.0.0.1:47382
```

If a daemon is already running, `brancla server` detects it and reuses it instead of erroring.

---

## VS Code Extension

### Install from the Marketplace (once published)

Open VS Code → **Extensions** (`Ctrl+Shift+X`) → search for **"Brancla"** → **Install**. Or run the direct install URL:

```
vscode:extension/brancla.brancla-vscode
```

### Install from a `.vsix` file (manual / pre-release)

Grab `brancla-vscode-1.0.0.vsix` from the [GitHub Releases](https://github.com/callmidavid/brancla/releases) page, then:

1. Open VS Code → **Extensions** (`Ctrl+Shift+X`)
2. Click the `...` menu (top-right) → **Install from VSIX...**
3. Select the `.vsix` file.

### Run from source (development)

```bash
cd vscode
npm install
npm run compile
code .
```

Press `F5` in the `vscode/` window to launch the **Extension Development Host**. Open a git repo as the workspace and the "Brancla" icon appears in the Activity Bar. Make sure `brancla` is on your `PATH` (see Quick Start) or start the daemon manually.

### Build your own `.vsix`

```bash
cd vscode
npm install -g @vscode/vsce
vsce package          # produces brancla-vscode-1.0.0.vsix
vsce publish          # publish to the VS Code Marketplace
```

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
  - `brancla server` — Start REST API daemon for the VS Code extension

### 2. Standalone VS Code Extension Sidebar (`vscode/`)

Dedicated VS Code Sidebar view integrated into the Activity Bar.

- **Features**: Workspace branch tree view, 1-click "Clean Dead Branches", automatic background sync with local Brancla daemon.
- **Commands**:
  - `Brancla: Scan Workspace for Dead Branches`
  - `Brancla: Clean Dead Branches Safely`
  - `Brancla: Restore Deleted Branch`

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide — how to set up a dev environment, code conventions, and how to open a pull request.

- **Report bugs / request features** — open a [GitHub Issue](https://github.com/callmidavid/brancla/issues)
- **Questions** — start a discussion in the repo

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

MIT — see [LICENSE](LICENSE) for details.
