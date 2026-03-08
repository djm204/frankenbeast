import { createServer } from 'node:http';
/**
 * Lightweight local HTTP server for inspecting traces in a browser.
 * Zero external dependencies — uses Node's built-in `node:http`.
 *
 * Routes:
 *   GET /              → self-contained HTML trace viewer
 *   GET /api/traces    → { traces: TraceSummary[] }
 *   GET /api/traces/:id → Trace (full) or 404 JSON
 *
 * Usage:
 * ```ts
 * const server = new TraceServer({ adapter, port: 4040 })
 * await server.start()
 * console.log(`Trace viewer at ${server.url}`)
 * ```
 */
export class TraceServer {
    adapter;
    requestedPort;
    _port = 0;
    server = null;
    constructor(options) {
        this.adapter = options.adapter;
        this.requestedPort = options.port ?? 4040;
    }
    /** Start listening. Resolves once the server is ready to accept connections. */
    start() {
        return new Promise((resolve, reject) => {
            const srv = createServer((req, res) => {
                void this.handleRequest(req, res);
            });
            srv.on('error', reject);
            srv.listen(this.requestedPort, () => {
                const addr = srv.address();
                this._port = addr && typeof addr === 'object' ? addr.port : this.requestedPort;
                this.server = srv;
                resolve();
            });
        });
    }
    /** Stop accepting connections and close the server. */
    stop() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(err => (err ? reject(err) : resolve()));
        });
    }
    /** Full base URL of the server, e.g. `http://localhost:4040`. */
    get url() {
        return `http://localhost:${this._port}`;
    }
    // ── Request routing ──────────────────────────────────────────────────────
    async handleRequest(req, res) {
        try {
            const path = new URL(req.url ?? '/', `http://localhost`).pathname;
            if (path === '/' || path === '') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(buildHtml());
                return;
            }
            if (path === '/api/traces') {
                const ids = await this.adapter.listTraceIds();
                const all = await Promise.all(ids.map(id => this.adapter.queryByTraceId(id)));
                const traces = all.filter(Boolean).map(t => ({
                    id: t.id,
                    goal: t.goal,
                    status: t.status,
                    spanCount: t.spans.length,
                    startedAt: t.startedAt,
                }));
                json(res, 200, { traces });
                return;
            }
            const traceMatch = /^\/api\/traces\/([^/]+)$/.exec(path);
            if (traceMatch) {
                const trace = await this.adapter.queryByTraceId(traceMatch[1]);
                if (!trace) {
                    json(res, 404, { error: 'trace not found' });
                    return;
                }
                json(res, 200, trace);
                return;
            }
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
        catch (err) {
            json(res, 500, { error: 'internal server error' });
        }
    }
}
// ── Helpers ───────────────────────────────────────────────────────────────
function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}
// ── HTML ─────────────────────────────────────────────────────────────────
function buildHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>franken-observer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;height:100vh;display:flex;flex-direction:column}
header{padding:.75rem 1.25rem;border-bottom:1px solid #2a2a2a;display:flex;align-items:center;gap:.75rem;flex-shrink:0}
header h1{font-size:.9rem;letter-spacing:.08em;color:#888;text-transform:uppercase}
header button{margin-left:auto;font-size:.75rem;background:#1e1e1e;color:#aaa;border:1px solid #333;padding:.25rem .6rem;border-radius:4px;cursor:pointer}
header button:hover{background:#2a2a2a}
main{display:flex;flex:1;overflow:hidden}
#sidebar{width:280px;border-right:1px solid #2a2a2a;overflow-y:auto;flex-shrink:0}
.trace-item{padding:.65rem 1rem;cursor:pointer;border-bottom:1px solid #1c1c1c}
.trace-item:hover,.trace-item.active{background:#161616}
.trace-goal{font-size:.825rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.trace-meta{font-size:.7rem;color:#555;margin-top:.2rem;display:flex;gap:.4rem}
#panel{flex:1;overflow-y:auto;padding:1.5rem}
#panel h2{font-size:1rem;margin-bottom:.4rem}
.trace-id{font-size:.7rem;color:#444;font-family:monospace;margin-bottom:1.25rem}
table{width:100%;border-collapse:collapse;font-size:.8rem;margin-top:.75rem}
th{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #2a2a2a;color:#666;font-weight:500;white-space:nowrap}
td{padding:.4rem .6rem;border-bottom:1px solid #1a1a1a;font-variant-numeric:tabular-nums}
.ok{color:#4ade80}.err{color:#f87171}.act{color:#facc15}
.empty{color:#444;font-style:italic;padding:1rem 0}
.badge{display:inline-block;padding:.1rem .4rem;border-radius:3px;font-size:.7rem;border:1px solid}
.badge.ok{border-color:#166534;color:#4ade80;background:#052e16}
.badge.err{border-color:#7f1d1d;color:#f87171;background:#2d0f0f}
.badge.act{border-color:#713f12;color:#facc15;background:#1c0f00}
</style>
</head>
<body>
<header>
  <h1>franken-observer</h1>
  <button onclick="loadTraces()">↺ Refresh</button>
</header>
<main>
  <div id="sidebar"><p class="empty" style="padding:1rem;font-size:.8rem">Loading…</p></div>
  <div id="panel"><p class="empty">Select a trace to inspect.</p></div>
</main>
<script>
const sidebar = document.getElementById('sidebar')
const panel   = document.getElementById('panel')

function esc(s){
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function badge(status){
  const cls = status==='completed'?'ok':status==='error'?'err':'act'
  return '<span class="badge '+cls+'">'+esc(status)+'</span>'
}
function fmtTime(ms){return new Date(ms).toLocaleTimeString()}

async function loadTraces(){
  const {traces} = await fetch('/api/traces').then(r=>r.json())
  if(!traces.length){sidebar.innerHTML='<p class="empty" style="padding:1rem;font-size:.8rem">No traces yet.</p>';return}
  sidebar.innerHTML = traces.map(t=>\`
    <div class="trace-item" data-id="\${t.id}" onclick="loadDetail('\${t.id}')">
      <div class="trace-goal">\${esc(t.goal)}</div>
      <div class="trace-meta">
        \${badge(t.status)}
        <span>\${t.spanCount} span\${t.spanCount!==1?'s':''}</span>
        <span>\${fmtTime(t.startedAt)}</span>
      </div>
    </div>\`).join('')
}

async function loadDetail(id){
  document.querySelectorAll('.trace-item').forEach(el=>el.classList.toggle('active',el.dataset.id===id))
  const t = await fetch('/api/traces/'+id).then(r=>r.json())
  const totalTokens = t.spans.reduce((n,s)=>(n+(s.metadata.totalTokens??0)),0)
  panel.innerHTML = \`
    <h2>\${esc(t.goal)}</h2>
    <div class="trace-id">\${t.id}</div>
    <div style="display:flex;gap:2rem;font-size:.8rem;color:#666;margin-bottom:1rem">
      <span>Status: \${badge(t.status)}</span>
      <span>Spans: \${t.spans.length}</span>
      \${totalTokens?'<span>Tokens: '+totalTokens+'</span>':''}
    </div>
    <table>
      <thead><tr><th>#</th><th>Span</th><th>Status</th><th>Duration</th><th>Tokens</th><th>Model</th></tr></thead>
      <tbody>\${t.spans.map((s,i)=>\`
        <tr>
          <td style="color:#444">\${i+1}</td>
          <td>\${esc(s.name)}</td>
          <td>\${badge(s.status)}</td>
          <td>\${s.durationMs!=null?s.durationMs+'ms':'—'}</td>
          <td>\${s.metadata.totalTokens??'—'}</td>
          <td style="color:#666">\${esc(s.metadata.model??'—')}</td>
        </tr>\`).join('')}
      </tbody>
    </table>\`
}

loadTraces()
</script>
</body>
</html>`;
}
//# sourceMappingURL=TraceServer.js.map