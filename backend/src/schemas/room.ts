import { z } from "zod";

export const roomInputSchema = z.object({
  name: z
    .string({ error: "กรุณาระบุชื่อห้อง" })
    .trim()
    .min(1, "กรุณาระบุชื่อห้อง")
    .max(100, "ชื่อห้องต้องไม่เกิน 100 ตัวอักษร"),
  capacity: z
    .number({ error: "Capacity ต้องเป็นตัวเลข" })
    .int("Capacity ต้องเป็นจำนวนเต็ม")
    .min(1, "Capacity ต้องมากกว่า 0")
    .max(500, "Capacity ต้องไม่เกิน 500"),
  building: z
    .string({ error: "กรุณาระบุอาคาร" })
    .trim()
    .min(1, "กรุณาระบุอาคาร")
    .max(100, "อาคารต้องไม่เกิน 100 ตัวอักษร"),
  floor: z
    .string({ error: "กรุณาระบุชั้น" })
    .trim()
    .min(1, "กรุณาระบุชั้น")
    .max(20, "ชั้นต้องไม่เกิน 20 ตัวอักษร"),
});

export type RoomInput = z.infer<typeof roomInputSchema>;
