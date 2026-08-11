"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, type FieldError } from "@/lib/api";
import { useApiList } from "@/lib/use-api-list";
import { EmployeePicker, type Employee } from "@/components/employee-picker";

type Room = {
  id: string;
  name: string;
  capacity: number;
  building: string;
  floor: string;
};

type BookingDetail = {
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

function formatBangkok(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

function BookingForm() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId") ?? "";
  const date = searchParams.get("date") ?? "";
  const startTime = searchParams.get("startTime") ?? "";
  const endTime = searchParams.get("endTime") ?? "";

  const { data: allRooms } = useApiList<Room>("/api/rooms");
  const room = allRooms.find((r) => r.id === roomId);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [title, setTitle] = useState("");
  const [attendeeCount, setAttendeeCount] = useState(searchParams.get("attendeeCount") ?? "");

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<BookingDetail | null>(null);

  function fieldError(field: string) {
    return fieldErrors.find((e) => e.field === field)?.message;
  }

  // date/startTime/endTime/roomId are shown as read-only summary text, not
  // editable inputs on this page (they're carried over from search), so
  // errors on those fields (e.g. FR-BKG-09's past-start-time check) have no
  // input to render next to — surface them as a banner instead.
  const attachedFields = new Set(["employeeId", "title", "attendeeCount"]);
  const unattachedFieldErrors = fieldErrors.filter((e) => !attachedFields.has(e.field));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors([]);
    setReasons([]);
    setGeneralError(null);

    const trimmedAttendeeCount = attendeeCount.trim();
    const result = await apiRequest<BookingDetail>("/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        roomId,
        employeeId: employee?.id ?? "",
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

    setBooked(result.data);
  }

  if (booked) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="mb-6 text-2xl font-semibold">จองสำเร็จ</h1>
        <div className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <p>
            <span className="font-medium">ห้อง:</span> {booked.room.name} ({booked.room.building} ชั้น{" "}
            {booked.room.floor})
          </p>
          <p>
            <span className="font-medium">ผู้จอง:</span> {booked.employee.firstName}{" "}
            {booked.employee.lastName}
          </p>
          <p>
            <span className="font-medium">หัวข้อ:</span> {booked.title}
          </p>
          <p>
            <span className="font-medium">เวลาเริ่ม:</span> {formatBangkok(booked.startAt)}
          </p>
          <p>
            <span className="font-medium">เวลาสิ้นสุด:</span> {formatBangkok(booked.endAt)}
          </p>
          <p>
            <span className="font-medium">จำนวนผู้เข้าร่วม:</span> {booked.attendeeCount}
          </p>
          <p>
            <span className="font-medium">สถานะ:</span> ยืนยันแล้ว
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          ค้นหาห้องอื่น
        </Link>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <p className="text-sm text-red-600">ไม่พบข้อมูลห้องที่ต้องการจอง กรุณากลับไปค้นหาใหม่</p>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          กลับไปค้นหาห้อง
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ยืนยันการจอง</h1>

      <div className="mb-6 rounded-lg border p-4 text-sm">
        <p>
          <span className="font-medium">ห้อง:</span> {room ? room.name : roomId}
          {room && ` (${room.building} ชั้น ${room.floor}, Capacity ${room.capacity})`}
        </p>
        <p>
          <span className="font-medium">วันที่:</span> {date}
        </p>
        <p>
          <span className="font-medium">เวลา:</span> {startTime}-{endTime}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {generalError && <p className="text-sm text-red-600">{generalError}</p>}

        {unattachedFieldErrors.length > 0 && (
          <div className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900">
            <ul className="list-inside list-disc">
              {unattachedFieldErrors.map((error) => (
                <li key={error.field}>{error.message}</li>
              ))}
            </ul>
          </div>
        )}

        {reasons.length > 0 && (
          <div className="rounded-md border border-red-400 bg-red-50 p-3 text-sm text-red-900">
            <p className="mb-1 font-medium">ไม่สามารถจองได้ เนื่องจาก:</p>
            <ul className="list-inside list-disc">
              {reasons.map((reason) => (
                <li key={reason.rule}>{reason.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="employee">ผู้จอง</Label>
          <EmployeePicker value={employee} onChange={setEmployee} />
          {fieldError("employeeId") && (
            <p className="text-sm text-red-600">{fieldError("employeeId")}</p>
          )}
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

        <div>
          <Button type="submit" disabled={submitting}>
            ยืนยันการจอง
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookingForm />
    </Suspense>
  );
}
