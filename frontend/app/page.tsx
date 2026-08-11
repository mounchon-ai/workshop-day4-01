"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { apiRequest, type FieldError } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";

type Room = {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
  status: string;
};

type BusinessHoursDay = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
};

type SearchResult =
  | { kind: "idle" }
  | { kind: "results"; rooms: Room[] }
  | { kind: "empty" }
  | { kind: "outside_hours"; businessHours: BusinessHoursDay | null };

function todayInBangkok() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export default function Home() {
  const { data: allRooms } = useApiList<Room>("/api/rooms");
  // Only active rooms can ever show up in search results, so a
  // building/floor combination that only has disabled rooms shouldn't be
  // offered as a filter option here.
  const activeRooms = allRooms.filter((room) => room.status === "active");
  const buildings = Array.from(new Set(activeRooms.map((room) => room.building))).sort();
  const floors = Array.from(new Set(activeRooms.map((room) => room.floor))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const [date, setDate] = useState(todayInBangkok());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  function fieldError(field: string) {
    return fieldErrors.find((e) => e.field === field)?.message;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors([]);
    setGeneralError(null);

    const params = new URLSearchParams({ date, startTime, endTime, attendeeCount });
    if (building) params.set("building", building);
    if (floor) params.set("floor", floor);

    const response = await apiRequest<Room[]>(`/api/rooms/available?${params.toString()}`);

    setSubmitting(false);

    if (!response.ok) {
      if (response.body.error === "outside_business_hours") {
        const body = response.body as { businessHours?: BusinessHoursDay };
        setResult({ kind: "outside_hours", businessHours: body.businessHours ?? null });
      } else if (response.body.fields) {
        setFieldErrors(response.body.fields);
        setResult({ kind: "idle" });
      } else {
        setGeneralError(response.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
        setResult({ kind: "idle" });
      }
      return;
    }

    setResult(response.data.length > 0 ? { kind: "results", rooms: response.data } : { kind: "empty" });
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ค้นหาห้องประชุมว่าง</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-4 rounded-lg border p-4">
        {generalError && <p className="text-sm text-red-600">{generalError}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="date">วันที่</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {fieldError("date") && <p className="text-sm text-red-600">{fieldError("date")}</p>}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="attendeeCount">จำนวนผู้เข้าร่วม</Label>
            <Input
              id="attendeeCount"
              type="number"
              min={1}
              value={attendeeCount}
              onChange={(e) => setAttendeeCount(e.target.value)}
            />
            {fieldError("attendeeCount") && (
              <p className="text-sm text-red-600">{fieldError("attendeeCount")}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="startTime">เวลาเริ่ม</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            {fieldError("startTime") && (
              <p className="text-sm text-red-600">{fieldError("startTime")}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="endTime">เวลาสิ้นสุด</Label>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
            {fieldError("endTime") && <p className="text-sm text-red-600">{fieldError("endTime")}</p>}
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

        <div>
          <Button type="submit" disabled={submitting}>
            ค้นหาห้องว่าง
          </Button>
        </div>
      </form>

      {result.kind === "outside_hours" && (
        <p className="text-sm text-amber-700">
          {result.businessHours?.isOpen
            ? `ช่วงเวลาที่ระบุอยู่นอกเวลาทำการ วันนี้เปิดทำการ ${result.businessHours.openTime}-${result.businessHours.closeTime}`
            : "วันที่เลือกเป็นวันหยุดทำการ ไม่เปิดให้จองห้องประชุม"}
        </p>
      )}

      {result.kind === "empty" && (
        <p className="text-sm text-muted-foreground">
          ไม่พบห้องว่างตรงเงื่อนไข ลองปรับช่วงเวลาหรือจำนวนผู้เข้าร่วม
        </p>
      )}

      {result.kind === "results" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อห้อง</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>อาคาร</TableHead>
              <TableHead>ชั้น</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rooms.map((room) => (
              <TableRow key={room.id}>
                <TableCell>{room.name}</TableCell>
                <TableCell>{room.capacity}</TableCell>
                <TableCell>{room.building}</TableCell>
                <TableCell>{room.floor}</TableCell>
                <TableCell>
                  <Link
                    href={`/book?${new URLSearchParams({
                      roomId: room.id,
                      date,
                      startTime,
                      endTime,
                      attendeeCount,
                    }).toString()}`}
                    className={buttonVariants({ size: "sm" })}
                  >
                    จองห้องนี้
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
