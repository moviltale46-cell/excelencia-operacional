import { WorkingScheduleConfig, DEFAULT_WORKING_SCHEDULE, HolidayConfig } from "../types";
import { safeParseDate } from "./dateUtils";

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
