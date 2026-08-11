import { z } from "zod";

// employeeId is required for now: it's the only filter this endpoint
// supports (FR-BKG-17, ticket 07), and with no authentication (ADR-0002) an
// unfiltered call would dump every employee's bookings — including meeting
// titles, which the data dictionary flags as potentially personal data.
// API-09 also names a date filter for the room usage calendar (ticket 10)
// — when that's added, loosen this to "at least one of employeeId/date"
// rather than requiring employeeId unconditionally.
export const bookingListQuerySchema = z.object({
  employeeId: z.string({ error: "กรุณาระบุ employeeId" }).trim().min(1, "กรุณาระบุ employeeId"),
});

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
