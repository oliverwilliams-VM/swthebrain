// Diagnostic: shows which board columns were matched to which widget, every
// column on the board, and the distinct values found in each matched column.
import { fetchBrain } from "../../lib/brain";

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
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ board: d.boardName, itemCount: d.items.length, groups: d.groups.map((g) => g.title), matched: d.columnsFound, distinctValues: distinct, allColumns: d.allColumns });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err || "Unknown error") });
  }
}
