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
        case "getDaemonStatus":
          this.postDaemonStatus(this._lastOnline);
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
    this._lastOnline = online;
    if (this._view) {
      this._view.webview.postMessage({ type: "daemonStatus", online });
    }
  }

  private _lastOnline = false;

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
          /* Brand */
          --brand: #f5c518;
          --brand-strong: #ffd84d;
          /* Apple semantic palette */
          --green: #30d158;
          --orange: #ff9f0a;
          --red: #ff453a;
          --blue: #0a84ff;
          --neutral: #98989d;

          /* Theme-aware surfaces (adapt to light & dark via VS Code vars) */
          --bg: var(--vscode-sideBar-background, #17171a);
          --text: var(--vscode-foreground, #f5f5f7);
          --muted: var(--vscode-descriptionForeground, #9b9ba3);
          --border: rgba(127, 127, 127, 0.25);
          --border: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);

          /* Layered glass-ish surfaces */
          --surface: rgba(127, 127, 127, 0.065);
          --surface-hi: rgba(127, 127, 127, 0.11);
          --tint-sat: rgba(48, 209, 88, 0.14);
          --tint-orn: rgba(255, 159, 10, 0.14);
          --tint-gld: rgba(245, 197, 24, 0.14);

          --radius: 12px;
          --radius-sm: 8px;
          --shadow: 0 1px 1.5px rgba(0,0,0,0.18), 0 8px 28px rgba(0,0,0,0.28);
          --font-stack: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
                         "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif;
        }

        * { box-sizing: border-box; margin: 0; }
        html, body { height: 100%; }
        body {
          font-family: var(--font-stack);
          font-size: 13px;
          color: var(--text);
          background: var(--bg);
          padding: 0;
          margin: 0;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }

        /* ---- Hero / header with soft aurora glass ---- */
        .hero {
          position: relative;
          padding: 18px 16px 14px;
          overflow: hidden;
          background: linear-gradient(180deg,
              color-mix(in srgb, var(--brand) 9%, transparent),
              color-mix(in srgb, var(--brand) 2%, transparent) 60%,
              transparent);
          border-bottom: 1px solid var(--border);
        }
        .hero::before {
          content: "";
          position: absolute;
          top: -42%;
          left: 50%;
          width: 240px;
          height: 240px;
          transform: translateX(-50%);
          background: radial-gradient(circle,
            color-mix(in srgb, var(--brand) 22%, transparent),
            transparent 70%);
          filter: blur(8px);
          pointer-events: none;
        }
        .hero-top { position: relative; display: flex; align-items: center; gap: 11px; }
        .hero-logo {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          box-shadow: var(--shadow), 0 0 0 1px color-mix(in srgb, var(--brand) 40%, transparent);
        }
        .hero-title { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; }
        .hero-title b { color: var(--brand); }
        .hero-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }

        .status-pill {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.2px;
          padding: 4px 10px;
          border-radius: 100px;
          background: var(--tint-gld);
          color: var(--brand-strong);
          border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
          box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.06);
        }
        .status-pill.offline {
          background: var(--surface);
          color: var(--muted);
          border-color: var(--border);
        }
        .status-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 22%, transparent);
        }
        .status-pill.offline .status-dot { background: var(--neutral); box-shadow: none; animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

        /* ---- Action buttons (Apple style: filled primary, subtle secondary) ---- */
        .actions { display: flex; gap: 9px; padding: 14px 16px 6px; }
        .btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid transparent;
          border-radius: 11px;
          padding: 9px 10px;
          font-family: inherit;
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: 0.1px;
          cursor: pointer;
          transition: transform 0.08s ease, filter 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
          -webkit-user-select: none;
          user-select: none;
        }
        .btn:active { transform: scale(0.985); }
        .btn:focus-visible { outline: 2px solid color-mix(in srgb, var(--brand) 60%, transparent); outline-offset: 2px; }
        .btn-primary {
          color: #1a1400;
          background: linear-gradient(180deg, var(--brand-strong), var(--brand));
          box-shadow: 0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35);
        }
        .btn-primary:hover { filter: brightness(1.07); box-shadow: 0 3px 10px color-mix(in srgb, var(--brand) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.35); }
        .btn-primary svg { opacity: 0.85; }
        .btn-secondary {
          color: var(--text);
          background: var(--surface);
          border-color: var(--border);
        }
        .btn-secondary:hover { background: var(--surface-hi); }
        .btn-secondary svg { color: var(--brand); }
        .btn:disabled { opacity: 0.45; cursor: default; }

        /* ---- Metrics (Apple-style tonal tiles) ---- */
        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 9px;
          padding: 10px 16px 8px;
        }
        .stat {
          position: relative;
          border-radius: var(--radius-sm);
          padding: 11px 6px 10px;
          text-align: center;
          border: 1px solid var(--border);
          background: var(--surface);
          overflow: hidden;
        }
        .stat::before {
          content: "";
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          opacity: 0.9;
        }
        .stat.safe { --acc: var(--green); }
        .stat.warn { --acc: var(--orange); }
        .stat.prot { --acc: var(--neutral); }
        .stat.safe::before { background: var(--green); }
        .stat.warn::before { background: var(--orange); }
        .stat.prot::before { background: var(--neutral); }
        .stat-num { font-size: 21px; font-weight: 700; line-height: 1; letter-spacing: -0.3px; }
        .stat.safe .stat-num { color: var(--green); }
        .stat.warn .stat-num { color: var(--orange); }
        .stat.prot .stat-num { color: var(--muted); }
        .stat-label {
          font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.6px;
          color: var(--muted); margin-top: 5px; font-weight: 600;
        }

        /* ---- Sections ---- */
        .section { padding: 0 16px 8px; }
        .section-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.9px; color: var(--muted);
          margin: 14px 0 8px; display: flex; align-items: center; gap: 7px;
        }
        .section-title svg { color: var(--brand); }
        .count-badge {
          background: var(--surface-hi);
          color: var(--text);
          border-radius: 100px;
          padding: 1px 7px;
          font-size: 10px; font-weight: 600;
          letter-spacing: 0;
        }
        .count-badge.gold { background: var(--tint-gld); color: var(--brand-strong); }

        /* ---- Branch cards ---- */
        .branch-card {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 10px 11px;
          margin-bottom: 8px;
          overflow: hidden;
          transition: transform 0.12s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .branch-card:hover { transform: translateY(-1px); }
        .branch-card::before {
          content: "";
          position: absolute; top: 0; left: 0; bottom: 0; width: 3px;
        }
        .branch-card.safe::before { background: var(--green); }
        .branch-card.warn::before { background: var(--orange); }
        .branch-card.prot::before { background: var(--neutral); }
        .branch-card.safe { border-color: color-mix(in srgb, var(--green) 30%, var(--border)); }
        .branch-card.warn { border-color: color-mix(in srgb, var(--orange) 30%, var(--border)); }
        .branch-card.prot { opacity: 0.7; }

        .branch-header {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          font-family: var(--vscode-editor-font-family, monospace);
          font-weight: 600; font-size: 12px;
        }
        .branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .branch-name svg { margin-right: 5px; opacity: 0.95; vertical-align: -2px; }
        .branch-card.safe .branch-name svg { color: var(--green); }
        .branch-card.warn .branch-name svg { color: var(--orange); }
        .branch-card.prot .branch-name svg { color: var(--neutral); }

        .badge {
          flex-shrink: 0;
          font-family: var(--font-stack);
          font-size: 9.5px; font-weight: 700; letter-spacing: 0.4px;
          padding: 2.5px 8px; border-radius: 100px; text-transform: uppercase;
        }
        .badge.safe { background: var(--tint-sat); color: var(--green); }
        .badge.warn { background: var(--tint-orn); color: var(--orange); }
        .badge.prot { background: var(--surface-hi); color: var(--muted); }

        .score-bar {
          height: 5px; border-radius: 3px;
          background: var(--surface-hi);
          margin-top: 9px; overflow: hidden;
        }
        .score-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, var(--brand), var(--brand-strong));
        }
        .branch-card.safe .score-fill { background: linear-gradient(90deg, #2ec15e, var(--green)); }
        .branch-card.warn .score-fill { background: linear-gradient(90deg, #ff8c00, var(--orange)); }
        .branch-card.prot .score-fill { background: var(--surface-hi); }

        .reason { font-size: 11px; color: var(--muted); margin-top: 7px; line-height: 1.4; }
        .pr-chip {
          display: inline-block;
          background: var(--surface-hi);
          color: var(--blue);
          border-radius: 6px; padding: 1px 6px;
          font-size: 10px; font-weight: 600; margin-right: 5px;
        }
        .restore-link {
          margin-top: 8px; font-size: 11.5px; color: var(--blue);
          cursor: pointer; font-weight: 600;
          display: inline-flex; align-items: center; gap: 5px;
          transition: opacity 0.15s ease;
        }
        .branch-card.prot .restore-link { display: none; }
        .restore-link:hover { opacity: 0.8; text-decoration: underline; }

        .empty {
          background: var(--surface);
          border: 1px dashed var(--border);
          border-radius: var(--radius-sm);
          padding: 18px 12px; text-align: center;
          color: var(--muted); font-size: 12px; line-height: 1.4;
        }
        .empty svg { color: var(--brand); opacity: 0.7; margin-bottom: 7px; }

        .footer {
          padding: 12px 16px 18px;
          font-size: 10.5px; color: var(--muted); text-align: center;
          letter-spacing: 0.2px; opacity: 0.8;
        }
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
        <button class="btn btn-secondary" id="btn-clean">${trashIcon} Clean Safe</button>
      </div>

      <div class="stats">
        <div class="stat safe"><div class="stat-num" id="stat-safe">–</div><div class="stat-label">Safe</div></div>
        <div class="stat warn"><div class="stat-num" id="stat-warn">–</div><div class="stat-label">Warnings</div></div>
        <div class="stat prot"><div class="stat-num" id="stat-prot">–</div><div class="stat-label">Protected</div></div>
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

      <div class="footer">Every delete is reversible via local backup refs</div>

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

        // Pull current daemon status right when the view loads, so we don't
        // depend on an earlier push that may have been sent before we attached.
        vscode.postMessage({ type: 'getDaemonStatus' });

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
