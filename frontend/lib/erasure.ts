// PDPA erasure-on-request (ticket 12) nulls Booking.employeeId/title instead
// of deleting the row (room/time/attendeeCount survive for anonymous
// statistics, NFR-PDPA-07) — these fill in for the nulled fields wherever a
// booking is displayed.
export const ANONYMIZED_TITLE = "(ข้อมูลถูกลบตามคำขอ PDPA)";
export const ANONYMIZED_EMPLOYEE_LABEL = "(ผู้ใช้ที่ถูกลบข้อมูล)";

export function bookingTitleOrFallback(title: string | null): string {
  return title ?? ANONYMIZED_TITLE;
}

export function employeeNameOrFallback(
  employee: { firstName: string; lastName: string } | null,
): string {
  return employee ? `${employee.firstName} ${employee.lastName}` : ANONYMIZED_EMPLOYEE_LABEL;
}
