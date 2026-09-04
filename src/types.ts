/**
 * Types for the Operational Excellence System
 */

export interface StatusHistoryEntry {
  status: string;
  comentario: string;
  timestamp: string;
  user: string;
}

export interface OperationRecord {
  id: string; // Unique ID
  team: string; // A: TEAM (JHAZMIN, FRANCISCO, NINOSKA, etc.)
  proyecto: string; // B: PROYECTO (Salaverry District, Santo Toribio, etc.)
  dpto: string; // C: DPTO.
  estac: string; // D: ESTAC.
  dep: string; // E: DEP.
  asesor: string; // F: ASESOR (ANABEL ALBINO, etc.)
  tipo: string; // G: TIPO (custom dynamic option or default)
  solicitud: string; // H: SOLICITUD (Fecha y Hora - automatic when registered by Jefe Legal)
  solicitudAt?: string; // H: ISO timestamp for Jefe Legal edit validation
  emision: string; // I: EMISION (Fecha y Hora - automatic when Asistente Legal/Jefe Legal updates status)
  emittedAt?: string; // I: ISO timestamp for Asistente Legal/Jefe Legal 30 min / 6 hours edit validation
  status: string; // J: STATUS (custom dynamic option or default)
  comentario: string; // K: COMENTARIO (now optional)
  createdAt: string; // Creation timestamp
  updatedAt?: string; // Last update timestamp
  derivadoA?: string; // Username of the Asistente Legal specifically assigned/reassigned to this record
  history?: StatusHistoryEntry[]; // History of status/observations
  updatedByUser?: string; // Auditing username for updates
  skipHistory?: boolean; // When true, update will NOT append to history or create history log documents (Admin edit)
}

export interface UserAccount {
  id: string;
  username: string;
  password?: string; // Optional for Asistente Legal users
  role: UserRole;
  active: boolean;
  assignedProjects: string[]; // Projects an Asistente Legal user is assigned to see/manage
}

export interface ProjectConfig {
  name: string;
  team: string;
  jefeVentas?: string; // Assigned Jefe de Ventas for this project
}

export interface TeamConfig {
  id: string;
  name: string;
  jefeVentas?: string;
}

export interface HolidayConfig {
  date: string; // "YYYY-MM-DD"
  description: string;
}

export interface WorkingScheduleConfig {
  startHour: number | string; // e.g. 9 or "09:00"
  endHour: number | string;   // e.g. 18 or "18:00"
  workingDays: number[]; // e.g. [1, 2, 3, 4, 5] (1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 0=Sunday)
  holidays: HolidayConfig[]; // array of { date: "YYYY-MM-DD", description: "..." }
}

export const DEFAULT_WORKING_SCHEDULE: WorkingScheduleConfig = {
  startHour: 9,
  endHour: 18,
  workingDays: [1, 2, 3, 4, 5], // Lunes a Viernes
  holidays: [
    { date: "2025-01-01", description: "Año Nuevo" },
    { date: "2025-04-17", description: "Jueves Santo" },
    { date: "2025-04-18", description: "Viernes Santo" },
    { date: "2025-05-01", description: "Día del Trabajo" },
    { date: "2025-06-07", description: "Día de la Bandera" },
    { date: "2025-06-29", description: "San Pedro y San Pablo" },
    { date: "2025-07-23", description: "Día de la Fuerza Aérea" },
    { date: "2025-07-28", description: "Fiestas Patrias" },
    { date: "2025-07-29", description: "Fiestas Patrias" },
    { date: "2025-08-06", description: "Batalla de Junín" },
    { date: "2025-08-30", description: "Santa Rosa de Lima" },
    { date: "2025-10-08", description: "Combate de Angamos" },
    { date: "2025-11-01", description: "Todos los Santos" },
    { date: "2025-12-08", description: "Inmaculada Concepción" },
    { date: "2025-12-09", description: "Batalla de Ayacucho" },
    { date: "2025-12-25", description: "Navidad" },
    { date: "2026-01-01", description: "Año Nuevo" },
    { date: "2026-04-02", description: "Jueves Santo" },
    { date: "2026-04-03", description: "Viernes Santo" },
    { date: "2026-05-01", description: "Día del Trabajo" },
    { date: "2026-06-07", description: "Día de la Bandera" },
    { date: "2026-06-29", description: "San Pedro y San Pablo" },
    { date: "2026-07-23", description: "Día de la Fuerza Aérea" },
    { date: "2026-07-28", description: "Fiestas Patrias" },
    { date: "2026-07-29", description: "Fiestas Patrias" },
    { date: "2026-08-06", description: "Batalla de Junín" },
    { date: "2026-08-30", description: "Santa Rosa de Lima" },
    { date: "2026-10-08", description: "Combate de Angamos" },
    { date: "2026-11-01", description: "Todos los Santos" },
    { date: "2026-12-08", description: "Inmaculada Concepción" },
    { date: "2026-12-09", description: "Batalla de Ayacucho" },
    { date: "2026-12-25", description: "Navidad" }
  ]
};

export interface AppSettings {
  platformName?: string; // Customizable platform name
  platformLogo?: string; // Base64 representation of custom platform logo
  jefeLegalEnabled: boolean; // Managed by Admin
  sharedExcelLink: string; // Excel Link entered by users
  sheetsWebhookUrl: string; // Actual webhook URL to sync with Google Sheets / Web App
  tiposOperacion: string[]; // Dynamic types list
  statuses: string[]; // Dynamic statuses list
  statusColors?: Record<string, string>; // Status colors mapping (hex or tailwind classes)
  proyectos: ProjectConfig[]; // Registered projects & associated teams
  users: UserAccount[]; // User accounts managed by Admin
  kpiVisibility: Record<UserRole, boolean>; // Role-based KPI visibility config
  asesores?: string[]; // Dynamic advisors list entered by Admin
  equipos?: TeamConfig[]; // Dynamic teams list managed by Admin
  workingSchedule?: WorkingScheduleConfig; // Working schedule and business hours config
  observationReasons?: ObservationReasonConfig[]; // Dynamic observation reasons managed by Admin
}

export interface ObservationReasonConfig {
  id: string;
  name: string;
  active: boolean;
}

export type UserRole = 'Administrador' | 'Jefe de Ventas' | 'Jefe Legal' | 'Asistente Legal';

export const STANDARD_OBSERVATIONS = [
  "Falta Documento de identidad.",
  "Falta contrato de separación firmado.",
  "No completó la DJ con estado civil y dirección actual.",
  "Falta voucher de separación.",
  "Error en el cronograma.",
  "Faltan documentos adicionales.",
  "Falta Precalificación / Carta de aprobación.",
  "No indicó el banco que otorgará el crédito hipotecario.",
  "Dirección Incompleta.",
  "Otros."
] as const;

export function getActiveObservationReasons(settings?: AppSettings): string[] {
  if (settings?.observationReasons && settings.observationReasons.length > 0) {
    const activeList = settings.observationReasons.filter(r => r.active).map(r => r.name);
    return activeList.length > 0 ? activeList : [...STANDARD_OBSERVATIONS];
  }
  return [...STANDARD_OBSERVATIONS];
}
