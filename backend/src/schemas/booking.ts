import { z } from "zod";
import { DATE_PATTERN, TIME_PATTERN, isValidCalendarDate, toBangkokInstant } from "../bangkok-time.js";

// IR-11 scopes the 409 "rule rejection" tier to Business Hours, Capacity,
// and Conflict only (FR-BKG-05 to 07) — those are evaluated in the route
// handler, not here. Everything below is completeness/format (IR-10),
// including time-range validity (FR-BKG-08) and the no-past-booking rule
// (FR-BKG-09), neither of which IR-11 names.
export const bookingInputSchema = z
  .object({
    roomId: z.string({ error: "กรุณาเลือกห้องประชุม" }).trim().min(1, "กรุณาเลือกห้องประชุม"),
    employeeId: z.string({ error: "กรุณาเลือกผู้จอง" }).trim().min(1, "กรุณาเลือกผู้จอง"),
    title: z
      .string({ error: "กรุณาระบุหัวข้อการประชุม" })
      .trim()
      .min(1, "กรุณาระบุหัวข้อการประชุม")
      .max(200, "หัวข้อการประชุมต้องไม่เกิน 200 ตัวอักษร"),
    attendeeCount: z
      .number({ error: "จำนวนผู้เข้าร่วมต้องเป็นตัวเลข" })
      .int("จำนวนผู้เข้าร่วมต้องเป็นจำนวนเต็ม")
      .min(1, "จำนวนผู้เข้าร่วมต้องมากกว่า 0"),
    date: z
      .string({ error: "กรุณาระบุวันที่" })
      .regex(DATE_PATTERN, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
      .refine(isValidCalendarDate, "วันที่ไม่ถูกต้อง"),
    startTime: z
      .string({ error: "กรุณาระบุเวลาเริ่ม" })
      .regex(TIME_PATTERN, "เวลาเริ่มต้องอยู่ในรูปแบบ HH:MM"),
    endTime: z
      .string({ error: "กรุณาระบุเวลาสิ้นสุด" })
      .regex(TIME_PATTERN, "เวลาสิ้นสุดต้องอยู่ในรูปแบบ HH:MM"),
  })
  .superRefine((data, ctx) => {
    const validStartTime = TIME_PATTERN.test(data.startTime);
    const validEndTime = TIME_PATTERN.test(data.endTime);

    if (validStartTime && validEndTime && data.endTime <= data.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม",
      });
    }

    if (DATE_PATTERN.test(data.date) && isValidCalendarDate(data.date) && validStartTime) {
      const startAt = toBangkokInstant(data.date, data.startTime);
      if (startAt.getTime() < Date.now()) {
        ctx.addIssue({
          code: "custom",
          path: ["startTime"],
          message: "ไม่สามารถจองเวลาที่ผ่านไปแล้วได้",
        });
      }
    }
  });

export type BookingInput = z.infer<typeof bookingInputSchema>;
