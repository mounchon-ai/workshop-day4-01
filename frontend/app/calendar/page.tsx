"use client";

import { useState } from "react";
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
  room: Room;
  employee: Employee | null;
};

type BusinessHoursDay = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
};

type RoomGroup = { room: Room; bookings: Booking[] };

// The API returns bookings pre-sorted by room name then start time (FR-BKG-03),
// so bookings belonging to the same room are always contiguous — grouping is
// just a linear scan, no sort/lookup needed here.
function groupByRoom(bookings: Booking[]): RoomGroup[] {
  const groups: RoomGroup[] = [];
  for (const booking of bookings) {
    const current = groups[groups.length - 1];
    if (current && current.room.id === booking.room.id) {
      current.bookings.push(booking);
    } else {
      groups.push({ room: booking.room, bookings: [booking] });
    }
  }
  return groups;
}

export default function CalendarPage() {
  const [date, setDate] = useState(todayInBangkok());
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");

  const { data: allRooms } = useApiList<Room>("/api/rooms");
  const activeRooms = allRooms.filter((room) => room.status === "active");
  const buildings = Array.from(new Set(activeRooms.map((room) => room.building))).sort();
  const floors = Array.from(new Set(activeRooms.map((room) => room.floor))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const params = new URLSearchParams({ date });
  if (building) params.set("building", building);
  if (floor) params.set("floor", floor);
  const { data: bookings } = useApiList<Booking>(`/api/bookings?${params.toString()}`);

  const { data: businessHours } = useApiList<BusinessHoursDay>("/api/business-hours");
  const selectedDayOfWeek = dayOfWeekForDate(date);
  const todaysHours = businessHours.find((bh) => bh.dayOfWeek === selectedDayOfWeek) ?? null;
  const isClosedDay = todaysHours !== null && !todaysHours.isOpen;

  const groups = groupByRoom(bookings);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ปฏิทินการใช้ห้อง</h1>

      <div className="mb-6 grid grid-cols-3 gap-4 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="date">วันที่</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="building">อาคาร</Label>
          <select
            id="building"
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">ทุกอาคาร</option>
            {buildings.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="floor">ชั้น</Label>
          <select
            id="floor"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">ทุกชั้น</option>
            {floors.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isClosedDay && (
        <p className="mb-4 text-sm text-amber-700">
          วันที่เลือกเป็นวันหยุดทำการ อยู่นอก Business Hours
        </p>
      )}

      {groups.length === 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ห้อง</TableHead>
              <TableHead>เวลา</TableHead>
              <TableHead>หัวข้อ</TableHead>
              <TableHead>ผู้จอง</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="whitespace-normal text-center text-muted-foreground">
                ยังไม่มีการจองในวันนี้
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.room.id}>
              <h2 className="mb-2 text-lg font-medium">
                {group.room.name} ({group.room.building} ชั้น {group.room.floor})
              </h2>
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
                  {group.bookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell>
                        {toBangkokTimeString(booking.startAt)}-{toBangkokTimeString(booking.endAt)}
                      </TableCell>
                      <TableCell>{bookingTitleOrFallback(booking.title)}</TableCell>
                      <TableCell>{employeeNameOrFallback(booking.employee)}</TableCell>
                      <TableCell>{BOOKING_STATUS_LABELS[booking.status] ?? booking.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
