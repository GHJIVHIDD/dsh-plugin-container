window.__ModuleLoader__.load({
	id: "@dsh-community/dsh-plugin-container",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// ── styles ─────────────────────────────────────────────────────────────
		const CSS = `
.dk{--dk-accent:var(--dsw-alias-brand-primary,#5b8cff);--dk-accent2:#38d9c0;--dk-ink:var(--dsw-alias-label-primary,#f3f6fc);--dk-mut:var(--dsw-alias-label-secondary,#8b95ab);--dk-line:var(--dsw-alias-border-l1,rgba(148,163,184,.18));--dk-soft:var(--dsw-alias-bg-layer-2,rgba(148,163,184,.08));--dk-card:var(--dsw-alias-bg-layer-1,rgba(148,163,184,.05));--dk-danger:#ff5c6c;--dk-warn:#f5b942;--dk-good:#35c58f;display:flex;flex-direction:column;height:100%;min-height:0;padding:14px 16px 18px;box-sizing:border-box;font-size:13px;color:var(--dk-ink);position:relative;overflow:hidden;}
.dk *,.dk *::before,.dk *::after{box-sizing:border-box;}
.dk::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(900px 260px at 12% -10%,color-mix(in srgb,var(--dk-accent) 10%,transparent),transparent 60%),radial-gradient(700px 240px at 96% 0%,color-mix(in srgb,var(--dk-accent2) 8%,transparent),transparent 62%);}
.dk-head{position:relative;display:flex;align-items:center;gap:10px;flex:none;min-width:0;flex-wrap:wrap;margin-bottom:12px;}
.dk-title{display:flex;align-items:center;gap:9px;font-weight:650;font-size:14.5px;letter-spacing:.01em;}
.dk-logo{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--dk-accent) 26%,transparent),color-mix(in srgb,var(--dk-accent2) 18%,transparent));border:1px solid color-mix(in srgb,var(--dk-accent) 38%,transparent);box-shadow:0 4px 18px color-mix(in srgb,var(--dk-accent) 22%,transparent);font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-weight:800;font-size:13px;}
.dk-sub{color:var(--dk-mut);font-size:11px;font-weight:500;background:var(--dk-soft);border:1px solid var(--dk-line);padding:2px 8px;border-radius:999px;}
.dk-spacer{flex:1 1 auto;min-width:8px;}
.dk-mode{display:flex;gap:2px;padding:3px;border:1px solid var(--dk-line);border-radius:10px;background:var(--dk-soft);flex:none;}
.dk-mode-btn{height:24px;padding:0 11px;border-radius:7px;border:none;background:transparent;color:var(--dk-mut);font-size:11.5px;line-height:22px;cursor:pointer;white-space:nowrap;font-weight:600;}
.dk-mode-btn:hover{color:var(--dk-ink);}
.dk-mode-btn[data-act='1']{background:var(--dk-card);color:var(--dk-ink);box-shadow:0 1px 8px rgba(0,0,0,.18),inset 0 0 0 1px var(--dk-line);}
.dk-btn{height:28px;padding:0 12px;border-radius:8px;border:1px solid var(--dk-line);background:var(--dk-soft);color:var(--dk-ink);font-size:12px;line-height:26px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;transition:border-color .15s ease,background .15s ease,transform .06s ease;}
.dk-btn:hover:not(:disabled){border-color:var(--dk-accent);background:var(--dk-card);}
.dk-btn:active:not(:disabled){transform:translateY(1px);}
.dk-btn:disabled{opacity:.45;cursor:default;}
.dk-btn-primary{background:linear-gradient(135deg,color-mix(in srgb,var(--dk-accent) 32%,transparent),color-mix(in srgb,var(--dk-accent2) 22%,transparent));border-color:color-mix(in srgb,var(--dk-accent) 45%,transparent);font-weight:650;}
.dk-btn-danger{color:var(--dk-danger);}
.dk-btn-danger[data-confirm='1']{background:color-mix(in srgb,var(--dk-danger) 14%,transparent);border-color:color-mix(in srgb,var(--dk-danger) 55%,transparent);font-weight:700;}
.dk-input{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dk-line);background:var(--dk-card);color:var(--dk-ink);font-size:12px;min-width:0;}
.dk-input::placeholder{color:var(--dk-mut);opacity:.75;}
.dk-input:focus{outline:none;border-color:var(--dk-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dk-accent) 14%,transparent);}
.dk-search{width:min(220px,24vw);}
.dk-stats{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;flex:none;margin-bottom:12px;}
.dk-stat{position:relative;overflow:hidden;border:1px solid var(--dk-line);border-radius:13px;background:linear-gradient(180deg,color-mix(in srgb,var(--dk-card) 88%,transparent),var(--dk-soft));padding:10px 12px 11px;min-width:0;}
.dk-stat::after{content:"";position:absolute;right:-14px;top:-14px;width:58px;height:58px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--s) 16%,transparent),transparent 70%);}
.dk-stat-label{color:var(--dk-mut);font-size:10.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;}
.dk-stat-num{font-size:20px;font-weight:750;line-height:25px;font-variant-numeric:tabular-nums;margin-top:2px;}
.dk-stat-num small{font-size:11px;font-weight:500;color:var(--dk-mut);margin-left:3px;}
.dk-stat-bar{height:4px;border-radius:999px;background:var(--dk-soft);overflow:hidden;margin-top:6px;}
.dk-stat-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--dk-accent),var(--dk-accent2));transition:width .7s cubic-bezier(.4,0,.2,1);}
.dk-error{position:relative;flex:none;display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;border:1px solid color-mix(in srgb,var(--dk-danger) 38%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dk-danger) 9%,transparent);color:var(--dk-danger);font-size:12px;line-height:18px;word-break:break-all;}
.dk-toolbar{position:relative;flex:none;display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;}
.dk-tabs{display:flex;gap:4px;padding:3px;border:1px solid var(--dk-line);border-radius:10px;background:var(--dk-soft);flex:none;}
.dk-tab{height:24px;padding:0 12px;border-radius:7px;border:none;background:transparent;color:var(--dk-mut);font-size:11.5px;line-height:22px;cursor:pointer;font-weight:600;}
.dk-tab[data-act='1']{background:var(--dk-card);color:var(--dk-ink);box-shadow:inset 0 0 0 1px var(--dk-line);}
.dk-filter{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dk-line);background:var(--dk-card);color:var(--dk-ink);font-size:12px;cursor:pointer;}
.dk-list{position:relative;flex:1 1 0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;overscroll-behavior:contain;scrollbar-width:thin;}
.dk-item{flex:none;display:flex;flex-direction:column;min-width:0;}
.dk-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--dk-line);border-radius:12px;background:var(--dk-card);cursor:pointer;transition:border-color .14s ease,background .14s ease,transform .14s ease;min-width:0;}
.dk-row:hover{border-color:color-mix(in srgb,var(--dk-accent) 35%,transparent);background:color-mix(in srgb,var(--dk-card) 92%,transparent);}
.dk-row[data-own='1']{border-left:3px solid var(--dk-accent);}
.dk-row-open{border-bottom-left-radius:0;border-bottom-right-radius:0;}
.dk-chev{color:var(--dk-mut);font-size:10px;width:12px;flex:none;transition:transform .16s ease;}
.dk-row-open .dk-chev{transform:rotate(90deg);}
.dk-dot{width:8px;height:8px;border-radius:50%;flex:none;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 15%,transparent);}
.dk-dot.running{color:var(--dk-good);background:var(--dk-good);}
.dk-dot.paused,.dk-dot.restarting{color:var(--dk-warn);background:var(--dk-warn);}
.dk-dot.exited{color:#7e8ba5;background:#7e8ba5;}
.dk-dot.dead{color:var(--dk-danger);background:var(--dk-danger);}
.dk-dot.created{color:var(--dk-accent);background:var(--dk-accent);}
.dk-name{font-weight:650;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.dk-meta{color:var(--dk-mut);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.dk-state{margin-left:auto;flex:none;font-size:11px;white-space:nowrap;font-weight:650;padding:2px 8px;border-radius:999px;background:var(--dk-soft);border:1px solid var(--dk-line);}
.dk-state.running{color:var(--dk-good);}
.dk-state.paused,.dk-state.restarting{color:var(--dk-warn);}
.dk-state.dead{color:var(--dk-danger);}
.dk-tag{flex:none;font-size:10px;line-height:16px;padding:0 7px;border-radius:999px;border:1px solid color-mix(in srgb,var(--dk-accent) 42%,transparent);color:var(--dk-accent);font-weight:700;}
.dk-tag.snap{color:var(--dk-accent2);border-color:color-mix(in srgb,var(--dk-accent2) 42%,transparent);}
.dk-actions{display:flex;gap:5px;flex:none;}
.dk-op{height:24px;padding:0 9px;border-radius:7px;border:1px solid var(--dk-line);background:var(--dk-soft);color:var(--dk-mut);font-size:11px;line-height:22px;cursor:pointer;transition:color .13s ease,border-color .13s ease,background .13s ease;}
.dk-op:hover:not(:disabled){color:var(--dk-ink);border-color:var(--dk-accent);background:var(--dk-card);}
.dk-op:disabled{opacity:.45;cursor:default;}
.dk-op.start{color:var(--dk-good);}
.dk-op.stop{color:var(--dk-warn);}
.dk-op.snap{color:var(--dk-accent2);}
.dk-op.rm{color:var(--dk-danger);}
.dk-op[data-confirm='1']{background:color-mix(in srgb,var(--dk-danger) 14%,transparent);border-color:color-mix(in srgb,var(--dk-danger) 55%,transparent);color:var(--dk-danger);font-weight:700;}
.dk-detail{border:1px solid var(--dk-line);border-top:none;border-radius:0 0 12px 12px;padding:11px 12px 13px;background:color-mix(in srgb,var(--dk-soft) 72%,transparent);min-width:0;}
.dk-dtabs{display:flex;gap:4px;margin-bottom:10px;overflow-x:auto;scrollbar-width:none;}
.dk-dtabs::-webkit-scrollbar{display:none;}
.dk-dtab{height:25px;padding:0 12px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dk-mut);font-size:11.5px;line-height:23px;cursor:pointer;white-space:nowrap;font-weight:600;}
.dk-dtab:hover{color:var(--dk-ink);}
.dk-dtab[data-act='1']{background:var(--dk-card);color:var(--dk-ink);border-color:var(--dk-line);}
.dk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 22px;font-size:11.5px;line-height:1.6;}
.dk-cell{display:flex;align-items:baseline;gap:7px;min-width:0;}
.dk-cell-k{color:var(--dk-mut);width:72px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dk-cell-v{word-break:break-all;min-width:0;}
.dk-mono{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);}
.dk-sec{margin-top:11px;}
.dk-sec-title{color:var(--dk-mut);font-size:10.5px;font-weight:700;line-height:16px;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase;}
.dk-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;line-height:17px;}
.dk-table th{color:var(--dk-mut);text-align:left;font-weight:600;padding:4px 8px;border-bottom:1px solid var(--dk-line);white-space:nowrap;}
.dk-table td{color:var(--dk-ink);padding:4px 8px;border-bottom:1px solid var(--dk-line);word-break:break-all;vertical-align:top;}
.dk-table tr:last-child td{border-bottom:none;}
.dk-shell{display:flex;flex-direction:column;border:1px solid rgba(148,163,184,.2);border-radius:10px;overflow:hidden;background:#0a101d;}
.dk-shell-list{display:flex;flex-direction:column;gap:7px;margin-top:7px;max-height:300px;overflow-y:auto;overscroll-behavior:contain;}
.dk-shell-row{flex:none;border:1px solid var(--dk-line);border-left:3px solid rgba(148,163,184,.32);border-radius:9px;background:var(--dk-card);padding:7px 10px 8px;min-width:0;}
.dk-shell-row[data-open='1'] .dk-shell-chev{transform:rotate(90deg);}
.dk-shell-headline{display:flex;align-items:center;gap:7px;min-width:0;cursor:pointer;}
.dk-shell-chev{flex:none;width:12px;font-size:10px;line-height:16px;color:var(--dk-mut);text-align:center;transition:transform .12s ease;}
.dk-shell-dot{width:7px;height:7px;border-radius:50%;background:var(--dk-mut);flex:none;}
.dk-shell-dot.running{background:var(--dk-good);animation:dk-pulse 1.1s ease-in-out infinite;}
.dk-shell-cmd{flex:1 1 auto;min-width:0;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:11.5px;line-height:17px;white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere;}
.dk-shell-time,.dk-shell-dur{flex:none;color:var(--dk-mut);font-size:10px;line-height:15px;white-space:nowrap;font-variant-numeric:tabular-nums;}
.dk-shell-status{flex:none;color:var(--dk-mut);font-size:10px;line-height:15px;padding:0 7px;border-radius:999px;background:var(--dk-soft);border:1px solid var(--dk-line);white-space:nowrap;}
.dk-shell-running{margin-top:6px;color:var(--dk-mut);font-size:11px;line-height:16px;display:flex;align-items:center;gap:6px;}
.dk-shell-running::before{content:'';width:5px;height:5px;border-radius:50%;background:var(--dk-good);animation:dk-pulse 1.1s ease-in-out infinite;flex:none;}
.dk-shell-out{margin:6px 0 0;padding:8px 10px;border:1px solid var(--dk-line);border-radius:7px;background:var(--dk-soft);color:var(--dk-mut);font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:11px;line-height:17px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-height:220px;overflow-y:auto;overscroll-behavior:contain;}
.dk-shell-chip{flex:none;color:var(--dk-mut);font-size:10px;line-height:15px;padding:1px 8px;border:1px solid rgba(148,163,184,.25);border-radius:999px;}
.dk-shell-bar{flex:none;display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(13,20,36,.92);border-bottom:1px solid rgba(148,163,184,.14);}
.dk-shell-title{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:7px;color:#b6c2d8;font-size:11.5px;font-weight:650;line-height:16px;}
.dk-shell-title .dot{width:7px;height:7px;border-radius:50%;background:var(--dk-good);animation:dk-pulse 1.6s ease-in-out infinite;flex:none;}
.dk-shell-title .dot.off{background:#7e8ba5;animation:none;}
.dk-shell-btn{flex:none;height:22px;padding:0 9px;border-radius:6px;border:1px solid rgba(148,163,184,.24);background:transparent;color:#aab8d2;font-size:10.5px;line-height:20px;cursor:pointer;}
.dk-shell-btn:hover{background:rgba(148,163,184,.14);color:#fff;}
.dk-shell-body{flex:1 1 0;min-height:0;max-height:270px;overflow-y:auto;padding:9px 12px;background:#080d18;overscroll-behavior:contain;font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:11.5px;line-height:18px;white-space:pre-wrap;word-break:break-all;color:#cbd6ea;}
.dk-shell-body .dim{color:#5e6f8d;}
.dk-shell-foot{display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(13,20,36,.92);border-top:1px solid rgba(148,163,184,.14);color:#6d7d9c;font-size:10.5px;line-height:16px;}
.dk-empty{flex:1 1 0;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;color:var(--dk-mut);font-size:13px;line-height:20px;text-align:center;padding:20px;}
.dk-empty-ico{font-family:var(--ds-font-family-code,ui-monospace,Menlo,Consolas,monospace);font-size:26px;line-height:1;background:linear-gradient(135deg,var(--dk-accent),var(--dk-accent2));-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:800;}
.dk-empty-sub{color:var(--dk-mut);font-size:11.5px;line-height:18px;opacity:.82;}
.dk-foot{position:relative;flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;color:var(--dk-mut);font-size:10.5px;line-height:16px;}
.dk-toast{position:absolute;right:14px;bottom:14px;z-index:20;max-width:min(360px,80%);padding:9px 13px;border-radius:10px;border:1px solid var(--dk-line);background:var(--dk-card);box-shadow:0 12px 36px rgba(0,0,0,.3);color:var(--dk-ink);font-size:12px;line-height:18px;animation:dk-in .18s ease;}
.dk-toast.ok{border-color:color-mix(in srgb,var(--dk-good) 40%,transparent);}
.dk-toast.err{border-color:color-mix(in srgb,var(--dk-danger) 40%,transparent);}
@keyframes dk-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes dk-pulse{0%,100%{opacity:1}50%{opacity:.28}}
.dk-modal-mask{position:absolute;inset:0;z-index:15;background:rgba(3,7,16,.58);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;}
.dk-modal{width:min(560px,100%);max-height:100%;overflow:auto;border:1px solid var(--dk-line);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#0d1322);box-shadow:0 24px 80px rgba(0,0,0,.45);padding:16px;}
.dk-modal-head{display:flex;align-items:center;gap:10px;margin-bottom:13px;}
.dk-modal-title{font-size:14px;font-weight:700;}
.dk-close{margin-left:auto;height:26px;width:26px;border-radius:7px;border:1px solid var(--dk-line);background:var(--dk-soft);color:var(--dk-mut);cursor:pointer;}
.dk-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;}
.dk-field{display:flex;flex-direction:column;gap:5px;min-width:0;}
.dk-field.wide{grid-column:1 / -1;}
.dk-field textarea{min-height:70px;resize:vertical;}
.dk-label{font-size:11px;color:var(--dk-mut);font-weight:600;}
.dk-hint{font-size:10.5px;color:var(--dk-mut);opacity:.8;line-height:15px;}
.dk-modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
.dk-check{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dk-ink);cursor:pointer;}
.dk-check input{accent-color:var(--dk-accent);}
@media (max-width:900px){.dk-stats{grid-template-columns:repeat(2,1fr);}}
@media (prefers-reduced-motion: reduce){.dk *,.dk *::before,.dk *::after{animation:none!important;transition:none!important;}}
`;

		// ── helpers ────────────────────────────────────────────────────────────
		function api(path, params) {
			let url = "/dock-api/" + path;
			if (params) {
				const keys = Object.keys(params);
				if (keys.length > 0) url += "?" + keys.map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k])).join("&");
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
			let out = "";
			let i = 0;
			const esc = String.fromCharCode(27);
			while (i < s.length) {
				const c = s[i];
				if (c === esc) {
					i++;
					if (s[i] === "[") {
						i++;
						while (i < s.length && !/[a-zA-Z]/.test(s[i])) i++;
						i++;
					} else if (s[i] === "]") {
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
			if (line.length > 21 && line[4] === "-" && line[7] === "-" && line[10] === "T") {
				const z = line.indexOf("Z ");
				if (z >= 0 && z < 40) return line.slice(z + 2);
			}
			return line;
		}
		function cleanDelta(delta) {
			return String(delta || "").split("\r").join("\n").split("\n").map(stripTs).join("\n");
		}
		function fmtTime(iso) {
			if (!iso) return "—";
			const s = String(iso);
			const ok = s.length >= 19 && s[4] === "-" && s[7] === "-" && (s[10] === " " || s[10] === "T") && s[13] === ":" && s[16] === ":";
			return ok ? s.slice(5, 19) : s.slice(0, 40);
		}
		function humanBytes(n) {
			if (!n && n !== 0) return "—";
			if (n < 1024) return n + " B";
			const units = ["KB", "MB", "GB", "TB"];
			let v = n;
			let i = -1;
			do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
			return v.toFixed(1) + " " + units[i];
		}
		function pct(n) {
			if (n == null) return 0;
			return Math.max(0, Math.min(100, Number(n) || 0));
		}
		function portList(ports) {
			if (!ports) return "—";
			if (typeof ports === "string") return ports || "—";
			if (typeof ports !== "object") return "—";
			const out = [];
			for (const k of Object.keys(ports)) {
				const binds = ports[k] || [];
				for (const b of binds) out.push((b.HostIp ? b.HostIp + ":" : "") + b.HostPort + "→" + k);
				if (!binds.length) out.push(k);
			}
			return out.join(", ") || "—";
		}
		function fmtDur(ms) {
			if (ms == null) return "";
			if (ms < 1000) return ms + "ms";
			const s = ms / 1000;
			if (s < 60) return s.toFixed(1) + "s";
			const m = Math.floor(s / 60);
			return m + "m " + String(Math.round(s % 60)).padStart(2, "0") + "s";
		}
		function shellStatusText(e) {
			if (e.status === "running") return "运行中";
			if (e.status === "bad" || e.status === "error") {
				if (e.exitCode !== null && e.exitCode !== 0) return "退出码 " + e.exitCode;
				return "失败";
			}
			return "成功";
		}
		const STATE_LABEL = { running: "运行中", paused: "已暂停", exited: "已退出", dead: "已终止", created: "已创建", restarting: "重启中" };
		const STATE_CLASS = { running: " running", paused: " paused", dead: " dead", restarting: " restarting" };

		// ── small components ────────────────────────────────────────────────────
		function StatCard(props) {
			const fill = pct(props.pct);
			return React.createElement("div", { className: "dk-stat", style: { "--s": props.color || "var(--dk-accent)" } },
				React.createElement("div", { className: "dk-stat-label" }, props.label),
				React.createElement("div", { className: "dk-stat-num" }, props.num, props.small ? React.createElement("small", null, props.small) : null),
				props.pct != null ? React.createElement("div", { className: "dk-stat-bar" },
					React.createElement("div", { className: "dk-stat-fill", style: { width: fill.toFixed(1) + "%" } })) : null);
		}

		function ShellRow(props) {
			const entry = props.entry;
			const [open, setOpen] = React.useState(false);
			const canExpand = entry.status !== "running";
			const durationMs = entry.durationMs != null ? entry.durationMs : (entry.endTime && entry.startTime ? entry.endTime - entry.startTime : null);
			const toggle = () => { if (canExpand) setOpen(!open); };
			const onKeyDown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
			const kids = [
				React.createElement("div", { className: "dk-shell-headline", role: "button", tabIndex: 0, "aria-expanded": open ? "true" : "false", onClick: toggle, onKeyDown: onKeyDown, title: canExpand ? (open ? "点击收起输出" : "点击展开输出") : undefined },
					React.createElement("span", { className: "dk-shell-chev" }, "▸"),
					React.createElement("span", { className: "dk-shell-dot" + (entry.status === "running" ? " running" : "") }),
					React.createElement("code", { className: "dk-shell-cmd" }, "$ " + entry.command),
					React.createElement("span", { className: "dk-shell-time" }, fmtTime(entry.startTime)),
					durationMs !== null && durationMs !== undefined ? React.createElement("span", { className: "dk-shell-dur" }, fmtDur(durationMs)) : null,
					React.createElement("span", { className: "dk-shell-status" }, shellStatusText(entry)),
				),
			];
			if (entry.status === "running") kids.push(React.createElement("div", { className: "dk-shell-running" }, "命令执行中，完成后将显示结果…"));
			else if (open) {
				const output = [];
				if (entry.stdout) output.push(entry.stdout);
				if (entry.stderr) output.push(entry.stderr);
				kids.push(React.createElement("pre", { className: "dk-shell-out" }, output.length > 0 ? output.join("\n") : "(无输出)"));
			}
			return React.createElement("div", { className: "dk-shell-row", "data-status": entry.status, "data-open": open ? "1" : "0" }, ...kids);
		}

		function CreateModal(props) {
			const [form, setForm] = React.useState({ image: "alpine", name: "", command: "sleep 3600", env: "", ports: "", volumes: "", network: "", cpus: "", memory: "", disk_quota: "", shm_size: "", restart: "", isolate_network: false, isolated: false, tty: false });
			const set = (k) => (e) => setForm((f) => Object.assign({}, f, { [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
			const submit = () => {
				if (!form.image.trim()) return;
				const splitLines = (s) => String(s || "").split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
				props.onSubmit({
					image: form.image.trim(),
					name: form.name.trim(),
					command: form.command.trim(),
					env: splitLines(form.env).join("|||"),
					ports: splitLines(form.ports).join("|||"),
					volumes: splitLines(form.volumes).join("|||"),
					network: form.network.trim(),
					cpus: form.cpus.trim(),
					memory: form.memory.trim(),
					disk_quota: form.disk_quota.trim(),
					shm_size: form.shm_size.trim(),
					restart: form.restart.trim(),
					isolated: form.isolated,
					isolate_network: form.isolate_network,
					tty: form.tty,
				});
			};
			return React.createElement("div", { className: "dk-modal-mask", onClick: (e) => { if (e.target === e.currentTarget) props.onClose(); } },
				React.createElement("div", { className: "dk-modal" },
					React.createElement("div", { className: "dk-modal-head" },
						React.createElement("span", { className: "dk-modal-title" }, "创建沙箱容器"),
						React.createElement("button", { type: "button", className: "dk-close", onClick: props.onClose, "aria-label": "关闭" }, "×")),
					React.createElement("div", { className: "dk-form" },
						React.createElement("label", { className: "dk-field wide" },
							React.createElement("span", { className: "dk-label" }, "镜像 *"),
							React.createElement("input", { className: "dk-input", value: form.image, onChange: set("image"), placeholder: "alpine / debian:12 / python:3.12-slim", autoFocus: true })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "容器名"),
							React.createElement("input", { className: "dk-input", value: form.name, onChange: set("name"), placeholder: "留空自动生成" })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "CPU 配额"),
							React.createElement("input", { className: "dk-input", value: form.cpus, onChange: set("cpus"), placeholder: "如 2" })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "内存上限"),
							React.createElement("input", { className: "dk-input", value: form.memory, onChange: set("memory"), placeholder: "如 512m" })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "/dev/shm"),
							React.createElement("input", { className: "dk-input", value: form.shm_size, onChange: set("shm_size"), placeholder: "如 64m" })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "磁盘配额"),
							React.createElement("input", { className: "dk-input", value: form.disk_quota, onChange: set("disk_quota"), placeholder: "如 10G(需 daemon 支持)" })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "网络"),
							React.createElement("input", { className: "dk-input", value: form.network, onChange: set("network"), placeholder: "默认 dsh-sandbox" })),
						React.createElement("label", { className: "dk-field" },
							React.createElement("span", { className: "dk-label" }, "重启策略"),
							React.createElement("input", { className: "dk-input", value: form.restart, onChange: set("restart"), placeholder: "如 unless-stopped" })),
						React.createElement("label", { className: "dk-field wide" },
							React.createElement("span", { className: "dk-label" }, "启动命令 / 初始化脚本"),
							React.createElement("textarea", { className: "dk-input", value: form.command, onChange: set("command"), placeholder: "sleep 3600" })),
						React.createElement("label", { className: "dk-field wide" },
							React.createElement("span", { className: "dk-label" }, "端口映射 (每行一个)"),
							React.createElement("textarea", { className: "dk-input", rows: 2, value: form.ports, onChange: set("ports"), placeholder: "8080:80" })),
						React.createElement("label", { className: "dk-field wide" },
							React.createElement("span", { className: "dk-label" }, "环境变量 (每行一个 K=V)"),
							React.createElement("textarea", { className: "dk-input", rows: 2, value: form.env, onChange: set("env"), placeholder: "FOO=bar" })),
						React.createElement("label", { className: "dk-field wide" },
							React.createElement("span", { className: "dk-label" }, "卷挂载 (每行一个 /host:/data)"),
							React.createElement("textarea", { className: "dk-input", rows: 2, value: form.volumes, onChange: set("volumes"), placeholder: "/host:/data" })),
						React.createElement("label", { className: "dk-check" },
							React.createElement("input", { type: "checkbox", checked: form.isolate_network, onChange: set("isolate_network") }),
							"仅内部隔离网络"),
						React.createElement("label", { className: "dk-check" },
							React.createElement("input", { type: "checkbox", checked: form.isolated, onChange: set("isolated") }),
							"完全无网络"),
						React.createElement("label", { className: "dk-check" },
							React.createElement("input", { type: "checkbox", checked: form.tty, onChange: set("tty") }),
							"分配 TTY")),
					React.createElement("div", { className: "dk-modal-foot" },
						React.createElement("button", { type: "button", className: "dk-btn", onClick: props.onClose }, "取消"),
						React.createElement("button", { type: "button", className: "dk-btn dk-btn-primary", disabled: props.busy, onClick: submit }, props.busy ? "创建中…" : "创建并启动"))));
		}

		function SnapshotModal(props) {
			const [note, setNote] = React.useState("");
			return React.createElement("div", { className: "dk-modal-mask", onClick: (e) => { if (e.target === e.currentTarget) props.onClose(); } },
				React.createElement("div", { className: "dk-modal", style: { width: "min(420px,100%)" } },
					React.createElement("div", { className: "dk-modal-head" },
						React.createElement("span", { className: "dk-modal-title" }, "创建快照 — " + props.container),
						React.createElement("button", { type: "button", className: "dk-close", onClick: props.onClose, "aria-label": "关闭" }, "×")),
					React.createElement("div", { className: "dk-hint" }, "快照基于 docker commit 创建镜像,可随时 docker_restore 回滚;按需共享底层存储。"),
					React.createElement("label", { className: "dk-field", style: { marginTop: 12 } },
						React.createElement("span", { className: "dk-label" }, "备注"),
						React.createElement("textarea", { className: "dk-input", value: note, onChange: (e) => setNote(e.target.value), placeholder: "可选,描述当前状态" })),
					React.createElement("div", { className: "dk-modal-foot" },
						React.createElement("button", { type: "button", className: "dk-btn", onClick: props.onClose }, "取消"),
						React.createElement("button", { type: "button", className: "dk-btn dk-btn-primary", disabled: props.busy, onClick: () => props.onSubmit(note) }, props.busy ? "快照中…" : "创建快照"))));
		}


		// ── main view ────────────────────────────────────────────────────────────
		function DockerView(props) {
			const sessionId = props.sessionId;
			const [status, setStatus] = React.useState(null);
			const [error, setError] = React.useState(null);
			const [mode, setMode] = React.useState("observe");
			const [view, setView] = React.useState("containers");
			const [filter, setFilter] = React.useState("all");
			const [query, setQuery] = React.useState("");
			const [expanded, setExpanded] = React.useState(null);
			const [tabOf, setTabOf] = React.useState({});
			const [details, setDetails] = React.useState({});
			const [shellOf, setShellOf] = React.useState({});
			const [logsOf, setLogsOf] = React.useState({});
			const [topOf, setTopOf] = React.useState({});
			const [logFollow, setLogFollow] = React.useState({});
			const [opBusy, setOpBusy] = React.useState(null);
			const [confirmRm, setConfirmRm] = React.useState(null);
			const [showCreate, setShowCreate] = React.useState(false);
			const [createBusy, setCreateBusy] = React.useState(false);
			const [snapTarget, setSnapTarget] = React.useState(null);
			const [snapBusy, setSnapBusy] = React.useState(false);
			const [toast, setToast] = React.useState(null);
			const shellRefs = React.useRef({});
			const shellBodyRefs = React.useRef({});
			const stickRefs = React.useRef({});

			const notify = React.useCallback((text, ok) => {
				setToast({ text, ok });
				window.setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), 3200);
			}, []);

			const load = React.useCallback(async () => {
				try {
					const r = await api("status", { session: sessionId });
					setStatus(r);
					setError(null);
				} catch (e) {
					setError(String((e && e.message) || e));
				}
			}, [sessionId]);

			React.useEffect(() => {
				let stopped = false;
				const tick = () => api("status", { session: sessionId }).then((r) => { if (!stopped) { setStatus(r); setError(null); } }, (e) => { if (!stopped) setError(String((e && e.message) || e)); });
				tick();
				const t = window.setInterval(tick, 5000);
				return () => { stopped = true; window.clearInterval(t); };
			}, [sessionId]);

			React.useEffect(() => {
				if (!expanded) return;
				const name = expanded;
				const refresh = () => {
					safe(api("inspect", { container: name, session: sessionId })).then((r) => setDetails((d) => Object.assign({}, d, { [name]: r })));
					safe(api("top", { container: name })).then((r) => setTopOf((t) => Object.assign({}, t, { [name]: r })));
				};
				refresh();
				const t = window.setInterval(refresh, 6000);
				return () => window.clearInterval(t);
			}, [expanded, sessionId]);

			React.useEffect(() => {
				if (!expanded) return;
				const name = expanded;
				const refresh = () => {
					safe(api("shell", { container: name })).then((r) => setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, (s && s[name]) || {}, { recent: r.entries || [] }) })));
					safe(api("logs", { container: name, tail: 500 })).then((r) => { if (r && r.ok) setLogsOf((l) => Object.assign({}, l, { [name]: String(r.text || "") })); });
				};
				refresh();
				const t = window.setInterval(refresh, 8000);
				return () => window.clearInterval(t);
			}, [expanded, sessionId]);

			const pollShell = React.useCallback((name) => {
				const ref = shellRefs.current[name] || (shellRefs.current[name] = { so: 0, se: 0, partial: "" });
				return safe(api("watch", { container: name, so: ref.so, se: ref.se })).then((r) => {
					if (!r || r.ok === false) return;
					ref.so = r.stdoutOffset;
					ref.se = r.stderrOffset;
					const delta = cleanDelta(r.delta);
					if (delta) ref.partial = (ref.partial + delta).slice(-200000);
					setShellOf((s) => {
						const cur = s[name] || {};
						const lines = String(ref.partial || "").split("\n").map((l) => (l.length ? l : " "));
						return Object.assign({}, s, { [name]: Object.assign({}, cur, { lines, ended: !!r.ended, error: r.endError || null }) });
					});
				});
			}, []);

			const shellHalted = !!(expanded && shellOf[expanded] && (shellOf[expanded].paused || shellOf[expanded].ended));
			React.useEffect(() => {
				if (!expanded || tabOf[expanded] !== "shell" || shellHalted) return;
				const name = expanded;
				pollShell(name);
				const t = window.setInterval(() => pollShell(name), 1500);
				return () => window.clearInterval(t);
			}, [expanded, tabOf, shellHalted, pollShell]);

			React.useEffect(() => {
				if (!expanded || tabOf[expanded] !== "logs" || !logFollow[expanded]) return;
				const name = expanded;
				const tick = () => safe(api("logs", { container: name, tail: 500 })).then((r) => { if (r && r.ok) setLogsOf((l) => Object.assign({}, l, { [name]: String(r.text || "") })); });
				tick();
				const t = window.setInterval(tick, 2500);
				return () => window.clearInterval(t);
			}, [expanded, tabOf, logFollow]);

			React.useEffect(() => {
				const el = shellBodyRefs.current[expanded];
				if (el && stickRefs.current[expanded]) el.scrollTop = el.scrollHeight;
			}, [shellOf, expanded]);

			const toggle = (name) => setExpanded((cur) => (cur === name ? null : name));
			const setTab = (name, t) => setTabOf((m) => Object.assign({}, m, { [name]: t }));
			const onScroll = (name) => (e) => {
				const el = e.currentTarget;
				stickRefs.current[name] = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
			};

			const runOp = (name, action) => {
				if (opBusy) return;
				if (action === "rm" && confirmRm !== name) {
					setConfirmRm(name);
					window.setTimeout(() => setConfirmRm((cur) => (cur === name ? null : cur)), 3000);
					return;
				}
				setConfirmRm(null);
				setOpBusy(name);
				api("op", { container: name, action, session: sessionId })
					.then(() => {
						setOpBusy(null);
						notify((action === "rm" ? "已删除 " : action === "start" ? "已启动 " : action === "restart" ? "已重启 " : "已停止 ") + name, true);
						if (action === "rm" && expanded === name) setExpanded(null);
						load();
					})
					.catch((e) => {
						setOpBusy(null);
						notify(String((e && e.message) || e), false);
						load();
					});
			};

			const doCreate = (form) => {
				setCreateBusy(true);
				api("create", Object.assign({}, form, { session: sessionId }))
					.then((r) => {
						setCreateBusy(false);
						setShowCreate(false);
						notify("容器 " + r.container + " 创建成功", true);
						load();
					})
					.catch((e) => {
						setCreateBusy(false);
						notify(String((e && e.message) || e), false);
					});
			};

			const doSnapshot = (note) => {
				if (!snapTarget) return;
				setSnapBusy(true);
				api("snapshot", { container: snapTarget, note, session: sessionId })
					.then(() => {
						setSnapBusy(false);
						setSnapTarget(null);
						notify("快照创建成功", true);
						load();
					})
					.catch((e) => {
						setSnapBusy(false);
						notify(String((e && e.message) || e), false);
					});
			};

			const restoreSnap = (snap) => {
				api("restore", { snapshot: snap, session: sessionId })
					.then(() => { notify("已从快照 " + snap + " 恢复", true); load(); })
					.catch((e) => notify(String((e && e.message) || e), false));
			};

			const deleteSnap = (snap) => {
				if (!window.confirm("确定永久删除快照 " + snap + " ?")) return;
				api("snapshot-delete", { snapshot: snap, session: sessionId })
					.then(() => { notify("快照 " + snap + " 已删除", true); load(); })
					.catch((e) => notify(String((e && e.message) || e), false));
			};


			const renderShellBody = (st, name) => {
				const recent = st.recent || [];
				const kids = [];
				kids.push(React.createElement("div", { className: "dk-sec", key: "recent" },
					React.createElement("div", { className: "dk-sec-title" }, "docker_exec 执行记录 (最近 10 条)"),
					recent.length === 0
						? React.createElement("div", { className: "dk-empty-sub" }, "暂无记录 — 智能体执行 docker_exec 后此处会实时出现")
						: React.createElement("div", { className: "dk-shell-list" }, recent.map((entry) => React.createElement(ShellRow, { key: entry.id, entry: entry })))));
				kids.push(React.createElement("div", { className: "dk-sec", key: "live" },
					React.createElement("div", { className: "dk-sec-title" }, "容器 stdout/stderr 只读实时观察"),
					React.createElement("div", { className: "dk-shell" },
						React.createElement("div", { className: "dk-shell-bar" },
							React.createElement("div", { className: "dk-shell-title" },
								React.createElement("span", { className: "dot" + (st.paused || st.ended ? " off" : "") }),
								React.createElement("span", null, st.ended ? "观察已结束" : (st.paused ? "已暂停" : "实时观察中"))),
							React.createElement("span", { className: "dk-shell-chip" }, "只读"),
							React.createElement("button", { type: "button", className: "dk-shell-btn", onClick: () => setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, s[name], { paused: !(s[name] || {}).paused }) })) }, st.paused ? "继续" : "暂停"),
							React.createElement("button", { type: "button", className: "dk-shell-btn", onClick: () => { const ref = shellRefs.current[name] || (shellRefs.current[name] = { so: 0, se: 0, partial: "" }); ref.partial = ""; stickRefs.current[name] = true; setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, s[name], { lines: [] }) })); } }, "清空"),
							React.createElement("button", { type: "button", className: "dk-shell-btn", onClick: () => { const ref = shellRefs.current[name] || (shellRefs.current[name] = { so: 0, se: 0, partial: "" }); ref.so = 0; ref.se = 0; ref.partial = ""; stickRefs.current[name] = true; setShellOf((s) => Object.assign({}, s, { [name]: Object.assign({}, s[name], { lines: [], ended: false, error: null }) })); pollShell(name); } }, "重连")),
						React.createElement("div", { className: "dk-shell-body", ref: (el) => { shellBodyRefs.current[name] = el; }, onScroll: onScroll(name) },
							(st.lines || []).length ? (st.lines || []).map((l, i) => React.createElement("div", { key: i }, l.length ? l : "\u00a0")) : React.createElement("div", { className: "dim" }, st.error ? st.error : "等待容器输出…")),
						React.createElement("div", { className: "dk-shell-foot" },
							React.createElement("span", null, (st.lines || []).length + " 行"),
							st.error ? React.createElement("span", null, st.error) : null))));
				return kids;
			};

			const renderDetail = (c) => {
				if (expanded !== c.name) return null;
				const d = details[c.name];
				const data = d && d.ok ? d.data : null;
				const tab = tabOf[c.name] || "overview";
				const kids = [];
				const cell = (k, v) => React.createElement("span", { className: "dk-cell", key: k },
					React.createElement("span", { className: "dk-cell-k" }, k),
					React.createElement("span", { className: "dk-cell-v" }, v == null || v === "" ? "—" : String(v)));
				kids.push(React.createElement("div", { className: "dk-dtabs", key: "tabs" },
					[{ id: "overview", label: "概览" }, { id: "logs", label: "日志" }, { id: "shell", label: "Shell" }, { id: "jobs", label: "任务" }, { id: "ports", label: "端口" }].map((t) =>
						React.createElement("button", { type: "button", key: t.id, className: "dk-dtab", "data-act": tab === t.id ? "1" : "0", onClick: () => setTab(c.name, t.id) }, t.label))));
				if (tab === "overview") {
					if (!data) {
						kids.push(React.createElement("div", { className: "dk-empty-sub", key: "loading" }, "加载中…"));
					} else {
						const res = data.resources || {};
						const rt = data.runtime || {};
						const state = data.state || {};
						const netPol = data.networkPolicy;
						const policyText = netPol
							? (netPol.isolated ? "完全隔离" : (netPol.publicAccess ? "公网" : "禁公网") + " · " + (netPol.internalAccess ? "内网互通" : "禁内网"))
							: "默认(公网 + 内网)";
						kids.push(React.createElement("div", { className: "dk-grid", key: "grid" },
							cell("状态", (state.Status || "—") + (state.ExitCode ? " · exit " + state.ExitCode : "")),
							cell("镜像", data.image),
							cell("归属", data.owner ? (data.owner.title || data.owner.sessionId) : "未登记"),
							cell("IP / 网络", (data.ip || "—") + " / " + (data.networks || []).join(", ")),
							cell("创建时间", fmtTime(data.created)),
							cell("重启策略", data.restartPolicy),
							cell("端口", portList(data.ports)),
							cell("网络策略", policyText),
							cell("工作目录", data.workingDir),
							cell("用户", data.user || "默认"),
							cell("CPU 限额", res.cpus || "默认"),
							cell("内存限额", res.memoryBytes ? humanBytes(res.memoryBytes) : "默认"),
							cell("Swap 限额", res.memorySwapBytes && res.memorySwapBytes !== -1 ? humanBytes(res.memorySwapBytes) : "默认"),
							cell("/dev/shm", res.shmBytes ? humanBytes(res.shmBytes) : "默认"),
							cell("PID 限额", res.pidsLimit || "默认"),
							cell("磁盘配额", res.diskQuota || "默认"),
							cell("容器 ID", data.id ? String(data.id).slice(0, 19) : "—")));
						if (rt && (rt.uptime || rt.memory || rt.rootFs)) {
							kids.push(React.createElement("div", { className: "dk-sec", key: "runtime" },
								React.createElement("div", { className: "dk-sec-title" }, "容器内实时状态"),
								React.createElement("div", { className: "dk-grid" },
									cell("Uptime", rt.uptime),
									cell("Load", rt.load),
									cell("内存(总量)", rt.memory ? humanBytes(rt.memory.totalBytes) : "—"),
									cell("内存(可用)", rt.memory ? humanBytes(rt.memory.availableBytes) : "—"),
									cell("根分区(总量)", rt.rootFs ? humanBytes(rt.rootFs.totalBytes) : "—"),
									cell("根分区(可用)", rt.rootFs ? humanBytes(rt.rootFs.availableBytes) : "—"))));
						}
						if (data.mounts && data.mounts.length) {
							const rows = data.mounts.map((m, i) => React.createElement("tr", { key: i },
								React.createElement("td", null, m.type),
								React.createElement("td", null, m.source || "(匿名)"),
								React.createElement("td", null, m.dest),
								React.createElement("td", null, m.rw ? "rw" : "ro")));
							kids.push(React.createElement("div", { className: "dk-sec", key: "mounts" },
								React.createElement("div", { className: "dk-sec-title" }, "挂载 (" + data.mounts.length + ")"),
								React.createElement("table", { className: "dk-table" },
									React.createElement("thead", null, React.createElement("tr", null,
										React.createElement("th", null, "类型"), React.createElement("th", null, "来源"), React.createElement("th", null, "目标"), React.createElement("th", null, "权限"))),
									React.createElement("tbody", null, ...rows))));
						}
					}
				} else if (tab === "logs") {
					const follow = !!logFollow[c.name];
					const text = logsOf[c.name];
					kids.push(React.createElement("div", { className: "dk-shell", key: "logs" },
						React.createElement("div", { className: "dk-shell-bar" },
							React.createElement("div", { className: "dk-shell-title" },
								React.createElement("span", { className: "dot" + (follow ? "" : " off") }),
								React.createElement("span", null, "容器日志" + (follow ? " · 跟随中" : ""))),
							React.createElement("button", { type: "button", className: "dk-shell-btn", onClick: () => setLogFollow((m) => Object.assign({}, m, { [c.name]: !follow })) }, follow ? "停止跟随" : "跟随")),
						React.createElement("div", { className: "dk-shell-body" }, text || "(暂无日志输出)")));
				} else if (tab === "shell") {
					const st = shellOf[c.name] || { lines: [], recent: [], paused: false, ended: false, error: null };
					kids.push(React.createElement("div", { key: "shell" }, renderShellBody(st, c.name)));
				} else if (tab === "jobs") {
					const jobs = (data && data.jobs) || [];
					const rows = jobs.map((j) => React.createElement("tr", { key: j.id },
						React.createElement("td", null, j.id),
						React.createElement("td", null, j.status),
						React.createElement("td", null, j.pid == null ? "—" : j.pid),
						React.createElement("td", null, fmtTime(j.startTime)),
						React.createElement("td", { className: "dk-mono" }, j.command)));
					kids.push(React.createElement("div", { key: "jobs" },
						React.createElement("div", { className: "dk-sec-title" }, "本容器后台任务"),
						jobs.length
							? React.createElement("table", { className: "dk-table" },
								React.createElement("thead", null, React.createElement("tr", null,
									React.createElement("th", null, "任务 ID"), React.createElement("th", null, "状态"), React.createElement("th", null, "PID"), React.createElement("th", null, "开始时间"), React.createElement("th", null, "命令"))),
								React.createElement("tbody", null, ...rows))
							: React.createElement("div", { className: "dk-empty-sub" }, "暂无后台任务")));
				} else {
					const tunnels = (status && status.tunnels || []).filter((t) => t.container === c.name);
					const rows = tunnels.map((t) => React.createElement("tr", { key: t.id },
						React.createElement("td", null, t.id),
						React.createElement("td", null, t.containerPort + " → 127.0.0.1:" + t.hostPort),
						React.createElement("td", null, t.proxy),
						React.createElement("td", null, t.status === "running" ? "运行中" : "已停止")));
					kids.push(React.createElement("div", { key: "ports" },
						React.createElement("div", { className: "dk-sec-title" }, "端口转发 (docker_port_forward)"),
						tunnels.length
							? React.createElement("table", { className: "dk-table" },
								React.createElement("thead", null, React.createElement("tr", null,
									React.createElement("th", null, "隧道 ID"), React.createElement("th", null, "映射"), React.createElement("th", null, "代理容器"), React.createElement("th", null, "状态"))),
								React.createElement("tbody", null, ...rows))
							: React.createElement("div", { className: "dk-empty-sub" }, "暂无端口转发")));
				}
				return React.createElement("div", { className: "dk-detail" }, ...kids);
			};


			const containers = status && status.ok ? status.containers || [] : [];
			const snapshots = status && status.ok ? status.snapshots || [] : [];
			const ownNames = new Set((status && status.own || []).map((o) => o.name));
			let running = 0;
			for (const c of containers) if (c.state === "running") running++;
			const totalCpuPct = status ? pct(status.totalCpuPerc) : 0;
			const totalMemPct = status && status.totalMem ? (status.totalMemBytes || 0) / status.totalMem * 100 : 0;
			const q = String(query || "").trim().toLowerCase();
			const shown = containers.filter((c) => {
				if (filter === "own" && !(c.ownedByThis || ownNames.has(c.name))) return false;
				if (filter === "running" && c.state !== "running") return false;
				if (q && !((c.name || "").toLowerCase().includes(q) || (c.image || "").toLowerCase().includes(q) || (c.state || "").toLowerCase().includes(q))) return false;
				return true;
			});

			const renderContainerRow = (c) => {
				const isOpen = expanded === c.name;
				const busy = opBusy === c.name;
				const isOwn = c.ownedByThis || ownNames.has(c.name);
				const canIntervene = mode === "intervene";
				return React.createElement("div", { key: c.id || c.name, className: "dk-item" },
					React.createElement("div", { className: "dk-row" + (isOpen ? " dk-row-open" : ""), "data-own": isOwn ? "1" : "0", onClick: () => toggle(c.name) },
						React.createElement("span", { className: "dk-chev" }, "▸"),
						React.createElement("span", { className: "dk-dot " + (c.state || "created") }),
						React.createElement("span", { className: "dk-name" }, c.name || "(unnamed)"),
						React.createElement("span", { className: "dk-meta" }, c.image || ""),
						React.createElement("span", { className: "dk-meta" }, c.cpuPerc != null ? c.cpuPerc.toFixed(1) + "% · " + humanBytes(c.memBytes) : ""),
						React.createElement("span", { className: "dk-state" + (STATE_CLASS[c.state] || "") }, STATE_LABEL[c.state] || c.state),
						isOwn ? React.createElement("span", { className: "dk-tag" }, "本会话") : null,
						canIntervene
							? React.createElement("span", { className: "dk-actions", onClick: (e) => e.stopPropagation() },
								React.createElement("button", { type: "button", className: "dk-op start", disabled: c.state === "running" || busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, "start"); } }, "启动"),
								React.createElement("button", { type: "button", className: "dk-op stop", disabled: (c.state !== "running" && c.state !== "paused") || busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, "stop"); } }, "停止"),
								React.createElement("button", { type: "button", className: "dk-op", disabled: c.state !== "running" || busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, "restart"); } }, "重启"),
								React.createElement("button", { type: "button", className: "dk-op snap", disabled: busy, onClick: (e) => { e.stopPropagation(); setSnapTarget(c.name); } }, "快照"),
								React.createElement("button", { type: "button", className: "dk-op rm", "data-confirm": confirmRm === c.name ? "1" : "0", disabled: busy, onClick: (e) => { e.stopPropagation(); runOp(c.name, "rm"); } }, confirmRm === c.name ? "确认删除?" : "删除"))
							: null),
					renderDetail(c));
			};

			const renderSnapshotRow = (s) => {
				const busy = snapBusy;
				return React.createElement("div", { key: s.name, className: "dk-item" },
					React.createElement("div", { className: "dk-row", "data-own": s.ownedByThis ? "1" : "0" },
						React.createElement("span", { className: "dk-dot created" }),
						React.createElement("span", { className: "dk-name" }, s.name),
						React.createElement("span", { className: "dk-meta" }, "来源 " + s.source + " · " + fmtTime(s.createdAt)),
						s.note ? React.createElement("span", { className: "dk-meta" }, s.note) : null,
						React.createElement("span", { className: "dk-state" }, s.wasRunning ? "来源运行中" : "来源已停止"),
						React.createElement("span", { className: "dk-tag snap" }, "快照"),
						mode === "intervene" && s.ownedByThis
							? React.createElement("span", { className: "dk-actions" },
								React.createElement("button", { type: "button", className: "dk-op start", disabled: busy, onClick: () => restoreSnap(s.name) }, "恢复"),
								React.createElement("button", { type: "button", className: "dk-op rm", disabled: busy, onClick: () => deleteSnap(s.name) }, "删除"))
							: null));
			};

			const listChildren = [];
			if (view === "containers") {
				if (containers.length === 0) {
					listChildren.push(React.createElement("div", { className: "dk-empty", key: "empty" },
						React.createElement("div", { className: "dk-empty-ico" }, "⬢"),
						React.createElement("div", null, "暂无容器"),
						React.createElement("div", { className: "dk-empty-sub" }, "点击「创建容器」,或让智能体使用 docker_create / docker_run 创建沙箱")));
				} else if (shown.length === 0) {
					listChildren.push(React.createElement("div", { className: "dk-empty", key: "empty" },
						React.createElement("div", { className: "dk-empty-ico" }, "⌕"),
						React.createElement("div", null, "没有匹配的容器"),
						React.createElement("div", { className: "dk-empty-sub" }, "调整搜索或过滤条件")));
				} else {
					listChildren.push(shown.map(renderContainerRow));
				}
			} else {
				if (snapshots.length === 0) {
					listChildren.push(React.createElement("div", { className: "dk-empty", key: "empty" },
						React.createElement("div", { className: "dk-empty-ico" }, "◈"),
						React.createElement("div", null, "暂无快照"),
						React.createElement("div", { className: "dk-empty-sub" }, "在干预模式对容器点击「快照」,或使用 docker_snapshot")));
				} else {
					listChildren.push(snapshots.map(renderSnapshotRow));
				}
			}

			return React.createElement("div", { className: "dk" },
				React.createElement("div", { className: "dk-head" },
					React.createElement("span", { className: "dk-title" },
						React.createElement("span", { className: "dk-logo" }, "⬢"),
						React.createElement("span", null, "容器沙箱"),
						React.createElement("span", { className: "dk-sub" }, "Docker")),
					React.createElement("div", { className: "dk-mode" },
						React.createElement("button", { type: "button", className: "dk-mode-btn", "data-act": mode === "observe" ? "1" : "0", onClick: () => setMode("observe") }, "仅观察"),
						React.createElement("button", { type: "button", className: "dk-mode-btn", "data-act": mode === "intervene" ? "1" : "0", onClick: () => setMode("intervene") }, "干预")),
					React.createElement("div", { className: "dk-spacer" }),
					mode === "intervene" ? React.createElement("button", { type: "button", className: "dk-btn dk-btn-primary", onClick: () => setShowCreate(true) }, "＋ 创建容器") : null,
					React.createElement("button", { type: "button", className: "dk-btn", onClick: () => load() }, "刷新")),
				error ? React.createElement("div", { className: "dk-error" }, "⚠ " + error) : null,
				React.createElement("div", { className: "dk-stats" },
					React.createElement(StatCard, { label: "容器", num: String(running), small: "/ " + containers.length + " 运行", color: "var(--dk-accent)", pct: containers.length ? running / containers.length * 100 : 0 }),
					React.createElement(StatCard, { label: "镜像 · 磁盘", num: status ? String(status.images || 0) : "—", small: status ? humanBytes(status.diskBytes) : "", color: "var(--dk-accent2)", pct: null }),
					React.createElement(StatCard, { label: "CPU", num: status ? status.totalCpuPerc.toFixed(1) + "%" : "—", small: status ? status.totalCpu + " 核" : "", color: "var(--dk-accent)", pct: totalCpuPct }),
					React.createElement(StatCard, { label: "内存", num: humanBytes(status ? status.totalMemBytes : null), small: status ? "/ " + humanBytes(status.totalMem) : "", color: "var(--dk-accent2)", pct: totalMemPct })),
				React.createElement("div", { className: "dk-toolbar" },
					React.createElement("div", { className: "dk-tabs" },
						React.createElement("button", { type: "button", className: "dk-tab", "data-act": view === "containers" ? "1" : "0", onClick: () => setView("containers") }, "容器 " + containers.length),
						React.createElement("button", { type: "button", className: "dk-tab", "data-act": view === "snapshots" ? "1" : "0", onClick: () => setView("snapshots") }, "快照 " + snapshots.length)),
					view === "containers"
						? React.createElement("select", { className: "dk-filter", value: filter, onChange: (e) => setFilter(e.target.value), "aria-label": "过滤" },
							React.createElement("option", { value: "all" }, "全部容器"),
							React.createElement("option", { value: "own" }, "本会话"),
							React.createElement("option", { value: "running" }, "运行中"))
						: null,
					view === "containers"
						? React.createElement("input", { className: "dk-input dk-search", value: query, onChange: (e) => setQuery(e.target.value), placeholder: "搜索名称 / 镜像 / 状态" })
						: null,
					React.createElement("div", { className: "dk-spacer" }),
					React.createElement("span", { className: "dk-sub" }, "上限 " + (status && status.cap ? status.cap : 64) + " · 每会话 " + (status && status.maxPerSession ? status.maxPerSession : 8))),
				React.createElement("div", { className: "dk-list" }, ...listChildren),
				React.createElement("div", { className: "dk-foot" },
					React.createElement("span", null, "Docker " + (status && status.ok ? status.serverVersion : "—") + " · " + (mode === "observe" ? "仅观察模式 · 写操作已隐藏" : "干预模式 · 可管理容器/快照/任务/端口")),
					React.createElement("span", null, "每 5s 自动刷新 · 与 dsh-plugin-vm-sandbox 同能力集")),
				showCreate ? React.createElement(CreateModal, { busy: createBusy, onSubmit: doCreate, onClose: () => setShowCreate(false) }) : null,
				snapTarget ? React.createElement(SnapshotModal, { container: snapTarget, busy: snapBusy, onSubmit: doSnapshot, onClose: () => setSnapTarget(null) }) : null,
				toast ? React.createElement("div", { className: "dk-toast " + (toast.ok ? "ok" : "err") }, toast.text) : null);
		}


		// ── plugin entry ────────────────────────────────────────────────────────
		const inject = ["slots"];

		function apply(ctx) {
			const slots = ctx.get("slots");
			if (slots === undefined) return;
			const style = document.createElement("style");
			style.dataset.plugin = "@dsh-community/dsh-plugin-container";
			style.dataset.pluginCss = "@dsh-community/dsh-plugin-container/styles";
			style.textContent = CSS;
			ctx.effect(() => {
				document.head.appendChild(style);
				return () => { style.remove(); };
			}, "dock: styles");
			slots.inject("conversation.view", () => slots.register(
				{ name: "conversation.view", id: "docker", order: 10.5, label: () => "容器" },
				(props) => React.createElement(DockerView, { sessionId: props && props.sessionId })
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

