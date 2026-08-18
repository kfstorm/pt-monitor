export const RESULT_STATUS_NAMES = [
  "unknownError",
  "waiting",
  "working",
  "success",
  "parseError",
  "passParse",
  "CFBlocked",
  "needLogin",
  "noResults",
] as const;

export type ResultStatusName = (typeof RESULT_STATUS_NAMES)[number] | "unknown";

export function statusName(status: unknown): ResultStatusName {
  return typeof status === "number" && RESULT_STATUS_NAMES[status]
    ? RESULT_STATUS_NAMES[status]
    : "unknown";
}
