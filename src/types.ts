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
  derivadoA?: string; // Username of the Asistente Legal specifically assigned/reassigned to this record
  history?: StatusHistoryEntry[]; // History of status/observations
  updatedByUser?: string; // Auditing username for updates
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
}

export type UserRole = 'Administrador' | 'Jefe de Ventas' | 'Jefe Legal' | 'Asistente Legal';
