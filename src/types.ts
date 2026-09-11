/**
 * Types for the Operational Excellence System
 */

export interface StatusHistoryEntry {
  status: string;
  comentario: string;
  timestamp: string;
  user: string;
  derivadoA?: string;
  affectsAdvisor?: boolean;
  tipoObservacion?: "Asesor" | "Observaciones de otras áreas";
  observationReasons?: string[];
}

export interface OperationRecord {
  id: string; // Unique ID
  team: string; // A: TEAM (JHAZMIN, FRANCISCO, NINOSKA, etc.)
  jefeVentas?: string; // Optional direct Jefe de Ventas associated with this operation
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
  tipoObservacion?: "Asesor" | "Observaciones de otras áreas"; // Distinguishes observations that do not affect advisor KPI
  affectsAdvisor?: boolean; // Whether the observation affects the advisor's KPI and timer runs (true) or stops (false)
  observationReasons?: string[]; // Observation reasons chosen
  observacion?: string; // Observation notes/comments
  reingresadoAt?: string; // Timestamp when observation was lifted and returned to legal queue
}

export interface UserAccount {
  id: string;
  username: string;
  password?: string; // Optional for Asistente Legal users
  role: UserRole;
  active: boolean;
  assignedProjects: string[]; // Projects an Asistente Legal user is assigned to see/manage
  assignedAdvisors?: string[]; // Asesores a su cargo for Jefe de Agentes
  teamName?: string; // Custom or default team name (e.g. "AGENTES" or "TEAM AGENTES")
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

export type ObservationCategory = 'legal' | 'otras_areas';

export interface ObservationReasonConfig {
  id: string;
  name: string;
  active: boolean;
  category?: ObservationCategory; // 'legal' (Asesor / Legal) or 'otras_areas' (Observaciones de otras áreas)
  affectsAdvisor?: boolean; // When true: observation affects advisor KPI and timer runs. When false: does NOT affect advisor and advisor timer stops
  color?: string; // Custom hex or badge color for visual identification
}

export type UserRole = 'Administrador' | 'Jefe de Ventas' | 'Jefe Legal' | 'Asistente Legal' | 'Jefe de Agentes';

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

export const STANDARD_OTHER_AREAS_OBSERVATIONS = [
  "Observaciones de otras áreas",
  "Pendiente de Aprobación de Crédito / Carta Bancaria",
  "Validación de Contabilidad / Finanzas",
  "Revisión de Arquitectura / Modificación de Plano",
  "Trámite Notarial / Minuta Externa",
  "Aprobación de Gerencia / Directorio",
  "Otros requerimientos de áreas internas"
] as const;

export const DEFAULT_OBSERVATION_REASONS: ObservationReasonConfig[] = [
  // Legal / Asesor (afecta asesor)
  { id: "obs-1", name: "Falta Documento de identidad.", active: true, category: "legal", affectsAdvisor: true, color: "#f43f5e" },
  { id: "obs-2", name: "Falta contrato de separación firmado.", active: true, category: "legal", affectsAdvisor: true, color: "#e11d48" },
  { id: "obs-3", name: "No completó la DJ con estado civil y dirección actual.", active: true, category: "legal", affectsAdvisor: true, color: "#ea580c" },
  { id: "obs-4", name: "Falta voucher de separación.", active: true, category: "legal", affectsAdvisor: true, color: "#d97706" },
  { id: "obs-5", name: "Error en el cronograma.", active: true, category: "legal", affectsAdvisor: true, color: "#ca8a04" },
  { id: "obs-6", name: "Faltan documentos adicionales.", active: true, category: "legal", affectsAdvisor: true, color: "#be123c" },
  { id: "obs-7", name: "Falta Precalificación / Carta de aprobación.", active: true, category: "legal", affectsAdvisor: true, color: "#f59e0b" },
  { id: "obs-8", name: "No indicó el banco que otorgará el crédito hipotecario.", active: true, category: "legal", affectsAdvisor: true, color: "#f97316" },
  { id: "obs-9", name: "Dirección Incompleta.", active: true, category: "legal", affectsAdvisor: true, color: "#e11d48" },
  { id: "obs-10", name: "Otros.", active: true, category: "legal", affectsAdvisor: true, color: "#64748b" },

  // Otras Áreas (no afecta asesor)
  { id: "obs-11", name: "Observaciones de otras áreas", active: true, category: "otras_areas", affectsAdvisor: false, color: "#2563eb" },
  { id: "obs-12", name: "Pendiente de Aprobación de Crédito / Carta Bancaria", active: true, category: "otras_areas", affectsAdvisor: false, color: "#3b82f6" },
  { id: "obs-13", name: "Validación de Contabilidad / Finanzas", active: true, category: "otras_areas", affectsAdvisor: false, color: "#0284c7" },
  { id: "obs-14", name: "Revisión de Arquitectura / Modificación de Plano", active: true, category: "otras_areas", affectsAdvisor: false, color: "#0891b2" },
  { id: "obs-15", name: "Trámite Notarial / Minuta Externa", active: true, category: "otras_areas", affectsAdvisor: false, color: "#4f46e5" },
  { id: "obs-16", name: "Aprobación de Gerencia / Directorio", active: true, category: "otras_areas", affectsAdvisor: false, color: "#7c3aed" },
  { id: "obs-17", name: "Otros requerimientos de áreas internas", active: true, category: "otras_areas", affectsAdvisor: false, color: "#0ea5e9" }
];

export function doesReasonAffectAdvisor(reasonName: string, settings?: AppSettings): boolean {
  if (settings?.observationReasons && settings.observationReasons.length > 0) {
    const found = settings.observationReasons.find(r => r.name.trim().toLowerCase() === reasonName.trim().toLowerCase());
    if (found && found.affectsAdvisor !== undefined) {
      return found.affectsAdvisor;
    }
  }
  const defaultFound = DEFAULT_OBSERVATION_REASONS.find(r => r.name.trim().toLowerCase() === reasonName.trim().toLowerCase());
  if (defaultFound && defaultFound.affectsAdvisor !== undefined) {
    return defaultFound.affectsAdvisor;
  }
  if (STANDARD_OTHER_AREAS_OBSERVATIONS.includes(reasonName as any) || reasonName.toLowerCase().includes("otras áreas") || reasonName.toLowerCase().includes("otras areas")) {
    return false;
  }
  return true;
}

export function getActiveObservationReasonConfigs(settings?: AppSettings, category?: ObservationCategory): ObservationReasonConfig[] {
  const list = (settings?.observationReasons && settings.observationReasons.length > 0)
    ? settings.observationReasons
    : DEFAULT_OBSERVATION_REASONS;

  let filtered = list.filter(r => r.active);
  if (category) {
    filtered = filtered.filter(r => (r.category || 'legal') === category);
  }
  return filtered;
}

export function getActiveObservationReasons(settings?: AppSettings, category?: ObservationCategory): string[] {
  const configs = getActiveObservationReasonConfigs(settings, category);
  return configs.map(c => c.name);
}

export function getReasonColor(reasonName: string, settings?: AppSettings): string {
  const list = (settings?.observationReasons && settings.observationReasons.length > 0)
    ? settings.observationReasons
    : DEFAULT_OBSERVATION_REASONS;

  const found = list.find(r => r.name.trim().toLowerCase() === reasonName.trim().toLowerCase());
  if (found?.color) return found.color;

  if (found?.category === 'otras_areas' || found?.affectsAdvisor === false) {
    return "#2563eb";
  }
  return "#f43f5e";
}
