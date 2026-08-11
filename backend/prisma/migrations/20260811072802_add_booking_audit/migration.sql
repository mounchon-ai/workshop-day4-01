-- CreateTable
CREATE TABLE "BookingAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorEmployeeId" TEXT NOT NULL,
    "detail" TEXT,
    "actedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingAudit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
