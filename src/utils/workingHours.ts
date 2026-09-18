import { WorkingScheduleConfig, DEFAULT_WORKING_SCHEDULE, HolidayConfig, OperationRecord, StatusHistoryEntry } from "../types";
import { safeParseDate, formatHoursHHMM, isOtherAreasObservation } from "./dateUtils";

/**
 * Checks if a given date (Date object) is marked as a holiday.
 */
export function isDateHoliday(
  date: Date, 
  holidays: (string | HolidayConfig)[] = DEFAULT_WORKING_SCHEDULE.holidays
): boolean {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const dateStr = `${year}-${month}-${day}`;

  return holidays.some(h => (typeof h === "string" ? h : h?.date) === dateStr);
}

/**
 * Checks if a given date is a configured working day.
 * (Day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
export function isWorkingDay(date: Date, config: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE): boolean {
  const dayOfWeek = date.getDay();
  const isWorkDay = (config.workingDays || [1, 2, 3, 4, 5]).includes(dayOfWeek);
  const isHoliday = isDateHoliday(date, config.holidays);

  return isWorkDay && !isHoliday;
}

export interface BusinessTimeResult {
  totalMinutes: number;
  totalHours: number;
  formattedMinutes: string;
  formattedHHMM: string;
  formattedDetailed: string;
}

/**
 * Precise business hours and minutes calculation between two timestamps.
 * 
 * Rules:
 * - Time only runs on configured working days (default Monday to Friday).
 * - Time only runs within configured daily working hours (default 09:00 to 18:00).
 * - Clocks stop strictly at the end hour (default 18:00) and resume at the start hour (default 09:00).
 * - Holidays / non-working days count for 0 minutes.
 * - If start time is outside business hours (e.g. submitted at 8pm or on weekend),
 *   time only starts counting from the next business opening (e.g. Monday 9:00am).
 * - If end time is after business hours (e.g. reviewed at 7pm), time stops counting at 6:00pm.
 * 
 * Example:
 * Request submitted Friday at 4:00 PM (16:00), reviewed Monday at 10:00 AM:
 * - Friday: 16:00 -> 18:00 = 2 hours = 120 min.
 * - Saturday & Sunday: non-working = 0 min.
 * - Monday: 09:00 -> 10:00 = 1 hour = 60 min.
 * - Total = 3 hours (180 minutes).
 */
export function calculateBusinessTime(
  startVal: any,
  endVal: any = new Date(),
  config: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE
): BusinessTimeResult {
  const start = safeParseDate(startVal);
  const end = safeParseDate(endVal) || new Date();

  if (!start || !end || start.getTime() >= end.getTime()) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      formattedMinutes: "0 min",
      formattedHHMM: "00:00",
      formattedDetailed: "0h 0m (0 min)"
    };
  }

  // Parse start hour and end hour (handles number e.g. 9 or string e.g. "09:00")
  let startH = 9;
  let startM = 0;
  if (typeof config.startHour === "number") {
    startH = config.startHour;
  } else if (typeof config.startHour === "string") {
    const parts = config.startHour.split(":");
    startH = parseInt(parts[0], 10) || 9;
    startM = parseInt(parts[1], 10) || 0;
  }

  let endH = 18;
  let endM = 0;
  if (typeof config.endHour === "number") {
    endH = config.endHour;
  } else if (typeof config.endHour === "string") {
    const parts = config.endHour.split(":");
    endH = parseInt(parts[0], 10) || 18;
    endM = parseInt(parts[1], 10) || 0;
  }

  const workingDays = config.workingDays || [1, 2, 3, 4, 5];
  const holidays = config.holidays || DEFAULT_WORKING_SCHEDULE.holidays;

  let totalMs = 0;
  const current = new Date(start.getTime());

  // Loop through days from start date to end date
  while (current.getTime() < end.getTime()) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const date = current.getDate();

    const dayOfWeek = current.getDay();
    const isWorkDay = workingDays.includes(dayOfWeek) && !isDateHoliday(current, holidays);

    if (isWorkDay) {
      const dayWorkStart = new Date(year, month, date, startH, startM, 0, 0);
      const dayWorkEnd = new Date(year, month, date, endH, endM, 0, 0);

      // Effective start on this day cannot be earlier than dayWorkStart
      const effectiveStart = current.getTime() < dayWorkStart.getTime() ? dayWorkStart : current;
      // Effective end on this day cannot be later than dayWorkEnd or the overall end
      const effectiveEnd = end.getTime() > dayWorkEnd.getTime() ? dayWorkEnd : end;

      if (effectiveStart.getTime() < effectiveEnd.getTime()) {
        totalMs += (effectiveEnd.getTime() - effectiveStart.getTime());
      }
    }

    // Advance to next day at 00:00:00
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  const totalMinutes = Math.round(totalMs / (1000 * 60));
  const totalHours = Number((totalMinutes / 60).toFixed(2));
  
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const hhmm = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;

  return {
    totalMinutes,
    totalHours,
    formattedMinutes: `${totalMinutes} min`,
    formattedHHMM: hhmm,
    formattedDetailed: `${h}h ${m}m (${totalMinutes} min)`
  };
}

export type OperationRole = 'LEGAL' | 'ADVISOR' | 'OTHER_AREAS' | 'CLOSED';

export interface OperationTimelineSegment {
  startTime: Date;
  endTime: Date;
  role: OperationRole;
  minutes: number;
  hours: number;
  status?: string;
  comment?: string;
  user?: string;
}

export interface OperationTimeBreakdown {
  legalMinutes: number;
  legalHours: number;
  legalFormatted: string; // e.g. "375 min (06:15)"

  advisorMinutes: number;
  advisorHours: number;
  advisorFormatted: string; // e.g. "150 min (02:30)"

  otherAreasMinutes: number;
  otherAreasHours: number;
  otherAreasFormatted: string;

  closedMinutes: number;
  closedHours: number;

  totalOperationMinutes: number;
  totalOperationHours: number;

  currentHolder: OperationRole;
  isCurrentlyActive: boolean;
  wasReopened: boolean;
  hadObservations: boolean;
  segments: OperationTimelineSegment[];
}

/**
 * Checks if a status or comment signifies a finalized or closed operation.
 */
export function isOperationClosedStatus(status?: string, comment?: string): boolean {
  const s = (status || "").toLowerCase().trim();
  const c = (comment || "").toLowerCase().trim();

  if (
    s === "cierre completo" ||
    s === "desistido" ||
    s === "desestimado" ||
    s === "cerrado" ||
    s === "completado" ||
    s === "entregado" ||
    s.includes("cierre completo") ||
    s.includes("desistid") ||
    s.includes("desestimad")
  ) {
    return true;
  }

  if (
    c.includes("proceso finalizado") ||
    c.includes("cierre completo") ||
    c.includes("operación desistida") ||
    c.includes("operacion desistida") ||
    c.includes("operación cerrada") ||
    c.includes("operacion cerrada")
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if a status or comment indicates the operation is observed.
 */
export function isOperationObservedStatus(status?: string, comment?: string): boolean {
  const s = (status || "").toLowerCase().trim();
  const c = (comment || "").toLowerCase().trim();

  if (s.includes("observad") || s.includes("rechazad")) {
    return true;
  }

  if (c.includes("[observación]") || c.includes("[observacion]") || c.includes("expediente observado")) {
    return true;
  }

  return false;
}

/**
 * Checks if a history entry or comment indicates that an observation has been lifted
 * ("Se levantó la observación") and the operation returns to Legal / Pendiente.
 */
export function isObservationLiftedEvent(entry?: { status?: string; comentario?: string }): boolean {
  if (!entry) return false;
  const s = (entry.status || "").toLowerCase().trim();
  const c = (entry.comentario || "").toLowerCase().trim();

  if (
    c.includes("se levantó la observación") ||
    c.includes("se levanto la observacion") ||
    c.includes("levantamiento de observaci") ||
    c.includes("observación levantada") ||
    c.includes("observacion levantada") ||
    c.includes("observación subsanada") ||
    c.includes("observacion subsanada") ||
    c.includes("observacion subsanado") ||
    c.includes("subsanado") ||
    c.includes("reingresado al flujo") ||
    c.includes("reingreso al flujo")
  ) {
    return true;
  }

  if (s.includes("observación levantada") || s.includes("observacion levantada") || s.includes("subsanad")) {
    return true;
  }

  return false;
}

/**
 * Single source of truth for cumulative business time calculations across operations.
 * 
 * Rules strictly respecting user specifications:
 * 1. Re-opened operations:
 *    When an operation is re-opened (e.g. was Cierre Completo, then re-opened as Modificación),
 *    the clock starts from where it left off, completely ignoring the days it was closed.
 * 2. Observations:
 *    When an observation is registered, the Legal clock stops, and the clock runs for the
 *    Advisor (or Otras Áreas).
 * 3. Lifting Observations ("Se levantó la observación"):
 *    The Advisor / Otras Áreas clock stops, the status returns to Pendiente, and the Legal
 *    clock resumes, adding active intervals (e.g. 30 min + 120 min = 150 min total).
 */
export function calculateOperationTimeBreakdown(
  record: OperationRecord,
  schedule: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE,
  asOfDate: Date = new Date()
): OperationTimeBreakdown {
  const fallbackResult: OperationTimeBreakdown = {
    legalMinutes: 0,
    legalHours: 0,
    legalFormatted: "0 min (00:00)",
    advisorMinutes: 0,
    advisorHours: 0,
    advisorFormatted: "0 min (00:00)",
    otherAreasMinutes: 0,
    otherAreasHours: 0,
    otherAreasFormatted: "0 min (00:00)",
    closedMinutes: 0,
    closedHours: 0,
    totalOperationMinutes: 0,
    totalOperationHours: 0,
    currentHolder: "CLOSED",
    isCurrentlyActive: false,
    wasReopened: false,
    hadObservations: false,
    segments: []
  };

  if (!record) return fallbackResult;

  const initialDate = safeParseDate(record.solicitudAt || record.createdAt || record.solicitud);
  if (!initialDate) return fallbackResult;

  // Gather chronological events
  interface TimelineEvent {
    date: Date;
    status: string;
    comment: string;
    user: string;
    affectsAdvisor?: boolean;
    tipoObservacion?: string;
  }

  const rawEvents: TimelineEvent[] = [];

  // Add all history entries
  if (Array.isArray(record.history)) {
    record.history.forEach((h: StatusHistoryEntry) => {
      const d = safeParseDate(h.timestamp);
      if (d) {
        rawEvents.push({
          date: d,
          status: h.status || "",
          comment: h.comentario || "",
          user: h.user || "",
          affectsAdvisor: h.affectsAdvisor,
          tipoObservacion: h.tipoObservacion
        });
      }
    });
  }

  // Sort chronological ascending
  rawEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Ensure initial registration is at start
  if (rawEvents.length === 0 || rawEvents[0].date.getTime() > initialDate.getTime()) {
    rawEvents.unshift({
      date: initialDate,
      status: record.status || "Pendiente",
      comment: record.comentario || "Registro Inicial",
      user: record.updatedByUser || "Sistema"
    });
  }

  // Deduplicate entries with identical timestamp down to second
  const events: TimelineEvent[] = [];
  rawEvents.forEach(e => {
    if (events.length === 0) {
      events.push(e);
    } else {
      const prev = events[events.length - 1];
      if (Math.abs(e.date.getTime() - prev.date.getTime()) > 1000) {
        events.push(e);
      } else {
        // Same second - take the more descriptive one
        if (e.status || e.comment) {
          events[events.length - 1] = e;
        }
      }
    }
  });

  let legalMinutes = 0;
  let advisorMinutes = 0;
  let otherAreasMinutes = 0;
  let closedMinutes = 0;

  let wasReopened = false;
  let hadObservations = false;
  const segments: OperationTimelineSegment[] = [];

  // Determine initial role
  const firstEvent = events[0];
  let currentRole: OperationRole = isOperationClosedStatus(firstEvent.status, firstEvent.comment)
    ? 'CLOSED'
    : (isOperationObservedStatus(firstEvent.status, firstEvent.comment)
        ? (isOtherAreasObservation(firstEvent) || firstEvent.affectsAdvisor === false ? 'OTHER_AREAS' : 'ADVISOR')
        : 'LEGAL');

  let currentTime = firstEvent.date;

  // Step through intervals between consecutive events
  for (let i = 1; i < events.length; i++) {
    const nextEvent = events[i];
    const nextTime = nextEvent.date;

    if (nextTime.getTime() > currentTime.getTime()) {
      const segMinutes = calculateBusinessTime(currentTime, nextTime, schedule).totalMinutes;
      const segHours = Number((segMinutes / 60).toFixed(2));

      segments.push({
        startTime: currentTime,
        endTime: nextTime,
        role: currentRole,
        minutes: segMinutes,
        hours: segHours,
        status: events[i - 1].status,
        comment: events[i - 1].comment,
        user: events[i - 1].user
      });

      if (currentRole === 'LEGAL') {
        legalMinutes += segMinutes;
      } else if (currentRole === 'ADVISOR') {
        advisorMinutes += segMinutes;
        hadObservations = true;
      } else if (currentRole === 'OTHER_AREAS') {
        otherAreasMinutes += segMinutes;
        hadObservations = true;
      } else if (currentRole === 'CLOSED') {
        closedMinutes += segMinutes;
      }

      currentTime = nextTime;
    }

    // Determine role transition triggered by nextEvent
    if (isObservationLiftedEvent(nextEvent)) {
      // "Se levantó la observación" -> Clock for advisor/other areas stops, resumes for Legal
      currentRole = 'LEGAL';
    } else if (isOperationClosedStatus(nextEvent.status, nextEvent.comment)) {
      // Operation closed (Cierre Completo, Desistido, etc.)
      currentRole = 'CLOSED';
    } else if (isOperationObservedStatus(nextEvent.status, nextEvent.comment)) {
      // Operation observed
      hadObservations = true;
      const isOther = isOtherAreasObservation(nextEvent) || nextEvent.affectsAdvisor === false || (nextEvent.tipoObservacion === "Observaciones de otras áreas");
      currentRole = isOther ? 'OTHER_AREAS' : 'ADVISOR';
    } else if (currentRole === 'CLOSED') {
      // Reopened operation!
      wasReopened = true;
      currentRole = 'LEGAL';
    } else if (currentRole === 'ADVISOR' || currentRole === 'OTHER_AREAS') {
      // If status explicitly moved to Pendiente or En Proceso, treat as returned to Legal
      const s = (nextEvent.status || "").toLowerCase();
      if (s.includes("pendiente") || s.includes("proceso") || s.includes("revis") || s.includes("modific")) {
        currentRole = 'LEGAL';
      }
    } else {
      // Default stays in current role (typically LEGAL)
      currentRole = 'LEGAL';
    }
  }

  // Handle open interval from currentTime to asOfDate
  const isCurrentlyClosed = isOperationClosedStatus(record.status, record.comentario) || currentRole === 'CLOSED';
  let isCurrentlyActive = false;

  if (!isCurrentlyClosed) {
    isCurrentlyActive = true;
    if (asOfDate.getTime() > currentTime.getTime()) {
      const ongoingMinutes = calculateBusinessTime(currentTime, asOfDate, schedule).totalMinutes;
      const ongoingHours = Number((ongoingMinutes / 60).toFixed(2));

      segments.push({
        startTime: currentTime,
        endTime: asOfDate,
        role: currentRole,
        minutes: ongoingMinutes,
        hours: ongoingHours,
        status: record.status,
        comment: "En curso"
      });

      if (currentRole === 'LEGAL') {
        legalMinutes += ongoingMinutes;
      } else if (currentRole === 'ADVISOR') {
        advisorMinutes += ongoingMinutes;
        hadObservations = true;
      } else if (currentRole === 'OTHER_AREAS') {
        otherAreasMinutes += ongoingMinutes;
        hadObservations = true;
      }
    }
  }

  const legalHours = Number((legalMinutes / 60).toFixed(2));
  const advisorHours = Number((advisorMinutes / 60).toFixed(2));
  const otherAreasHours = Number((otherAreasMinutes / 60).toFixed(2));
  const closedHours = Number((closedMinutes / 60).toFixed(2));
  const totalOperationMinutes = legalMinutes + advisorMinutes + otherAreasMinutes;
  const totalOperationHours = Number((totalOperationMinutes / 60).toFixed(2));

  return {
    legalMinutes,
    legalHours,
    legalFormatted: `${legalMinutes} min (${formatHoursHHMM(legalHours)})`,
    advisorMinutes,
    advisorHours,
    advisorFormatted: `${advisorMinutes} min (${formatHoursHHMM(advisorHours)})`,
    otherAreasMinutes,
    otherAreasHours,
    otherAreasFormatted: `${otherAreasMinutes} min (${formatHoursHHMM(otherAreasHours)})`,
    closedMinutes,
    closedHours,
    totalOperationMinutes,
    totalOperationHours,
    currentHolder: isCurrentlyClosed ? 'CLOSED' : currentRole,
    isCurrentlyActive,
    wasReopened,
    hadObservations,
    segments
  };
}

