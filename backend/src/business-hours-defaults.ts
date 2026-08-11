export type BusinessHoursDefault = {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
};

// dayOfWeek follows JS Date#getDay: 0 = Sunday ... 6 = Saturday.
// Mirrored as literal INSERT values in the add_business_hours migration —
// that migration seeds the real/test databases, this seeds `resetDb`.
export const DEFAULT_BUSINESS_HOURS: BusinessHoursDefault[] = [
  { dayOfWeek: 0, openTime: "08:00", closeTime: "18:00", isOpen: false },
  { dayOfWeek: 1, openTime: "08:00", closeTime: "18:00", isOpen: true },
  { dayOfWeek: 2, openTime: "08:00", closeTime: "18:00", isOpen: true },
  { dayOfWeek: 3, openTime: "08:00", closeTime: "18:00", isOpen: true },
  { dayOfWeek: 4, openTime: "08:00", closeTime: "18:00", isOpen: true },
  { dayOfWeek: 5, openTime: "08:00", closeTime: "18:00", isOpen: true },
  { dayOfWeek: 6, openTime: "08:00", closeTime: "18:00", isOpen: false },
];
