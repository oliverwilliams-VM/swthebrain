// Diagnostic: shows which board columns were matched to which widget, every
// column on the board, and the distinct values found in each matched column.
import { fetchBrain, fetchPreBrainInstalls } from "../../lib/brain";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const d = await fetchBrain();
    const distinct = {};
    for (const key of Object.keys(d.columnsFound)) {
      const m = new Map();
      d.items.forEach((i) => { const val = (key.startsWith("kpi") ? i.kpi?.[key] : i[key]) || "(empty)"; m.set(val, (m.get(val) || 0) + 1); });
      distinct[key] = Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40));
    }
    const month = process.env.BRAIN_PRELIVE_MONTH || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" }).slice(0, 7);
    let preBrain;
    try {
      const r = await fetchPreBrainInstalls(d.items, month);
      preBrain = { ...r, sample: r.items.slice(0, 5), items: undefined };
    } catch (e) { preBrain = { error: String(e?.message || e) }; }
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ board: d.boardName, itemCount: d.items.length, groups: d.groups.map((g) => g.title), matched: d.columnsFound, distinctValues: distinct, allColumns: d.allColumns, preBrain });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err || "Unknown error") });
  }
}
