export function fmtBytes(value: number | null, locale = "en"): string {
  if (value == null) return "–";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let i = 0;
  let v = Number(value);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fractionDigits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const text = new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(v);
  return `${text} ${units[i]}`;
}

export function fmtNum(value: number | null, locale = "en"): string {
  if (value == null) return "–";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function fmtRatio(
  value: number | null,
  uploaded?: number | null,
  downloaded?: number | null,
  locale = "en",
): string {
  if (value == null) {
    if (
      uploaded != null &&
      downloaded != null &&
      Number(uploaded) > 0 &&
      Number(downloaded) === 0
    ) {
      return "∞";
    }
    return "–";
  }
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "-∞";
  return fmtNum(value, locale);
}

export function fmtTime(ms: number | null, locale = "en"): string {
  return ms
    ? new Date(ms).toLocaleString(locale)
    : locale.startsWith("zh")
      ? "从未"
      : "never";
}

export function fmtDay(t: number, locale = "en"): string {
  const parts = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(t));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  const date = locale.startsWith("zh")
    ? `${get("month")}月${get("day")}日`
    : `${get("month")}/${get("day")}`;
  return `${date} ${get("hour")}:${get("minute")}`;
}
