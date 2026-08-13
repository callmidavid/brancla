# Contributing to Brancla

Thanks for helping out! Whether it's a bug report, a new feature, or a docs fix — every contribution matters.

## Getting Started

1. **Fork** the repo on GitHub.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/your-username/brancla.git
   cd brancla
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/callmidavid/brancla.git
   ```
4. Create a branch for your work:
   ```bash
   git checkout -b feat/your-feature
   ```

## Development Environment

### Go core (CLI + daemon)

Requires [Go 1.21+](https://go.dev/dl/).

```bash
go build ./...
go run ./core/cmd/brancla --help
```

### VS Code extension

```bash
cd vscode
npm install
npm run compile
code .
```

Press `F5` to launch the Extension Development Host. Start the daemon with `go run ./core/cmd/brancla server` in another terminal, then open a git repo as the workspace to test the sidebar.

## Code Conventions

- **Go**: run `go fmt ./...` and `go vet ./...` before committing. Follow standard Go naming and keep packages focused (`core/internal/...`, `core/providers/...`).
- **TypeScript**: keep the strict TS config (`strict: true`). Follow the existing style in `vscode/src/`.
- Don't add comments unless the code genuinely needs explaining; prefer clear names.
- Keep the gold-and-black UI theme and Lucide icons in the sidebar webview.

## What to Work On

- Open issues marked `good first issue`.
- Improve safety scoring / branch detection in `core/internal/safety/`.
- Add tests — the repo currently has none; adding tests for the scanner, safety engine, and database is high-value.
- Docs and examples are always appreciated.

## Committing

- Write clear, conventional commit messages (e.g. `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`).
- Keep changes focused — one logical change per commit.
- Never commit secrets, the compiled `brancla` binary, `node_modules/`, or `dist/` (they're gitignored).

## Opening a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature
   ```
2. Open a PR against `main` and fill in the template.
3. Reference any related issue (e.g. `Closes #12`).
4. Expect a review — be open to feedback; we'll work through it together.

## License

By contributing you agree your work is licensed under the same [MIT](LICENSE) license as the project.
