"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { useDebouncedValue } from "@/lib/use-debounced-value";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  status: string;
};

const emptyForm = { firstName: "", lastName: "", department: "" };

export default function AdminEmployeesPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const employeesPath = debouncedSearch
    ? `/api/employees?search=${encodeURIComponent(debouncedSearch)}`
    : "/api/employees";
  const { data: employees, refresh: refreshEmployees } = useApiList<Employee>(employeesPath);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmingErasureId, setConfirmingErasureId] = useState<string | null>(null);
  const [rowActingId, setRowActingId] = useState<string | null>(null);
  // Keyed by employee id (not a single slot) — two different rows' actions
  // can fail around the same time, and each row's error must stay visible
  // on its own row rather than the later failure hiding the earlier one.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  function setRowError(employeeId: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev };
      if (message === null) {
        delete next[employeeId];
      } else {
        next[employeeId] = message;
      }
      return next;
    });
  }

  function fieldError(field: string) {
    return fieldErrors.find((e) => e.field === field)?.message;
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id);
    setForm({
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department,
    });
    resetFeedback();
  }

  function resetFeedback() {
    setFieldErrors([]);
    setGeneralError(null);
    setDuplicateWarning(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    resetFeedback();
  }

  async function submitEmployee(confirmDuplicate: boolean) {
    setSubmitting(true);

    const payload = { ...form, confirmDuplicate };

    const result = editingId
      ? await apiRequest<Employee>(`/api/employees/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        })
      : await apiRequest<Employee>("/api/employees", {
          method: "POST",
          body: JSON.stringify(payload),
        });

    setSubmitting(false);

    if (!result.ok) {
      if (result.body.error === "duplicate_employee_name") {
        setDuplicateWarning(result.body.message ?? "มีชื่อนี้อยู่แล้ว");
        return;
      }
      if (result.body.fields) {
        setFieldErrors(result.body.fields);
      } else {
        setGeneralError(result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
      return;
    }

    cancelEdit();
    await refreshEmployees();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetFeedback();
    await submitEmployee(false);
  }

  async function handleConfirmDuplicate() {
    await submitEmployee(true);
  }

  async function toggleStatus(employee: Employee) {
    setRowActingId(employee.id);
    setRowError(employee.id, null);

    const nextStatus = employee.status === "active" ? "disabled" : "active";
    const result = await apiRequest<Employee>(`/api/employees/${employee.id}`, {
      method: "PUT",
      body: JSON.stringify({
        firstName: employee.firstName,
        lastName: employee.lastName,
        department: employee.department,
        status: nextStatus,
        // A toggle never changes the name, so it can't create a NEW
        // duplicate — without this, an employee sharing a name with
        // another (an explicitly supported state, confirmed at
        // creation/edit time) could never have its status toggled again,
        // since the same duplicate the admin already confirmed once would
        // otherwise re-block every subsequent PUT forever.
        confirmDuplicate: true,
      }),
    });

    setRowActingId(null);

    if (!result.ok) {
      setRowError(employee.id, result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }

    await refreshEmployees();
  }

  async function confirmErasure(employee: Employee) {
    setRowActingId(employee.id);
    setRowError(employee.id, null);

    const result = await apiRequest<{ count: number }>(`/api/employees/${employee.id}/erasure`, {
      method: "POST",
    });

    setRowActingId(null);
    setConfirmingErasureId(null);

    if (!result.ok) {
      setRowError(employee.id, result.body.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
      return;
    }

    await refreshEmployees();
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">จัดการรายการ Employee</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-medium">{editingId ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงานใหม่"}</h2>

        {generalError && <p className="text-sm text-red-600">{generalError}</p>}

        {duplicateWarning && (
          <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{duplicateWarning}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={submitting}
              onClick={handleConfirmDuplicate}
            >
              ยืนยันบันทึกถึงจะซ้ำ
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="firstName">ชื่อ</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          {fieldError("firstName") && (
            <p className="text-sm text-red-600">{fieldError("firstName")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="lastName">นามสกุล</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
          {fieldError("lastName") && (
            <p className="text-sm text-red-600">{fieldError("lastName")}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="department">หน่วยงาน</Label>
          <Input
            id="department"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          {fieldError("department") && (
            <p className="text-sm text-red-600">{fieldError("department")}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {editingId ? "บันทึกการแก้ไข" : "เพิ่มพนักงาน"}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              ยกเลิก
            </Button>
          )}
        </div>
      </form>

      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor="search">ค้นหาจากชื่อหรือนามสกุล</Label>
        <Input
          id="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="พิมพ์บางส่วนของชื่อ..."
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>นามสกุล</TableHead>
            <TableHead>หน่วยงาน</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id}>
              <TableCell>{employee.firstName}</TableCell>
              <TableCell>{employee.lastName}</TableCell>
              <TableCell>{employee.department}</TableCell>
              <TableCell>{employee.status === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}</TableCell>
              <TableCell>
                {rowErrors[employee.id] && (
                  <p className="mb-1 whitespace-normal text-sm text-red-600">
                    {rowErrors[employee.id]}
                  </p>
                )}
                {confirmingErasureId === employee.id ? (
                  <div className="flex flex-col gap-1">
                    <p className="whitespace-normal text-sm">
                      ยืนยันคำขอลบข้อมูลตาม PDPA หรือไม่? การจองเดิมจะไม่ระบุตัวตนเจ้าของอีกต่อไป
                      และไม่สามารถย้อนกลับได้
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={rowActingId === employee.id}
                        onClick={() => confirmErasure(employee)}
                      >
                        ยืนยันลบข้อมูล
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowActingId === employee.id}
                        onClick={() => setConfirmingErasureId(null)}
                      >
                        ไม่ลบ
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowActingId === employee.id}
                      onClick={() => startEdit(employee)}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowActingId === employee.id}
                      onClick={() => toggleStatus(employee)}
                    >
                      {employee.status === "active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={rowActingId === employee.id}
                      onClick={() => {
                        setRowError(employee.id, null);
                        setConfirmingErasureId(employee.id);
                      }}
                    >
                      ลบข้อมูล (PDPA)
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
