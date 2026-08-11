import { z } from "zod";
import { DATE_PATTERN, isValidCalendarDate } from "../bangkok-time.js";

// FR-BKG-17 ("my bookings", ticket 07) and FR-BKG-03 (room usage calendar,
// ticket 10) are two different views over the same endpoint (API-09) — the
// caller picks a mode by supplying exactly one of employeeId/date, never
// both and never neither. With no authentication (ADR-0002), an unfiltered
// call would dump every employee's bookings — including meeting titles,
// which the data dictionary flags as potentially personal data — so "at
// least one" isn't enough; it must be exactly one. date-mode itself also
// exposes every booking's title and booker name org-wide for that day —
// that's not a gap, it's what FR-BKG-03/UC-06 explicitly ask the calendar to
// show, under the same no-authentication risk acceptance as the rest of the
// system (ADR-0002).
export const bookingListQuerySchema = z
  .object({
    employeeId: z.string({ error: "กรุณาระบุ employeeId" }).trim().min(1, "กรุณาระบุ employeeId").optional(),
    date: z
      .string({ error: "กรุณาระบุวันที่" })
      .regex(DATE_PATTERN, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
      .refine(isValidCalendarDate, "วันที่ไม่ถูกต้อง")
      .optional(),
    // Only meaningful in date-mode (the room usage calendar) — the refine
    // below rejects supplying either alongside employeeId, so a caller
    // never gets silence when the combination doesn't apply.
    building: z.string().trim().min(1).optional(),
    floor: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.employeeId) !== Boolean(data.date), {
    message: "กรุณาระบุ employeeId หรือ date อย่างใดอย่างหนึ่ง",
    path: [],
  })
  .refine((data) => !data.employeeId || (!data.building && !data.floor), {
    message: "building/floor ใช้ได้เฉพาะเมื่อระบุ date เท่านั้น",
    path: ["building"],
  });

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
