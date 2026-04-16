export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

export function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return "-";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return "-";
    return dt.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return String(d);
  }
}

export function formatEuro(n: number | string | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "€ 0";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "€ 0";
  return (
    "€ " +
    num.toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatMeur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "€ 0";
  const m = Number(n) / 1_000_000;
  if (m >= 100)
    return "€ " + m.toLocaleString("it-IT", { maximumFractionDigits: 0 }) + " M";
  return "€ " + m.toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " M";
}

export function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  return Math.round(Number(n)).toLocaleString("it-IT");
}

export function formatPct(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(Number(n))) return "0%";
  return (
    Number(n).toLocaleString("it-IT", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + "%"
  );
}
