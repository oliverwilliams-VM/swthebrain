// Pure functions that turn board items into every dashboard widget.
// Kept free of React so they can be tested and tweaked in one place.

const low = (x) => String(x || "").trim().toLowerCase();
export const PALETTE = ["#00c875", "#fdab3d", "#579bfc", "#0086c0", "#a25ddc", "#7f8c9a", "#e2445c", "#ffcb00", "#66ccff", "#ff7575"];

// Semantic colours so statuses look the same as in Monday regardless of order.
export function colorFor(label, i = 0) {
  const l = low(label);
  if (/^(confirmed|complete|completed|matches|match|done|installed)/.test(l)) return "#00c875";
  if (/(reject|breach|fail|site issue)/.test(l)) return "#e2445c";
  if (/^(new request|differs|on track)/.test(l)) return "#fdab3d";
  if (/date proposed|accepted/.test(l)) return "#579bfc";
  if (/reviewing/.test(l)) return "#0086c0";
  if (/change requested/.test(l)) return "#a25ddc";
  if (/no good/.test(l)) return "#333333";
  if (/^\(?empty\)?$/.test(l)) return "#c4c4c4";
  return PALETTE[(i + 3) % PALETTE.length];
}

export function countBy(items, fn, empty = "(empty)") {
  const m = new Map();
  items.forEach((it) => {
    const k = fn(it) || empty;
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export const isoDay = (d) => (d ? String(d).slice(0, 10) : "");
const parseDay = (s) => {
  const t = isoDay(s);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return new Date(`${t}T00:00:00`);
};
const startOfToday = (now) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

const isConfirmed = (it) => low(it.bookingStatus).startsWith("confirmed");
const isHold = (it) => /hold/.test(low(it.group));
// A KPI formula cell -> number. Numeric text counts as itself; otherwise any
// non-empty value other than 0/No/False/dash counts as 1.
function kpiNum(t) {
  const x = String(t ?? "").trim();
  if (!x) return 0;
  const n = parseFloat(x.replace(/,/g, ""));
  if (Number.isFinite(n)) return n;
  return /^(no|false|-|n\/a|0)$/i.test(x) ? 0 : 1;
}
const isHistorical = (it) => /historic|backfill/.test(low(it.requestSource));

export function within14(it, now) {
  const d = parseDay(it.installDate);
  if (!d) return false;
  const t = startOfToday(now);
  const diff = Math.round((d - t) / 86400000);
  return diff >= 0 && diff <= 14;
}

export function computeMetrics(data, now = new Date()) {
  const items = data.items;
  const have = data.columnsFound || {};
  const sourceKnown = Boolean(have.requestSource);

  const historical = items.filter(isHistorical).length;
  const within = items.filter((it) => within14(it, now));

  // "details missing": uses a dedicated column if the board has one,
  // otherwise treats an install in the next 14 days that Apex hasn't
  // confirmed yet as missing details. (Inferred rule - see README.)
  const detailsMissing = within.filter((it) => {
    if (have.detailsComplete) return /^(no|missing|incomplete|\(empty\)|)$/.test(low(it.detailsComplete)) || /missing|incomplete/.test(low(it.detailsComplete));
    return isConfirmed(it);
  });

  const withStatus = items.filter((it) => it.bookingStatus);
  const withCheck = items.filter((it) => it.dateCheck);

  const kpi = (key, fallback, needs) => (have[key] ? items.reduce((a, it) => a + kpiNum(it.kpi?.[key]), 0) : needs ? fallback() : null);
  const tiles = [
    { key: "total", icon: "📦", label: "Total jobs", value: items.length },
    { key: "hist", icon: "🗂️", label: "Historical backfill", value: kpi("kpiHist", () => historical, sourceKnown) },
    { key: "hold", icon: "⏸️", label: "On hold", value: kpi("kpiHold", () => items.filter(isHold).length, true) },
    { key: "live", icon: "🧠", label: "Live Brain requests", value: kpi("kpiLive", () => items.length - historical, sourceKnown) },
    { key: "n14", icon: "📅", label: "Installs in next 14 days", value: kpi("kpiNext14", () => within.length, have.installDate), row: 2 },
    { key: "conf", icon: "✅", label: "Confirmed installs", value: kpi("kpiConfirmed", () => items.filter(isConfirmed).length, have.bookingStatus), row: 2 },
    { key: "breach", icon: "🚨", label: "Apex: SLA breached", value: kpi("kpiBreach", () => items.filter((i) => /breach/.test(low(i.sla))).length, have.sla), row: 2, tone: "bad" },
    { key: "miss", icon: "⚠️", label: "VM: booked installs ≤14 days with gaps", value: kpi("kpiRisk", () => detailsMissing.length, have.installDate), row: 3, tone: "warn" },
    { key: "agree", icon: "🔴", label: "VM: Apex dates to agree", value: kpi("kpiAgree", () => items.filter((i) => /differ/.test(low(i.dateCheck))).length, have.dateCheck), row: 3, tone: "bad" },
    { key: "await", icon: "🟠", label: "Apex: awaiting response", value: kpi("kpiAwaiting", () => items.filter((i) => /date proposed|reviewing/.test(low(i.bookingStatus)) && !isHold(i)).length, have.bookingStatus), row: 3, tone: "warn" },
  ];

  const km = (key, fb) => (have[key] ? (it) => kpiNum(it.kpi?.[key]) > 0 : fb);
  const matchers = {
    total: () => true,
    hist: km("kpiHist", isHistorical),
    hold: km("kpiHold", isHold),
    live: km("kpiLive", (it) => !isHistorical(it)),
    n14: km("kpiNext14", (it) => within14(it, now)),
    conf: km("kpiConfirmed", isConfirmed),
    breach: km("kpiBreach", (it) => /breach/.test(low(it.sla))),
    miss: km("kpiRisk", (it) => within14(it, now) && isConfirmed(it)),
    agree: km("kpiAgree", (it) => /differ/.test(low(it.dateCheck))),
    await: km("kpiAwaiting", (it) => /date proposed|reviewing/.test(low(it.bookingStatus)) && !isHold(it)),
  };
  tiles.forEach((t) => { t.pick = matchers[t.key]; });

  // Pipeline by stage = the board's groups, in board order.
  const pipeline = data.groups
    .map((g) => ({ label: g.title, value: items.filter((i) => i.groupId === g.id).length, color: g.color || "#fdab3d", pick: (it) => it.groupId === g.id }))
    .filter((g) => g.value > 0)
    .sort((a, b) => a.value - b.value);

  // Confirmed installs by month (chronological).
  const byMonth = new Map();
  items.filter(isConfirmed).forEach((it) => {
    const d = parseDay(it.installDate);
    if (!d) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(k, (byMonth.get(k) || 0) + 1);
  });
  const months = [...byMonth.entries()].sort().map(([k, value]) => {
    const [y, m] = k.split("-");
    return { label: new Date(+y, +m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" }), value, pick: (it) => isConfirmed(it) && isoDay(it.installDate).startsWith(k) };
  });

  const withColors = (rows, field) => rows.map((r, i) => ({ ...r, color: colorFor(r.label, i), pick: field ? (it) => (it[field] || "(empty)") === r.label || (!it[field] && /^\(?empty\)?$/i.test(r.label)) : undefined }));
  const statusRows = withColors(countBy(withStatus, (i) => i.bookingStatus), "bookingStatus");
  const holdRows = withColors(countBy(items.filter((i) => i.holdReason), (i) => i.holdReason), "holdReason");
  const checkRows = withColors(countBy(withCheck, (i) => i.dateCheck), "dateCheck");
  const progressRows = withColors(countBy(items, (i) => i.bookingStatus, "empty"), "bookingStatus");
  const slaRows = withColors(countBy(items.filter((i) => i.sla), (i) => i.sla), "sla");
  const sourceRows = sourceKnown
    ? countBy(items, (i) => i.requestSource).map((r) => ({ ...r, color: /historic|backfill/.test(low(r.label)) ? "#0086c0" : "#fdab3d", pick: (it) => (it.requestSource || "(empty)") === r.label }))
    : [];

  // Calendar events keyed by yyyy-mm-dd.
  const groupColor = Object.fromEntries(data.groups.map((g) => [g.id, g.color]));
  const events = {};
  items.forEach((it) => {
    const k = isoDay(it.installDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    (events[k] ||= []).push({ id: it.id, name: it.name, color: groupColor[it.groupId] || "#fdab3d", group: it.group });
  });

  return { tiles, pipeline, months, statusRows, progressRows, holdRows, checkRows, slaRows, sourceRows, events, confirmedPct: items.length ? Math.round((items.filter(isConfirmed).length / items.length) * 1000) / 10 : 0 };
}
