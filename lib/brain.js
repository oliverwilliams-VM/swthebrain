// The Brain - Management Dashboard: Monday fetch + column auto-detection.
// Board schema wasn't inspectable ahead of time, so columns are found by type
// and title. Override any of them with env vars (column id), e.g.
// BRAIN_COL_BOOKING_STATUS=status_abc. /api/brain-check shows what was found.

const BOARD_ID = process.env.BRAIN_BOARD_ID || "18432365825";
const MONDAY_API_URL = "https://api.monday.com/v2";
const PAGE_SIZE = 500;

async function mondayQuery(query, variables) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: process.env.MONDAY_API_TOKEN, "API-Version": "2024-01" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data;
}

const COLUMNS_QUERY = `query ($b: [ID!]) { boards(ids: $b) { name groups { id title color } columns { id title type } } }`;
const FIELDS = `id name group { id title color } column_values(ids: $colIds) { id type text value ... on MirrorValue { display_value } ... on FormulaValue { display_value } }`;
const ITEMS_QUERY = `query ($b: [ID!], $colIds: [String!], $cursor: String) { boards(ids: $b) { items_page(limit: ${PAGE_SIZE}, cursor: $cursor) { cursor items { ${FIELDS} } } } }`;
const NEXT_QUERY = `query ($cursor: String!, $colIds: [String!]) { next_items_page(limit: ${PAGE_SIZE}, cursor: $cursor) { cursor items { ${FIELDS} } } }`;

// key -> how to find the column. First rule that matches wins; titles are
// tested in order so more specific patterns come first.
export const COLUMN_RULES = {
  bookingStatus: { env: "BRAIN_COL_BOOKING_STATUS", titles: [/apex booking status/i, /booking status/i, /apex.*status/i], types: ["status", "color"] },
  installDate: { env: "BRAIN_COL_INSTALL_DATE", titles: [/^install date/i, /install(ation)? date/i, /confirmed.*date/i, /apex.*date/i, /booked.*date/i, /install/i], types: ["date"] },
  requestedDate: { env: "BRAIN_COL_REQUESTED_DATE", titles: [/request(ed)?.*date/i, /vm.*date/i, /proposed.*date/i], types: ["date"] },
  dateCheck: { env: "BRAIN_COL_DATE_CHECK", titles: [/date check/i, /date (response|decision|status|match)/i, /apex.*(response|date).*status/i], types: ["status", "color", "formula", "mirror"] },
  holdReason: { env: "BRAIN_COL_HOLD_REASON", titles: [/hold reason/i, /reason.*hold/i, /on hold/i], types: ["status", "color", "dropdown", "text", "long_text"] },
  sla: { env: "BRAIN_COL_SLA", titles: [/sla/i], types: ["status", "color", "formula", "mirror"] },
  requestSource: { env: "BRAIN_COL_REQUEST_SOURCE", titles: [/request source/i, /source/i], types: ["status", "color", "dropdown", "text"] },
  detailsComplete: { env: "BRAIN_COL_DETAILS", titles: [/details (missing|complete|provided)/i, /info(rmation)? (missing|complete)/i, /missing/i], types: ["status", "color", "formula", "mirror", "checkbox", "text"] },
};

export function resolveColumns(columns) {
  const out = {};
  for (const [key, rule] of Object.entries(COLUMN_RULES)) {
    const envId = process.env[rule.env];
    let found = envId ? columns.find((c) => c.id === envId) : null;
    if (!found) {
      for (const re of rule.titles) {
        found = columns.find((c) => re.test(c.title) && rule.types.includes(c.type) && !Object.values(out).some((o) => o?.id === c.id && key !== "requestedDate"));
        if (found) break;
      }
    }
    out[key] = found || null;
  }
  // Install date and requested date must be different columns.
  if (out.installDate && out.requestedDate && out.installDate.id === out.requestedDate.id) out.requestedDate = null;
  return out;
}

const s = (v) => (v == null ? "" : typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const textOf = (cv) => s(cv?.text) || s(cv?.display_value);

export async function fetchBrain() {
  if (!process.env.MONDAY_API_TOKEN) throw new Error("MONDAY_API_TOKEN is not set. Add it in Vercel (Settings -> Environment Variables) and redeploy.");
  const meta = await mondayQuery(COLUMNS_QUERY, { b: [BOARD_ID] });
  const board = meta.boards?.[0];
  if (!board) throw new Error(`Board ${BOARD_ID} not found (does the token have access?)`);
  const cols = resolveColumns(board.columns);
  const colIds = [...new Set(Object.values(cols).filter(Boolean).map((c) => c.id))];

  const first = await mondayQuery(ITEMS_QUERY, { b: [BOARD_ID], colIds, cursor: null });
  let all = [...first.boards[0].items_page.items];
  let cursor = first.boards[0].items_page.cursor;
  while (cursor) {
    const next = await mondayQuery(NEXT_QUERY, { cursor, colIds });
    all = all.concat(next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }

  const items = all.map((it) => {
    const v = (key) => {
      const c = cols[key];
      if (!c) return "";
      const cv = it.column_values.find((x) => x.id === c.id);
      if (c.type === "checkbox") {
        try { return JSON.parse(cv.value)?.checked ? "Yes" : "No"; } catch { return "No"; }
      }
      return textOf(cv);
    };
    return {
      id: it.id,
      name: it.name,
      group: it.group?.title || "",
      groupId: it.group?.id || "",
      bookingStatus: v("bookingStatus"),
      installDate: v("installDate"),
      requestedDate: v("requestedDate"),
      dateCheck: v("dateCheck"),
      holdReason: v("holdReason"),
      sla: v("sla"),
      requestSource: v("requestSource"),
      detailsComplete: v("detailsComplete"),
    };
  });

  return {
    boardName: board.name,
    groups: board.groups.map((g) => ({ id: g.id, title: g.title, color: g.color })),
    columnsFound: Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, c ? { id: c.id, title: c.title, type: c.type } : null])),
    allColumns: board.columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
    items,
  };
}
