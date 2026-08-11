import { prisma } from "../src/prisma.js";
import { DEFAULT_BUSINESS_HOURS } from "../src/business-hours-defaults.js";

/**
 * Clears all tables between tests, in dependency order (children before
 * parents). Extend this — don't add per-table cleanup in individual test
 * files — as new tables with foreign keys (e.g. Booking -> Room/Employee)
 * are added.
 */
export async function resetDb() {
  await prisma.room.deleteMany();
  await prisma.employee.deleteMany();

  // BusinessHours is a fixed 7-row settings table with no create/delete
  // endpoint (DR-05) — reset it back to defaults rather than deleting it,
  // so every test starts from the same 7 rows the migration seeds.
  for (const day of DEFAULT_BUSINESS_HOURS) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: day.dayOfWeek },
      update: day,
      create: day,
    });
  }
}
