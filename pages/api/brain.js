import { fetchBrain } from "../../lib/brain";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const { allColumns, ...data } = await fetchBrain();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ ...data, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err || "Unknown error") + (err?.stack ? " | " + err.stack.split("\n")[1]?.trim() : "") });
  }
}
