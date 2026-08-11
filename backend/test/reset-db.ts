import { prisma } from "../src/prisma.js";

/**
 * Clears all tables between tests, in dependency order (children before
 * parents). Extend this — don't add per-table cleanup in individual test
 * files — as new tables with foreign keys (e.g. Booking -> Room/Employee)
 * are added.
 */
export async function resetDb() {
  await prisma.room.deleteMany();
  await prisma.employee.deleteMany();
}
