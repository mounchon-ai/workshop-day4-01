Status: ready-for-agent

# Ticket 14: Scheduled PDPA retention sweep

## Problem Statement

The system already lets an Employee's personal data be erased on request (ticket 12, `NFR-PDPA-05`), but nothing removes personal data automatically once its retention period lapses on its own. Per `docs/sds/05-data-requirements.md` §5.5 and `NFR-PDPA-06`, three kinds of data have a fixed retention clock that is currently not enforced by any running code:

- A Booking that ended over 2 years ago still carries its owner's `employeeId` and `title` indefinitely.
- An Employee disabled over 2 years ago is never removed, even once every Booking that referenced them has already been anonymized.
- A `BookingAudit` row (`NFR-SEC-05`'s change trail) is kept forever instead of being purged after 1 year.

Left unenforced, the system silently drifts out of compliance with `DR-11`/`NFR-PDPA-06` the longer it runs — the gap only grows, and nothing in the codebase currently closes it. `backend/src/routes/employees.ts` (the ticket 12 erasure route) already flags this explicitly in a comment as out of its scope and names it "ticket 14's concern (the scheduled PDPA retention job)."

## Solution

Add a scheduled retention sweep, run automatically inside the backend process (no user or admin action triggers it), that enforces all three §5.5 retention rules every time it runs:

1. Anonymize any Booking whose `endAt` is more than 2 years in the past and still has a non-null `employeeId` — null out `employeeId` and `title`, exactly like the ticket 12 erasure-on-request flow, leaving `roomId`, `startAt`/`endAt`, and `attendeeCount` untouched for anonymous statistics (`NFR-PDPA-07`).
2. Delete any disabled Employee whose disable date is more than 2 years in the past, once no Booking still references them (i.e., every Booking they ever owned has already been anonymized by rule 1 or by an on-request erasure).
3. Delete any `BookingAudit` row whose `actedAt` is more than 1 year in the past.

The sweep runs once at process startup and then on a recurring interval for as long as the backend runs — matching the single always-on backend container in `docker-compose.yml`. It produces no user-visible output; it is a background maintenance job, not a feature end users or admins interact with.

## User Stories

1. As the organization's Data Protection Officer, I want Booking records to lose their personal-data fields automatically 2 years after the meeting ends, so that the organization stays compliant with `NFR-PDPA-06` without anyone having to remember to run a manual purge.
2. As the organization's Data Protection Officer, I want disabled Employee records to be deleted automatically 2 years after they were disabled, so that stale personal data doesn't accumulate indefinitely once someone leaves the organization.
3. As the person accountable for the audit trail (`NFR-SEC-05`), I want `BookingAudit` rows older than 1 year to be purged automatically, so that the audit log doesn't retain change history longer than its stated retention period.
4. As the developer maintaining this system, I want the retention sweep to be idempotent, so that it running once, or once a day for a year, produces the same end state as running it exactly once at the correct moment.
5. As the developer maintaining this system, I want the retention sweep to be a plain injectable function rather than an HTTP endpoint, so that a system with no authentication (`ADR-0002`) never exposes a destructive bulk-anonymize/bulk-delete operation to anyone who can reach the network.
6. As an Employee whose Booking has already been erased on request (ticket 12) or anonymized by this sweep, I want the booking list and detail views to keep rendering sensibly, so that browsing historical room usage doesn't break just because the personal-data fields are gone (already true today via `frontend/lib/erasure.ts`'s null-safe fallbacks — this ticket does not touch the frontend).

## Implementation Decisions

- **New module, `backend/src/pdpa-retention.ts`.** Export a single function, e.g. `runPdpaRetentionSweep(prisma, options?: { now?: () => number })`, that performs all three rules described above in one call and returns a summary (counts anonymized/deleted per rule) for logging. `now` defaults to `Date.now` and exists purely so tests can pin "the present" the same way `createBookingRateLimiter`'s `now` option does in `backend/src/rate-limit.ts`.
- **No HTTP route for this ticket.** This is the one new seam this ticket introduces, and it's new deliberately: the system has no authentication (`ADR-0002`), so any HTTP-reachable trigger for a bulk anonymize/delete operation would be callable by anyone who can reach the backend on the network. A plain function invoked only from process startup avoids that exposure entirely. Prefer this seam over adding a route.
- **Wiring in `backend/src/server.ts`.** Call `runPdpaRetentionSweep` once immediately when the process starts, then again on a recurring interval (e.g. `setInterval`, once every 24 hours) for the lifetime of the process. Running at startup — not only on the interval — matters because the single backend container in `docker-compose.yml` can restart at any time; an interval-only schedule could drift arbitrarily long past a restart before firing. `app.ts` stays HTTP-only; this wiring belongs in `server.ts` alongside `app.listen`.
- **No locking or concurrency guard.** `docker-compose.yml` runs exactly one backend container, so no two sweeps ever run concurrently. Do not add distributed locking, a job queue, or a scheduling library — out of proportion to the deployment.
- **Booking anonymization predicate: select purely on `endAt`, not on `status`.** §5.5's Thai text ("Booking สถานะเสร็จสิ้นหรือยกเลิกแล้ว") reads as "completed or cancelled," but nothing in this codebase ever transitions a Booking to a `"completed"` status — `status` is only ever `"confirmed"` (set on creation) or `"cancelled"` (set by the cancel route in `backend/src/routes/bookings.ts`). A Booking whose `endAt` is more than 2 years in the past is de facto over regardless of whether it was ever explicitly cancelled. The predicate is: `endAt < (now - 2 years)` AND `employeeId IS NOT NULL`. Do not filter on `status`, and do not introduce a `"completed"` status value to make the filter "work" — that would be new unrequested behavior.
- **Employee deletion ordering is enforced by the schema, not by extra application logic.** `Booking.employeeId` is a foreign key to `Employee`. Because rule 1 anonymizes old Bookings before rule 2 deletes old disabled Employees (run rule 1 before rule 2 within the same sweep call), any Employee whose Bookings are all old enough to have been anonymized already has no remaining referencing rows, and the delete succeeds. An Employee disabled 2+ years ago who still owns a Booking less than 2 years past its `endAt` is left alone by rule 2 — it will naturally become eligible once that Booking is anonymized in a future sweep. This mirrors the two-step order already used in ticket 12's erasure route (anonymize bookings, then delete the employee).
- **Employee "disabled date" tracking.** The `Employee` model has `status` and `updatedAt` but no dedicated "disabled at" timestamp. Use `updatedAt` as the disable date for any Employee whose `status` is the disabled value, on the basis that `updatedAt` changes whenever the record (including a status flip to disabled) is saved via the existing edit route. Note this in code as an approximation: if an already-disabled Employee's record is edited again for an unrelated reason, its retention clock restarts. This is an accepted approximation for this ticket, not a schema change — do not add a new column.
- **`BookingAudit` purge is purely time-based.** Delete any row where `actedAt < (now - 1 year)`, independent of whether the Booking or Employee it references still exists or has itself been anonymized/erased. This also covers audit rows for employees erased on request (ticket 12) or anonymized by rule 1 — they are not purged immediately on erasure/anonymization, only once their own 1-year clock elapses. (The 1-year audit retention being shorter than the 2-year booking retention means an audit row for a given Booking will always have already been purged by the time that Booking itself is anonymized.)
- **Idempotency.** Every predicate in all three rules must already exclude rows that were handled by a previous sweep (anonymized Bookings have `employeeId IS NULL` and so won't match rule 1 again; deleted Employees and deleted `BookingAudit` rows are simply gone). Running the sweep twice in a row must leave the database in the same state as running it once.

## Testing Decisions

- Test the new module directly by calling `runPdpaRetentionSweep` against the real test SQLite database (via `prisma` from `backend/src/prisma.ts` and `resetDb()` from `backend/test/reset-db.ts`), the same integration style already used by every other `backend/test/*.test.ts` file — seed rows with Prisma directly (as `employees-erasure.test.ts` already does for its "past booking" fixture), call the sweep, then assert on `prisma.*.findMany`/`findUnique` results. No HTTP layer is involved since there is no route.
- New test file: `backend/test/pdpa-retention.test.ts`.
- Cover, per rule:
  - A Booking with `endAt` just over 2 years in the past and a non-null `employeeId` is anonymized (`employeeId` and `title` become `null`; `roomId`, `startAt`, `endAt`, `attendeeCount` are unchanged).
  - A Booking with `endAt` just under 2 years in the past is left untouched (boundary case).
  - A **`confirmed`** Booking (not `"cancelled"` or `"completed"`) whose `endAt` is over 2 years in the past is still anonymized — this is the regression test for the status-predicate decision above; do not seed it as `status: "completed"`.
  - An already-anonymized Booking (`employeeId` already `null`) is left alone by a second sweep.
  - A disabled Employee whose `updatedAt` is over 2 years in the past, with no remaining Bookings referencing them, is deleted.
  - A disabled Employee over the 2-year mark who still owns a non-anonymized recent Booking is NOT deleted (FK still references them).
  - An active (non-disabled) Employee, however old their `updatedAt`, is never deleted by this sweep.
  - A `BookingAudit` row with `actedAt` over 1 year in the past is deleted; one under 1 year is kept.
  - Running the sweep twice in immediate succession produces no further changes on the second call (idempotency) — assert equal row counts/state before and after the second call.
  - Use an injected `now` in every test (per the `RateLimiterOptions`-style pattern in `backend/src/rate-limit.ts`) rather than relying on real wall-clock time, so "2 years ago" and "1 year ago" are exact and deterministic.
- Prior art: `backend/test/employees-erasure.test.ts` for the anonymization assertions shape, and `backend/test/rate-limit.test.ts` for the injected-`now`, call-the-module-directly testing style (as opposed to the HTTP-level style in `backend/test/bookings-rate-limit.test.ts`, which doesn't apply here since there is no route).

## Out of Scope

- Any HTTP endpoint, admin UI, or manual "run retention now" trigger. The sweep is fully automatic.
- Purging a `BookingAudit` row immediately when its Employee is erased on request (ticket 12) or anonymized by this sweep's rule 1. Audit retention stays purely time-based (1 year from `actedAt`), per §5.5.
- Any frontend change. `frontend/lib/erasure.ts` already renders anonymized/erased bookings correctly (`ANONYMIZED_TITLE`, `ANONYMIZED_EMPLOYEE_LABEL`); this ticket produces more of the same already-handled state, nothing new to render.
- Database backup retention (30 sets, §5.5's last row) — that's an infrastructure/ops concern (`NFR-AVL-03`), not application code.
- Adding a dedicated "disabled at" timestamp column to `Employee`. The `updatedAt` approximation is accepted for this ticket.
- A general-purpose job scheduler or cron library. A single `setInterval` in `server.ts` is sufficient for one backend container.
- Resolving `ASM-08` (the `[ต้องยืนยัน — ASM-08]` flag on the 2-year figure in §5.5) — this ticket implements the 2-year figure as currently documented; revisiting the figure itself is a documentation/assumption-sign-off concern, not an implementation one.

## Further Notes

This ticket completes the last unimplemented row of the `NFR-PDPA-06`/`DR-11` requirement pair and the `NFR-SEC-05` audit-retention requirement. After this ticket, every `รอพัฒนา` ("pending") status in `docs/sds/07-traceability-matrix.md` §7.2 should be reviewed and updated to reflect actual implementation status across all 14 tickets — that housekeeping pass is not part of this ticket's own scope, but is worth flagging to whoever picks up documentation upkeep next.
