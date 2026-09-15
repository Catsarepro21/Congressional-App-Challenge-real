import type { MedicationItem } from "../types";

/** Calendar dates belong to the user's timezone, not UTC. */
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return localDate(new Date(`${value}T12:00:00`)) === value;
}

export function currentMedications(
  meds: MedicationItem[],
  day: string | null,
  today: string,
): MedicationItem[] {
  return day === today
    ? meds
    : meds.map((med) => ({ ...med, status: "Pending", stockDebited: false }));
}

/** Undo restores only inventory actually deducted by this completion. */
export function changeDose(
  med: MedicationItem,
  status: MedicationItem["status"],
): MedicationItem {
  if (med.status === status) return med;
  const completing = status === "Completed";
  const debit = completing && med.stock !== undefined && med.stock > 0;
  const stock =
    med.stock === undefined
      ? undefined
      : Math.max(0, med.stock + (med.stockDebited ? 1 : 0) - (debit ? 1 : 0));
  return { ...med, status, stock, stockDebited: debit };
}

/** Validate user measurements at both the form and persistence boundaries. */
export function validateVitalReadings(entry: {systolicBP?: number; diastolicBP?: number; bloodGlucose?: number; spo2?: number; temperature?: number}): string | null {
  const limits = {systolicBP: [40, 300], diastolicBP: [30, 200], bloodGlucose: [1, 1000], spo2: [1, 100], temperature: [80, 115]} as const;
  if (!Object.keys(limits).some(key => entry[key as keyof typeof limits] !== undefined)) return 'Enter at least one measurement.';
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = entry[key]; const [min, max] = limits[key];
    if (value !== undefined && (!Number.isFinite(value) || value < min || value > max)) return `Enter a valid ${key} measurement (${min}–${max}).`;
  }
  if ((entry.systolicBP === undefined) !== (entry.diastolicBP === undefined)) return 'Enter both blood pressure numbers.';
  if (entry.systolicBP !== undefined && entry.diastolicBP !== undefined && entry.systolicBP <= entry.diastolicBP) return 'Systolic pressure must be greater than diastolic pressure.';
  return null;
}
