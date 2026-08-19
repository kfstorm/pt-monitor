export interface StatusInfo {
  label: string;
  className: string;
}

const BAD = "border-destructive/40 bg-destructive/10 text-destructive";

export function statusInfo(
  statusName: string,
  translate: (key: string) => string,
): StatusInfo {
  switch (statusName) {
    case "success":
      return {
        label: translate("status.healthy"),
        className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
      };
    case "passParse":
      return {
        label: translate("status.skipped"),
        className: "border-amber-500/40 bg-amber-500/10 text-amber-400",
      };
    case "needLogin":
      return { label: translate("status.loginFailed"), className: BAD };
    case "CFBlocked":
      return { label: translate("status.cloudflare"), className: BAD };
    case "unknownError":
      return { label: translate("status.unknownError"), className: BAD };
    case "waiting":
      return { label: translate("status.waiting"), className: BAD };
    case "working":
      return { label: translate("status.working"), className: BAD };
    case "parseError":
      return { label: translate("status.parseError"), className: BAD };
    case "noResults":
      return { label: translate("status.noResults"), className: BAD };
    case "unknown":
      return { label: translate("status.unknown"), className: BAD };
    default:
      return { label: statusName || translate("status.unknown"), className: BAD };
  }
}
