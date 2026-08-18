export interface StatusInfo {
  label: string;
  className: string;
}

const BAD = "border-destructive/40 bg-destructive/10 text-destructive";

export function statusInfo(statusName: string): StatusInfo {
  switch (statusName) {
    case "success":
      return { label: "Healthy", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" };
    case "passParse":
      return { label: "Skipped", className: "border-amber-500/40 bg-amber-500/10 text-amber-400" };
    case "needLogin":
      return { label: "Login failed", className: BAD };
    case "CFBlocked":
      return { label: "Cloudflare", className: BAD };
    default:
      return { label: statusName || "Unknown", className: BAD };
  }
}