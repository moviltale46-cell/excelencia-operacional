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
  if (!val) return "";
  const d = safeParseDate(val);
  if (d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  if (typeof val === "string") {
    const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`;
    }
  }
  return "";
}

/**
 * Format project name together with all valid units (DPTO, ESTAC, DEP).
 * Shows ONLY the units that have a value, separated cleanly.
 * Example 1: Castilla with only Estac -> "Castilla (ESTAC E-10)"
 * Example 2: Torre Tale with only Dpto -> "Torre Tale (DPTO 2004 B)"
 * Example 3: Torre Bolivar with Dpto and Estac -> "Torre Bolivar (DPTO A707, ESTAC E-12)"
 * Example 4: No units -> "Castilla"
 */
export function formatProjectAndUnits(r?: { proyecto?: string; dpto?: string; estac?: string; dep?: string } | null): string {
  if (!r) return "-";
  const projectName = (r.proyecto || "").trim() || "Proyecto sin nombre";
  const parts: string[] = [];

  const cleanVal = (val?: string | null) => {
    if (!val) return "";
    const trimmed = val.trim();
    if (trimmed === "-" || trimmed === "--" || trimmed.toLowerCase() === "sin" || trimmed.toLowerCase() === "ninguno") {
      return "";
    }
    return trimmed;
  };

  const dVal = cleanVal(r.dpto);
  const eVal = cleanVal(r.estac);
  const dpVal = cleanVal(r.dep);

  if (dVal) {
    parts.push(/^dpto/i.test(dVal) ? dVal : `DPTO ${dVal}`);
  }
  if (eVal) {
    parts.push(/^estac/i.test(eVal) ? eVal : `ESTAC ${eVal}`);
  }
  if (dpVal) {
    parts.push(/^dep/i.test(dpVal) ? dpVal : `DEP ${dpVal}`);
  }

  if (parts.length === 0) {
    return projectName;
  }

  return `${projectName} (${parts.join(", ")})`;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateRecord?: any;
  fechaCreacion?: string;
  errorMessage?: string;
}

/**
 * Validate that unit(s) are not duplicated in the same project.
 * Only triggers if the project matches AND the exact corresponding unit is repeated:
 * Dpto with Dpto, Estac with Estac, and/or Dep with Dep.
 * Returns exact notification message:
 * "Se detectó una operación ya ingresada el dd/mm/aaaa por favor desestime la anterior operación o reabra la operacion"
 */
export function checkDuplicateUnitOperation(
  records: any[],
  newRecord: {
    proyecto?: string;
    dpto?: string;
    estac?: string;
    dep?: string;
    id?: string;
    tipo?: string;
  }
): DuplicateCheckResult {
  const normProj = normalizeText(newRecord.proyecto);
  if (!normProj) return { isDuplicate: false };

  const cleanType = (val?: string) => normalizeText(val || "");
  const newTypeNorm = cleanType(newRecord.tipo);
  const isNewAdenda = newTypeNorm.includes("adenda");

  const cleanUnit = (val?: string | number | null): string => {
    if (val === null || val === undefined) return "";
    let clean = String(val).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    clean = clean.replace(/^(dpto\.?|departamento)\s*/i, "");
    clean = clean.replace(/^(estac\.?|estacionamiento|est\.?)\s*/i, "");
    clean = clean.replace(/^(dep\.?|deposito)\s*/i, "");
    clean = clean.replace(/^[\s\-_#]+/, "").replace(/[\s\-_#]+$/, "");
    if (
      !clean ||
      clean === "-" || 
      clean === "--" || 
      clean === "n/a" || 
      clean === "na" || 
      clean === "sin" || 
      clean === "ninguno" || 
      clean === "0"
    ) {
      return "";
    }
    return clean;
  };

  const newDpto = cleanUnit(newRecord.dpto);
  const newEstac = cleanUnit(newRecord.estac);
  const newDep = cleanUnit(newRecord.dep);

  // If no specific unit is provided, no duplicate can be flagged
  if (!newDpto && !newEstac && !newDep) {
    return { isDuplicate: false };
  }

  const matchesAny = (val1: string, val2: string): boolean => {
    if (!val1 || !val2) return false;
    const v1 = val1.toLowerCase().replace(/[\s\-_]+/g, "");
    const v2 = val2.toLowerCase().replace(/[\s\-_]+/g, "");
    if (v1 === v2 && v1.length > 0) return true;
    const parts1 = val1.split(/[,/]+/).map(s => s.trim().toLowerCase().replace(/[\s\-_]+/g, "")).filter(Boolean);
    const parts2 = val2.split(/[,/]+/).map(s => s.trim().toLowerCase().replace(/[\s\-_]+/g, "")).filter(Boolean);
    for (const p1 of parts1) {
      for (const p2 of parts2) {
        if (p1 === p2 && p1.length > 0) return true;
      }
    }
    return false;
  };

  for (const r of records) {
    if (!r) continue;
    if ((r as any).Activo === false) continue;
    if (newRecord.id && r.id === newRecord.id) continue;
    if (normalizeText(r.proyecto) !== normProj) continue;

    // A record that was already "Desistido" (desestimada) does not block re-entering the unit
    const isDesistido = (r.status || "").toLowerCase().includes("desistid");
    if (isDesistido) continue;

    const rTypeNorm = cleanType(r.tipo);
    const isREmisionOrMod = rTypeNorm.includes("emision") || rTypeNorm.includes("modific") || !rTypeNorm;

    // Distinction between ADENDA and EMISION / MODIFICACION:
    // If user is adding an ADENDA, an existing EMISION or MODIFICACION does not block it.
    // If user is adding EMISION or MODIFICACION and one already exists, duplicate alert is triggered.
    if (isNewAdenda && isREmisionOrMod) {
      continue;
    }

    const rDpto = cleanUnit(r.dpto);
    const rEstac = cleanUnit(r.estac);
    const rDep = cleanUnit(r.dep);

    // Strict unit-to-unit matching: Dpto matches Dpto, Estac matches Estac, Dep matches Dep.
    // NEVER cross-match Dpto with Estac or Dep.
    const dptoMatch = Boolean(newDpto && rDpto && matchesAny(newDpto, rDpto));
    const estacMatch = Boolean(newEstac && rEstac && matchesAny(newEstac, rEstac));
    const depMatch = Boolean(newDep && rDep && matchesAny(newDep, rDep));

    if (dptoMatch || estacMatch || depMatch) {
      const rawDate = r.createdAt || r.solicitudAt || r.solicitud;
      const fechaCreacion = formatDateOnly(rawDate) || "fecha anterior";
      const errorMessage = `Se detectó una operación ya ingresada el ${fechaCreacion} por favor desestime la anterior operación o reabra la operacion`;
      return {
        isDuplicate: true,
        duplicateRecord: r,
        fechaCreacion,
        errorMessage
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Safely format unit components (DPTO, ESTAC, DEP) avoiding empty placeholders like "(-)" or "DPTO -"
 * Shows ONLY the fields that have values (DPTO and/or ESTAC and/or DEP).
 * For example:
 * - Castilla with only Estac -> "ESTAC E-10"
 * - Record with Dpto and Estac -> "DPTO 101 • ESTAC E-10"
 * - Record with all three -> "DPTO 101 • ESTAC E-10 • DEP D-02"
 */
export function formatUnitDisplay(r?: { dpto?: string; estac?: string; dep?: string } | null): string {
  if (!r) return "Sin unidad";
  const parts: string[] = [];

  const cleanUnitValue = (val?: string | null, prefix?: string): string => {
    if (!val) return "";
    let clean = val.trim();
    if (!clean || clean === "-" || clean === "--" || clean === "." || clean.toLowerCase() === "sin" || clean.toLowerCase() === "ninguno" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "na") {
      return "";
    }
    // Remove repeated prefixes if already typed by user
    if (prefix) {
      const regex = new RegExp(`^${prefix}\\.?\\s*`, "i");
      clean = clean.replace(regex, "").trim();
    }
    if (!clean || clean === "-" || clean === "--") return "";
    return prefix ? `${prefix} ${clean}` : clean;
  };

  const dVal = cleanUnitValue(r.dpto, "DPTO");
  const eVal = cleanUnitValue(r.estac, "ESTAC");
  const dpVal = cleanUnitValue(r.dep, "DEP");

  if (dVal) parts.push(dVal);
  if (eVal) parts.push(eVal);
  if (dpVal) parts.push(dpVal);

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

/**
 * Checks if a record, status or history entry corresponds to "Observaciones de otras áreas"
 * or any observation that does NOT affect the advisor (affectsAdvisor === false)
 */
export function isOtherAreasObservation(r?: any): boolean {
  if (!r) return false;
  if (typeof r === "string") {
    const s = r.toLowerCase();
    return s.includes("otras áreas") || s.includes("otras areas") || s.includes("no afecta asesor");
  }
  // Explicit flag: does not affect advisor
  if (r.affectsAdvisor === false || r.afectaAsesor === false) return true;
  if (r.tipoObservacion === "Observaciones de otras áreas") return true;
  const s = (r.status || "").toLowerCase();
  if (s.includes("otras áreas") || s.includes("otras areas")) return true;
  if (r.comentario && (r.comentario.toLowerCase().includes("otras áreas") || r.comentario.toLowerCase().includes("otras areas") || r.comentario.toLowerCase().includes("[observación otras áreas]") || r.comentario.toLowerCase().includes("[no afecta asesor]"))) {
    return true;
  }
  return false;
}

/**
 * Checks if an observation affects the advisor in their KPI and runs the advisor timer.
 * If false, it does NOT affect advisor KPI and the advisor timer stops!
 */
export function doesObservationAffectAdvisor(r?: any): boolean {
  if (!r) return false;
  if (r.affectsAdvisor === false || r.afectaAsesor === false) return false;
  if (r.tipoObservacion === "Observaciones de otras áreas") return false;
  if (isOtherAreasObservation(r)) return false;
  return true;
}

/**
 * Checks if an observation is an actual advisor error (excluding "Observaciones de otras áreas")
 */
export function isAdvisorErrorObservation(r?: any): boolean {
  if (!r) return false;
  if (!doesObservationAffectAdvisor(r)) return false;
  if (isOtherAreasObservation(r)) return false;
  if (typeof r === "string") {
    const s = r.toLowerCase();
    return s.includes("observad") || s.includes("rechazad");
  }
  const s = (r.status || "").toLowerCase();
  const isObs = s.includes("observad") || s.includes("rechazad");
  if (isObs) return true;
  if (r.history && Array.isArray(r.history)) {
    return r.history.some((h: any) => {
      if (h.affectsAdvisor === false) return false;
      if (isOtherAreasObservation(h)) return false;
      const hs = (h.status || "").toLowerCase();
      const hc = (h.comentario || "").toLowerCase();
      return hs.includes("observad") || hs.includes("rechazad") || hc.includes("[observación]");
    });
  }
  return false;
}

/**
 * Returns the current date and time in the system display format: DD/MM/YYYY / HH:MM:SS
 */
export function getFormattedSystemDateTime(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} / ${hh}:${min}:${ss}`;
}


