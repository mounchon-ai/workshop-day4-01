import { z } from "zod";

export const bookingCancelSchema = z.object({
  employeeId: z.string({ error: "กรุณาเลือกผู้จอง" }).trim().min(1, "กรุณาเลือกผู้จอง"),
});

export type BookingCancelInput = z.infer<typeof bookingCancelSchema>;
