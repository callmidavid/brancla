import * as vscode from "vscode";
import * as http from "http";
import * as https from "https";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BranclaSidebarProvider } from "./sidebarView";

const DEFAULT_URL = "http://127.0.0.1:47382";
const CLI_NAME = process.platform === "win32" ? "brancla.exe" : "brancla";
const RELEASE_BASE_URL = "https://github.com/callmidavid/brancla/releases";
let baseUrl = DEFAULT_URL;

function readServerInfo(): string | null {
  try {
    const info = JSON.parse(
      fs.readFileSync(
        path.join(os.homedir(), ".brancla", "server.json"),
        "utf8",
      ),
    );
    return info && info.url ? String(info.url) : null;
  } catch {
    return null;
  }
}

function isReachable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url + "/api/status", (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getPathEntries(): string[] {
  return (process.env.PATH || "")
    .split(path.delimiter)
    .filter((entry) => entry.length > 0);
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getBundledSourceRoot(extensionRoot: string): string | null {
  const candidates = [
    path.resolve(extensionRoot, ".."),
    path.resolve(extensionRoot, "..", ".."),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "go.mod")) &&
      fs.existsSync(path.join(candidate, "core", "cmd", "brancla", "main.go"))
    ) {
      return candidate;
    }
  }

  return null;
}

function getPlatformKey(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `${process.platform}-${arch}`;
}

function getBundledBinaryPath(extensionRoot: string): string | null {
  const binaryPath = path.join(
    extensionRoot,
    "bin",
    getPlatformKey(),
    CLI_NAME,
  );
  return fs.existsSync(binaryPath) ? binaryPath : null;
}

function getReleaseAssetName(): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return `brancla-${getPlatformKey()}${suffix}`;
}

function findBranclaBinary(extensionRoot: string): string | null {
  const home = os.homedir();
  const bundledBinary = getBundledBinaryPath(extensionRoot);
  const candidates = [
    ...getPathEntries().map((entry) => path.join(entry, CLI_NAME)),
    path.join(home, ".brancla", "bin", CLI_NAME),
    path.join(home, "go", "bin", CLI_NAME),
    ...(bundledBinary ? [bundledBinary] : []),
  ];

  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function downloadFile(
  url: string,
  destination: string,
  redirects = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location) {
        response.resume();
        if (redirects > 5) {
          reject(new Error("Too many redirects while downloading Brancla CLI"));
          return;
        }
        downloadFile(
          new URL(location, url).toString(),
          destination,
          redirects + 1,
        )
          .then(resolve)
          .catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`download failed with HTTP ${statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination, { mode: 0o755 });
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    });

    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error("Timed out downloading Brancla CLI"));
    });
  });
}

function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      shell: process.platform === "win32",
      stdio: "ignore",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

async function installBranclaCli(extensionRoot: string): Promise<string> {
  const binDir = path.join(os.homedir(), ".brancla", "bin");
  const binaryPath = path.join(binDir, CLI_NAME);
  fs.mkdirSync(binDir, { recursive: true });

  const bundledBinary = getBundledBinaryPath(extensionRoot);
  if (bundledBinary) {
    fs.copyFileSync(bundledBinary, binaryPath);
    if (process.platform !== "win32") {
      fs.chmodSync(binaryPath, 0o755);
    }
    return binaryPath;
  }

  const downloadUrl = `${RELEASE_BASE_URL}/latest/download/${getReleaseAssetName()}`;
  const tempPath = `${binaryPath}.download`;
  try {
    await downloadFile(downloadUrl, tempPath);
    fs.renameSync(tempPath, binaryPath);
    if (process.platform !== "win32") {
      fs.chmodSync(binaryPath, 0o755);
    }
    return binaryPath;
  } catch (err) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup errors
    }
    console.log("[Brancla] release binary download failed:", err);
  }

  const sourceRoot = getBundledSourceRoot(extensionRoot);
  if (sourceRoot) {
    await runProcess("go", ["build", "-o", binaryPath, "./core/cmd/brancla"], {
      cwd: sourceRoot,
    });
    return binaryPath;
  }

  throw new Error(
    `No Brancla CLI binary found for ${getPlatformKey()}. Install from a GitHub release or build from source.`,
  );
}

// Ensure the Brancla daemon is running, starting it if necessary.
async function ensureDaemon(extensionRoot: string): Promise<string> {
  for (const candidate of [readServerInfo(), DEFAULT_URL]) {
    if (candidate && (await isReachable(candidate))) {
      return candidate;
    }
  }

  const cliPath = findBranclaBinary(extensionRoot);
  if (!cliPath) {
    throw new Error(
      "Brancla CLI is not installed. Run 'Brancla: Install or Repair CLI' from the Command Palette.",
    );
  }

  // Not running, so spawn it in the background.
  const child: ChildProcess = spawn(cliPath, ["server"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Wait up to ~5s for it to come up.
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    for (const candidate of [readServerInfo(), DEFAULT_URL]) {
      if (candidate && (await isReachable(candidate))) {
        return candidate;
      }
    }
  }
  throw new Error("Timed out waiting for Brancla daemon to start");
}

export function activate(context: vscode.ExtensionContext) {
  console.log("[Brancla] extension 1.0.2 activate: checking daemon status");
  const provider = new BranclaSidebarProvider(context.extensionUri);
  const extensionRoot = context.extensionUri.fsPath;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BranclaSidebarProvider.viewType,
      provider,
    ),
  );

  // Start or attach to the daemon, then push its real status to the sidebar.
  function refreshDaemonStatus() {
    ensureDaemon(extensionRoot)
      .then((url) => {
        baseUrl = url;
        console.log("[Brancla] daemon online at", url);
        provider.postDaemonStatus(true);
      })
      .catch((err) => {
        console.log("[Brancla] daemon offline:", err?.message);
        provider.postDaemonStatus(false);
      });
  }

  // Poll daemon health so the status pill stays accurate and the daemon is
  // (re)started automatically if it ever goes down.
  const statusTimer = setInterval(refreshDaemonStatus, 10000);
  context.subscriptions.push(
    new vscode.Disposable(() => clearInterval(statusTimer)),
  );

  // Kick off the first check immediately.
  refreshDaemonStatus();

  // Command: Scan Workspace
  const scanCmd = vscode.commands.registerCommand(
    "brancla.scanWorkspace",
    async () => {
      const repoPath = await resolveRepositoryPath();
      if (!repoPath) {
        vscode.window.showWarningMessage(
          "Open a file or folder inside a git repository.",
        );
        return;
      }

      try {
        baseUrl = await ensureDaemon(extensionRoot);
        const data = await httpPost(`${baseUrl}/api/scan`, { path: repoPath });
        provider.updateBranchData(data);
        vscode.window.showInformationMessage(
          `Brancla: Scanned workspace. Found ${data.branches?.length || 0} branches.`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          "Brancla Daemon API not responding. Start daemon using: brancla server",
        );
        refreshDaemonStatus();
      }
    },
  );

  // Command: Clean Dead Branches
  const cleanCmd = vscode.commands.registerCommand(
    "brancla.cleanDeadBranches",
    async () => {
      const repoPath = await resolveRepositoryPath();
      if (!repoPath) {
        return;
      }

      try {
        baseUrl = await ensureDaemon(extensionRoot);
        const branchesData = await httpGet(
          `${baseUrl}/api/branches?repo=${encodeURIComponent(repoPath)}`,
        );
        const safeBranches = (branchesData.branches || [])
          .filter(
            (b: any) =>
              b.safetyStatus === "SAFE_TO_DELETE" ||
              b.safetyStatus === "SAFE_SQUASH_MERGED",
          )
          .map((b: any) => b.name);

        if (safeBranches.length === 0) {
          vscode.window.showInformationMessage(
            "No dead branches found! Repository is clean.",
          );
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Safely delete ${safeBranches.length} dead branch(es) with automatic local backup refs?`,
          "Delete Branches",
          "Cancel",
        );

        if (confirm === "Delete Branches") {
          const res = await httpPost(`${baseUrl}/api/delete`, {
            path: repoPath,
            branches: safeBranches,
          });
          vscode.window.showInformationMessage(
            `🧹 Successfully deleted ${res.deleted?.length || 0} branch(es) with backup refs!`,
          );
          vscode.commands.executeCommand("brancla.scanWorkspace");
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          "Failed to clean branches via Brancla daemon.",
        );
      }
    },
  );

  // Command: Restore Branch
  const restoreCmd = vscode.commands.registerCommand(
    "brancla.restoreBranch",
    async (branchName?: string) => {
      const repoPath = await resolveRepositoryPath();
      if (!repoPath) return;

      if (!branchName) {
        branchName = await vscode.window.showInputBox({
          prompt: "Enter deleted branch name to restore from local backup ref:",
        });
      }

      if (!branchName) return;

      try {
        baseUrl = await ensureDaemon(extensionRoot);
        await httpPost(`${baseUrl}/api/restore`, {
          path: repoPath,
          branch: branchName,
        });
        vscode.window.showInformationMessage(
          `🎉 Successfully restored branch '${branchName}'!`,
        );
        vscode.commands.executeCommand("brancla.scanWorkspace");
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to restore branch '${branchName}'`,
        );
      }
    },
  );

  const installCmd = vscode.commands.registerCommand(
    "brancla.installCli",
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing Brancla CLI globally",
          cancellable: false,
        },
        async () => {
          try {
            const binaryPath = await installBranclaCli(extensionRoot);
            vscode.window.showInformationMessage(
              `Brancla CLI installed at ${binaryPath}.`,
            );
            refreshDaemonStatus();
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Failed to install Brancla CLI: ${err?.message || err}`,
            );
          }
        },
      );
    },
  );

  context.subscriptions.push(scanCmd, cleanCmd, restoreCmd, installCmd);

  // Initial Scan on Activation (once the daemon is confirmed up).
  ensureDaemon(extensionRoot)
    .then((url) => {
      baseUrl = url;
      vscode.commands.executeCommand("brancla.scanWorkspace");
    })
    .catch(() => undefined);
}

export function deactivate() {}

async function resolveRepositoryPath(): Promise<string | null> {
  const activeFile = vscode.window.activeTextEditor?.document.uri;
  if (activeFile?.scheme === "file") {
    const activeDir = path.dirname(activeFile.fsPath);
    const repoRoot = await gitTopLevel(activeDir);
    if (repoRoot) {
      return repoRoot;
    }
  }

  const workspaceFolders = vscode.workspace.workspaceFolders || [];
  for (const folder of workspaceFolders) {
    const repoRoot = await gitTopLevel(folder.uri.fsPath);
    if (repoRoot) {
      return repoRoot;
    }
  }

  return workspaceFolders[0]?.uri.fsPath || null;
}

function gitTopLevel(folderPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(
      "git",
      ["-C", folderPath, "rev-parse", "--show-toplevel"],
      {
        shell: process.platform === "win32",
      },
    );
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", () => resolve(null));
    child.on("exit", (code) => {
      resolve(code === 0 ? output.trim() : null);
    });
  });
}

function httpPost(urlStr: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      urlStr,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
              return;
            }
            resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpGet(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get(urlStr, (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
              return;
            }
            resolve(parsed);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}
