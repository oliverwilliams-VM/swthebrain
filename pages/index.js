import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { computeMetrics, colorFor } from "../lib/metrics";

const TILE_COLOR = { total: "#579bfc", hist: "#0086c0", hold: "#fdab3d", live: "#00c875", n14: "#579bfc", conf: "#00c875", breach: "#e2445c", miss: "#fdab3d", agree: "#e2445c", await: "#fdab3d" };
const MONTH_ONLY = (d) => d.toLocaleString("en-GB", { month: "long", year: "numeric" });
const pct = (v, t) => (t ? `${Math.round((v / t) * 1000) / 10}%` : "0%");
const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–");
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const needsInfo = (it) => /^needs/i.test(String(it.detailsComplete || "").trim());
const BOARD_URL = "https://vita-mojo-team.monday.com/boards/18432365825/pulses/";

function downloadCsv(rows, name) {
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

function exportNeedsInfo(items) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows = items.filter(needsInfo).map((i) => {
    const gaps = i.detailsComplete.replace(/^needs:?\s*/i, "").split(",").map((x) => x.trim()).filter(Boolean);
    const d = /^\d{4}-\d{2}-\d{2}/.test(i.installDate) ? new Date(`${i.installDate.slice(0, 10)}T00:00:00`) : null;
    return { i, gaps, days: d ? Math.round((d - today) / 86400000) : null };
  }).sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  const head = ["Job", "Stage", "Booking status", "Confirmed install date", "Days to install", "Requested install date", "Date check", "What's missing", "No. of gaps", "Monday link"];
  const out = [head, ...rows.map(({ i, gaps, days }) => [i.name, i.group, i.bookingStatus, i.installDate, days ?? "", i.requestedDate, i.dateCheck, gaps.join("; "), gaps.length, BOARD_URL + i.id])];
  downloadCsv(out, `brain-needs-info-${new Date().toLocaleDateString("sv-SE")}.csv`);
}

function exportPdf() {
  const prev = document.title;
  document.title = `The Brain - Management Dashboard ${new Date().toLocaleDateString("sv-SE")}`;
  const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
  window.addEventListener("afterprint", restore);
  window.print();
}

function Tile({ t, total, onOpen }) {
  const c = TILE_COLOR[t.key] || "#579bfc";
  if (t.value === null) {
    return <div className="tile na" style={{ "--c": "#555" }}><div className="tl"><span className="ti">{t.icon}</span>{t.label}</div><div className="tn">column not found</div></div>;
  }
  const hot = (t.tone === "bad" || t.tone === "warn") && t.value > 0;
  return (
    <button className={`tile ${hot ? "hot" : ""}`} style={{ "--c": c }} onClick={() => onOpen({ title: t.label, items: null, pick: t.pick })}>
      <div className="tl"><span className="ti">{t.icon}</span>{t.label}</div>
      <div className="tn">{t.value}</div>
      <div className="tp">{t.key === "total" ? "all jobs on the board" : `${pct(t.value, total)} of jobs · click for list`}</div>
    </button>
  );
}

function Legend({ rows, onOpen, hover, setHover, total }) {
  return (
    <div className="legend">
      {rows.map((r) => (
        <button key={r.label} className={`lg ${hover === r.label ? "on" : ""}`} onMouseEnter={() => setHover(r.label)} onMouseLeave={() => setHover(null)} onClick={() => r.pick && onOpen({ title: r.label, pick: r.pick })}>
          <i style={{ background: r.color }} />{r.label}<b>{r.value}</b><em>{pct(r.value, total)}</em>
        </button>
      ))}
    </div>
  );
}

function Donut({ rows, hole, size = 210, hover, setHover, onOpen, total }) {
  const R = size / 2, cx = R, cy = R;
  let a0 = -Math.PI / 2;
  const paths = rows.map((r) => {
    const a1 = a0 + (r.value / total) * Math.PI * 2;
    const full = r.value === total;
    const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const gap = rows.length > 1 ? 0.012 : 0;
    const [x0, y0] = p(a0 + gap, R - 3), [x1, y1] = p(a1 - gap, R - 3);
    const [x2, y2] = p(a1 - gap, R * hole), [x3, y3] = p(a0 + gap, R * hole);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    let d;
    if (full) d = hole > 0
      ? `M ${cx} ${cy - R + 3} A ${R - 3} ${R - 3} 0 1 1 ${cx - 0.01} ${cy - R + 3} L ${cx - 0.01} ${cy - R * hole} A ${R * hole} ${R * hole} 0 1 0 ${cx} ${cy - R * hole} Z`
      : `M ${cx} ${cy - R + 3} A ${R - 3} ${R - 3} 0 1 1 ${cx - 0.01} ${cy - R + 3} Z`;
    else d = hole > 0
      ? `M ${x0} ${y0} A ${R - 3} ${R - 3} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${R * hole} ${R * hole} 0 ${large} 0 ${x3} ${y3} Z`
      : `M ${cx} ${cy} L ${x0} ${y0} A ${R - 3} ${R - 3} 0 ${large} 1 ${x1} ${y1} Z`;
    a0 = a1;
    return <path key={r.label} d={d} fill={r.color} className={hover === r.label ? "on" : ""} onMouseEnter={() => setHover(r.label)} onMouseLeave={() => setHover(null)} onClick={() => r.pick && onOpen({ title: r.label, pick: r.pick })}><title>{`${r.label}: ${r.value} (${pct(r.value, total)})`}</title></path>;
  });
  const hv = rows.find((r) => r.label === hover);
  return (
    <svg className={`donut ${hover ? "dim" : ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: "100%" }}>
      {paths}
      {hole > 0 && (
        <g textAnchor="middle" pointerEvents="none">
          <text x={cx} y={cy + 4} fill="#f2f4f6" fontSize="28" fontWeight="700">{hv ? hv.value : total}</text>
          <text x={cx} y={cy + 24} fill="#97a1ad" fontSize="11">{hv ? pct(hv.value, total) : "total"}</text>
        </g>
      )}
    </svg>
  );
}

function PieCard({ title, rows, hole = 0, onOpen, note }) {
  const [hover, setHover] = useState(null);
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="panel">
      <h3>{title}{note && <small>{note}</small>}</h3>
      {total ? (
        <div className="chart-row">
          <Donut rows={rows} hole={hole} hover={hover} setHover={setHover} onOpen={onOpen} total={total} />
          <Legend rows={rows} onOpen={onOpen} hover={hover} setHover={setHover} total={total} />
        </div>
      ) : <div className="empty">No data (column not found or empty)</div>}
    </div>
  );
}

function wrap(label, n = 22) {
  const words = label.split(" "); const lines = []; let cur = "";
  words.forEach((w) => { if ((cur + " " + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
  if (cur) lines.push(cur);
  return lines.length > 3 ? [...lines.slice(0, 2), lines.slice(2).join(" ").slice(0, n - 1) + "…"] : lines;
}

function Bars({ rows, height = 280, W = 900, color = "#579bfc", onOpen }) {
  if (!rows.length) return <div className="empty">No data</div>;
  const padL = 34, padB = 62, padT = 26;
  const max = Math.max(...rows.map((r) => r.value));
  const step = max <= 8 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : 50;
  const top = Math.ceil(max / step) * step || step;
  const slot = (W - padL) / rows.length;
  const bw = Math.min(110, slot - 36);
  const y = (v) => padT + (height - padT - padB) * (1 - v / top);
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }}>
      {ticks.map((v) => (
        <g key={v}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="#232932" strokeDasharray={v ? "3 4" : ""} /><text x={padL - 8} y={y(v) + 4} fill="#67717d" fontSize="11" textAnchor="end">{v}</text></g>
      ))}
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        const h = Math.max(2, y(0) - y(r.value));
        return (
          <g key={r.label} className="bar" onClick={() => r.pick && onOpen({ title: r.label, pick: r.pick })}>
            <rect x={cx - bw / 2} y={y(0) - h} width={bw} height={h} fill={r.color || color} rx="5"><title>{`${r.label}: ${r.value}`}</title></rect>
            <text x={cx} y={y(0) - h - 8} fill="#f2f4f6" fontSize="13" fontWeight="700" textAnchor="middle">{r.value}</text>
            <text x={cx} y={height - padB + 17} fill="#97a1ad" fontSize="11" textAnchor="middle">{wrap(r.label).map((l, j) => <tspan key={j} x={cx} dy={j ? 13 : 0}>{l}</tspan>)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Progress({ rows, confirmedPct, onOpen }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return <div className="empty">No data</div>;
  return (
    <>
      <div className="chart-row" style={{ flexWrap: "nowrap", justifyContent: "stretch", gap: "1.2rem" }}>
        <div className="pct-big">{confirmedPct}%<small>confirmed</small></div>
        <div className="stack">
          {rows.map((r) => <div key={r.label} title={`${r.label}: ${r.value}`} onClick={() => r.pick && onOpen({ title: r.label, pick: r.pick })} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />)}
        </div>
      </div>
      <div className="cal-legend" style={{ marginTop: "1rem" }}>{rows.map((r) => <span key={r.label}><i style={{ background: r.color }} />{r.label} · {r.value}</span>)}</div>
    </>
  );
}

function Calendar({ events, groups, onOpen, items }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const offset = (cursor.getDay() + 6) % 7;
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
  const todayK = new Date().toLocaleDateString("sv-SE");
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i >= 35 && d.getMonth() !== cursor.getMonth()) break;
    const k = d.toLocaleDateString("sv-SE");
    cells.push({ d, k, ev: events[k] || [], out: d.getMonth() !== cursor.getMonth() });
  }
  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  return (
    <div className="panel">
      <h3>🗓️ Install calendar<span className="cal-nav"><span>{MONTH_ONLY(cursor)}</span><button className="btn" onClick={() => shift(-1)}>‹</button><button className="btn" onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button><button className="btn" onClick={() => shift(1)}>›</button></span></h3>
      <div className="cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <div key={x} className="dow">{x}</div>)}
        {cells.map((c) => (
          <button key={c.k} className={`cell ${c.out ? "out" : ""} ${c.k === todayK ? "today" : ""}`} onClick={() => c.ev.length && onOpen({ title: `Installs on ${fmtDate(c.k)}`, pick: (it) => String(it.installDate).slice(0, 10) === c.k })}>
            <div className="dn"><span>{String(c.d.getDate()).padStart(2, "0")}</span></div>
            {c.ev.slice(0, 2).map((e) => <div key={e.id} className="chip" style={{ background: e.color }} title={`${e.name} (${e.group})`}>{e.name}</div>)}
            {c.ev.length > 2 && <div className="more">+{c.ev.length - 2} more</div>}
          </button>
        ))}
      </div>
      <div className="cal-legend">{groups.map((g) => <span key={g.id}><i style={{ background: g.color }} />{g.title}</span>)}</div>
    </div>
  );
}

function Drawer({ view, items, onClose }) {
  const [q, setQ] = useState("");
  useEffect(() => { const h = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  const rows = useMemo(() => {
    const base = items.filter(view.pick);
    const t = q.trim().toLowerCase();
    return t ? base.filter((i) => `${i.name} ${i.group} ${i.bookingStatus} ${i.detailsComplete}`.toLowerCase().includes(t)) : base;
  }, [items, view, q]);
  const exportCsv = () => {
    const head = ["Job", "Stage", "Booking status", "Confirmed install date", "Date check", "SLA", "What's missing"];
    const lines = [head, ...rows.map((i) => [i.name, i.group, i.bookingStatus, i.installDate, i.dateCheck, i.sla, i.detailsComplete])].map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" }));
    a.download = `brain-${view.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
  };
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={view.title}>
        <header>
          <div style={{ flex: 1 }}><h4>{view.title}</h4><p>{rows.length} job{rows.length === 1 ? "" : "s"}</p></div>
          <button className="btn" onClick={onClose}>Close ✕</button>
        </header>
        <div className="tools"><input autoFocus placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div>
        <div className="list">
          <table>
            <thead><tr><th>Job</th><th>Stage</th><th>Booking</th><th>Install date</th><th>Date check</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.name}</b>{/^needs/i.test(i.detailsComplete) && <div className="miss">{i.detailsComplete}</div>}</td>
                  <td>{i.group}</td>
                  <td>{i.bookingStatus ? <span className="pill" style={{ borderColor: colorFor(i.bookingStatus) }}>{i.bookingStatus}</span> : "–"}</td>
                  <td>{fmtDate(i.installDate)}</td>
                  <td>{i.dateCheck || "–"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="5" className="empty">Nothing matches.</td></tr>}
            </tbody>
          </table>
        </div>
      </aside>
    </>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState(null);

  const load = (bust = false) => {
    setLoading(true);
    fetch(bust ? `/api/brain?t=${Date.now()}` : "/api/brain")
      .then(async (r) => {
        let json;
        try { json = await r.json(); } catch { throw new Error(`Unexpected response (status ${r.status})`); }
        if (!r.ok) throw new Error(json.error || `Request failed (${r.status})`);
        setData(json); setError(null); setNow(new Date());
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const m = useMemo(() => (data ? computeMetrics(data, now) : null), [data, now]);
  const missing = data ? Object.entries(data.columnsFound).filter(([k, v]) => !v && !["requestedDate", "detailsComplete"].includes(k) && !k.startsWith("kpi")).map(([k]) => k) : [];
  const row = (n) => m?.tiles.filter((t) => (t.row || 1) === n) || [];
  const total = data?.items.length || 0;
  const needsCount = data ? data.items.filter(needsInfo).length : 0;
  const stamp = now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const open = (v) => setView(v);

  return (
    <>
      <Head><title>The Brain – Management Dashboard</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/Subway.png" alt="Subway" className="logo" />
            <div className="divider" />
            <div>
              <h1>🧠 The Brain – Management Dashboard</h1>
              <p className="sub"><span className={`dot ${error ? "off" : ""}`} />{error ? "Update failed" : data ? `Live from Monday · updated ${stamp}` : "Loading…"}</p>
            </div>
          </div>
          <div className="controls">
            <button className="btn" onClick={() => load(true)} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
            <img src="/Vita Mojo_Primary_Dark.png" alt="Vita Mojo" className="logo vm" />
          </div>
        </div>
      </header>
      <main className="main">
        {m && (
          <div className="actions">
            <button className="act primary" onClick={() => exportNeedsInfo(data.items)} disabled={!data.columnsFound.detailsComplete || !needsCount} title="One CSV of every job with anything still missing, soonest install first">
              ⬇ Download all records with missing info{data.columnsFound.detailsComplete ? ` (${needsCount})` : " — column not found"}
            </button>
            <button className="act" onClick={exportPdf}>⬇ Export dashboard to PDF</button>
          </div>
        )}
        {error && <div className="banner err">Couldn't load The Brain: {error}</div>}
        {missing.length > 0 && !error && <div className="banner warn">Couldn't auto-detect board columns for: {missing.join(", ")}. Open /api/brain-check to see the board's columns, then set the matching BRAIN_COL_… variable in Vercel.</div>}
        {!m && !error && <div className="grid g-hero">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}</div>}
        {m && (
          <>
            <div className="section"><h2>Overview</h2><span>click any card or chart for the jobs behind it</span></div>
            <div className="grid g-hero">{row(1).map((t) => <Tile key={t.key} t={t} total={total} onOpen={open} />)}</div>

            <div className="section"><h2>Installs &amp; Apex actions</h2></div>
            <div className="grid g-apex">{[...row(2), ...row(3)].map((t) => <Tile key={t.key} t={t} total={total} onOpen={open} />)}</div>

            <div className="section"><h2>Pipeline</h2></div>
            <div className="panel"><h3>📊 Pipeline by stage<small>jobs per board group</small></h3><Bars rows={m.pipeline} height={300} onOpen={open} /></div>

            <div className="section"><h2>Booking &amp; dates</h2></div>
            <div className="grid g2">
              <div className="panel"><h3>📈 Confirmed installs by month</h3><Bars rows={m.months} W={520} height={270} onOpen={open} /></div>
              <PieCard title="🍩 Apex booking status" rows={m.statusRows} hole={0.58} onOpen={open} />
            </div>
            <div className="grid g2" style={{ marginTop: "0.8rem" }}>
              <div className="panel"><h3>📗 Booking progress<small>share of all jobs</small></h3><Progress rows={m.progressRows} confirmedPct={m.confirmedPct} onOpen={open} /></div>
              <PieCard title="📅 Date check (Apex vs requested)" rows={m.checkRows} hole={0.58} onOpen={open} />
            </div>

            <div className="section"><h2>Health</h2></div>
            <div className="grid g2">
              <PieCard title="⏱️ Apex SLA performance" rows={m.slaRows} hole={0.58} onOpen={open} />
              <PieCard title="⏸️ Hold reasons" rows={m.holdRows} hole={0.58} onOpen={open} />
            </div>

            <div className="section"><h2>Source &amp; schedule</h2></div>
            <div className="grid g2">
              <PieCard title="🧭 Request source" rows={m.sourceRows} hole={0.58} onOpen={open} note="live vs historical" />
              <Calendar events={m.events} groups={data.groups} onOpen={open} items={data.items} />
            </div>
          </>
        )}
        <p className="foot">{data ? `${data.boardName} · ${total} jobs · refreshes every 5 minutes · v3` : ""}</p>
      </main>
      {view && data && <Drawer view={view} items={data.items} onClose={() => setView(null)} />}
    </>
  );
}
