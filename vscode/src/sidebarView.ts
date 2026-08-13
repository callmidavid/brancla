import * as vscode from 'vscode';

export class BranclaSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'branclaSidebarView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'scanRepo':
          vscode.commands.executeCommand('brancla.scanWorkspace');
          break;
        case 'cleanBranches':
          vscode.commands.executeCommand('brancla.cleanDeadBranches');
          break;
        case 'restoreBranch':
          vscode.commands.executeCommand('brancla.restoreBranch', data.branch);
          break;
      }
    });
  }

  public updateBranchData(data: any) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'updateData', payload: data });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Brancla Sweeper</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background: var(--vscode-sideBar-background);
          padding: 12px;
          margin: 0;
          font-size: 13px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header h3 {
          margin: 0;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--vscode-symbolIcon-moduleForeground);
        }

        .btn {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          justify-content: center;
          margin-bottom: 8px;
        }

        .btn:hover {
          background: var(--vscode-button-hoverBackground);
        }

        .btn-danger {
          background: var(--vscode-errorForeground);
          color: white;
        }

        .section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--vscode-descriptionForeground);
          margin: 16px 0 8px 0;
        }

        .branch-card {
          background: var(--vscode-welcomePage-tileBackground);
          border: 1px solid var(--vscode-widget-border);
          border-radius: 6px;
          padding: 8px 10px;
          margin-bottom: 8px;
        }

        .branch-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
          font-family: var(--vscode-editor-font-family);
        }

        .badge-safe {
          color: #10b981;
          font-size: 10px;
          font-weight: 700;
        }

        .badge-warning {
          color: #f59e0b;
          font-size: 10px;
          font-weight: 700;
        }

        .badge-protected {
          color: #3b82f6;
          font-size: 10px;
          font-weight: 700;
        }

        .reason {
          font-size: 11px;
          color: var(--vscode-descriptionForeground);
          margin-top: 4px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h3>🧹 Brancla Sweeper</h3>
      </div>

      <button className="btn" onclick="scanRepo()">🔄 Sync & Scan Workspace</button>
      <button className="btn btn-danger" onclick="cleanBranches()">🧹 Safely Clean Selected</button>

      <div id="stats" style="margin: 12px 0; font-size: 12px; color: var(--vscode-descriptionForeground);">
        Scanning workspace...
      </div>

      <div class="section-title">Safe to Clean (Dead on Remote)</div>
      <div id="safe-list"></div>

      <div class="section-title">Warnings / Protected</div>
      <div id="warning-list"></div>

      <script>
        const vscode = acquireVsCodeApi();

        function scanRepo() {
          vscode.postMessage({ type: 'scanRepo' });
        }

        function cleanBranches() {
          vscode.postMessage({ type: 'cleanBranches' });
        }

        function restore(branch) {
          vscode.postMessage({ type: 'restoreBranch', branch });
        }

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'updateData') {
            render(message.payload);
          }
        });

        function render(data) {
          const statsEl = document.getElementById('stats');
          const safeEl = document.getElementById('safe-list');
          const warnEl = document.getElementById('warning-list');

          if (!data || !data.branches) {
            statsEl.innerText = "No repository detected.";
            return;
          }

          const safe = data.branches.filter(b => b.safetyStatus === 'SAFE_TO_DELETE' || b.safetyStatus === 'SAFE_SQUASH_MERGED');
          const warn = data.branches.filter(b => b.safetyStatus !== 'SAFE_TO_DELETE' && b.safetyStatus !== 'SAFE_SQUASH_MERGED');

          statsEl.innerHTML = \`Found <b>\${safe.length}</b> dead branches safe to delete.\`;

          safeEl.innerHTML = safe.length === 0 ? '<div style="color:var(--vscode-descriptionForeground); font-size:12px;">✨ Repository is clean!</div>' : safe.map(b => \`
            <div class="branch-card">
              <div class="branch-header">
                <span>🌿 \${b.name}</span>
                <span class="badge-safe">🟢 SAFE (\${b.safetyScore}%)</span>
              </div>
              <div class="reason">\${b.safetyReason}</div>
            </div>
          \`).join('');

          warnEl.innerHTML = warn.map(b => \`
            <div class="branch-card">
              <div class="branch-header">
                <span>🌿 \${b.name}</span>
                <span class="\${b.safetyStatus === 'PROTECTED' || b.safetyStatus === 'CURRENT' ? 'badge-protected' : 'badge-warning'}">\${b.safetyStatus}</span>
              </div>
              <div class="reason">\${b.safetyReason}</div>
            </div>
          \`).join('');
        }
      </script>
    </body>
    </html>`;
  }
}
