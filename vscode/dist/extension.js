"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const http = require("http");
const sidebarView_1 = require("./sidebarView");
function activate(context) {
    const provider = new sidebarView_1.BranclaSidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarView_1.BranclaSidebarProvider.viewType, provider));
    // Command: Scan Workspace
    const scanCmd = vscode.commands.registerCommand('brancla.scanWorkspace', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder open.');
            return;
        }
        const repoPath = workspaceFolders[0].uri.fsPath;
        try {
            const data = await httpPost('http://127.0.0.1:47382/api/scan', { path: repoPath });
            provider.updateBranchData(data);
            vscode.window.showInformationMessage(`Brancla: Scanned workspace. Found ${data.branches?.length || 0} branches.`);
        }
        catch (err) {
            vscode.window.showErrorMessage('Brancla Daemon API not responding. Start daemon using: brancla server');
        }
    });
    // Command: Clean Dead Branches
    const cleanCmd = vscode.commands.registerCommand('brancla.cleanDeadBranches', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }
        const repoPath = workspaceFolders[0].uri.fsPath;
        try {
            const branchesData = await httpGet(`http://127.0.0.1:47382/api/branches?repo=${encodeURIComponent(repoPath)}`);
            const safeBranches = (branchesData.branches || [])
                .filter((b) => b.safetyStatus === 'SAFE_TO_DELETE' || b.safetyStatus === 'SAFE_SQUASH_MERGED')
                .map((b) => b.name);
            if (safeBranches.length === 0) {
                vscode.window.showInformationMessage('✨ No dead branches found! Repository is clean.');
                return;
            }
            const confirm = await vscode.window.showWarningMessage(`Safely delete ${safeBranches.length} dead branch(es) with automatic local backup refs?`, 'Delete Branches', 'Cancel');
            if (confirm === 'Delete Branches') {
                const res = await httpPost('http://127.0.0.1:47382/api/delete', { path: repoPath, branches: safeBranches });
                vscode.window.showInformationMessage(`🧹 Successfully deleted ${res.deleted?.length || 0} branch(es) with backup refs!`);
                vscode.commands.executeCommand('brancla.scanWorkspace');
            }
        }
        catch (err) {
            vscode.window.showErrorMessage('Failed to clean branches via Brancla daemon.');
        }
    });
    // Command: Restore Branch
    const restoreCmd = vscode.commands.registerCommand('brancla.restoreBranch', async (branchName) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0)
            return;
        const repoPath = workspaceFolders[0].uri.fsPath;
        if (!branchName) {
            branchName = await vscode.window.showInputBox({ prompt: 'Enter deleted branch name to restore from local backup ref:' });
        }
        if (!branchName)
            return;
        try {
            await httpPost('http://127.0.0.1:47382/api/restore', { path: repoPath, branch: branchName });
            vscode.window.showInformationMessage(`🎉 Successfully restored branch '${branchName}'!`);
            vscode.commands.executeCommand('brancla.scanWorkspace');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to restore branch '${branchName}'`);
        }
    });
    context.subscriptions.push(scanCmd, cleanCmd, restoreCmd);
    // Initial Scan on Activation
    setTimeout(() => {
        vscode.commands.executeCommand('brancla.scanWorkspace');
    }, 1500);
}
function deactivate() { }
function httpPost(urlStr, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(urlStr, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
            },
        }, (res) => {
            let responseBody = '';
            res.on('data', chunk => responseBody += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseBody));
                }
                catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
function httpGet(urlStr) {
    return new Promise((resolve, reject) => {
        http.get(urlStr, (res) => {
            let responseBody = '';
            res.on('data', chunk => responseBody += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseBody));
                }
                catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}
//# sourceMappingURL=extension.js.map