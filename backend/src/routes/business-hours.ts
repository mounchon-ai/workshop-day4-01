import { Router } from "express";
import { prisma } from "../prisma.js";
import { businessHoursInputSchema } from "../schemas/business-hours.js";
import { parseBody } from "../validation.js";

export const businessHoursRouter = Router();

businessHoursRouter.get("/api/business-hours", async (_req, res, next) => {
  try {
    const hours = await prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    res.status(200).json(hours);
  } catch (err) {
    next(err);
  }
});

businessHoursRouter.put("/api/business-hours", async (req, res, next) => {
  const parsed = parseBody(businessHoursInputSchema, req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", fields: parsed.errors });
    return;
  }

  try {
    // All 7 rows always exist (seeded by migration, never created/deleted),
    // so this is always an update, never an upsert.
    await prisma.$transaction(
      parsed.data.map((day) =>
        prisma.businessHours.update({
          where: { dayOfWeek: day.dayOfWeek },
          data: { openTime: day.openTime, closeTime: day.closeTime, isOpen: day.isOpen },
        }),
      ),
    );

    const hours = await prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    res.status(200).json(hours);
  } catch (err) {
    next(err);
  }
});
