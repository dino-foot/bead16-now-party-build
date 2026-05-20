export function playgroundPage(_req, res) {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Colyseus Playground</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e1e4e8; }
.nav { display: flex; align-items: center; height: 42px; background: #161b22; border-bottom: 1px solid #30363d; padding: 0 16px; gap: 2px; flex-shrink: 0; }
.nav-brand { font-weight: 700; font-size: 0.9rem; color: #58a6ff; margin-right: 12px; display: flex; align-items: center; gap: 6px; }
.nav-brand svg { width: 18px; height: 18px; fill: #58a6ff; }
.nav-link { padding: 6px 14px; border-radius: 6px; font-size: 0.82rem; font-weight: 500; color: #8b949e; text-decoration: none; cursor: pointer; transition: all 0.12s; border: 1px solid transparent; background: none; }
.nav-link:hover { color: #e1e4e8; background: #21262d; }
.nav-link.active { color: #e1e4e8; background: #21262d; border-color: #30363d; }
.nav-external { padding: 6px 14px; border-radius: 6px; font-size: 0.82rem; font-weight: 500; color: #58a6ff; text-decoration: none; cursor: pointer; transition: all 0.12s; border: 1px solid #30363d; background: #21262d; display: inline-flex; align-items: center; gap: 5px; }
.nav-external:hover { background: #30363d; border-color: #484f58; color: #79c0ff; }
.nav-external svg { width: 12px; height: 12px; fill: currentColor; }
.nav-spacer { flex: 1; }
iframe { width: 100%; height: calc(100vh - 42px); border: none; }
</style>
</head>
<body>
<div class="nav">
    <div class="nav-brand">
        <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        Colyseus
    </div>
    <button class="nav-link active">Playground</button>
    <div class="nav-spacer"></div>
    <a class="nav-external" href="/dashboard" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16"><path d="M0 11.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-2zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-5zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-8zm4-3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v11a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-11z"/></svg>
        Database
    </a>
    <a class="nav-external" href="/monitor" target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM4.5 7.5a.5.5 0 0 1 .5-.5h2.5V4.5a.5.5 0 0 1 1 0V7H11a.5.5 0 0 1 0 1H8.5v2.5a.5.5 0 0 1-1 0V8H5a.5.5 0 0 1-.5-.5z"/></svg>
        Chatroom
    </a>
</div>
<iframe src="/colyseus"></iframe>
</body>
</html>`);
}
