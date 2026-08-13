# Brancla — Dead Branch Sweeper

Sync your local git repository with GitHub/GitLab to safely sweep dead remote branches — without ever losing unmerged work.

![VS Code](https://img.shields.io/badge/VS%20Code-1.75+-0078d7?logo=visualstudiocode&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-gold)

## Features

- **Dead branch detection** — queries the GitHub/GitLab API for PR/MR status, detects squashed merges, and scores every branch 0–100%.
- **Safe cleanup** — only branches confirmed safe to delete are cleaned, and every deletion creates a git safety ref (`refs/brancla/backups/...`) so it's 100% reversible.
- **One-click restore** — bring back any deleted branch from the sidebar.
- **Live dashboard** — see Safe / Warning / Protected branches at a glance, with safety-score bars and reasons.

## Requirements

- **VS Code** `^1.75.0` or newer.
- **No Go install required** for normal extension use. Run **Brancla: Install or Repair CLI** from the Command Palette once; the extension copies its bundled CLI into `~/.brancla/bin` and uses that location automatically from any `.py`, `.js`, `.ts`, Go, Rust, Java, C/C++, C#, PHP, Ruby, shell, HTML/CSS, JSON, or YAML project.

  The extension auto-starts the local daemon on activation. If `~/.brancla/bin` is on your shell `PATH`, you can also start it manually:

  ```bash
  brancla server
  ```

  Building the CLI from source is only needed for development.

## Usage

1. Open a git repository as your workspace folder.
2. Click the **Brancla** icon in the Activity Bar (left side).
3. Press **Sync & Scan** to fetch branch statuses.
4. Review the **Safe to Clean** list, then press **Clean Safe**.
5. Need a branch back? Hit the **Restore** link on any deleted branch.

### Commands

| Command | Description |
| --- | --- |
| `Brancla: Scan Workspace for Dead Branches` | Scan repo & sync remote PR statuses |
| `Brancla: Clean Dead Branches Safely` | Delete safe dead branches with backup refs |
| `Brancla: Restore Deleted Branch` | Restore a branch from local backup ref |
| `Brancla: Install or Repair CLI` | Install the bundled CLI globally to `~/.brancla/bin` |

## How safe is it?

| Status | Score | What it means |
| --- | --- | --- |
| SAFE_TO_DELETE | 100% | PR merged, remote branch deleted |
| SAFE_SQUASH_MERGED | 95% | Commits squashed & merged |
| WARNING_CLOSED_PR | 60% | PR closed unmerged, remote branch gone |
| WARNING_UNMERGED | 35% | Dead on remote but has unpushed commits |
| PROTECTED | 0% | `main`/`master`/`dev`/`staging`/`release/*` |
| CURRENT | 0% | Currently checked out |

Protected and current branches can never be deleted. Warnings are never auto-cleaned.

## Support

- Bugs & feature requests: [GitHub Issues](https://github.com/callmidavid/brancla/issues)
- Source: [github.com/callmidavid/brancla](https://github.com/callmidavid/brancla)

## License

[MIT](https://github.com/callmidavid/brancla/blob/main/LICENSE)
