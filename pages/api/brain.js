import { fetchBrain, fetchPreBrainInstalls } from "../../lib/brain";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const { allColumns, ...data } = await fetchBrain();
    const month = process.env.BRAIN_PRELIVE_MONTH || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" }).slice(0, 7);
    let preBrain;
    try {
      const r = await fetchPreBrainInstalls(data.items, month);
      preBrain = { month, items: r.items, alreadyOnBrain: r.alreadyOnBrain };
    } catch (e) {
      preBrain = { month, items: [], error: String(e?.message || e) };
    }
    data.preBrain = preBrain;
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err || "Unknown error") + (err?.stack ? " | " + err.stack.split("\n")[1]?.trim() : "") });
  }
}
