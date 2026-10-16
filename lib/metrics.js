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
    return !isConfirmed(it);
  });

  const withStatus = items.filter((it) => it.bookingStatus);
  const withCheck = items.filter((it) => it.dateCheck);

  const tiles = [
    { key: "total", icon: "📦", label: "Total jobs", value: items.length },
    { key: "hist", icon: "🗂️", label: "Historical backfill", value: sourceKnown ? historical : null },
    { key: "hold", icon: "⏸️", label: "On hold", value: items.filter(isHold).length },
    { key: "live", icon: "🧠", label: "Live Brain requests", value: sourceKnown ? items.length - historical : null },
    { key: "n14", icon: "📅", label: "Installs in next 14 days", value: have.installDate ? within.length : null, row: 2 },
    { key: "conf", icon: "✅", label: "Confirmed installs", value: have.bookingStatus ? items.filter(isConfirmed).length : null, row: 2 },
    { key: "breach", icon: "🚨", label: "Apex: SLA breached", value: have.sla ? items.filter((i) => /breach/.test(low(i.sla))).length : null, row: 2, tone: "bad" },
    { key: "miss", icon: "⚠️", label: "VM: Installs ≤14 days, details missing", value: have.installDate ? detailsMissing.length : null, row: 3, tone: "warn" },
    { key: "agree", icon: "🔴", label: "VM: Apex dates to agree", value: have.dateCheck ? items.filter((i) => /differ/.test(low(i.dateCheck))).length : null, row: 3, tone: "bad" },
    { key: "await", icon: "🟠", label: "Apex: awaiting response", value: have.bookingStatus ? items.filter((i) => /date proposed|reviewing/.test(low(i.bookingStatus)) && !isHold(i)).length : null, row: 3, tone: "warn" },
  ];

  // Pipeline by stage = the board's groups, in board order.
  const pipeline = data.groups
    .map((g) => ({ label: g.title, value: items.filter((i) => i.groupId === g.id).length, color: g.color || "#fdab3d" }))
    .filter((g) => g.value > 0);

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
    return { label: new Date(+y, +m - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" }), value };
  });

  const withColors = (rows) => rows.map((r, i) => ({ ...r, color: colorFor(r.label, i) }));
  const statusRows = withColors(countBy(withStatus, (i) => i.bookingStatus));
  const holdRows = withColors(countBy(items.filter(isHold), (i) => i.holdReason));
  const checkRows = withColors(countBy(withCheck, (i) => i.dateCheck));
  const slaRows = withColors(countBy(items.filter((i) => i.sla), (i) => i.sla));
  const sourceRows = sourceKnown
    ? countBy(items, (i) => i.requestSource).map((r, i) => ({ ...r, color: /historic|backfill/.test(low(r.label)) ? "#0086c0" : i === 0 ? "#fdab3d" : "#fdab3d" }))
    : [];

  // Calendar events keyed by yyyy-mm-dd.
  const groupColor = Object.fromEntries(data.groups.map((g) => [g.id, g.color]));
  const events = {};
  items.forEach((it) => {
    const k = isoDay(it.installDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    (events[k] ||= []).push({ id: it.id, name: it.name, color: groupColor[it.groupId] || "#fdab3d", group: it.group });
  });

  return { tiles, pipeline, months, statusRows, holdRows, checkRows, slaRows, sourceRows, events, confirmedPct: withStatus.length ? Math.round((withStatus.filter(isConfirmed).length / withStatus.length) * 1000) / 10 : 0 };
}
