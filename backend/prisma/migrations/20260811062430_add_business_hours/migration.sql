-- CreateTable
CREATE TABLE "BusinessHours" (
    "dayOfWeek" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- Seed default Business Hours (dayOfWeek follows JS Date#getDay: 0 = Sunday
-- ... 6 = Saturday): 08:00-18:00, Monday-Friday open, Saturday-Sunday closed.
-- Ready from first run, no application-level seed step required.
INSERT INTO "BusinessHours" ("dayOfWeek", "openTime", "closeTime", "isOpen", "updatedAt") VALUES
    (0, '08:00', '18:00', 0, CURRENT_TIMESTAMP),
    (1, '08:00', '18:00', 1, CURRENT_TIMESTAMP),
    (2, '08:00', '18:00', 1, CURRENT_TIMESTAMP),
    (3, '08:00', '18:00', 1, CURRENT_TIMESTAMP),
    (4, '08:00', '18:00', 1, CURRENT_TIMESTAMP),
    (5, '08:00', '18:00', 1, CURRENT_TIMESTAMP),
    (6, '08:00', '18:00', 0, CURRENT_TIMESTAMP);
