import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { computeMetrics } from "../lib/metrics";

const MONTH_ONLY = (d) => d.toLocaleString("en-GB", { month: "long", year: "numeric" });
const pct = (v, t) => (t ? `${Math.round((v / t) * 1000) / 10}%` : "0%");

function Tile({ t }) {
  return (
    <div className={`tile ${t.tone || ""}`}>
      <div className="tl">{t.icon} {t.label}</div>
      {t.value === null ? <div className="tn na">column not found</div> : <div className="tn">{t.value}</div>}
    </div>
  );
}

function Legend({ rows }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="legend">
      {rows.map((r) => (
        <span key={r.label}><i style={{ background: r.color }} />{r.label}: {pct(r.value, total)}</span>
      ))}
    </div>
  );
}

function Donut({ rows, hole = 0.55, size = 220 }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return <div className="empty">No data</div>;
  const R = size / 2, cx = R, cy = R;
  let a0 = -Math.PI / 2;
  const arcs = rows.map((r) => {
    const a1 = a0 + (r.value / total) * Math.PI * 2;
    const full = r.value === total;
    const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x0, y0] = p(a0, R - 2), [x1, y1] = p(a1 - 1e-4, R - 2);
    const [x2, y2] = p(a1 - 1e-4, R * hole), [x3, y3] = p(a0, R * hole);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = full
      ? `M ${cx} ${cy - R + 2} A ${R - 2} ${R - 2} 0 1 1 ${cx - 0.01} ${cy - R + 2} Z`
      : hole > 0
      ? `M ${x0} ${y0} A ${R - 2} ${R - 2} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${R * hole} ${R * hole} 0 ${large} 0 ${x3} ${y3} Z`
      : `M ${cx} ${cy} L ${x0} ${y0} A ${R - 2} ${R - 2} 0 ${large} 1 ${x1} ${y1} Z`;
    a0 = a1;
    return <path key={r.label} d={d} fill={r.color}><title>{`${r.label}: ${r.value}`}</title></path>;
  });
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: "100%" }}>{arcs}</svg>;
}

function PieCard({ title, rows, hole }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="chart-row"><Donut rows={rows} hole={hole} /><Legend rows={rows} /></div>
      ) : <div className="empty">No data (column not found or empty)</div>}
    </div>
  );
}

function Bars({ rows, height = 260, color = "#579bfc", W = 900 }) {
  if (!rows.length) return <div className="empty">No data</div>;
  const padL = 40, padB = 46, padT = 24;
  const max = Math.max(...rows.map((r) => r.value));
  const step = max <= 10 ? 2 : max <= 30 ? 10 : max <= 60 ? 20 : Math.ceil(max / 4 / 10) * 10;
  const top = Math.ceil(max / step) * step || step;
  const bw = Math.min(120, (W - padL) / rows.length - 40);
  const slot = (W - padL) / rows.length;
  const y = (v) => padT + (height - padT - padB) * (1 - v / top);
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ display: "block" }}>
      {ticks.map((v) => (
        <g key={v}><line x1={padL} x2={W} y1={y(v)} y2={y(v)} stroke="#262b31" /><text x={padL - 8} y={y(v) + 4} fill="#99a2ab" fontSize="11" textAnchor="end">{v}</text></g>
      ))}
      {rows.map((r, i) => {
        const cx = padL + slot * i + slot / 2;
        const label = r.label.length > 34 ? r.label.slice(0, 33) + "…" : r.label;
        return (
          <g key={r.label}>
            <rect x={cx - bw / 2} y={y(r.value)} width={bw} height={y(0) - y(r.value)} fill={r.color || color} rx="2"><title>{`${r.label}: ${r.value}`}</title></rect>
            <text x={cx} y={y(r.value) - 6} fill="#f2f4f6" fontSize="12" fontWeight="700" textAnchor="middle">{r.value}</text>
            <text x={cx} y={height - padB + 16} fill="#99a2ab" fontSize="10.5" textAnchor="middle">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Progress({ rows, confirmedPct }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (!total) return <div className="empty">No data</div>;
  return (
    <>
      <div className="chart-row" style={{ flexWrap: "nowrap" }}>
        <div style={{ display: "flex", height: 96, flex: 1, borderRadius: 6, overflow: "hidden", background: "#2a2f36" }}>
          {rows.map((r) => <div key={r.label} title={`${r.label}: ${r.value}`} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />)}
        </div>
        <div style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>{confirmedPct}% Confirmed</div>
      </div>
      <div className="legend" style={{ marginTop: "0.8rem", justifyContent: "center", gridTemplateColumns: "repeat(auto-fit, minmax(110px, auto))" }}>
        {rows.map((r) => <span key={r.label}><i style={{ background: r.color }} />{r.label}</span>)}
      </div>
    </>
  );
}

function Calendar({ events, groups }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const first = new Date(cursor);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
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
      <div className="cal-head">
        <h2>🗓️ Install calendar</h2>
        <div><span className="stamp">{MONTH_ONLY(cursor)}</span><button onClick={() => shift(-1)}>‹</button><button onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button><button onClick={() => shift(1)}>›</button></div>
      </div>
      <div className="cal">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <div key={x} className="dow">{x}</div>)}
        {cells.map((c) => (
          <div key={c.k} className={`${c.out ? "out" : ""} ${c.k === todayK ? "today" : ""}`}>
            <div className="dn"><span>{String(c.d.getDate()).padStart(2, "0")}</span></div>
            {c.ev.slice(0, 2).map((e) => <div key={e.id} className="chip" style={{ background: e.color }} title={`${e.name} (${e.group})`}>{e.name}</div>)}
            {c.ev.length > 2 && <div className="more" title={c.ev.slice(2).map((e) => e.name).join("\n")}>+{c.ev.length - 2} more</div>}
          </div>
        ))}
      </div>
      <div className="cal-legend">{groups.map((g) => <span key={g.id}><i style={{ background: g.color }} />{g.title}</span>)}</div>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

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
  const missing = data ? Object.entries(data.columnsFound).filter(([k, v]) => !v && !["requestedDate", "detailsComplete"].includes(k)).map(([k]) => k) : [];
  const row = (n) => m?.tiles.filter((t) => (t.row || 1) === n) || [];
  const stamp = now.toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(" at ", " | ");

  return (
    <>
      <Head><title>The Brain – Management Dashboard</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/Subway.png" alt="Subway" className="logo" />
            <div><h1>🧠 The Brain – Management Dashboard</h1><p className="sub">{data ? `${data.boardName} · updated ${stamp}` : "Loading…"}</p></div>
          </div>
          <div className="controls">
            <button onClick={() => load(true)} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
            <img src="/Vita Mojo_Primary_Dark.png" alt="Vita Mojo" className="logo vm" />
          </div>
        </div>
      </header>
      <main className="main">
        {error && <div className="error">Couldn't load The Brain: {error}</div>}
        {missing.length > 0 && !error && (
          <div className="placing placing-warn">Couldn't auto-detect board columns for: {missing.join(", ")}. Open /api/brain-check to see the board's columns, then set the matching BRAIN_COL_… variable in Vercel (see README).</div>
        )}
        {m && (
          <>
            <div className="grid g4">{row(1).map((t) => <Tile key={t.key} t={t} />)}</div>
            <div className="grid g3">{row(2).map((t) => <Tile key={t.key} t={t} />)}</div>
            <div className="grid g3">{row(3).map((t) => <Tile key={t.key} t={t} />)}</div>
            <div className="grid"><div className="panel"><h2>📊 Pipeline by stage</h2><Bars rows={m.pipeline} height={300} /></div></div>
            <div className="grid g2">
              <div className="panel"><h2>📈 Confirmed installs by month</h2><Bars rows={m.months} W={520} height={250} /></div>
              <PieCard title="🍩 Apex booking status" rows={m.statusRows} />
            </div>
            <div className="grid g2">
              <PieCard title="⏸️ Hold reasons" rows={m.holdRows} hole={0} />
              <PieCard title="📅 Date check (Apex vs requested)" rows={m.checkRows} hole={0} />
            </div>
            <div className="grid g2">
              <div className="panel"><h2>📗 Booking progress (share of jobs confirmed)</h2><Progress rows={m.statusRows} confirmedPct={m.confirmedPct} /></div>
              <PieCard title="⏱️ Apex SLA performance" rows={m.slaRows} />
            </div>
            <div className="grid g2">
              <PieCard title="🧭 Request source (live vs historical)" rows={m.sourceRows} hole={0} />
              <Calendar events={m.events} groups={data.groups} />
            </div>
          </>
        )}
        {!m && !error && <p className="foot">Loading board…</p>}
        <p className="foot">Data from Monday board {data?.boardName || ""}. Refreshes every 5 minutes.</p>
      </main>
    </>
  );
}
