"use client";

import { Suspense, use, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiList } from "@/lib/use-api-list";
import { dayOfWeekForDate, toBangkokTimeString, todayInBangkok } from "@/lib/bangkok-time";
import { BOOKING_STATUS_LABELS } from "@/lib/booking-status";
import { bookingTitleOrFallback, employeeNameOrFallback } from "@/lib/erasure";

type Room = {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
  status: string;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
};

type Booking = {
  id: string;
  title: string | null;
  attendeeCount: number;
  startAt: string;
  endAt: string;
  status: string;
  employee: Employee | null;
};

type BusinessHoursDay = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
};

function RoomCalendar({ id }: { id: string }) {
  const [date, setDate] = useState(todayInBangkok());

  // No GET /api/rooms/:id endpoint exists — /book's page finds its room the
  // same way, out of the full list, so this isn't a new pattern.
  const { data: allRooms } = useApiList<Room>("/api/rooms");
  const room = allRooms.find((r) => r.id === id);

  const { data: bookings } = useApiList<Booking>(
    `/api/bookings?${new URLSearchParams({ date, roomId: id }).toString()}`,
  );

  const { data: businessHours } = useApiList<BusinessHoursDay>("/api/business-hours");
  const selectedDayOfWeek = dayOfWeekForDate(date);
  const todaysHours = businessHours.find((bh) => bh.dayOfWeek === selectedDayOfWeek) ?? null;
  const isClosedDay = todaysHours !== null && !todaysHours.isOpen;

  if (allRooms.length > 0 && !room) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-red-600">ไม่พบห้องประชุมนี้</p>
        <Link href="/rooms" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปหน้ารายชื่อห้อง
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">{room ? room.name : "ปฏิทินห้อง"}</h1>
      {room && (
        <p className="mb-6 text-sm text-muted-foreground">
          {room.building} ชั้น {room.floor} · Capacity {room.capacity}
        </p>
      )}

      <div className="mb-6 flex items-end justify-between gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="date">วันที่</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {room?.status === "active" && (
          <Link
            href={`/book?${new URLSearchParams({ roomId: id, date }).toString()}`}
            className={buttonVariants({ size: "sm" })}
          >
            จองห้องนี้
          </Link>
        )}
      </div>

      {isClosedDay && (
        <p className="mb-4 text-sm text-amber-700">
          วันที่เลือกเป็นวันหยุดทำการ อยู่นอก Business Hours
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เวลา</TableHead>
            <TableHead>หัวข้อ</TableHead>
            <TableHead>ผู้จอง</TableHead>
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="whitespace-normal text-center text-muted-foreground">
                ยังไม่มีการจองในวันนี้
              </TableCell>
            </TableRow>
          ) : (
            bookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>
                  <Link href={`/bookings/${booking.id}`} className="underline-offset-4 hover:underline">
                    {toBangkokTimeString(booking.startAt)}-{toBangkokTimeString(booking.endAt)}
                  </Link>
                </TableCell>
                <TableCell>{bookingTitleOrFallback(booking.title)}</TableCell>
                <TableCell>{employeeNameOrFallback(booking.employee)}</TableCell>
                <TableCell>{BOOKING_STATUS_LABELS[booking.status] ?? booking.status}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function RoomCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Suspense fallback={null}>
      <RoomCalendar id={id} />
    </Suspense>
  );
}
