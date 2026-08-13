import * as vscode from "vscode";
import * as http from "http";
import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BranclaSidebarProvider } from "./sidebarView";

const DEFAULT_URL = "http://127.0.0.1:47382";
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

// Ensure the Brancla daemon is running, starting it if necessary.
async function ensureDaemon(): Promise<string> {
  const infoUrl = readServerInfo();
  for (const candidate of [infoUrl, DEFAULT_URL]) {
    if (candidate && (await isReachable(candidate))) {
      return candidate;
    }
  }

  // Not running — spawn it in the background.
  const child: ChildProcess = spawn("brancla", ["server"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Wait up to ~5s for it to come up.
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    for (const candidate of [infoUrl, DEFAULT_URL]) {
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

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BranclaSidebarProvider.viewType,
      provider,
    ),
  );

  // Start or attach to the daemon, then push its real status to the sidebar.
  function refreshDaemonStatus() {
    ensureDaemon()
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
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage("No workspace folder open.");
        return;
      }

      const repoPath = workspaceFolders[0].uri.fsPath;
      try {
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
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
      }
      const repoPath = workspaceFolders[0].uri.fsPath;

      try {
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
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) return;
      const repoPath = workspaceFolders[0].uri.fsPath;

      if (!branchName) {
        branchName = await vscode.window.showInputBox({
          prompt: "Enter deleted branch name to restore from local backup ref:",
        });
      }

      if (!branchName) return;

      try {
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

  context.subscriptions.push(scanCmd, cleanCmd, restoreCmd);

  // Initial Scan on Activation (once the daemon is confirmed up).
  ensureDaemon().then(() => {
    vscode.commands.executeCommand("brancla.scanWorkspace");
  });
}

export function deactivate() {}

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
            resolve(JSON.parse(responseBody));
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
            resolve(JSON.parse(responseBody));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}
