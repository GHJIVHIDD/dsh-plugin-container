window.__ModuleLoader__.load({
	id: "@dsh-community/dsh-plugin-container",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// ── styles ─────────────────────────────────────────────────────────────
		const CSS = `
.dk-panel{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;padding:12px 16px 20px;box-sizing:border-box;font-size:13px;color:var(--dsw-alias-label-primary);}
.dk-head{display:flex;align-items:center;gap:10px;flex:none;min-width:0;}
.dk-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;min-width:0;}
.dk-title-ico{color:var(--dsw-alias-label-secondary);font-size:14px;font-weight:700;line-height:1;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);}
.dk-mode{display:flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2);flex:none;}
.dk-mode-btn{height:22px;padding:0 10px;border-radius:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:20px;cursor:pointer;white-space:nowrap;}
.dk-mode-btn:hover{color:var(--dsw-alias-label-primary);}
.dk-mode-btn[data-act='1']{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.08);}
.dk-count{flex:1 1 auto;color:var(--dsw-alias-label-secondary);font-size:12px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dk-live{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;}
.dk-live .dot{width:7px;height:7px;border-radius:50%;background:#34c77b;animation:dk-pulse 1.6s ease-in-out infinite;}
.dk-live .dot.bad{background:#e5484d;animation:none;}
@keyframes dk-pulse{0%,100%{opacity:1}50%{opacity:.3}}
.dk-btn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;}
.dk-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1);}
.dk-btn:disabled{opacity:.5;cursor:default;}
.dk-error{flex:none;color:var(--dsw-alias-state-error-primary,#e5484d);font-size:12px;line-height:18px;word-break:break-all;}
.dk-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;flex:none;}
.dk-stat{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);padding:8px 12px 9px;min-width:0;}
.dk-stat-label{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;}
.dk-stat-num{font-size:19px;font-weight:700;line-height:24px;font-variant-numeric:tabular-nums;margin-top:1px;}
.dk-stat-num small{font-size:11.5px;font-weight:500;color:var(--dsw-alias-label-secondary);margin-left:2px;}
.dk-list{flex:1 1 0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;overscroll-behavior:contain;}
.dk-item{flex:none;display:flex;flex-direction:column;min-width:0;}
.dk-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;transition:background .12s ease;min-width:0;}
.dk-row:hover{background:var(--dsw-alias-bg-layer-2);}
.dk-row-open{border-bottom-left-radius:0;border-bottom-right-radius:0;}
.dk-chev{color:var(--dsw-alias-label-secondary);font-size:10px;width:12px;flex:none;transition:transform .15s ease;}
.dk-row-open .dk-chev{transform:rotate(90deg);}
.dk-dot{width:8px;height:8px;border-radius:50%;flex:none;}
.dk-dot[data-st='running']{background:#34c77b;}
.dk-dot[data-st='paused'],.dk-dot[data-st='restarting']{background:#e8b43c;}
.dk-dot[data-st='exited']{background:#8a94a6;}
.dk-dot[data-st='dead']{background:#e5484d;}
.dk-dot[data-st='created']{background:#4c8bf5;}
.dk-name{font-weight:600;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.dk-meta{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.dk-state{margin-left:auto;flex:none;font-size:11.5px;white-space:nowrap;}
.dk-state-run{color:var(--dsw-alias-state-success-primary,#30a46c);}
.dk-state-warn{color:var(--dsw-alias-state-warn-primary,#f5a524);}
.dk-state-dead{color:var(--dsw-alias-state-error-primary,#e5484d);}
.dk-actions{display:flex;gap:5px;flex:none;}
.dk-op{height:24px;padding:0 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:22px;cursor:pointer;transition:color .15s ease,border-color .15s ease,background .15s ease;}
.dk-op:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);}
.dk-op:disabled{opacity:.45;cursor:default;}
.dk-op.start{color:#2ea043;}
.dk-op.stop{color:#d4a72c;}
.dk-op.rm{color:#e5484d;}
.dk-op[data-confirm='1']{background:rgba(229,72,77,.12);border-color:rgba(229,72,77,.55);color:#e5484d;font-weight:600;}
.dk-detail{border:1px solid var(--dsw-alias-border-l1);border-top:none;border-radius:0 0 8px 8px;padding:10px 12px 12px;background:var(--dsw-alias-bg-layer-2);min-width:0;}
.dk-res{display:flex;flex-direction:column;gap:5px;padding-bottom:10px;margin-bottom:8px;border-bottom:1px dashed var(--dsw-alias-border-l1);}
.dk-res-row{display:flex;align-items:center;gap:10px;font-size:11.5px;min-width:0;}
.dk-res-k{flex:none;width:34px;color:var(--dsw-alias-label-secondary);font-size:10px;font-weight:600;letter-spacing:.06em;}
.dk-res-val{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums;}
.dk-tabs{display:flex;gap:4px;margin-bottom:10px;flex:none;}
.dk-tab{height:24px;padding:0 12px;border-radius:6px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:22px;cursor:pointer;}
.dk-tab:hover{color:var(--dsw-alias-label-primary);}
.dk-tab[data-act='1']{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1);}
.dk-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 20px;font-size:11.5px;line-height:1.55;}
.dk-detail-cell{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dk-detail-k{color:var(--dsw-alias-label-secondary);width:74px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dk-detail-v{word-break:break-all;min-width:0;}
.dk-sec{margin-top:10px;}
.dk-sec-title{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;line-height:16px;margin-bottom:6px;letter-spacing:.04em;}
.dk-muted{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;}
.dk-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11.5px;line-height:18px;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);}
.dk-table th{color:var(--dsw-alias-label-secondary);text-align:left;font-weight:500;padding:3px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap;}
.dk-table td{color:var(--dsw-alias-label-primary);padding:3px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);word-break:break-all;vertical-align:top;}
.dk-table tr:last-child td{border-bottom:none;}
.dk-shell-bar{flex:none;display:flex;align-items:center;gap:10px;padding:6px 10px;background:#0d1424;border-radius:8px 8px 0 0;}
.dk-shell-title{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:7px;color:#aab8d2;font-size:11.5px;font-weight:600;line-height:16px;}
.dk-shell-title .dot{width:7px;height:7px;border-radius:50%;background:#34c77b;animation:dk-pulse 1.6s ease-in-out infinite;flex:none;}
.dk-shell-title .dot.off{background:#8a94a6;animation:none;}
.dk-shell-chip{flex:none;color:#8fa0bd;font-size:10.5px;line-height:15px;padding:1px 8px;border:1px solid rgba(148,163,184,.25);border-radius:999px;}
.dk-shell-btn{flex:none;height:22px;padding:0 10px;border-radius:6px;border:1px solid rgba(148,163,184,.25);background:transparent;color:#aab8d2;font-size:11px;line-height:20px;cursor:pointer;}
.dk-shell-btn:hover{background:rgba(148,163,184,.12);color:#e2e8f5;}
.dk-shell-body{flex:1 1 0;min-height:0;max-height:280px;overflow-y:auto;padding:10px 12px;background:#0a0f1e;border-radius:0 0 8px 8px;overscroll-behavior:contain;}
.dk-shell-line{margin:0;color:#c8d4ea;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12px;line-height:19px;white-space:pre-wrap;word-break:break-all;}
.dk-shell-line.dim{color:#5b6b8a;}
.dk-shell-foot{display:flex;align-items:center;gap:8px;padding:5px 10px;background:#0d1424;border-radius:0 0 8px 8px;color:#6d7d9c;font-size:11px;line-height:16px;}
.dk-empty{flex:1 1 0;min-height:160px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-align:center;padding:20px;}
.dk-empty-ico{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:20px;line-height:1;color:var(--dsw-alias-label-secondary);}
.dk-empty-sub{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;opacity:.85;}
.dk-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;}
.dk-bar{flex:1 1 auto;height:5px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;position:relative;min-width:0;}
.dk-bar-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#1d4ed8,#3b82f6,#60a5fa);transition:width .6s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;}
.dk-bar-fill::after{content:'';position:absolute;top:0;bottom:0;left:0;width:55%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:dk-shimmer 2.4s linear infinite;}
@keyframes dk-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}
@media (max-width:860px){.dk-stats{grid-template-columns:repeat(2,1fr);}}
`;

		// ── helpers ────────────────────────────────────────────────────────────
		function api(path, params) {
			let url = "/dock-api/" + path;
			if (params) {
				const keys = Object.keys(params);
				if (keys.length > 0) {
					url += "?" + keys.map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k])).join("&");
				}
			}
			return fetch(url, { cache: "no-store" })
				.then((r) => r.json().catch(() => ({ ok: false, error: "HTTP " + r.status })))
				.then((j) => {
					if (!j || j.ok === false) throw new Error((j && j.error) || "请求失败");
					return j;
				});
		}

		const safe = (p) => p.catch((e) => ({ ok: false, error: String((e && e.message) || e) }));

		function stripAnsi(s) {
			let out = '';
			let i = 0;
			const esc = String.fromCharCode(27);
			while (i < s.length) {
				const c = s[i];
				if (c === esc) {
					i++;
					if (s[i] === '[') {
						i++;
						while (i < s.length && !/[a-zA-Z]/.test(s[i])) i++;
						i++;
					} else if (s[i] === ']') {
						i++;
						while (i < s.length && s[i] !== String.fromCharCode(7)) i++;
						i++;
					} else {
						i++;
					}
				} else {
					out += c;
					i++;
				}
			}
			return out;
		}

		function stripTs(line) {
			if (line.length > 21 && line[4] === '-' && line[7] === '-' && line[10] === 'T') {
				const z = line.indexOf('Z ');
				if (z >= 0 && z < 40) return line.slice(z + 2);
			}
			return line;
		}

		function cleanDelta(delta) {
			const s = stripAnsi(String(delta || '')).split(String.fromCharCode(13)).join(String.fromCharCode(10));
			return s.split(String.fromCharCode(10)).map(stripTs).join(String.fromCharCode(10));
		}

		function cleanLogs(text) {
			return cleanDelta(String(text || '')).split(String.fromCharCode(10)).map((l) => (l.length > 0 ? l : ' ')).join(String.fromCharCode(10));
		}

		function fmtTime(iso) {
			if (!iso) return '—';
			const s = String(iso);
			const ok = s.length >= 19 && s[4] === '-' && s[7] === '-' && (s[10] === ' ' || s[10] === 'T') && s[13] === ':' && s[16] === ':';
			return ok ? s.slice(5, 19) : s.slice(0, 40);
		}

		function humanBytes(n) {
			if (!n && n !== 0) return '—';
			if (n < 1024) return n + ' B';
			const units = ['KB', 'MB', 'GB', 'TB'];
			let v = n;
			let i = -1;
			do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
			return v.toFixed(1) + ' ' + units[i];
		}

		function portList(ports) {
			if (!ports) return '—';
			if (typeof ports === 'string') return ports || '—';
			if (typeof ports !== 'object') return '—';
			const out = [];
			for (const k of Object.keys(ports)) {
				const binds = ports[k] || [];
				for (const b of binds) out.push((b.HostIp ? b.HostIp + ':' : '') + b.HostPort + '→' + k);
				if (!binds.length) out.push(k);
			}
			return out.join(', ') || '—';
		}

		function Bar(props) {
			const pct = Math.max(0, Math.min(100, Number(props.pct) || 0));
			return React.createElement('div', { className: 'dk-bar' },
				React.createElement('div', { className: 'dk-bar-fill', style: { width: pct.toFixed(1) + '%' } }));
		}

		const STATE_LABEL = { running: '运行中', paused: '已暂停', exited: '已退出', dead: '已终止', created: '已创建', restarting: '重启中' };
		const STATE_CLASS = { running: ' dk-state-run', paused: ' dk-state-warn', dead: ' dk-state-dead', restarting: ' dk-state-warn' };

		// ── view ───────────────────────────────────────────────────────────────
		function DockerView(props) {
			const ctx = props.ctx;
			const [status, setStatus] = React.useState(null);
			const [error, setError] = React.useState(null);
			const [expanded, setExpanded] = React.useState(null);
			const [tabOf, setTabOf] = React.useState({});
			const [details, setDetails] = React.useState({});
			const [logsOf, setLogsOf] = React.useState({});
			const [topOf, setTopOf] = React.useState({});
			const [shellOf, setShellOf] = React.useState({});
			const [logFollow, setLogFollow] = React.useState({});
			const [opBusy, setOpBusy] = React.useState(null);
			const [confirmRm, setConfirmRm] = React.useState(null);
			const [mode, setMode] = React.useState('observe');
			const shellRefs = React.useRef({});
			const shellBodyRefs = React.useRef({});
			const logsBodyRefs = React.useRef({});
			const stickRefs = React.useRef({});

			const load = React.useCallback(async () => {
				try {
					const r = await api('status', {});
					setStatus(r);
					setError(null);
				} catch (e) {
					setError(String((e && e.message) || e));
				}
			}, []);

			React.useEffect(() => { load(); }, [load]);
			React.useEffect(() => {
				const t = window.setInterval(() => load(), 5000);
				return () => window.clearInterval(t);
			}, [load]);

			const refreshDetail = React.useCallback((name) => {
				safe(api('inspect', { container: name })).then((r) => setDetails((d) => Object.assign({}, d, { [name]: r })));
				safe(api('logs', { container: name, tail: 500 })).then((r) => { if (r && r.ok) setLogsOf((l) => Object.assign({}, l, { [name]: cleanLogs(r.text) })); });
				safe(api('top', { container: name })).then((r) => setTopOf((t) => Object.assign({}, t, { [name]: r })));
			}, []);

			React.useEffect(() => {
				if (!expanded) return;
				refreshDetail(expanded);
			}, [expanded, refreshDetail]);

			React.useEffect(() => {
				if (!expanded) return;
				const t = window.setInterval(() => {
					safe(api('top', { container: expanded })).then((r) => setTopOf((m) => Object.assign({}, m, { [expanded]: r })));
				}, 8000);
				return () => window.clearInterval(t);
			}, [expanded]);

			React.useEffect(() => {
				if (!expanded || tabOf[expanded] !== 'logs' || !logFollow[expanded]) return;
				const t = window.setInterval(() => {
					safe(api('logs', { container: expanded, tail: 500 })).then((r) => { if (r && r.ok) setLogsOf((l) => Object.assign({}, l, { [expanded]: cleanLogs(r.text) })); });
				}, 3000);
				return () => window.clearInterval(t);
			}, [expanded, tabOf, logFollow]);

			const pollShell = React.useCallback(async (name) => {
				const st = shellOf[name];
				if (!st || st.paused) return;
				const ref = shellRefs.current[name] || (shellRefs.current[name] = { so: 0, se: 0, partial: '' });
				try {
					const r = await api('watch', { container: name, so: ref.so, se: ref.se });
					ref.so = r.stdoutOffset;
					ref.se = r.stderrOffset;
					let lines = st.lines;
					if (r.delta) {
						const cleaned = cleanDelta(r.delta);
						if (cleaned) {
							const parts = (ref.partial + cleaned).split(String.fromCharCode(10));
							ref.partial = parts.pop();
							lines = lines.concat(parts).slice(-1500);
						}
					}
					if (r.ended && ref.partial) {
						lines = lines.concat([ref.partial]).slice(-1500);
						ref.partial = '';
					}
					setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, st, { lines, ended: !!r.ended, error: r.endError || null }) }));
				} catch (e) {
					setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, st, { error: String((e && e.message) || e) }) }));
				}
			}, [shellOf]);

			React.useEffect(() => {
				if (!expanded || tabOf[expanded] !== 'shell') return;
				if (!shellOf[expanded]) {
					setShellOf((s) => Object.assign({}, s, { [expanded]: { lines: [], paused: false, ended: false, error: null } }));
					return;
				}
				if (shellOf[expanded].paused) return;
				pollShell(expanded);
				const t = window.setInterval(() => pollShell(expanded), 2000);
				return () => window.clearInterval(t);
			}, [expanded, tabOf, shellOf, pollShell]);

			React.useEffect(() => {
				const el = shellBodyRefs.current[expanded];
				if (el && stickRefs.current[expanded]) el.scrollTop = el.scrollHeight;
			}, [shellOf, expanded]);
			React.useEffect(() => {
				const el = logsBodyRefs.current[expanded];
				if (el && stickRefs.current[expanded]) el.scrollTop = el.scrollHeight;
			}, [logsOf, expanded]);

			const onScroll = (name) => (e) => {
				const el = e.currentTarget;
				stickRefs.current[name] = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
			};

			const toggle = (name) => setExpanded((cur) => (cur === name ? null : name));

			const setTab = (name, t) => setTabOf((m) => Object.assign({}, m, { [name]: t }));

			const runOp = (name, action) => {
				if (opBusy) return;
				if (action === 'rm' && confirmRm !== name) {
					setConfirmRm(name);
					window.setTimeout(() => setConfirmRm((cur) => (cur === name ? null : cur)), 3000);
					return;
				}
				setConfirmRm(null);
				setOpBusy(name);
				api('op', { container: name, action })
					.then(() => {
						setOpBusy(null);
						if (action === 'rm') {
							if (expanded === name) setExpanded(null);
							setShellOf((s) => { const n = Object.assign({}, s); delete n[name]; return n; });
						}
						load();
					})
					.catch((e) => {
						setOpBusy(null);
						setError(String((e && e.message) || e));
						load();
					});
			};

			const clearShell = (name) => {
				const st = shellOf[name];
				if (!st) return;
				const ref = shellRefs.current[name] || (shellRefs.current[name] = { so: 0, se: 0, partial: '' });
				ref.partial = '';
				stickRefs.current[name] = true;
				setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, st, { lines: [] }) }));
			};

			const reconnectShell = (name) => {
				const st = shellOf[name];
				if (!st) return;
				const ref = shellRefs.current[name] || (shellRefs.current[name] = { so: 0, se: 0, partial: '' });
				ref.so = 0;
				ref.se = 0;
				ref.partial = '';
				stickRefs.current[name] = true;
				setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, st, { lines: [], ended: false, error: null }) }));
				pollShell(name);
			};

			const togglePause = (name) => {
				const st = shellOf[name];
				if (!st) return;
				setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, st, { paused: !st.paused }) }));
			};

			const containers = (status && status.ok && status.containers) || [];
			let running = 0, paused = 0, exited = 0;
			for (const c of containers) {
				if (c.state === 'running') running++;
				else if (c.state === 'paused') paused++;
				else exited++;
			}

			const renderDetail = (c) => {
				if (expanded !== c.name) return null;
				const d = details[c.name];
				const err = d && !d.ok ? (d.error || '加载失败') : null;
				const data = d && d.ok ? d.data : null;
				const tab = tabOf[c.name] || 'info';
				const children = [];

				children.push(React.createElement('div', { className: 'dk-res', key: 'res' },
					React.createElement('div', { className: 'dk-res-row' },
						React.createElement('span', { className: 'dk-res-k' }, 'CPU'),
						React.createElement(Bar, { pct: c.cpuPerc }),
						React.createElement('span', { className: 'dk-res-val' }, c.cpuPerc === null || c.cpuPerc === undefined ? '—' : c.cpuPerc.toFixed(2) + '%')),
					React.createElement('div', { className: 'dk-res-row' },
						React.createElement('span', { className: 'dk-res-k' }, 'MEM'),
						React.createElement(Bar, { pct: c.memPerc }),
						React.createElement('span', { className: 'dk-res-val' }, c.memBytes === null || c.memBytes === undefined ? '—' : humanBytes(c.memBytes) + ' · ' + (c.memPerc || 0).toFixed(2) + '%'))));

				children.push(React.createElement('div', { className: 'dk-tabs', key: 'tabs' },
					['info', 'logs', 'shell'].map((t) => React.createElement('button', {
						type: 'button',
						key: t,
						className: 'dk-tab',
						'data-act': tab === t ? '1' : '0',
						onClick: () => setTab(c.name, t),
					}, { info: '详情', logs: '日志', shell: 'Shell 观察' }[t]))));

				if (tab === 'info') {
					const kv = [];
					const cell = (k, v) => kv.push(React.createElement('span', { className: 'dk-detail-cell', key: k },
						React.createElement('span', { className: 'dk-detail-k' }, k),
						React.createElement('span', { className: 'dk-detail-v' }, v == null || v === '' ? '—' : String(v))));
					if (err) {
						cell('错误', err);
					} else if (!data) {
						cell('状态', '加载中…');
					} else {
						const dState = data.state || {};
						cell('状态', dState.Status || '—');
						cell('镜像', data.image);
						cell('容器 ID', data.id ? String(data.id).slice(0, 19) : '—');
						cell('创建时间', fmtTime(data.created));
						cell('命令', (data.cmd || []).join(' '));
						cell('入口点', (data.entrypoint || []).join(' '));
						cell('端口', portList(data.ports));
						cell('网络', data.networks && data.networks.length ? data.networks.join(', ') : '—');
						cell('重启策略', data.restartPolicy);
						cell('环境变量', data.envCount + ' 个');
						cell('TTY', data.tty ? '是' : '否');
						cell('PID', dState.Pid ? dState.Pid : '—');
					}
					children.push(React.createElement('div', { className: 'dk-detail-grid', key: 'kv' }, ...kv));
					if (data && data.mounts && data.mounts.length) {
						const rows = data.mounts.map((m, i) => React.createElement('tr', { key: i },
							React.createElement('td', null, m.type),
							React.createElement('td', null, m.source || '(匿名)'),
							React.createElement('td', null, m.dest),
							React.createElement('td', null, m.rw ? 'rw' : 'ro')));
						children.push(React.createElement('div', { className: 'dk-sec', key: 'mounts' },
							React.createElement('div', { className: 'dk-sec-title' }, '挂载 (' + data.mounts.length + ')'),
							React.createElement('table', { className: 'dk-table' },
								React.createElement('thead', null, React.createElement('tr', null,
									React.createElement('th', null, '类型'), React.createElement('th', null, '来源'), React.createElement('th', null, '目标'), React.createElement('th', null, '权限'))),
								React.createElement('tbody', null, ...rows))));
					}
					const top = topOf[c.name];
					if (top) {
						if (top.ok) {
							const rows = (top.rows || []).map((r, i) => React.createElement('tr', { key: i },
								React.createElement('td', null, r[0]), React.createElement('td', null, r[1]), React.createElement('td', null, r[2]), React.createElement('td', null, r[3])));
							children.push(React.createElement('div', { className: 'dk-sec', key: 'top' },
								React.createElement('div', { className: 'dk-sec-title' }, '进程快照 (8s 自动刷新)'),
								React.createElement('table', { className: 'dk-table' },
									React.createElement('thead', null, React.createElement('tr', null, (top.titles || []).map((t, i) => React.createElement('th', { key: i }, t)))),
									React.createElement('tbody', null, rows.length ? rows : React.createElement('tr', null, React.createElement('td', { colSpan: 4 }, '(无进程)'))))));
						} else {
							children.push(React.createElement('div', { className: 'dk-sec', key: 'top' },
								React.createElement('div', { className: 'dk-sec-title' }, '进程快照'),
								React.createElement('div', { className: 'dk-muted' }, top.error || '无法获取')));
						}
					}
				} else if (tab === 'logs') {
					const follow = !!logFollow[c.name];
					children.push(React.createElement('div', { className: 'dk-shell-bar', key: 'bar' },
						React.createElement('div', { className: 'dk-shell-title' },
							React.createElement('span', { className: 'dot' + (follow ? '' : ' off') }),
							React.createElement('span', null, '容器日志' + (follow ? ' · 跟随中' : ''))),
						React.createElement('span', { className: 'dk-shell-chip' }, '最近 500 行'),
						React.createElement('button', { type: 'button', className: 'dk-shell-btn', onClick: () => setLogFollow((m) => Object.assign({}, m, { [c.name]: !follow })) }, follow ? '停止跟随' : '跟随'),
						React.createElement('button', { type: 'button', className: 'dk-shell-btn', onClick: () => refreshDetail(c.name) }, '刷新')));
					children.push(React.createElement('div', { className: 'dk-shell-body', ref: (el) => { logsBodyRefs.current[c.name] = el; }, onScroll: onScroll(c.name), key: 'body' },
						React.createElement('pre', { className: 'dk-shell-line' }, logsOf[c.name] || '(暂无日志输出)')));
				} else {
					const st = shellOf[c.name] || { lines: [], paused: false, ended: false, error: null };
					children.push(React.createElement('div', { className: 'dk-shell-bar', key: 'bar' },
						React.createElement('div', { className: 'dk-shell-title' },
							React.createElement('span', { className: 'dot' + (st.paused || st.ended ? ' off' : '') }),
							React.createElement('span', null, st.ended ? '观察已结束' : (st.paused ? '已暂停' : '实时观察中'))),
						React.createElement('span', { className: 'dk-shell-chip' }, '仅观察 · 只读'),
						React.createElement('button', { type: 'button', className: 'dk-shell-btn', onClick: () => togglePause(c.name) }, st.paused ? '继续' : '暂停'),
						React.createElement('button', { type: 'button', className: 'dk-shell-btn', onClick: () => clearShell(c.name) }, '清空'),
						React.createElement('button', { type: 'button', className: 'dk-shell-btn', onClick: () => reconnectShell(c.name) }, '重连')));
					const bodyChildren = st.lines.length
						? st.lines.map((l, i) => React.createElement('div', { className: 'dk-shell-line', key: i }, l.length ? l : String.fromCharCode(160)))
						: [React.createElement('div', { className: 'dk-shell-line dim', key: 0 }, st.error ? st.error : '等待容器输出…')];
					children.push(React.createElement('div', { className: 'dk-shell-body', ref: (el) => { shellBodyRefs.current[c.name] = el; }, onScroll: onScroll(c.name), key: 'body' }, ...bodyChildren));
					children.push(React.createElement('div', { className: 'dk-shell-foot', key: 'foot' },
						React.createElement('span', null, st.lines.length + ' 行'),
						st.error ? React.createElement('span', null, st.error) : null));
				}
				return React.createElement('div', { className: 'dk-detail' }, ...children);
			};

			const listChildren = [];
			if (containers.length === 0) {
				listChildren.push(React.createElement('div', { className: 'dk-empty', key: 'empty' },
					React.createElement('div', { className: 'dk-empty-ico' }, '⬢'),
					React.createElement('div', null, '暂无容器'),
					React.createElement('div', { className: 'dk-empty-sub' }, '可让智能体用 docker_run 等工具创建容器')));
			} else {
				for (const c of containers) {
					const isOpen = expanded === c.name;
					const busy = opBusy === c.name;
					listChildren.push(React.createElement('div', { key: c.id || c.name, className: 'dk-item' },
						React.createElement('div', { className: 'dk-row' + (isOpen ? ' dk-row-open' : ''), onClick: () => toggle(c.name) },
							React.createElement('span', { className: 'dk-chev' }, '▸'),
							React.createElement('span', { className: 'dk-dot', 'data-st': c.state }),
							React.createElement('span', { className: 'dk-name' }, c.name || '(unnamed)'),
							React.createElement('span', { className: 'dk-meta' }, c.image || ''),
							React.createElement('span', { className: 'dk-state' + (STATE_CLASS[c.state] || '') }, STATE_LABEL[c.state] || c.state),
							mode === 'intervene'
								? React.createElement('span', { className: 'dk-actions', onClick: (e) => e.stopPropagation() },
									React.createElement('button', { type: 'button', className: 'dk-op start', disabled: c.state === 'running' || busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, 'start'); } }, '启动'),
									React.createElement('button', { type: 'button', className: 'dk-op stop', disabled: (c.state !== 'running' && c.state !== 'paused') || busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, 'stop'); } }, '停止'),
									React.createElement('button', { type: 'button', className: 'dk-op rm', 'data-confirm': confirmRm === c.name ? '1' : '0', disabled: busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, 'rm'); } }, confirmRm === c.name ? '确认删除?' : '删除'))
								: null),
						renderDetail(c)));
				}
			}

			return React.createElement('div', { className: 'dk-panel' },
				React.createElement('div', { className: 'dk-head' },
					React.createElement('span', { className: 'dk-title' },
						React.createElement('span', { className: 'dk-title-ico' }, '⬢'),
						React.createElement('span', null, '容器'),
						React.createElement('div', { className: 'dk-mode' },
							React.createElement('button', { type: 'button', className: 'dk-mode-btn', 'data-act': mode === 'observe' ? '1' : '0', onClick: () => setMode('observe') }, '仅观察'),
							React.createElement('button', { type: 'button', className: 'dk-mode-btn', 'data-act': mode === 'intervene' ? '1' : '0', onClick: () => setMode('intervene') }, '干预'))),
					React.createElement('span', { className: 'dk-count' }, status && status.ok ? '共 ' + containers.length + ' 个 · 运行 ' + running : ''),
					React.createElement('span', { className: 'dk-live' },
						React.createElement('span', { className: 'dot' + (error ? ' bad' : '') }),
						error ? 'Docker 不可用' : '实时更新'),
					React.createElement('button', { type: 'button', className: 'dk-btn', onClick: () => load() }, '刷新')),
				error ? React.createElement('div', { className: 'dk-error', key: 'err' }, '⚠ ' + error) : null,
				React.createElement('div', { className: 'dk-stats' },
					React.createElement('div', { className: 'dk-stat', key: 's1' },
						React.createElement('div', { className: 'dk-stat-label' }, 'CPU 占用'),
						React.createElement('div', { className: 'dk-stat-num' }, status && status.ok ? status.totalCpuPerc.toFixed(1) : '—',
							status && status.ok ? React.createElement('small', null, '% · ' + status.totalCpu + ' 核') : null)),
					React.createElement('div', { className: 'dk-stat', key: 's2' },
						React.createElement('div', { className: 'dk-stat-label' }, '内存占用'),
						React.createElement('div', { className: 'dk-stat-num' }, humanBytes(status && status.ok ? status.totalMemBytes : null),
							status && status.ok ? React.createElement('small', null, ' / ' + humanBytes(status.totalMem)) : null)),
					React.createElement('div', { className: 'dk-stat', key: 's3' },
						React.createElement('div', { className: 'dk-stat-label' }, '容器'),
						React.createElement('div', { className: 'dk-stat-num' }, running,
							React.createElement('small', null, ' / ' + containers.length + ' 个'))),
					React.createElement('div', { className: 'dk-stat', key: 's4' },
						React.createElement('div', { className: 'dk-stat-label' }, '镜像 · 磁盘'),
						React.createElement('div', { className: 'dk-stat-num' }, status && status.ok ? status.images : '—',
							React.createElement('small', null, ' · ' + humanBytes(status && status.ok ? status.disk : null))))),
				React.createElement('div', { className: 'dk-list' }, ...listChildren),
				React.createElement('div', { className: 'dk-foot' },
					React.createElement('span', null, 'Docker ' + (status && status.ok ? status.serverVersion : '—') + ' · 本地'),
					React.createElement('span', null, mode === 'observe' ? '仅观察模式 · 操作按钮已隐藏' : '干预模式 · 可直接操作容器')));
		}

		// ── plugin entry ────────────────────────────────────────────────────────
		const inject = ['slots'];

		function apply(ctx) {
			const slots = ctx.get('slots');
			if (slots === undefined) return;
			const style = document.createElement('style');
			style.dataset.plugin = '@dsh-community/dsh-plugin-container';
			style.dataset.pluginCss = '@dsh-community/dsh-plugin-container/styles';
			style.textContent = CSS;
			ctx.effect(() => {
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, 'dock: styles');
			slots.inject('conversation.view', () => slots.register(
				{ name: 'conversation.view', id: 'docker', order: 10.5, label: () => '容器' },
				(props) => React.createElement(DockerView, Object.assign({}, props, { ctx }))
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
