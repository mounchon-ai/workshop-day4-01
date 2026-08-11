"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiList } from "@/lib/use-api-list";
import { EmployeePicker, type Employee } from "@/components/employee-picker";
import { formatBangkokCompact } from "@/lib/bangkok-time";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status";
import { bookingTitleOrFallback } from "@/lib/erasure";
import { useNow } from "@/lib/use-now";

type Room = {
  id: string;
  name: string;
  building: string;
  floor: string;
};

type Booking = {
  id: string;
  title: string | null;
  attendeeCount: number;
  startAt: string;
  endAt: string;
  status: string;
  room: Room;
  employee: Employee | null;
};

function MyBookings() {
  const searchParams = useSearchParams();
  const initialEmployeeId = searchParams.get("employeeId");

  const { data: allEmployees } = useApiList<Employee>("/api/employees");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  // Pre-select the employee carried over via ?employeeId= (e.g. coming back
  // from a booking's detail page) once the employee list has loaded. Guarded
  // on the list reference, not on employeeId/employee, so a user who
  // deliberately clears the picker doesn't get silently re-selected.
  const [syncedEmployees, setSyncedEmployees] = useState(allEmployees);
  if (allEmployees !== syncedEmployees) {
    setSyncedEmployees(allEmployees);
    if (initialEmployeeId) {
      const match = allEmployees.find((e) => e.id === initialEmployeeId);
      if (match) setEmployee(match);
    }
  }

  const path = employee ? `/api/bookings?employeeId=${employee.id}` : null;
  const { data: bookings } = useApiList<Booking>(path);

  const now = useNow();
  const upcoming = bookings.filter((b) => new Date(b.endAt).getTime() >= now);
  const visibleBookings = upcomingOnly ? upcoming : bookings;

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Booking ของฉัน</h1>

      <div className="mb-6 max-w-sm">
        <EmployeePicker value={employee} onChange={setEmployee} />
      </div>

      {!employee && (
        <p className="text-sm text-muted-foreground">กรุณาเลือกชื่อพนักงานเพื่อดูรายการ Booking</p>
      )}

      {employee && bookings.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            {employee.firstName} {employee.lastName} ยังไม่มีรายการ Booking
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            ค้นหาห้องว่าง
          </Link>
        </div>
      )}

      {employee && bookings.length > 0 && (
        <>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={upcomingOnly}
              onChange={(e) => setUpcomingOnly(e.target.checked)}
            />
            แสดงเฉพาะที่ยังไม่ผ่าน
          </label>

          {visibleBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีรายการที่ยังไม่ผ่าน</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ห้อง</TableHead>
                  <TableHead>เวลาเริ่ม</TableHead>
                  <TableHead>หัวข้อ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell>{booking.room.name}</TableCell>
                    <TableCell>{formatBangkokCompact(booking.startAt)}</TableCell>
                    <TableCell>{bookingTitleOrFallback(booking.title)}</TableCell>
                    <TableCell>{BOOKING_STATUS_LABELS[booking.status] ?? booking.status}</TableCell>
                    <TableCell>
                      <Link
                        href={`/bookings/${booking.id}?employeeId=${employee.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        ดูรายละเอียด
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <MyBookings />
    </Suspense>
  );
}
