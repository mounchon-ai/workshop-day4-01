import { z } from "zod";
import { isValidCalendarDate } from "../bangkok-time.js";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const roomSearchQuerySchema = z
  .object({
    date: z
      .string({ error: "กรุณาระบุวันที่" })
      .regex(datePattern, "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)")
      .refine(isValidCalendarDate, "วันที่ไม่ถูกต้อง"),
    startTime: z
      .string({ error: "กรุณาระบุเวลาเริ่ม" })
      .regex(timePattern, "เวลาเริ่มต้องอยู่ในรูปแบบ HH:MM"),
    endTime: z
      .string({ error: "กรุณาระบุเวลาสิ้นสุด" })
      .regex(timePattern, "เวลาสิ้นสุดต้องอยู่ในรูปแบบ HH:MM"),
    attendeeCount: z.coerce
      .number({ error: "จำนวนผู้เข้าร่วมต้องเป็นตัวเลข" })
      .int("จำนวนผู้เข้าร่วมต้องเป็นจำนวนเต็ม")
      .min(1, "จำนวนผู้เข้าร่วมต้องมากกว่า 0"),
    building: z.string().trim().min(1).optional(),
    floor: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม",
    path: ["endTime"],
  });

export type RoomSearchQuery = z.infer<typeof roomSearchQuerySchema>;
