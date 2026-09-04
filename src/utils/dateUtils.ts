/**
 * Safe date parsing and formatting utilities to prevent "RangeError: Invalid time value"
 * across the application when dealing with Spanish/Peruvian (DD/MM/YYYY) date strings,
 * ISO dates, Google Apps Script timestamps, or undefined/null values.
 */

export function safeParseDate(val: any): Date | null {
  if (val === null || val === undefined || val === "") return null;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  if (typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof val !== "string") return null;

  const str = val.trim();
  if (!str) return null;

  // 1. Check for Spanish/Peruvian format: DD/MM/YYYY or DD-MM-YYYY, optionally followed by / HH:mm:ss or space HH:mm:ss
  // (This handles "01/09/2026 / 16:38:46", "01/09/2026 16:38:46", "01/09/2026", etc.)
  const spanishMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s*(?:[\/\-]\s*|\s+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (spanishMatch) {
    const day = parseInt(spanishMatch[1], 10);
    const month = parseInt(spanishMatch[2], 10) - 1; // 0-indexed in JS
    const year = parseInt(spanishMatch[3], 10);
    const hours = spanishMatch[4] ? parseInt(spanishMatch[4], 10) : 0;
    const minutes = spanishMatch[5] ? parseInt(spanishMatch[5], 10) : 0;
    const seconds = spanishMatch[6] ? parseInt(spanishMatch[6], 10) : 0;

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. ISO or standard format (e.g. "2026-08-02T10:50:00")
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  // 3. Fallback: replace '-' with '/'
  d = new Date(str.replace(/-/g, "/"));
  if (!isNaN(d.getTime())) return d;

  return null;
}

export function safeToISOString(val: any): string | undefined {
  const d = safeParseDate(val);
  if (!d) return undefined;
  try {
    return d.toISOString();
  } catch {
    return undefined;
  }
}

export function safeToLocaleString(val: any, locale = "es-PE", options?: Intl.DateTimeFormatOptions): string {
  const d = safeParseDate(val);
  if (!d) return typeof val === "string" ? val : "";
  if (!options) {
    return formatDateTimeFull(d);
  }
  try {
    return d.toLocaleString(locale, options);
  } catch {
    return typeof val === "string" ? val : "";
  }
}

export function safeGetTime(val: any): number | null {
  const d = safeParseDate(val);
  return d ? d.getTime() : null;
}

export function formatHoursHHMM(hoursVal: number | string): string {
  const num = typeof hoursVal === "number" ? hoursVal : parseFloat(hoursVal as string);
  if (isNaN(num) || num <= 0) return "00:00";
  const totalMin = Math.round(num * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function formatHoursWithMin(hoursVal: number | string): string {
  const num = typeof hoursVal === "number" ? hoursVal : parseFloat(hoursVal as string);
  if (isNaN(num) || num <= 0) return "00:00 (0h 0m)";
  const totalMin = Math.round(num * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hhmm = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  return `${hhmm} (${h}h ${m}m)`;
}

export function normalizeText(str?: any): string {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Standard format for the application: DD/MM/AAAA / HH:MM:SS
 */
export function formatDateTimeFull(val: any): string {
  if (!val) return "-";
  const d = safeParseDate(val);
  if (!d) return typeof val === "string" ? val : "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} / ${hh}:${min}:${ss}`;
}

/**
 * Standard date-only format: DD/MM/AAAA
 */
export function formatDateOnly(val: any): string {
  if (!val) return "-";
  const d = safeParseDate(val);
  if (!d) return typeof val === "string" ? val : "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Safely format unit components (DPTO, ESTAC, DEP) avoiding empty placeholders like "(-)" or "DPTO -"
 * If no DPTO is present, shows whatever unit is available, e.g. "ESTAC 370", "DEP D01".
 */
export function formatUnitDisplay(r?: { dpto?: string; estac?: string; dep?: string } | null): string {
  if (!r) return "Sin unidad";
  const parts: string[] = [];
  const cleanDpto = (r.dpto || "").trim();
  const cleanEstac = (r.estac || "").trim();
  const cleanDep = (r.dep || "").trim();

  if (cleanDpto && cleanDpto !== "-") parts.push(`DPTO ${cleanDpto}`);
  if (cleanEstac && cleanEstac !== "-") parts.push(`ESTAC ${cleanEstac}`);
  if (cleanDep && cleanDep !== "-") parts.push(`DEP ${cleanDep}`);

  if (parts.length === 0) {
    return "Sin unidad";
  }
  return parts.join(" • ");
}

/**
 * Split a datetime string or Date into two distinct formatted strings: [dateStr, timeStr]
 * Perfect for 2-row date and time displays.
 */
export function getDateAndTimeString(val: any): { date: string; time: string } {
  if (!val) return { date: "-", time: "-" };
  const d = safeParseDate(val);
  if (!d) {
    if (typeof val === "string") {
      const m = val.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})(?:\s*(?:[\/\-]\s*|\s+)(\d{1,2}:\d{1,2}(?::\d{1,2})?))?/);
      if (m) {
        return { date: m[1], time: m[2] || "--:--:--" };
      }
    }
    return { date: typeof val === "string" ? val : "-", time: "--:--:--" };
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return {
    date: `${dd}/${mm}/${yyyy}`,
    time: `${hh}:${min}:${ss}`
  };
}

