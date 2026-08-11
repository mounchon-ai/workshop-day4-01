import { z } from "zod";

export const employeeInputSchema = z.object({
  firstName: z
    .string({ error: "กรุณาระบุชื่อ" })
    .trim()
    .min(1, "กรุณาระบุชื่อ")
    .max(100, "ชื่อต้องไม่เกิน 100 ตัวอักษร"),
  lastName: z
    .string({ error: "กรุณาระบุนามสกุล" })
    .trim()
    .min(1, "กรุณาระบุนามสกุล")
    .max(100, "นามสกุลต้องไม่เกิน 100 ตัวอักษร"),
  department: z
    .string({ error: "กรุณาระบุหน่วยงาน" })
    .trim()
    .min(1, "กรุณาระบุหน่วยงาน")
    .max(100, "หน่วยงานต้องไม่เกิน 100 ตัวอักษร"),
  confirmDuplicate: z.boolean().optional(),
});

export type EmployeeInput = z.infer<typeof employeeInputSchema>;
