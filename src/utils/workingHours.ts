import { WorkingScheduleConfig, DEFAULT_WORKING_SCHEDULE, HolidayConfig, OperationRecord, StatusHistoryEntry } from "../types";
import { 
  safeParseDate, 
  formatHoursHHMM, 
  isOtherAreasObservation,
  getRecordIngresoDate,
  getRecordIngresoMonthKey,
  getRecordReopenDate,
  getRecordReopenMonthKey,
  isPendingFromPreviousMonth
} from "./dateUtils";

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

  reopenedMinutes?: number;
  reopenedHours?: number;
  reopenedFormatted?: string;

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
    s === "emitido" ||
    s === "firmado" ||
    s === "acuerdo interno" ||
    s.includes("cierre completo") ||
    s.includes("desistid") ||
    s.includes("desestimad") ||
    s.includes("emitid") ||
    s.includes("aprobado para emisi") ||
    s.includes("acuerdo interno")
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

  // Ensure emission date is represented if record was emitted/closed and not already in history
  if (record.emittedAt || record.emision) {
    const emittedDate = safeParseDate(record.emittedAt || record.emision);
    if (emittedDate) {
      const alreadyHasEventAtEmission = rawEvents.some(
        ev => Math.abs(ev.date.getTime() - emittedDate.getTime()) <= 60000
      );
      if (!alreadyHasEventAtEmission) {
        const fallbackStatus = isOperationObservedStatus(record.status, record.comentario)
          ? (record.status || "Observado / Rechazado")
          : (isOperationClosedStatus(record.status, record.comentario) ? (record.status || "Emitido") : "Emitido");
        rawEvents.push({
          date: emittedDate,
          status: fallbackStatus,
          comment: "Emisión / Cierre registrado",
          user: record.derivadoA || record.updatedByUser || "Legal"
        });
      }
    }
  }

  // If operation was genuinely reopened, ensure it is represented in the timeline
  const isTrulyReopened = Boolean(record.isReopened || record.reopenedAt);
  if (isTrulyReopened && record.reopenedAt) {
    const reopenedDate = safeParseDate(record.reopenedAt);
    if (reopenedDate) {
      const alreadyHasReopenEvent = rawEvents.some(
        ev => Math.abs(ev.date.getTime() - reopenedDate.getTime()) <= 5000
      );
      if (!alreadyHasReopenEvent) {
        rawEvents.push({
          date: reopenedDate,
          status: "Reabierto",
          comment: "[Reapertura de Operación] Expediente reabierto y reactivado por Jefe Legal.",
          user: record.updatedByUser || "Jefe Legal"
        });
      }
    }
  } else if (record.reingresadoAt) {
    const reenteredDate = safeParseDate(record.reingresadoAt);
    if (reenteredDate) {
      const alreadyHasReenterEvent = rawEvents.some(
        ev => Math.abs(ev.date.getTime() - reenteredDate.getTime()) <= 5000
      );
      if (!alreadyHasReenterEvent) {
        rawEvents.push({
          date: reenteredDate,
          status: "Pendiente",
          comment: "[Reingreso a Legal] Observación atendida / expediente continúa revisión legal.",
          user: record.updatedByUser || "Jefe Legal"
        });
      }
    }
  }

  // Sort chronological ascending
  rawEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Ensure initial registration is at start (ALWAYS starts in Legal's court as Pendiente)
  if (rawEvents.length === 0 || rawEvents[0].date.getTime() > initialDate.getTime()) {
    rawEvents.unshift({
      date: initialDate,
      status: "Pendiente",
      comment: "Registro Inicial",
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
    const nextCommLower = (nextEvent.comment || "").toLowerCase();
    if (
      isObservationLiftedEvent(nextEvent) ||
      nextCommLower.includes("reapertura") ||
      nextCommLower.includes("[modificación anexada]")
    ) {
      // "Se levantó la observación" or "Reapertura" -> Clock stops for closed/advisor, resumes for Legal
      currentRole = 'LEGAL';
      if (nextCommLower.includes("reapertura") || nextCommLower.includes("[modificación anexada]")) {
        wasReopened = true;
      }
    } else if (isOperationObservedStatus(nextEvent.status, nextEvent.comment)) {
      // Operation observed -> Clock stops for Legal, starts for Advisor / Other Areas
      hadObservations = true;
      const isOther = isOtherAreasObservation(nextEvent) || nextEvent.affectsAdvisor === false || (nextEvent.tipoObservacion === "Observaciones de otras áreas");
      currentRole = isOther ? 'OTHER_AREAS' : 'ADVISOR';
    } else if (isOperationClosedStatus(nextEvent.status, nextEvent.comment)) {
      // Operation closed or emitted (Cierre Completo, Desistido, Emitido, Acuerdo Interno, etc.)
      currentRole = 'CLOSED';
    } else if (currentRole === 'CLOSED') {
      // Subsequent action after closure (e.g. reopened or continued management)
      wasReopened = true;
      currentRole = 'LEGAL';
    } else if (currentRole === 'ADVISOR' || currentRole === 'OTHER_AREAS') {
      // If status explicitly moved to Pendiente or En Proceso or Modificado, treat as returned to Legal
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
  // Only add ongoing minutes if the operation is genuinely still open (not closed and not already emitted/completed)
  const hasReentered = Boolean(record.reingresadoAt);
  const isStatusClosed = isOperationClosedStatus(record.status, record.comentario);
  const statusLower = (record.status || "").toLowerCase().trim();
  const hasEmittedTimestamp = Boolean(record.emision || record.emittedAt);
  const isCompletedModification = statusLower.includes("modificad") && hasEmittedTimestamp;

  // Check if a reopen or re-entry happened strictly after the emission date
  const emittedDateObj = safeParseDate(record.emittedAt || record.emision);
  const latestReentryObj = safeParseDate(record.reopenedAt || record.reingresadoAt);
  const reenteredAfterEmission = Boolean(
    latestReentryObj && (!emittedDateObj || latestReentryObj.getTime() > emittedDateObj.getTime())
  );

  const isCurrentlyClosed =
    isStatusClosed ||
    isCompletedModification ||
    (currentRole === 'CLOSED' && !reenteredAfterEmission);

  let isCurrentlyActive = false;

  if (!isCurrentlyClosed) {
    isCurrentlyActive = true;
    if (currentRole === 'CLOSED') {
      currentRole = 'LEGAL';
    }
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

  // Calculate live reopened timer for the legal assistant
  let reopenedMinutes = 0;
  let reopenedHours = 0;
  let reopenedFormatted: string | undefined = undefined;

  if ((wasReopened || hasReentered) && !isCurrentlyClosed) {
    const reenteredDate = safeParseDate(record.reopenedAt || record.reingresadoAt) || currentTime;
    if (reenteredDate && asOfDate.getTime() > reenteredDate.getTime()) {
      const reopBiz = calculateBusinessTime(reenteredDate, asOfDate, schedule);
      reopenedMinutes = reopBiz.totalMinutes;
      reopenedHours = Number((reopenedMinutes / 60).toFixed(2));
      reopenedFormatted = `${reopenedMinutes} min (${formatHoursHHMM(reopenedHours)})`;
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
    wasReopened: Boolean(record.isReopened || record.reopenedAt || wasReopened),
    reopenedMinutes,
    reopenedHours,
    reopenedFormatted,
    hadObservations,
    segments
  };
}

/**
 * Returns the exact Date corresponding to the first business day of the month at 09:00:00 AM.
 */
export function getFirstBusinessDayOfMonth(
  year: number,
  monthZeroIndexed: number,
  config: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE
): Date {
  const d = new Date(year, monthZeroIndexed, 1, 9, 0, 0, 0);
  
  // Advance until a working day is found
  while (!isWorkingDay(d, config)) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  
  return d;
}

export interface AssistantScopeEvaluation {
  inScope: boolean;
  type: 'NEW' | 'MODIFICATION' | 'PENDING_PREVIOUS' | 'OUT_OF_SCOPE';
  effectiveStartDate: Date | null;
  label: string;
}

/**
 * Single source of truth for Asistente Legal monthly KPIs and response time calculation.
 * Rules requested by user:
 * "Los tiempos de respuesta promedio de los asistente legales, siempre tener en cuenta que son de las solicitadas en el mes,
 * por ejemplo si una solicitud ingresa en el 31 de octubre y se termina de gestionar por varias acciones en noviembre ese tiempo
 * se sumara para octubre, solo se considerar para noviembre lo que se ingrese en o reabra operación en noviembre y seria el
 * tiempo promedio para ese mes."
 */
export function evaluateAssistantRecordScope(
  r: any,
  targetMonthKey: string,
  _schedule: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE
): AssistantScopeEvaluation {
  if (!r) {
    return { inScope: false, type: 'OUT_OF_SCOPE', effectiveStartDate: null, label: 'Fuera de alcance' };
  }

  const ingDate = getRecordIngresoDate(r);
  const ingMonthKey = getRecordIngresoMonthKey(r);
  const reopenDate = getRecordReopenDate(r);
  const reopenMonthKey = getRecordReopenMonthKey(r);

  // 1. Solicitud ingresada en el mes objetivo:
  // Si ingresa el 31 de octubre y se termina de gestionar por varias acciones en noviembre,
  // pertenece a octubre y todo su tiempo de gestión se suma para octubre.
  if (ingMonthKey === targetMonthKey && ingDate) {
    return {
      inScope: true,
      type: 'NEW',
      effectiveStartDate: ingDate,
      label: 'Solicitud del Mes'
    };
  }

  // 2. Operación reabierta explícitamente en el mes objetivo (de un mes anterior):
  // Solo se considera para el nuevo mes lo que ingrese o reabra operación en ese mes.
  if (reopenMonthKey === targetMonthKey && reopenDate) {
    return {
      inScope: true,
      type: 'MODIFICATION',
      effectiveStartDate: reopenDate,
      label: 'Operación Reabierta en el Mes'
    };
  }

  return {
    inScope: false,
    type: 'OUT_OF_SCOPE',
    effectiveStartDate: null,
    label: 'Fuera de alcance'
  };
}

/**
 * Checks if a Legal Assistant has already responded to / managed the operation
 * (either emitted, closed, observed, or recorded at least one action in history).
 */
export function hasAssistantRespondedToRecord(r: any): boolean {
  if (!r) return false;
  if (r.emision || r.emittedAt) return true;
  if (isOperationClosedStatus(r.status, r.comentario)) return true;
  if (isOperationObservedStatus(r.status, r.comentario)) return true;
  const s = (r.status || "").toLowerCase().trim();
  if (s === "modificado" || s === "acuerdo interno") return true;
  if (Array.isArray(r.history) && r.history.length > 0) {
    return r.history.some((h: any) => {
      const c = (h?.comentario || "").toLowerCase();
      return !c.includes("nueva solicitud registrada") && c !== "registro inicial";
    });
  }
  return false;
}

/**
 * Calculates the cumulative legal response time in minutes for an assistant record according to its monthly scope:
 * - NEW (Solicitada en el mes): sums all LEGAL response intervals from solicitud until completion (even if actions finish in the next month).
 *   If the operation was later formally reopened in a subsequent month, stops before that subsequent month's reopen date.
 * - MODIFICATION (Reabierta en el mes): sums all LEGAL response intervals from the reopen date in this month until completion.
 */
export function calculateAssistantRecordResponseMinutes(
  r: any,
  scope: AssistantScopeEvaluation,
  schedule: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE,
  asOfDate: Date = new Date()
): number {
  if (!scope.inScope || !scope.effectiveStartDate) return 0;

  const breakdown = calculateOperationTimeBreakdown(r, schedule, asOfDate);

  if (scope.type === 'MODIFICATION') {
    // Sum only LEGAL segments occurring on or after the reopen date in this month
    const reopenStartMs = scope.effectiveStartDate.getTime();
    let reopenedLegalMins = 0;
    for (const seg of breakdown.segments) {
      if (seg.role === 'LEGAL' && seg.endTime.getTime() > reopenStartMs) {
        const segStart = seg.startTime.getTime() < reopenStartMs ? scope.effectiveStartDate : seg.startTime;
        const mins = calculateBusinessTime(segStart, seg.endTime, schedule).totalMinutes;
        reopenedLegalMins += mins;
      }
    }
    if (reopenedLegalMins > 0) {
      return reopenedLegalMins;
    }
    const end = safeParseDate(r.emision || r.emittedAt);
    if (end && end.getTime() > reopenStartMs) {
      return calculateBusinessTime(scope.effectiveStartDate, end, schedule).totalMinutes;
    }
    return 0;
  }

  // NEW operation solicited in the target month:
  // Check if it was formally reopened in a LATER month after being closed
  const ingMonthKey = getRecordIngresoMonthKey(r);
  const reopenDate = getRecordReopenDate(r);
  const reopenMonthKey = getRecordReopenMonthKey(r);

  if (
    reopenDate &&
    reopenMonthKey &&
    ingMonthKey &&
    reopenMonthKey !== ingMonthKey &&
    reopenDate.getTime() > scope.effectiveStartDate.getTime()
  ) {
    // Sum all LEGAL segments belonging to the original request cycle (before the subsequent month's reopen)
    const reopenMs = reopenDate.getTime();
    let initialCycleMins = 0;
    for (const seg of breakdown.segments) {
      if (seg.role === 'LEGAL' && seg.startTime.getTime() < reopenMs) {
        const segEnd = seg.endTime.getTime() > reopenMs ? reopenDate : seg.endTime;
        const mins = calculateBusinessTime(seg.startTime, segEnd, schedule).totalMinutes;
        initialCycleMins += mins;
      }
    }
    if (initialCycleMins > 0) {
      return initialCycleMins;
    }
  }

  if (breakdown.legalMinutes > 0) {
    return breakdown.legalMinutes;
  }

  const end = safeParseDate(r.emision || r.emittedAt);
  if (end && end.getTime() > scope.effectiveStartDate.getTime()) {
    return calculateBusinessTime(scope.effectiveStartDate, end, schedule).totalMinutes;
  }
  return 0;
}


