import pool from "../db/db.js";
export async function dashboardHandler(_req, res) {
    try {
        const [players, stats, invitations] = await Promise.all([
            pool.query(`
                SELECT playfab_id, player_name, country, avatar_id, avatar_url, last_login
                FROM players
                ORDER BY last_login DESC NULLS LAST
            `),
            pool.query(`
                SELECT ps.playfab_id, p.player_name, ps.level, ps.exp, ps.coins, ps.games_played, ps.games_won, ps.updated_at
                FROM player_stats ps
                LEFT JOIN players p ON p.playfab_id = ps.playfab_id
                ORDER BY ps.games_played DESC
            `),
            pool.query(`
                SELECT i.id, i.sender_playfab_id, i.sender_name, i.recipient_playfab_id, rp.player_name AS recipient_name, i.room_code, i.entry_fee, i.status, i.created_at, i.expires_at
                FROM invitations i
                LEFT JOIN players rp ON rp.playfab_id = i.recipient_playfab_id
                ORDER BY i.created_at DESC
            `),
        ]);
        res.send(renderDashboard(players.rows, stats.rows, invitations.rows));
    }
    catch (err) {
        console.error("[DASHBOARD] Failed to render:", err);
        res.status(500).send("Failed to load dashboard data");
    }
}
function renderDashboard(players, statsRows, invitations) {
    const playersJson = JSON.stringify(players);
    const statsJson = JSON.stringify(statsRows.map((r) => {
        const played = Number(r.games_played) || 0;
        const won = Number(r.games_won) || 0;
        return { ...r, winrate: played > 0 ? Math.round((won / played) * 1000) / 10 : 0 };
    }));
    const invitationsJson = JSON.stringify(invitations);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; background: #0f1117; color: #e1e4e8; }
.tabs-bar { display: flex; background: #161b22; border-bottom: 1px solid #30363d; padding: 0 16px; }
.tab-btn { padding: 10px 22px; background: none; border: none; color: #8b949e; cursor: pointer; font-size: 0.9rem; font-weight: 500; border-bottom: 2px solid transparent; transition: color 0.15s; }
.tab-btn:hover { color: #c9d1d9; }
.tab-btn.active { color: #58a6ff; border-bottom-color: #58a6ff; }
.tab-panel { flex: 1; }
.db-panel { padding: 20px; overflow-y: auto; flex: 1; }
h2 { font-size: 1.3rem; margin-bottom: 14px; color: #58a6ff; }
.sub-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid #30363d; }
.sub-tab { padding: 8px 18px; background: none; border: none; color: #8b949e; cursor: pointer; font-size: 0.85rem; border-bottom: 2px solid transparent; }
.sub-tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
.sub-tab:hover { color: #c9d1d9; }
.sub-panel { display: none; }
.sub-panel.active { display: block; }
.search-bar { margin-bottom: 12px; }
.search-bar input { width: 100%; max-width: 400px; padding: 7px 12px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e1e4e8; font-size: 0.82rem; outline: none; }
.search-bar input:focus { border-color: #58a6ff; }
.search-bar input::placeholder { color: #484f58; }
table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
th { text-align: left; padding: 10px 14px; background: #1c2128; color: #8b949e; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.5px; cursor: pointer; user-select: none; white-space: nowrap; border-bottom: 1px solid #30363d; }
th:hover { color: #c9d1d9; }
th .sa { margin-left: 4px; font-size: 0.65rem; }
td { padding: 9px 14px; border-bottom: 1px solid #21262d; font-size: 0.82rem; white-space: nowrap; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #1c2128; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; }
.badge-green { background: #1b4332; color: #40c057; }
.badge-blue { background: #1a2744; color: #58a6ff; }
.badge-yellow { background: #3d3200; color: #e3b341; }
.badge-red { background: #3d1f1f; color: #f85149; }
.empty { text-align: center; padding: 36px 16px; color: #484f58; }
.refresh-btn { background: #21262d; border: 1px solid #30363d; color: #c9d1d9; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.78rem; }
.refresh-btn:hover { background: #30363d; }
.header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
code { background: #1c2128; padding: 2px 6px; border-radius: 4px; font-size: 0.78rem; }
</style>
</head>
<body>
<div class="tabs-bar">
    <button class="tab-btn active" data-tab="database">Database</button>
    <button class="tab-btn" onclick="window.open('/monitor','_blank')">Monitor ↗</button>
</div>
<div id="panel-database" class="tab-panel active">
    <div class="db-panel">
        <div class="header-row">
            <h2>Player Dashboard</h2>
            <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        </div>
        <div class="sub-tabs">
            <button class="sub-tab active" data-sub="players">Players</button>
            <button class="sub-tab" data-sub="stats">Player Stats</button>
            <button class="sub-tab" data-sub="invitations">Invitations</button>
        </div>
        <div id="sub-players" class="sub-panel active">
            <div class="search-bar"><input type="text" id="sp" placeholder="Search by name, ID, or country..."></div>
            <table><thead><tr>
                <th data-c="playfab_id">PlayFab ID <span class="sa"></span></th>
                <th data-c="player_name">Name <span class="sa"></span></th>
                <th data-c="country">Country <span class="sa"></span></th>
                <th data-c="avatar_id">Avatar <span class="sa"></span></th>
                <th data-c="last_login">Last Login <span class="sa"></span></th>
            </tr></thead><tbody id="tb-p"></tbody></table>
        </div>
        <div id="sub-stats" class="sub-panel">
            <div class="search-bar"><input type="text" id="ss" placeholder="Search by name or ID..."></div>
            <table><thead><tr>
                <th data-c="playfab_id">PlayFab ID <span class="sa"></span></th>
                <th data-c="player_name">Name <span class="sa"></span></th>
                <th data-c="level">Level <span class="sa"></span></th>
                <th data-c="exp">EXP <span class="sa"></span></th>
                <th data-c="coins">Coins <span class="sa"></span></th>
                <th data-c="games_played">Games <span class="sa"></span></th>
                <th data-c="games_won">Wins <span class="sa"></span></th>
                <th data-c="winrate">Win Rate <span class="sa"></span></th>
                <th data-c="updated_at">Updated <span class="sa"></span></th>
            </tr></thead><tbody id="tb-s"></tbody></table>
        </div>
        <div id="sub-invitations" class="sub-panel">
            <div class="search-bar"><input type="text" id="si" placeholder="Search by sender, recipient, room code, or status..."></div>
            <table><thead><tr>
                <th data-c="id">ID <span class="sa"></span></th>
                <th data-c="sender_name">Sender <span class="sa"></span></th>
                <th data-c="recipient_name">Recipient <span class="sa"></span></th>
                <th data-c="room_code">Room Code <span class="sa"></span></th>
                <th data-c="entry_fee">Entry Fee <span class="sa"></span></th>
                <th data-c="status">Status <span class="sa"></span></th>
                <th data-c="created_at">Created <span class="sa"></span></th>
                <th data-c="expires_at">Expires <span class="sa"></span></th>
            </tr></thead><tbody id="tb-i"></tbody></table>
        </div>
    </div>
</div>
<script>
const P = ${playersJson};
const S = ${statsJson};
const I = ${invitationsJson};
const sort = { p: { c: null, a: true }, s: { c: null, a: true }, i: { c: null, a: true } };

function esc(s) { if (s == null) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
function fmt(v) { if (!v) return '-'; try { const d = new Date(v); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); } catch { return v; } }

function renderP() {
    const q = document.getElementById('sp').value.toLowerCase();
    let rows = P;
    if (q) rows = rows.filter(r => (r.playfab_id||'').toLowerCase().includes(q) || (r.player_name||'').toLowerCase().includes(q) || (r.country||'').toLowerCase().includes(q));
    rows = srt(rows, 'p');
    const tb = document.getElementById('tb-p');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">No players found</td></tr>'; return; }
    tb.innerHTML = rows.map(r => '<tr><td><code>' + esc(r.playfab_id) + '</code></td><td>' + esc(r.player_name||'-') + '</td><td>' + esc(r.country||'-') + '</td><td>' + esc(r.avatar_id ?? '-') + '</td><td>' + fmt(r.last_login) + '</td></tr>').join('');
}

function renderS() {
    const q = document.getElementById('ss').value.toLowerCase();
    let rows = S;
    if (q) rows = rows.filter(r => (r.playfab_id||'').toLowerCase().includes(q) || (r.player_name||'').toLowerCase().includes(q));
    rows = srt(rows, 's');
    const tb = document.getElementById('tb-s');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="9" class="empty">No stats found</td></tr>'; return; }
    tb.innerHTML = rows.map(r => {
        const played = Number(r.games_played)||0, won = Number(r.games_won)||0;
        const badge = played >= 50 ? 'badge-green' : played >= 10 ? 'badge-blue' : 'badge-yellow';
        return '<tr><td><code>' + esc(r.playfab_id) + '</code></td><td>' + esc(r.player_name||'-') + '</td><td><span class="badge badge-blue">' + esc(String(r.level??0)) + '</span></td><td>' + Number(r.exp||0).toLocaleString() + '</td><td>' + Number(r.coins||0).toLocaleString() + '</td><td><span class="badge ' + badge + '">' + played + '</span></td><td>' + won + '</td><td>' + r.winrate + '%</td><td>' + fmt(r.updated_at) + '</td></tr>';
    }).join('');
}

function renderI() {
    const q = document.getElementById('si').value.toLowerCase();
    let rows = I;
    if (q) rows = rows.filter(r => (r.sender_name||'').toLowerCase().includes(q) || (r.recipient_name||'').toLowerCase().includes(q) || (r.recipient_playfab_id||'').toLowerCase().includes(q) || (r.room_code||'').toLowerCase().includes(q) || (r.status||'').toLowerCase().includes(q));
    rows = srt(rows, 'i');
    const tb = document.getElementById('tb-i');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">No invitations found</td></tr>'; return; }
    tb.innerHTML = rows.map(r => {
        const statusBadge = r.status === 'accepted' ? 'badge-green' : r.status === 'pending' ? 'badge-yellow' : 'badge-red';
        return '<tr><td>' + esc(r.id) + '</td><td>' + esc(r.sender_name||'-') + '</td><td>' + esc(r.recipient_name||r.recipient_playfab_id||'-') + '</td><td><code>' + esc(r.room_code) + '</code></td><td>' + Number(r.entry_fee||0).toLocaleString() + '</td><td><span class="badge ' + statusBadge + '">' + esc(r.status) + '</span></td><td>' + fmt(r.created_at) + '</td><td>' + fmt(r.expires_at) + '</td></tr>';
    }).join('');
}

function srt(rows, k) {
    const s = sort[k]; if (!s.c) return rows;
    return [...rows].sort((a, b) => {
        let va = a[s.c], vb = b[s.c];
        if (va == null) va = ''; if (vb == null) vb = '';
        if (typeof va === 'number' && typeof vb === 'number') return s.a ? va - vb : vb - va;
        return s.a ? String(va).toLowerCase().localeCompare(String(vb).toLowerCase()) : String(vb).toLowerCase().localeCompare(String(va).toLowerCase());
    });
}



document.querySelectorAll('.sub-tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sub-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.sub-panel').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('sub-' + b.dataset.sub).classList.add('active');
}));

document.querySelectorAll('th[data-c]').forEach(th => th.addEventListener('click', () => {
    const panelId = th.closest('.sub-panel').id;
    const panel = panelId === 'sub-players' ? 'p' : panelId === 'sub-stats' ? 's' : 'i';
    const c = th.dataset.c;
    if (sort[panel].c === c) sort[panel].a = !sort[panel].a; else { sort[panel].c = c; sort[panel].a = true; }
    th.closest('thead').querySelectorAll('.sa').forEach(s => s.textContent = '');
    th.querySelector('.sa').textContent = sort[panel].a ? '\\u25B2' : '\\u25BC';
    if (panel === 'p') renderP(); else if (panel === 's') renderS(); else renderI();
}));

document.getElementById('sp').addEventListener('input', renderP);
document.getElementById('ss').addEventListener('input', renderS);
document.getElementById('si').addEventListener('input', renderI);

renderP(); renderS(); renderI();
</script>
</body>
</html>`;
}
