"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, type FieldError } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";
import { formatBangkok, toBangkokDateString, toBangkokTimeString } from "@/lib/bangkok-time";
import { useNow } from "@/lib/use-now";

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
  title: string;
  attendeeCount: number;
  startAt: string;
  endAt: string;
  status: string;
  room: Room;
  employee: Employee;
};

type RejectionReason = { rule: string; message: string };

function EditBookingForm({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const employeeId = searchParams.get("employeeId") ?? "";
  const detailHref = `/bookings/${id}${employeeId ? `?employeeId=${employeeId}` : ""}`;

  const { data: allRooms } = useApiList<Room>("/api/rooms");

  const [booking, setBooking] = useState<Booking | null>(null);
  const [notFound, setNotFound] = useState(false);
  const now = useNow();

  // GET /api/rooms returns every room regardless of status, so the
  // booking's current room is always present here — but it must stay
  // selectable even if it's since been disabled (FR-ROOM-05 keeps booking
  // history intact), otherwise the <select> has no option matching the
  // pre-filled roomId state below.
  const roomOptions = allRooms.filter(
    (room) => room.status === "active" || room.id === booking?.room.id,
  );

  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Pre-fill the form once the booking loads, guarded on the booking
  // reference (render-time sync, not an effect — see the business-hours
  // admin page for the same pattern) so it only runs once per fetch.
  const [syncedBooking, setSyncedBooking] = useState<Booking | null>(null);
  if (booking !== syncedBooking) {
    setSyncedBooking(booking);
    if (booking) {
      setRoomId(booking.room.id);
      setTitle(booking.title);
      setAttendeeCount(String(booking.attendeeCount));
      setDate(toBangkokDateString(booking.startAt));
      setStartTime(toBangkokTimeString(booking.startAt));
      setEndTime(toBangkokTimeString(booking.endAt));
    }
  }

  useEffect(() => {
    let ignore = false;
    apiRequest<Booking>(`/api/bookings/${id}`).then((result) => {
      if (ignore) return;
      if (result.ok) {
        setBooking(result.data);
      } else {
        setNotFound(true);
      }
    });
    return () => {
      ignore = true;
    };
  }, [id]);

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState<Booking | null>(null);

  function fieldError(field: string) {
    return fieldErrors.find((e) => e.field === field)?.message;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors([]);
    setReasons([]);
    setGeneralError(null);

    const trimmedAttendeeCount = attendeeCount.trim();
    const result = await apiRequest<Booking>(`/api/bookings/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        roomId,
        employeeId,
        title,
        attendeeCount: trimmedAttendeeCount === "" ? null : Number(trimmedAttendeeCount),
        date,
        startTime,
        endTime,
      }),
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.body.error === "booking_rejected") {
        const body = result.body as { reasons?: RejectionReason[] };
        setReasons(body.reasons ?? []);
      } else if (result.body.fields) {
        setFieldErrors(result.body.fields);
      } else {
        setGeneralError(result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
      return;
    }

    setSaved(result.data);
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm text-red-600">ไม่พบ Booking ที่ต้องการ</p>
        <Link href="/bookings" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปที่รายการ
        </Link>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="mb-6 text-2xl font-semibold">แก้ไขสำเร็จ</h1>
        <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <p>
            <span className="font-medium">ห้อง:</span> {saved.room.name} ({saved.room.building} ชั้น{" "}
            {saved.room.floor})
          </p>
          <p>
            <span className="font-medium">หัวข้อ:</span> {saved.title}
          </p>
          <p>
            <span className="font-medium">เวลาเริ่ม:</span> {formatBangkok(saved.startAt)}
          </p>
          <p>
            <span className="font-medium">เวลาสิ้นสุด:</span> {formatBangkok(saved.endAt)}
          </p>
          <p>
            <span className="font-medium">จำนวนผู้เข้าร่วม:</span> {saved.attendeeCount}
          </p>
        </div>
        <Link href={detailHref} className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          กลับไปดูรายละเอียด
        </Link>
      </div>
    );
  }

  if (!booking) {
    return null;
  }

  // Ownership is checked first, before the edit form is shown at all — the
  // same gate PUT enforces authoritatively (FR-BKG-12), mirrored here so a
  // non-owner (or a stale/direct link) never sees a form that can only fail.
  if (employeeId !== booking.employee.id) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm text-red-600">แก้ไขได้เฉพาะเจ้าของ Booking เท่านั้น</p>
        <Link href={detailHref} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปดูรายละเอียด
        </Link>
      </div>
    );
  }

  // A cancelled booking has no path back to "confirmed" (DR-08) — mirrored
  // here the same way ownership and ended are, so the form never renders
  // just to fail against PUT's booking_cancelled check.
  if (booking.status === "cancelled") {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm text-red-600">Booking นี้ถูกยกเลิกไปแล้ว ไม่สามารถแก้ไขได้</p>
        <Link href={detailHref} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปดูรายละเอียด
        </Link>
      </div>
    );
  }

  if (new Date(booking.endAt).getTime() < now) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm text-red-600">Booking นี้ผ่านไปแล้ว ไม่สามารถแก้ไขได้</p>
        <Link href={detailHref} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปดูรายละเอียด
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">แก้ไข Booking</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {generalError && <p className="text-sm text-red-600">{generalError}</p>}

        {reasons.length > 0 && (
          <div className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900">
            <p className="mb-1 font-medium">ไม่สามารถบันทึกการแก้ไขได้ เนื่องจาก:</p>
            <ul className="list-inside list-disc">
              {reasons.map((reason) => (
                <li key={reason.rule}>{reason.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="room">ห้อง</Label>
          <select
            id="room"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {roomOptions.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} ({room.building} ชั้น {room.floor})
              </option>
            ))}
          </select>
          {fieldError("roomId") && <p className="text-sm text-red-600">{fieldError("roomId")}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="title">หัวข้อการประชุม</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          {fieldError("title") && <p className="text-sm text-red-600">{fieldError("title")}</p>}
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
          <Label htmlFor="date">วันที่</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {fieldError("date") && <p className="text-sm text-red-600">{fieldError("date")}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
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
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            บันทึกการแก้ไข
          </Button>
          <Link href={detailHref} className={buttonVariants({ variant: "outline" })}>
            ยกเลิก
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function EditBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <Suspense fallback={null}>
      <EditBookingForm id={id} />
    </Suspense>
  );
}
