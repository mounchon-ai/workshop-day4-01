"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type BusinessHoursDay = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
};

// dayOfWeek follows JS Date#getDay: 0 = Sunday ... 6 = Saturday.
const DAY_NAMES = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

function sortByDay(days: BusinessHoursDay[]) {
  return [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

export default function AdminBusinessHoursPage() {
  const { data: businessHours, refresh } = useApiList<BusinessHoursDay>("/api/business-hours");
  const [rows, setRows] = useState<BusinessHoursDay[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Adjust local edit state during render when a new fetch lands (initial
  // load, or the re-fetch after a successful save), per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  // Storing the last-seen reference keeps this from re-running every render.
  const [syncedBusinessHours, setSyncedBusinessHours] = useState(businessHours);
  if (businessHours !== syncedBusinessHours) {
    setSyncedBusinessHours(businessHours);
    if (businessHours.length > 0) {
      setRows(sortByDay(businessHours));
    }
  }

  function fieldError(dayOfWeek: number, field: string) {
    return fieldErrors.find((e) => e.field === `${dayOfWeek}.${field}`)?.message;
  }

  function updateRow(dayOfWeek: number, patch: Partial<BusinessHoursDay>) {
    setRows((prev) => prev.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors([]);
    setGeneralError(null);
    setSaved(false);

    const result = await apiRequest<BusinessHoursDay[]>("/api/business-hours", {
      method: "PUT",
      body: JSON.stringify(rows),
    });

    setSubmitting(false);

    if (!result.ok) {
      if (result.body.fields) {
        setFieldErrors(result.body.fields);
        const rootError = result.body.fields.find((f) => f.field === "_root");
        setGeneralError(rootError?.message ?? null);
      } else if (result.body.message) {
        setGeneralError(result.body.message);
      } else {
        setGeneralError("เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
      return;
    }

    setSaved(true);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">ตั้งค่าช่วงเวลาทำการ</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {generalError && <p className="text-sm text-red-600">{generalError}</p>}
        {saved && <p className="text-sm text-green-600">บันทึกสำเร็จ</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>วัน</TableHead>
              <TableHead>เปิดใช้งาน</TableHead>
              <TableHead>เวลาเปิด</TableHead>
              <TableHead>เวลาปิด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.dayOfWeek}>
                <TableCell>{DAY_NAMES[row.dayOfWeek]}</TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={row.isOpen}
                    onChange={(e) => updateRow(row.dayOfWeek, { isOpen: e.target.checked })}
                    aria-label={`เปิดใช้งานวัน${DAY_NAMES[row.dayOfWeek]}`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    value={row.openTime}
                    onChange={(e) => updateRow(row.dayOfWeek, { openTime: e.target.value })}
                  />
                  {fieldError(row.dayOfWeek, "openTime") && (
                    <p className="text-sm text-red-600">{fieldError(row.dayOfWeek, "openTime")}</p>
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    type="time"
                    value={row.closeTime}
                    onChange={(e) => updateRow(row.dayOfWeek, { closeTime: e.target.value })}
                  />
                  {fieldError(row.dayOfWeek, "closeTime") && (
                    <p className="text-sm text-red-600">{fieldError(row.dayOfWeek, "closeTime")}</p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div>
          <Button type="submit" disabled={submitting || rows.length === 0}>
            บันทึกการเปลี่ยนแปลง
          </Button>
        </div>
      </form>
    </div>
  );
}
