import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dayInputSchema = z
  .object({
    dayOfWeek: z
      .number({ error: "กรุณาระบุวันในสัปดาห์" })
      .int("วันในสัปดาห์ต้องเป็นจำนวนเต็ม")
      .min(0, "วันในสัปดาห์ต้องอยู่ระหว่าง 0–6")
      .max(6, "วันในสัปดาห์ต้องอยู่ระหว่าง 0–6"),
    openTime: z
      .string({ error: "กรุณาระบุเวลาเปิด" })
      .regex(timePattern, "เวลาเปิดต้องอยู่ในรูปแบบ HH:MM"),
    closeTime: z
      .string({ error: "กรุณาระบุเวลาปิด" })
      .regex(timePattern, "เวลาปิดต้องอยู่ในรูปแบบ HH:MM"),
    isOpen: z.boolean({ error: "กรุณาระบุสถานะวันทำการ" }),
  })
  .refine((day) => day.closeTime > day.openTime, {
    message: "เวลาปิดต้องมากกว่าเวลาเปิด",
    path: ["closeTime"],
  });

export const businessHoursInputSchema = z
  .array(dayInputSchema)
  .length(7, "ต้องระบุค่าตั้งค่าครบทั้ง 7 วัน")
  .refine((days) => new Set(days.map((day) => day.dayOfWeek)).size === 7, {
    message: "วันในสัปดาห์ต้องไม่ซ้ำกันและครบ 0–6",
  });

export type BusinessHoursInput = z.infer<typeof businessHoursInputSchema>;
