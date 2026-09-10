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
