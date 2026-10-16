# The Brain – Management Dashboard

Self-hosted copy of the Monday "The Brain – Management Dashboard" (board 18432365825).

## Deploy (same as the other dashboards)
1. New private GitHub repo, upload the unzipped folder contents.
2. Vercel -> Add New Project -> import the repo.
3. Environment variables: `MONDAY_API_TOKEN` (same token), optional `DASHBOARD_PASSWORD`.
4. Deploy, then open `/api/brain-check` once.

## Column detection
The board's columns were not visible when this was built, so they are found by
type + title. `/api/brain-check` shows which column each widget matched and the
values found. If one is wrong, set the Vercel env var to the column ID (and redeploy):

| Widget | Env var | Looks for |
|---|---|---|
| Booking status, Confirmed, Progress | `BRAIN_COL_BOOKING_STATUS` | status "Apex booking status" |
| Install date (14 days, by month, calendar) | `BRAIN_COL_INSTALL_DATE` | date "Install date" |
| Date check | `BRAIN_COL_DATE_CHECK` | "Date check" (Matches/Differs/Accepted/Rejected) |
| Hold reasons | `BRAIN_COL_HOLD_REASON` | "Hold reason" |
| SLA | `BRAIN_COL_SLA` | "SLA" (On Track/Complete/Breached) |
| Request source | `BRAIN_COL_REQUEST_SOURCE` | "Request source" (Sign Up / Historical Backfill) |
| Details missing | `BRAIN_COL_DETAILS` | optional "details complete" column |

Rules derived from the Monday screenshot: Pipeline by stage = board groups; On hold = items in a
group with "hold" in its name; Dates to agree = Date check "Differs"; SLA breached = SLA contains "breach".
Inferred (check against Monday): "Apex awaiting response" = status Date Proposed or Reviewing (not on hold);
Tiles read the board's KPI formula columns, so their logic lives in Monday.
Board ID can be changed with `BRAIN_BOARD_ID`.
