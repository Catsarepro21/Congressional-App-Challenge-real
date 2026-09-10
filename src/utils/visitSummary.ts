import type { SafeScaleState } from "../types";
import { localDate } from "./daily";

/** Explicit fields only: never serialize tokens, API keys or document images. */
export function visitSummary(state: SafeScaleState): string {
  return [
    "SAFESCALE — PERSONAL VISIT NOTES",
    `Prepared ${localDate()}${state.isTestMode ? " · FICTIONAL SAMPLE DATA" : ""}`,
    `Name: ${state.profile.name || "Not entered"}`,
    `Allergies recorded: ${state.userAllergies.join(", ") || "Not entered"}`,
    "\nCURRENT MEDICATION SCHEDULE",
    ...state.medicationSchedule.map(
      (m) => `${m.name} · ${m.dosage} · daily at ${m.time}`,
    ),
    ...(state.medicationSchedule.length ? [] : ["No medications recorded."]),
    "\nRECENT JOURNAL ENTRIES (up to 10 of each type)",
    ...state.moodLogs
      .slice(0, 10)
      .map(
        (m) =>
          `${m.timestamp}: ${m.feelings.join(", ")}; stress ${m.stressLevel}. ${m.notes || ""}`,
      ),
    ...state.symptomLogs
      .slice(0, 10)
      .map(
        (m) =>
          `${m.date} ${m.timestamp}: ${m.type}; self-reported severity ${m.severity}/10`,
      ),
    "\nSAVED RECORDS",
    ...state.medicalRecords.map(
      (r) =>
        `${r.date} · ${r.title} · ${r.provider || "Provider not entered"}\n${r.value}`,
    ),
    "\nUser-entered notes, not a verified clinical record or diagnosis.",
  ].join("\n");
}
