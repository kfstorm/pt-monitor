export function fmtBytes(value: number | null): string {
  if (value == null) return "–";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let i = 0;
  let v = Number(value);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const text = v >= 100 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 1 : 2);
  return `${text} ${units[i]}`;
}

export function fmtNum(value: number | null): string {
  if (value == null) return "–";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function fmtRatio(
  value: number | null,
  uploaded?: number | null,
  downloaded?: number | null,
): string {
  if (value == null) {
    if (uploaded != null && downloaded != null && Number(uploaded) > 0 && Number(downloaded) === 0) {
      return "∞";
    }
    return "–";
  }
  if (value === Infinity) return "∞";
  if (value === -Infinity) return "-∞";
  return fmtNum(value);
}

export function fmtTime(ms: number | null): string {
  return ms ? new Date(ms).toLocaleString() : "never";
}

export function fmtDay(t: number): string {
  const d = new Date(t);
  return (
    `${d.getMonth() + 1}/${d.getDate()} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}
