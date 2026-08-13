import * as vscode from "vscode";

const LUCIDE =
  (paths: string) =>
  (size = 16) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">${paths}</svg>`;

const ICONS = {
  refresh: LUCIDE(
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  ),
  trash: LUCIDE(
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  ),
  branch: LUCIDE(
    '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  ),
  check: LUCIDE(
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  ),
  alert: LUCIDE(
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ),
  lock: LUCIDE(
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  ),
  star: LUCIDE(
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  ),
  restore: LUCIDE(
    '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>',
  ),
  sparkles: LUCIDE(
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  ),
  shield: LUCIDE(
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  ),
  unlock: LUCIDE(
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  ),
};

export class BranclaSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "branclaSidebarView";
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
        case "scanRepo":
          vscode.commands.executeCommand("brancla.scanWorkspace");
          break;
        case "cleanBranches":
          vscode.commands.executeCommand("brancla.cleanDeadBranches");
          break;
        case "restoreBranch":
          vscode.commands.executeCommand("brancla.restoreBranch", data.branch);
          break;
      }
    });
  }

  public updateBranchData(data: any) {
    if (this._view) {
      this._view.webview.postMessage({ type: "updateData", payload: data });
    }
  }

  public postDaemonStatus(online: boolean) {
    if (this._view) {
      this._view.webview.postMessage({ type: "daemonStatus", online });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "icon.png"),
    );

    const refreshIcon = ICONS.refresh(14);
    const trashIcon = ICONS.trash(14);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'unsafe-inline';">
      <title>Brancla Sweeper</title>
      <style>
        :root {
          --gold: #f5c518;
          --gold-bright: #ffd84d;
          --gold-dim: rgba(245, 197, 24, 0.55);
          --gold-faint: rgba(245, 197, 24, 0.12);
          --gold-line: rgba(245, 197, 24, 0.28);
          --ink: #0b0b0d;
          --card: #141416;
          --card-line: #26262b;
          --text: #faf7ec;
          --muted: #a3a39a;
          --radius: 8px;
        }

        * { box-sizing: border-box; }
        html, body { height: 100%; }
        body {
          font-family: var(--vscode-font-family);
          font-size: 13px;
          color: var(--text);
          background: var(--ink);
          padding: 0;
          margin: 0;
        }

        .hero {
          position: relative;
          padding: 16px 14px 14px;
          background: linear-gradient(135deg, rgba(245,197,24,0.14), rgba(245,197,24,0.03) 60%, transparent);
          border-bottom: 1px solid var(--gold-line);
        }
        .hero-top { display: flex; align-items: center; gap: 10px; }
        .hero-logo {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          box-shadow: 0 2px 12px rgba(245,197,24,0.28);
        }
        .hero-title {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.2px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .hero-title b { color: var(--gold); }
        .hero-sub { font-size: 11px; color: var(--muted); margin-top: 1px; }

        .status-pill {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 10px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 20px;
          background: var(--gold-faint);
          color: var(--gold);
          border: 1px solid var(--gold-line);
        }
        .status-pill.offline {
          background: rgba(120,120,120,0.10);
          color: var(--muted);
          border-color: #2c2c30;
        }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
        .status-pill.offline .status-dot { animation: pulse 1.4s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        .actions { display: flex; gap: 8px; padding: 12px 14px; }
        .btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: none;
          border-radius: var(--radius);
          padding: 9px 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.05s ease, filter 0.15s ease;
        }
        .btn:active { transform: translateY(1px); }
        .btn-primary {
          color: #0b0b0d;
          background: linear-gradient(135deg, var(--gold-bright), var(--gold));
        }
        .btn-primary:hover { filter: brightness(1.08); }
        .btn-danger {
          color: var(--gold);
          background: var(--card);
          border: 1px solid var(--gold-line);
        }
        .btn-danger:hover { background: var(--gold-faint); }

        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          padding: 4px 14px 14px;
        }
        .stat {
          background: var(--card);
          border: 1px solid var(--card-line);
          border-radius: var(--radius);
          padding: 9px 6px;
          text-align: center;
        }
        .stat-num { font-size: 19px; font-weight: 800; line-height: 1.1; color: var(--gold); }
        .stat-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted); margin-top: 2px; }

        .section { padding: 0 14px 6px; }
        .section-title {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
          margin: 12px 0 7px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .section-title svg { color: var(--gold); }
        .count-badge {
          background: rgba(127,127,127,0.16);
          color: var(--text);
          border-radius: 10px;
          padding: 0 6px;
          font-size: 10px;
        }
        .count-badge.gold { background: var(--gold-faint); color: var(--gold); }

        .branch-card {
          background: var(--card);
          border: 1px solid var(--card-line);
          border-left: 3px solid var(--gold-dim);
          border-radius: var(--radius);
          padding: 9px 10px;
          margin-bottom: 7px;
        }
        .branch-card.safe { border-left-color: var(--gold); }
        .branch-card.warn { border-left-color: var(--gold); border-style: dashed; }
        .branch-card.prot { opacity: 0.75; }

        .branch-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          font-family: var(--vscode-editor-font-family);
          font-weight: 600;
          font-size: 12px;
        }
        .branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .branch-name svg { margin-right: 4px; opacity: 0.9; color: var(--gold); }

        .badge {
          flex-shrink: 0;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.3px;
          padding: 2px 7px;
          border-radius: 10px;
          text-transform: uppercase;
        }
        .badge.safe { background: var(--gold-faint); color: var(--gold); border: 1px solid var(--gold-line); }
        .badge.warn { background: rgba(245,197,24,0.08); color: var(--gold-bright); border: 1px dashed var(--gold-line); }
        .badge.prot { background: rgba(127,127,127,0.14); color: var(--muted); }

        .score-bar {
          height: 4px;
          border-radius: 2px;
          background: #222226;
          margin-top: 8px;
          overflow: hidden;
        }
        .score-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, var(--gold), var(--gold-bright));
        }
        .branch-card.prot .score-fill { background: #3a3a40; }

        .reason { font-size: 11px; color: var(--muted); margin-top: 6px; line-height: 1.35; }
        .pr-chip {
          display: inline-block;
          background: var(--gold-faint);
          color: var(--gold);
          border-radius: 4px;
          padding: 0 5px;
          font-size: 10px;
          font-weight: 600;
          margin-right: 4px;
        }
        .restore-link {
          margin-top: 7px;
          font-size: 11px;
          color: var(--gold);
          cursor: pointer;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .restore-link:hover { text-decoration: underline; }

        .empty {
          background: var(--card);
          border: 1px dashed var(--card-line);
          border-radius: var(--radius);
          padding: 16px 12px;
          text-align: center;
          color: var(--muted);
          font-size: 12px;
        }
        .empty svg { color: var(--gold); opacity: 0.7; margin-bottom: 6px; }
      </style>
    </head>
    <body>
      <div class="hero">
        <div class="hero-top">
          <img class="hero-logo" src="${iconUri}" alt="Brancla">
          <div>
            <div class="hero-title">Brancla</div>
            <div class="hero-sub">Safe local git branch cleanup</div>
          </div>
          <span class="status-pill offline" id="status"><span class="status-dot"></span><span id="status-text">Daemon offline</span></span>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary" id="btn-scan">${refreshIcon} Sync &amp; Scan</button>
        <button class="btn btn-danger" id="btn-clean">${trashIcon} Clean Safe</button>
      </div>

      <div class="stats">
        <div class="stat"><div class="stat-num" id="stat-safe">–</div><div class="stat-label">Safe</div></div>
        <div class="stat"><div class="stat-num" id="stat-warn">–</div><div class="stat-label">Warnings</div></div>
        <div class="stat"><div class="stat-num" id="stat-prot">–</div><div class="stat-label">Protected</div></div>
      </div>

      <div class="section">
        <div class="section-title">${ICONS.check(13)} Safe to Clean <span class="count-badge gold" id="badge-safe">0</span></div>
        <div id="safe-list"></div>
      </div>

      <div class="section">
        <div class="section-title">${ICONS.alert(13)} Warnings <span class="count-badge gold" id="badge-warn">0</span></div>
        <div id="warning-list"></div>
      </div>

      <div class="section">
        <div class="section-title">${ICONS.lock(13)} Protected <span class="count-badge" id="badge-prot">0</span></div>
        <div id="protected-list"></div>
      </div>

      <script>
        const vscode = acquireVsCodeApi();

        const statusEl = document.getElementById('status');
        const statusText = document.getElementById('status-text');
        const statSafe = document.getElementById('stat-safe');
        const statWarn = document.getElementById('stat-warn');
        const statProt = document.getElementById('stat-prot');
        const badgeSafe = document.getElementById('badge-safe');
        const badgeWarn = document.getElementById('badge-warn');
        const badgeProt = document.getElementById('badge-prot');
        const safeList = document.getElementById('safe-list');
        const warnList = document.getElementById('warning-list');
        const protList = document.getElementById('protected-list');

        const ICON = (paths, size = 16) =>
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px">' + paths + '</svg>';

        const SVG = {
          branch: ICON('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
          check: ICON('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>'),
          alert: ICON('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
          lock: ICON('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
          unlock: ICON('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>'),
          star: ICON('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
          restore: ICON('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>'),
          sparkles: ICON('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>'),
          shield: ICON('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
        };

        document.getElementById('btn-scan').addEventListener('click', () => {
          statusText.textContent = 'Scanning...';
          statusEl.className = 'status-pill offline';
          vscode.postMessage({ type: 'scanRepo' });
        });
        document.getElementById('btn-clean').addEventListener('click', () => {
          vscode.postMessage({ type: 'cleanBranches' });
        });

        window.addEventListener('message', event => {
          const msg = event.data;
          if (msg.type === 'updateData') render(msg.payload);
          else if (msg.type === 'daemonStatus') setOnline(msg.online);
        });

        function setOnline(online) {
          statusEl.className = online ? 'status-pill' : 'status-pill offline';
          statusText.textContent = online ? 'Daemon online' : 'Daemon offline';
        }

        function isSafe(b) { return b.safetyStatus === 'SAFE_TO_DELETE' || b.safetyStatus === 'SAFE_SQUASH_MERGED'; }
        function isWarn(b) { return b.safetyStatus === 'WARNING_UNMERGED' || b.safetyStatus === 'WARNING_CLOSED_PR'; }
        function isProt(b) { return b.safetyStatus === 'PROTECTED' || b.safetyStatus === 'CURRENT'; }

        function statusClass(b) { return isSafe(b) ? 'safe' : isWarn(b) ? 'warn' : 'prot'; }
        function statusLabel(b) {
          const s = b.safetyStatus;
          if (s === 'SAFE_TO_DELETE') return 'SAFE';
          if (s === 'SAFE_SQUASH_MERGED') return 'SQUASHED';
          if (s === 'WARNING_UNMERGED') return 'UNMERGED';
          if (s === 'WARNING_CLOSED_PR') return 'CLOSED PR';
          if (s === 'PROTECTED') return 'PROTECTED';
          if (s === 'CURRENT') return 'ACTIVE';
          return s || 'UNKNOWN';
        }
        function glyphFor(b) {
          if (isSafe(b)) return SVG.check;
          if (b.safetyStatus === 'CURRENT') return SVG.star;
          if (isProt(b)) return SVG.lock;
          return SVG.alert;
        }

        function cardHtml(b) {
          const score = typeof b.safetyScore === 'number' ? b.safetyScore : 0;
          const pr = (b.prNumber && b.prNumber > 0)
            ? '<span class="pr-chip">#' + b.prNumber + ' ' + (b.prState || '') + '</span>'
            : '';
          const safeName = b.name.replace(/'/g, "\\\\'");
          const restore = !isProt(b)
            ? '<div class="restore-link" onclick="restore(\'' + safeName + '\')">' + SVG.restore + " Restore '" + b.name + "'</div>"
            : '';
          return '' +
            '<div class="branch-card ' + statusClass(b) + '">' +
              '<div class="branch-header">' +
                '<span class="branch-name">' + glyphFor(b) + b.name + '</span>' +
                '<span class="badge ' + statusClass(b) + '">' + statusLabel(b) + '</span>' +
              '</div>' +
              '<div class="score-bar"><div class="score-fill" style="width:' + score + '%"></div></div>' +
              '<div class="reason">' + pr + (b.safetyReason || '') + '</div>' +
              restore +
            '</div>';
        }

        function emptyHtml(icon, text) {
          return '<div class="empty">' + icon + '<div>' + text + '</div></div>';
        }

        function render(data) {
          if (!data || !data.branches) {
            statSafe.textContent = '0'; statWarn.textContent = '0'; statProt.textContent = '0';
            badgeSafe.textContent = '0'; badgeWarn.textContent = '0'; badgeProt.textContent = '0';
            safeList.innerHTML = emptyHtml(SVG.branch, 'No repository detected. Open a git workspace.');
            warnList.innerHTML = '';
            protList.innerHTML = '';
            setOnline(false);
            return;
          }

          const safe = data.branches.filter(isSafe);
          const warn = data.branches.filter(isWarn);
          const prot = data.branches.filter(isProt);

          statSafe.textContent = safe.length;
          statWarn.textContent = warn.length;
          statProt.textContent = prot.length;
          badgeSafe.textContent = safe.length;
          badgeWarn.textContent = warn.length;
          badgeProt.textContent = prot.length;

          safeList.innerHTML = safe.length === 0
            ? emptyHtml(SVG.sparkles, 'Repository is clean! No dead branches.')
            : safe.map(cardHtml).join('');
          warnList.innerHTML = warn.length === 0
            ? emptyHtml(SVG.shield, 'No warnings. Nice work!')
            : warn.map(cardHtml).join('');
          protList.innerHTML = prot.length === 0
            ? emptyHtml(SVG.unlock, 'No protected branches.')
            : prot.map(cardHtml).join('');

          setOnline(true);
        }

        function restore(branch) {
          vscode.postMessage({ type: 'restoreBranch', branch });
        }
      </script>
    </body>
    </html>`;
  }
}
