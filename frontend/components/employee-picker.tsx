"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useApiList } from "@/lib/use-api-list";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  department: string;
  status: string;
};

type Props = {
  value: Employee | null;
  onChange: (employee: Employee | null) => void;
  // Scoped to callers that need it (the create-booking flow, FR-EMP-05's
  // "no longer a selectable booking-owner option") — defaulting to
  // unfiltered so a disabled employee can still be found to view their own
  // past bookings ("Booking ของฉัน", ticket 07), which this same component
  // also powers.
  activeOnly?: boolean;
};

// FR-EMP-03: booking creation must go through this typeahead, not a plain
// select, since the employee list can run into the hundreds (ASM-03).
export function EmployeePicker({ value, onChange, activeOnly = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 300);
  const path = debouncedQuery
    ? `/api/employees?search=${encodeURIComponent(debouncedQuery)}`
    : "/api/employees";
  const { data: fetchedEmployees } = useApiList<Employee>(path);
  const employees = activeOnly
    ? fetchedEmployees.filter((employee) => employee.status === "active")
    : fetchedEmployees;

  function select(employee: Employee) {
    onChange(employee);
    setQuery(`${employee.firstName} ${employee.lastName}`);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        value={value ? `${value.firstName} ${value.lastName}` : query}
        onChange={(e) => {
          onChange(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="พิมพ์ชื่อหรือนามสกุล..."
      />
      {open && query && !value && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-background shadow-md">
          {employees.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">ไม่พบชื่อที่ตรงกัน</li>
          )}
          {employees.map((employee) => (
            <li key={employee.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => select(employee)}
              >
                {employee.firstName} {employee.lastName} · {employee.department}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
