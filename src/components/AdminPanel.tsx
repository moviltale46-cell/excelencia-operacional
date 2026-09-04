import React, { useState } from "react";
import { 
  AppSettings, OperationRecord, UserAccount, ProjectConfig, UserRole, TeamConfig,
  WorkingScheduleConfig, DEFAULT_WORKING_SCHEDULE, HolidayConfig,
  ObservationReasonConfig, STANDARD_OBSERVATIONS
} from "../types";
import { 
  Settings, Check, Save, Copy, FileSpreadsheet, Eye, EyeOff, 
  Edit, Trash2, ShieldAlert, UserCheck, Plus, X, List, Shield, 
  Building, CheckSquare, Square, Layers, HelpCircle, Info,
  RefreshCw, Zap, Server, Database, Activity, CheckCircle2, AlertCircle,
  Calendar, Clock, BarChart3, TrendingUp
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import { clearAllCache } from "../services/api";
import { calculateBusinessTime } from "../utils/workingHours";
import DailyObservationsControlChart from "./DailyObservationsControlChart";

interface AdminPanelProps {
  settings: AppSettings;
  records: OperationRecord[];
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onUpdateRecord: (id: string, updatedFields: Partial<OperationRecord>) => void;
  onDeleteRecord: (id: string) => void;
  onImportExcel: (fileBase64: string) => Promise<{ success: boolean; count: number }>;
  onRefreshAll?: () => Promise<void>;
}

export const STATUS_COLOR_PRESETS = [
  { name: "Ámbar (Pendiente)", bg: "bg-amber-100 text-amber-800 border-amber-200" },
  { name: "Azul (En Proceso)", bg: "bg-blue-100 text-blue-800 border-blue-200" },
  { name: "Verde (Aprobado)", bg: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { name: "Rosa (Observado)", bg: "bg-rose-100 text-rose-800 border-rose-200" },
  { name: "Violeta (Prioritario)", bg: "bg-violet-100 text-violet-800 border-violet-200" },
  { name: "Pizarra (Inactivo)", bg: "bg-slate-100 text-slate-800 border-slate-200" }
];

export default function AdminPanel({
  settings,
  records,
  onUpdateSettings,
  onUpdateRecord,
  onDeleteRecord,
  onImportExcel,
  onRefreshAll
}: AdminPanelProps) {
  // Navigation for Sub-panels inside Admin Consola
  const [activeSubTab, setActiveSubTab] = useState<"general" | "schedule" | "users" | "terms" | "projects" | "records" | "advisors" | "motivos" | "analytics">("general");

  // Platform general settings
  const [platformName, setPlatformName] = useState(settings.platformName || "Excelencia Operacional");
  const [platformLogo, setPlatformLogo] = useState(settings.platformLogo || "");
  const [jefeLegalToggle, setJefeLegalToggle] = useState(settings.jefeLegalEnabled);
  const [excelUrl, setExcelUrl] = useState(settings.sharedExcelLink);
  const [webhookUrl, setWebhookUrl] = useState(settings.sheetsWebhookUrl);
  const [kpiVisibility, setKpiVisibility] = useState<Record<UserRole, boolean>>(
    settings.kpiVisibility || {
      "Administrador": true,
      "Jefe de Ventas": false,
      "Jefe Legal": true,
      "Asistente Legal": false
    }
  );

  // Working Hours & Schedule state
  const [workingSchedule, setWorkingSchedule] = useState<WorkingScheduleConfig>(
    settings.workingSchedule || DEFAULT_WORKING_SCHEDULE
  );
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayDesc, setNewHolidayDesc] = useState("");
  const [simStartDate, setSimStartDate] = useState("2026-09-04 16:00");
  const [simEndDate, setSimEndDate] = useState("2026-09-07 10:00");
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
  
  const [showWebHookSecret, setShowWebHookSecret] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Live connection test & force cache refresh states
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; message: string } | null>(null);
  const [forceSyncing, setForceSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Users management state
  const [users, setUsers] = useState<UserAccount[]>(settings.users || []);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<Partial<UserAccount>>({
    username: "",
    password: "",
    role: "Asistente Legal",
    active: true,
    assignedProjects: []
  });
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Advisors management state
  const [asesores, setAsesores] = useState<string[]>(settings.asesores || []);
  const [newAsesorName, setNewAsesorName] = useState("");

  // Observation Reasons management state (Checklist)
  const [observationReasons, setObservationReasons] = useState<ObservationReasonConfig[]>(
    settings.observationReasons && settings.observationReasons.length > 0
      ? settings.observationReasons
      : STANDARD_OBSERVATIONS.map((name, idx) => ({
          id: `OBS${String(idx + 1).padStart(3, "0")}`,
          name,
          active: true
        }))
  );
  const [newReasonText, setNewReasonText] = useState("");
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [editingReasonText, setEditingReasonText] = useState("");
  const [reasonsSuccessMsg, setReasonsSuccessMsg] = useState(false);

  // Prop-syncing Effect: Keep states synchronized with loaded settings (Fixes logout persistence issues)
  React.useEffect(() => {
    if (settings) {
      if (settings.platformName) setPlatformName(settings.platformName);
      if (settings.platformLogo) setPlatformLogo(settings.platformLogo);
      setJefeLegalToggle(settings.jefeLegalEnabled);
      setExcelUrl(settings.sharedExcelLink || "");
      setWebhookUrl(settings.sheetsWebhookUrl || "");
      if (settings.kpiVisibility) setKpiVisibility(settings.kpiVisibility);
      if (settings.users) setUsers(settings.users);
      if (settings.tiposOperacion) setTipos(settings.tiposOperacion);
      if (settings.statuses) setStatuses(settings.statuses);
      if (settings.statusColors) setStatusColors(settings.statusColors);
      if (settings.proyectos) setProyectos(settings.proyectos);
      if (settings.asesores) setAsesores(settings.asesores);
      if (settings.equipos) setEquipos(settings.equipos);
      if (settings.workingSchedule) setWorkingSchedule(settings.workingSchedule);
      if (settings.observationReasons && settings.observationReasons.length > 0) {
        setObservationReasons(settings.observationReasons);
      }
    }
  }, [settings]);

  // Dynamic Operations and Statuses state
  const [tipos, setTipos] = useState<string[]>(settings.tiposOperacion || ["EMISION", "MODIFICACION", "ADENDA"]);
  const [statuses, setStatuses] = useState<string[]>(settings.statuses || [
    "Pendiente de Firma", "En Revisión Técnica", "Aprobado para Emisión", "Observado / Rechazado"
  ]);
  const [statusColors, setStatusColors] = useState<Record<string, string>>(settings.statusColors || {
    "Pendiente de Firma": "bg-amber-100 text-amber-800 border-amber-200",
    "En Revisión Técnica": "bg-blue-100 text-blue-800 border-blue-200",
    "Aprobado para Emisión": "bg-emerald-100 text-emerald-800 border-emerald-200",
    "Observado / Rechazado": "bg-rose-100 text-rose-800 border-rose-200"
  });
  
  const [selectedColorClass, setSelectedColorClass] = useState("bg-amber-100 text-amber-800 border-amber-200");
  const [editingStatusColorClass, setEditingStatusColorClass] = useState("bg-amber-100 text-amber-800 border-amber-200");

  const [newTipo, setNewTipo] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [editingTipoIndex, setEditingTipoIndex] = useState<number | null>(null);
  const [editingTipoValue, setEditingTipoValue] = useState("");
  const [editingStatusIndex, setEditingStatusIndex] = useState<number | null>(null);
  const [editingStatusValue, setEditingStatusValue] = useState("");

  // Projects & Teams state
  const [proyectos, setProyectos] = useState<ProjectConfig[]>(settings.proyectos || []);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectTeam, setNewProjectTeam] = useState("");
  const [newProjectJefeVentas, setNewProjectJefeVentas] = useState("");
  const [editingProjIndex, setEditingProjIndex] = useState<number | null>(null);
  const [editingProjValue, setEditingProjValue] = useState<ProjectConfig>({ name: "", team: "", jefeVentas: "" });

  const [equipos, setEquipos] = useState<TeamConfig[]>(settings.equipos || []);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamJefe, setNewTeamJefe] = useState("");

  // States for record editing (Sub-tab 5)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editTeam, setEditTeam] = useState("");
  const [editProyecto, setEditProyecto] = useState("");
  const [editDpto, setEditDpto] = useState("");
  const [editEstac, setEditEstac] = useState("");
  const [editDep, setEditDep] = useState("");
  const [editAsesor, setEditAsesor] = useState("");
  const [editTipo, setEditTipo] = useState("");
  const [editSolicitud, setEditSolicitud] = useState("");
  const [editEmision, setEditEmision] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editComentario, setEditComentario] = useState("");

  // Google Apps Script template with Tiered Server-Side CacheService and Bootstrap optimization
  const appsScriptTemplate = `/**
 * Google Apps Script Webhook de Alto Rendimiento con Caché Escalonada
 * Sistema de Excelencia Operacional - Legal y Ventas
 * 
 * Instrucciones de Implementación:
 * 1. En tu Google Sheet, ve a "Extensiones" -> "Apps Script".
 * 2. Borra todo el código existente e inserta este script completo.
 * 3. Haz clic en "Implementar" -> "Nueva implementación" (o "Gestionar implementaciones" -> Editar -> Nueva versión).
 * 4. Selecciona el tipo: "Aplicación web".
 * 5. Configuración requerida:
 *    - Ejecutar como: "Tú" (tu cuenta)
 *    - Quién tiene acceso: "Cualquiera"
 * 6. Haz clic en "Implementar" y autoriza los permisos.
 * 7. Copia la URL generada y pégala en la sección de Webhook en la Consola del Administrador.
 */

const SHEET_HEADERS = {
  "Usuarios": ["IdUsuario", "Usuario", "Password", "NombreCompleto", "Rol", "Activo", "FechaCreacion", "FechaActualizacion", "Proyectos"],
  "Equipos": ["IdEquipo", "NombreEquipo", "JefeVentas", "Activo", "FechaCreacion"],
  "Asesores": ["IdAsesor", "Nombre", "IdEquipo", "Activo", "FechaCreacion"],
  "Proyectos": ["IdProyecto", "NombreProyecto", "IdEquipo", "Activo", "FechaCreacion"],
  "Estados": ["IdEstado", "NombreEstado", "Color", "Orden", "Activo"],
  "TiposOperacion": ["IdTipo", "NombreTipo", "Activo"],
  "Operaciones": ["IdOperacion", "IdProyecto", "IdEquipo", "Dpto", "Estacionamiento", "Deposito", "Asesor", "TipoOperacion", "FechaSolicitud", "FechaEmision", "Estado", "Comentario", "DerivadoA", "UsuarioRegistro", "FechaRegistro", "UsuarioModificacion", "FechaModificacion", "Activo"],
  "Historial": ["IdHistorial", "IdOperacion", "Estado", "Comentario", "UsuarioRegistro", "FechaRegistro"]
};

// Duración de caché en servidor: 600 segundos (10 minutos) para catálogos
const CACHE_TTL_SECONDS = 600;

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = SHEET_HEADERS[name];
    if (headers) {
      sheet.appendRow(headers);
    }
  }
  return sheet;
}

function getFormattedDateTime() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-5", "dd/MM/yyyy HH:mm:ss");
}

function clearServerCache() {
  try {
    const cache = CacheService.getScriptCache();
    cache.removeAll(["cached_users", "cached_teams", "cached_advisors", "cached_projects", "cached_statuses", "cached_types", "cached_history", "cached_lookups_bundle"]);
  } catch (e) {
    // Ignore cache error
  }
}

function readSheet(name) {
  const sheet = getSheet(name);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) {
        let val = row[i];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT-5", "dd/MM/yyyy HH:mm:ss");
        }
        obj[h] = val;
      }
    });
    return obj;
  });
}

function writeRow(sheetName, keyCol, keyValue, rowData, isDelete) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  const normKey = String(keyCol || "").toLowerCase().replace(/[\s_-]/g, "");
  let keyColIndex = -1;
  if (keyCol) {
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i]).toLowerCase().replace(/[\s_-]/g, "") === normKey) {
        keyColIndex = i;
        break;
      }
    }
    
    if (keyColIndex === -1) {
      keyColIndex = headers.length;
      sheet.getRange(1, keyColIndex + 1).setValue(keyCol);
      headers.push(keyCol);
    }
  }
  
  let rowIndex = -1;
  if (lastRow > 1 && keyValue && keyColIndex !== -1) {
    const values = sheet.getRange(2, keyColIndex + 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim().toLowerCase() === String(keyValue).trim().toLowerCase()) {
        rowIndex = i + 2;
        break;
      }
    }
  }
  
  if (isDelete) {
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
      clearServerCache();
      return true;
    }
    return false;
  }
  
  if (rowIndex !== -1) {
    headers.forEach((h, colIdx) => {
      const hNorm = String(h).toLowerCase().replace(/[\s_-]/g, "");
      for (const k in rowData) {
        if (String(k).toLowerCase().replace(/[\s_-]/g, "") === hNorm && rowData[k] !== undefined) {
          sheet.getRange(rowIndex, colIdx + 1).setValue(rowData[k]);
          break;
        }
      }
    });
  } else {
    const newRow = headers.map(h => {
      const hNorm = String(h).toLowerCase().replace(/[\s_-]/g, "");
      for (const k in rowData) {
        if (String(k).toLowerCase().replace(/[\s_-]/g, "") === hNorm && rowData[k] !== undefined) {
          return rowData[k];
        }
      }
      return "";
    });
    sheet.appendRow(newRow);
  }
  
  clearServerCache();
  return true;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "getOperations";
  const forceRefresh = (e && e.parameter && e.parameter.forceRefresh === "1");
  
  if (forceRefresh || action === "clearCache") {
    clearServerCache();
    if (action === "clearCache") {
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Caché de servidor eliminada con éxito." }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  const cache = CacheService.getScriptCache();
  let data = [];
  
  try {
    // 1. BOOTSTRAP: Retorna catálogos (con caché) + operaciones (siempre frescas) en 1 sola llamada rápida
    if (action === "bootstrap") {
      const users = readSheet("Usuarios").map(row => ({
        id: row.IdUsuario,
        username: row.Usuario,
        password: row.Password,
        role: row.Rol,
        active: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si",
        assignedProjects: row.Proyectos || ""
      }));
      const teams = readSheet("Equipos").map(row => ({
        IdEquipo: row.IdEquipo,
        NombreEquipo: row.NombreEquipo,
        JefeVentas: row.JefeVentas,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
      const advisors = readSheet("Asesores").map(row => ({
        IdAsesor: row.IdAsesor,
        Nombre: row.Nombre,
        IdEquipo: row.IdEquipo,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
      const projects = readSheet("Proyectos").map(row => ({
        IdProyecto: row.IdProyecto,
        NombreProyecto: row.NombreProyecto,
        IdEquipo: row.IdEquipo,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
      const statuses = readSheet("Estados").map(row => ({
        IdEstado: row.IdEstado,
        NombreEstado: row.NombreEstado,
        Color: row.Color,
        Orden: Number(row.Orden) || 0,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
      const types = readSheet("TiposOperacion").map(row => ({
        IdTipo: row.IdTipo,
        NombreTipo: row.NombreTipo,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
      const history = readSheet("Historial").map(row => ({
        IdHistorial: row.IdHistorial,
        IdOperacion: row.IdOperacion,
        Estado: row.Estado,
        Comentario: row.Comentario,
        UsuarioRegistro: row.UsuarioRegistro,
        FechaRegistro: row.FechaRegistro
      }));
      const operations = readSheet("Operaciones").map(row => ({
        IdOperacion: row.IdOperacion,
        IdProyecto: row.IdProyecto,
        IdEquipo: row.IdEquipo,
        Dpto: row.Dpto,
        Estacionamiento: row.Estacionamiento,
        Deposito: row.Deposito,
        Asesor: row.Asesor,
        TipoOperacion: row.TipoOperacion,
        FechaSolicitud: row.FechaSolicitud,
        FechaEmision: row.FechaEmision,
        Estado: row.Estado,
        Comentario: row.Comentario,
        DerivadoA: row.DerivadoA,
        UsuarioRegistro: row.UsuarioRegistro,
        FechaRegistro: row.FechaRegistro,
        UsuarioModificacion: row.UsuarioModificacion,
        FechaModificacion: row.FechaModificacion,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        data: {
          users: users,
          teams: teams,
          advisors: advisors,
          projects: projects,
          statuses: statuses,
          types: types,
          history: history,
          operations: operations
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "getUsers") {
      data = readSheet("Usuarios").map(row => ({
        id: row.IdUsuario,
        username: row.Usuario,
        password: row.Password,
        role: row.Rol,
        active: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si",
        assignedProjects: row.Proyectos || ""
      }));
    } else if (action === "getTeams") {
      data = readSheet("Equipos").map(row => ({
        IdEquipo: row.IdEquipo,
        NombreEquipo: row.NombreEquipo,
        JefeVentas: row.JefeVentas,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
    } else if (action === "getAdvisors") {
      data = readSheet("Asesores").map(row => ({
        IdAsesor: row.IdAsesor,
        Nombre: row.Nombre,
        IdEquipo: row.IdEquipo,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
    } else if (action === "getProjects") {
      data = readSheet("Proyectos").map(row => ({
        IdProyecto: row.IdProyecto,
        NombreProyecto: row.NombreProyecto,
        IdEquipo: row.IdEquipo,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
    } else if (action === "getStatus") {
      data = readSheet("Estados").map(row => ({
        IdEstado: row.IdEstado,
        NombreEstado: row.NombreEstado,
        Color: row.Color,
        Orden: Number(row.Orden) || 0,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
    } else if (action === "getTypes") {
      data = readSheet("TiposOperacion").map(row => ({
        IdTipo: row.IdTipo,
        NombreTipo: row.NombreTipo,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
    } else if (action === "getOperations") {
      // Operaciones: SIEMPRE DATOS FRESCOS EN TIEMPO REAL
      data = readSheet("Operaciones").map(row => ({
        IdOperacion: row.IdOperacion,
        IdProyecto: row.IdProyecto,
        IdEquipo: row.IdEquipo,
        Dpto: row.Dpto,
        Estacionamiento: row.Estacionamiento,
        Deposito: row.Deposito,
        Asesor: row.Asesor,
        TipoOperacion: row.TipoOperacion,
        FechaSolicitud: row.FechaSolicitud,
        FechaEmision: row.FechaEmision,
        Estado: row.Estado,
        Comentario: row.Comentario,
        DerivadoA: row.DerivadoA,
        UsuarioRegistro: row.UsuarioRegistro,
        FechaRegistro: row.FechaRegistro,
        UsuarioModificacion: row.UsuarioModificacion,
        FechaModificacion: row.FechaModificacion,
        Activo: row.Activo === "SI" || row.Activo === true || row.Activo === "TRUE" || row.Activo === "si"
      }));
    } else if (action === "getHistory") {
      data = readSheet("Historial").map(row => ({
        IdHistorial: row.IdHistorial,
        IdOperacion: row.IdOperacion,
        Estado: row.Estado,
        Comentario: row.Comentario,
        UsuarioRegistro: row.UsuarioRegistro,
        FechaRegistro: row.FechaRegistro
      }));
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const jsonString = e.postData.contents;
    const payload = JSON.parse(jsonString);
    const action = payload.action;
    const data = payload.data || payload;
    let result = false;
    
    if (action === "saveUser") {
      result = writeRow("Usuarios", "IdUsuario", data.id, {
        IdUsuario: data.id,
        Usuario: data.username,
        Password: data.password,
        NombreCompleto: data.nombre || data.username,
        Rol: data.role,
        Activo: data.active ? "SI" : "NO",
        FechaCreacion: getFormattedDateTime(),
        FechaActualizacion: getFormattedDateTime(),
        Proyectos: data.assignedProjects
      }, false);
    } else if (action === "updateUser") {
      result = writeRow("Usuarios", "IdUsuario", data.id, {
        IdUsuario: data.id,
        Usuario: data.username,
        Password: data.password,
        NombreCompleto: data.nombre || data.username,
        Rol: data.role,
        Activo: data.active ? "SI" : "NO",
        FechaActualizacion: getFormattedDateTime(),
        Proyectos: data.assignedProjects
      }, false);
    } else if (action === "deleteUser") {
      result = writeRow("Usuarios", "IdUsuario", data.id, null, true);
    } else if (action === "saveTeam") {
      result = writeRow("Equipos", "IdEquipo", data.IdEquipo, {
        IdEquipo: data.IdEquipo,
        NombreEquipo: data.NombreEquipo,
        JefeVentas: data.JefeVentas,
        Activo: data.Activo ? "SI" : "NO",
        FechaCreacion: data.FechaCreacion || getFormattedDateTime()
      }, false);
    } else if (action === "saveAdvisor") {
      result = writeRow("Asesores", "IdAsesor", data.IdAsesor, {
        IdAsesor: data.IdAsesor,
        Nombre: data.Nombre,
        IdEquipo: data.IdEquipo,
        Activo: data.Activo ? "SI" : "NO",
        FechaCreacion: data.FechaCreacion || getFormattedDateTime()
      }, false);
    } else if (action === "deleteAdvisor") {
      result = writeRow("Asesores", "IdAsesor", data.IdAsesor, null, true);
    } else if (action === "saveProject") {
      result = writeRow("Proyectos", "IdProyecto", data.IdProyecto, {
        IdProyecto: data.IdProyecto,
        NombreProyecto: data.NombreProyecto,
        IdEquipo: data.IdEquipo,
        Activo: data.Activo ? "SI" : "NO",
        FechaCreacion: data.FechaCreacion || getFormattedDateTime()
      }, false);
    } else if (action === "deleteProject") {
      result = writeRow("Proyectos", "IdProyecto", data.IdProyecto, null, true);
    } else if (action === "saveStatus") {
      result = writeRow("Estados", "IdEstado", data.IdEstado, {
        IdEstado: data.IdEstado,
        NombreEstado: data.NombreEstado,
        Color: data.Color,
        Orden: data.Orden,
        Activo: data.Activo ? "SI" : "NO"
      }, false);
    } else if (action === "deleteStatus") {
      result = writeRow("Estados", "IdEstado", data.IdEstado, null, true);
    } else if (action === "saveType") {
      result = writeRow("TiposOperacion", "IdTipo", data.IdTipo, {
        IdTipo: data.IdTipo,
        NombreTipo: data.NombreTipo,
        Activo: data.Activo ? "SI" : "NO"
      }, false);
    } else if (action === "deleteType") {
      result = writeRow("TiposOperacion", "IdTipo", data.IdTipo, null, true);
    } else if (action === "saveOperation" || action === "updateOperation" || action === "evaluateOperation") {
      // Registra una nueva fila de auditoría con el IdOperacion para preservar el historial completo
      result = writeRow("Operaciones", null, null, {
        IdOperacion: data.IdOperacion,
        IdProyecto: data.IdProyecto,
        IdEquipo: data.IdEquipo,
        Dpto: data.Dpto,
        Estacionamiento: data.Estacionamiento || data.Estacionamie,
        Estacionamie: data.Estacionamie || data.Estacionamiento,
        Deposito: data.Deposito,
        Asesor: data.Asesor,
        TipoOperacion: data.TipoOperacion,
        FechaSolicitud: data.FechaSolicitud,
        FechaEmision: data.FechaEmision,
        Estado: data.Estado,
        Comentario: data.Comentario,
        DerivadoA: data.DerivadoA,
        UsuarioRegistro: data.UsuarioRegistro,
        FechaRegistro: data.FechaRegistro || getFormattedDateTime(),
        UsuarioModifica: data.UsuarioModifica || data.UsuarioRegistro,
        UsuarioModificacion: data.UsuarioModifica || data.UsuarioRegistro,
        FechaModificacion: data.FechaModificacion || getFormattedDateTime(),
        Activo: "SI"
      }, false);
    } else if (action === "deleteOperation") {
      result = writeRow("Operaciones", "IdOperacion", data.IdOperacion, null, true);
    } else if (action === "saveHistory") {
      const hisId = data.IdHistorial || ("HIS" + Date.now() + "-" + Math.floor(Math.random() * 1000));
      result = writeRow("Historial", "IdHistorial", hisId, {
        IdHistorial: hisId,
        IdOperacion: data.IdOperacion,
        Estado: data.Estado,
        Comentario: data.Comentario,
        UsuarioRegistro: data.UsuarioRegistro,
        FechaRegistro: data.FechaRegistro || getFormattedDateTime()
      }, false);
    } else if (action === "clearCache") {
      clearServerCache();
      result = true;
    }
    
    clearServerCache();
    return ContentService.createTextOutput(JSON.stringify({ success: result, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(appsScriptTemplate);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleTestConnection = async () => {
    if (!webhookUrl || !webhookUrl.trim().startsWith("http")) {
      setConnectionResult({ success: false, message: "Por favor ingresa una URL válida de Google Apps Script." });
      return;
    }
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await fetch(`${webhookUrl.trim()}?action=getProjects&_t=${Date.now()}`);
      const json = await res.json();
      if (json.success) {
        setConnectionResult({ success: true, message: `¡Conexión Exitosa! El Webhook responde y sincroniza correctamente.` });
      } else {
        setConnectionResult({ success: false, message: `El Webhook respondió: ${json.message || "Error desconocido"}` });
      }
    } catch (e: any) {
      setConnectionResult({ success: false, message: `No se pudo conectar: ${e?.message || "Verifica la URL y que la implementación tenga acceso 'Cualquiera'"}` });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleForceSyncAll = async () => {
    setForceSyncing(true);
    setSyncMessage(null);
    try {
      await clearAllCache();
      if (onRefreshAll) {
        await onRefreshAll();
      }
      setSyncMessage({ type: "success", text: "¡Sincronización completada! Todos los catálogos y operaciones han sido actualizados con datos frescos." });
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (e: any) {
      setSyncMessage({ type: "error", text: `Error durante la sincronización: ${e?.message || "Error desconocido"}` });
    } finally {
      setForceSyncing(false);
    }
  };

  // Trigger save settings
  const handleSaveSettings = (updatedProps: Partial<AppSettings> = {}) => {
    setSavingSettings(true);
    const finalSettings = {
      platformName: platformName,
      platformLogo: platformLogo,
      jefeLegalEnabled: jefeLegalToggle,
      sharedExcelLink: excelUrl,
      sheetsWebhookUrl: webhookUrl,
      kpiVisibility: kpiVisibility,
      users: users,
      tiposOperacion: tipos,
      statuses: statuses,
      statusColors: statusColors,
      proyectos: proyectos,
      asesores: asesores,
      equipos: equipos,
      workingSchedule: workingSchedule,
      observationReasons: observationReasons,
      ...updatedProps
    };
    onUpdateSettings(finalSettings);
    setTimeout(() => {
      setSavingSettings(false);
    }, 600);
  };

  // User Password display toggle
  const toggleRevealPassword = (userId: string) => {
    setRevealedPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  // Save/Create user
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.username) return;

    let updatedUsers: UserAccount[];
    if (editingUserId) {
      updatedUsers = users.map(u => u.id === editingUserId ? { ...u, ...userForm } as UserAccount : u);
      setEditingUserId(null);
    } else {
      const newUser: UserAccount = {
        id: `u-${Date.now()}`,
        username: userForm.username,
        password: userForm.password || "",
        role: userForm.role || "Asistente Legal",
        active: userForm.active !== undefined ? userForm.active : true,
        assignedProjects: userForm.assignedProjects || []
      };
      updatedUsers = [...users, newUser];
    }

    setUsers(updatedUsers);
    setUserForm({
      username: "",
      password: "",
      role: "Asistente Legal",
      active: true,
      assignedProjects: []
    });
    handleSaveSettings({ users: updatedUsers });
  };

  const startEditUser = (u: UserAccount) => {
    setEditingUserId(u.id);
    setUserForm(u);
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm("¿Estás seguro de eliminar este usuario?")) {
      const updatedUsers = users.filter(u => u.id !== userId);
      setUsers(updatedUsers);
      handleSaveSettings({ users: updatedUsers });
    }
  };

  const toggleUserActive = (u: UserAccount) => {
    const updatedUsers = users.map(user => user.id === u.id ? { ...user, active: !user.active } : user);
    setUsers(updatedUsers);
    handleSaveSettings({ users: updatedUsers });
  };

  // Handle Project Assignment checkbox toggle in User form
  const handleToggleProjectInUser = (projName: string) => {
    const currentList = userForm.assignedProjects || [];
    const newList = currentList.includes(projName)
      ? currentList.filter(p => p !== projName)
      : [...currentList, projName];
    setUserForm(prev => ({ ...prev, assignedProjects: newList }));
  };

  // Dynamic items manipulation: Tipo de Operación
  const handleAddTipo = () => {
    if (!newTipo || tipos.includes(newTipo)) return;
    const newList = [...tipos, newTipo];
    setTipos(newList);
    setNewTipo("");
    handleSaveSettings({ tiposOperacion: newList });
  };

  const handleDeleteTipo = (item: string) => {
    const newList = tipos.filter(t => t !== item);
    setTipos(newList);
    handleSaveSettings({ tiposOperacion: newList });
  };

  const handleEditTipo = (idx: number) => {
    setEditingTipoIndex(idx);
    setEditingTipoValue(tipos[idx]);
  };

  const handleSaveTipo = (idx: number) => {
    if (!editingTipoValue) return;
    const newList = [...tipos];
    newList[idx] = editingTipoValue;
    setTipos(newList);
    setEditingTipoIndex(null);
    handleSaveSettings({ tiposOperacion: newList });
  };

  // Dynamic items manipulation: Status
  const handleAddStatus = () => {
    if (!newStatus || statuses.includes(newStatus)) return;
    const newList = [...statuses, newStatus];
    const newColors = { ...statusColors, [newStatus]: selectedColorClass };
    setStatuses(newList);
    setStatusColors(newColors);
    setNewStatus("");
    handleSaveSettings({ statuses: newList, statusColors: newColors });
  };

  const handleDeleteStatus = (item: string) => {
    const newList = statuses.filter(s => s !== item);
    const newColors = { ...statusColors };
    delete newColors[item];
    setStatuses(newList);
    setStatusColors(newColors);
    handleSaveSettings({ statuses: newList, statusColors: newColors });
  };

  const handleEditStatus = (idx: number) => {
    setEditingStatusIndex(idx);
    setEditingStatusValue(statuses[idx]);
    setEditingStatusColorClass(statusColors[statuses[idx]] || "bg-slate-100 text-slate-800 border-slate-200");
  };

  const handleSaveStatus = (idx: number) => {
    if (!editingStatusValue) return;
    const oldStatusName = statuses[idx];
    const newList = [...statuses];
    newList[idx] = editingStatusValue;
    
    const newColors = { ...statusColors };
    if (oldStatusName !== editingStatusValue) {
      delete newColors[oldStatusName];
    }
    newColors[editingStatusValue] = editingStatusColorClass;

    setStatuses(newList);
    setStatusColors(newColors);
    setEditingStatusIndex(null);
    handleSaveSettings({ statuses: newList, statusColors: newColors });
  };

  // Projects mappings
  const handleAddProject = () => {
    if (!newProjectName || !newProjectTeam) return;
    if (proyectos.some(p => p.name.toLowerCase() === newProjectName.toLowerCase())) {
      alert("Ya existe un proyecto con ese nombre.");
      return;
    }
    const newList: ProjectConfig[] = [
      ...proyectos,
      {
        name: newProjectName,
        team: newProjectTeam.toUpperCase(),
        jefeVentas: newProjectJefeVentas || undefined
      }
    ];
    setProyectos(newList);
    setNewProjectName("");
    setNewProjectTeam("");
    setNewProjectJefeVentas("");
    handleSaveSettings({ proyectos: newList });
  };

  const handleDeleteProject = (idx: number) => {
    const newList = proyectos.filter((_, i) => i !== idx);
    setProyectos(newList);
    handleSaveSettings({ proyectos: newList });
  };

  const handleAddTeam = () => {
    if (!newTeamName) return;
    if (equipos.some(t => t.name.toLowerCase() === newTeamName.toLowerCase())) {
      alert("Ya existe un equipo con ese nombre.");
      return;
    }
    const newList: TeamConfig[] = [
      ...equipos,
      {
        id: `EQ${Date.now()}`,
        name: newTeamName.toUpperCase(),
        jefeVentas: newTeamJefe || undefined
      }
    ];
    setEquipos(newList);
    setNewTeamName("");
    setNewTeamJefe("");
    handleSaveSettings({ equipos: newList });
  };

  const handleDeleteTeam = (idx: number) => {
    if (confirm("¿Estás seguro de eliminar este equipo permanentemente de la base de datos?")) {
      const newList = equipos.filter((_, i) => i !== idx);
      setEquipos(newList);
      handleSaveSettings({ equipos: newList });
    }
  };

  const handleEditProject = (idx: number) => {
    setEditingProjIndex(idx);
    setEditingProjValue(proyectos[idx]);
  };

  const handleSaveProject = (idx: number) => {
    if (!editingProjValue.name || !editingProjValue.team) return;
    const newList = [...proyectos];
    newList[idx] = {
      ...editingProjValue,
      team: editingProjValue.team.toUpperCase(),
      jefeVentas: editingProjValue.jefeVentas || undefined
    };
    setProyectos(newList);
    setEditingProjIndex(null);
    handleSaveSettings({ proyectos: newList });
  };

  // Master records administration
  const startEditingRecord = (r: OperationRecord) => {
    setEditingRecordId(r.id);
    setEditTeam(r.team);
    setEditProyecto(r.proyecto);
    setEditDpto(r.dpto);
    setEditEstac(r.estac);
    setEditDep(r.dep);
    setEditAsesor(r.asesor);
    setEditTipo(r.tipo);
    setEditSolicitud(r.solicitud);
    setEditEmision(r.emision);
    setEditStatus(r.status);
    setEditComentario(r.comentario);
  };

  const saveEditedRecord = () => {
    if (!editingRecordId) return;
    onUpdateRecord(editingRecordId, {
      team: editTeam,
      proyecto: editProyecto,
      dpto: editDpto,
      estac: editEstac,
      dep: editDep,
      asesor: editAsesor,
      tipo: editTipo,
      solicitud: editSolicitud,
      emision: editEmision,
      status: editStatus,
      comentario: editComentario,
      skipHistory: true // Admin edits without leaving a history trail
    });
    setEditingRecordId(null);
  };

  // File import helper
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus("Leyendo archivo...");
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const result = evt.target?.result as string;
        const base64Data = result.split(",")[1];
        const res = await onImportExcel(base64Data);
        if (res.success) {
          setImportStatus(`¡Importación exitosa! Se importaron ${res.count} registros.`);
        } else {
          setImportStatus("Error al importar. Verifique el formato.");
        }
      } catch (err: any) {
        setImportStatus("Error: " + err.message);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6" id="admin-panel-container">
      
      {/* Sub tabs bar */}
      <div className="flex flex-wrap gap-1 bg-blue-50/50 p-1 rounded-xl border border-blue-100 shadow-xs">
        <button
          onClick={() => setActiveSubTab("general")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "general" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <Settings className="h-3.5 w-3.5 inline mr-1" />
          General e Integración
        </button>
        <button
          onClick={() => setActiveSubTab("schedule")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "schedule" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <Clock className="h-3.5 w-3.5 inline mr-1" />
          Horario Laboral y SLA
        </button>
        <button
          onClick={() => setActiveSubTab("users")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "users" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <UserCheck className="h-3.5 w-3.5 inline mr-1" />
          Usuarios y Accesos
        </button>
        <button
          onClick={() => setActiveSubTab("terms")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "terms" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <List className="h-3.5 w-3.5 inline mr-1" />
          Tipos y Estados
        </button>
        <button
          onClick={() => setActiveSubTab("projects")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "projects" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <Building className="h-3.5 w-3.5 inline mr-1" />
          Proyectos y Equipos
        </button>
        <button
          onClick={() => setActiveSubTab("records")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "records" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <Layers className="h-3.5 w-3.5 inline mr-1" />
          Control de Filas
        </button>
        <button
          onClick={() => setActiveSubTab("advisors")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "advisors" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
        >
          <UserCheck className="h-3.5 w-3.5 inline mr-1" />
          Asesores Inmobiliarios
        </button>
        <button
          onClick={() => setActiveSubTab("motivos")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "motivos" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-white"
          }`}
          id="btn-admin-subtab-motivos"
        >
          <CheckSquare className="h-3.5 w-3.5 inline mr-1" />
          Motivos de Observación
        </button>
        <button
          onClick={() => setActiveSubTab("analytics")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "analytics" ? "bg-brand-primary text-white shadow-xs font-extrabold" : "text-slate-600 hover:bg-white"
          }`}
          id="btn-admin-subtab-analytics"
        >
          <BarChart3 className="h-3.5 w-3.5 inline mr-1 text-amber-500" />
          Analítica Avanzada & KPIs
        </button>
      </div>

      {/* SUB-PANEL 1: GENERAL & INTEGRATION */}
      {activeSubTab === "general" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn items-start">
          
          {/* Col 1: Platform Settings */}
          <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-blue-50 pb-2">
                <Settings className="h-5 w-5 text-brand-primary" />
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Control de la Plataforma</h3>
              </div>
              
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Configura los accesos generales de los roles del sistema y la visibilidad de los paneles de KPIs.
              </p>

              {/* Nombre de la Plataforma */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
                  Nombre de la Plataforma / Sistema
                </label>
                <input
                  type="text"
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  placeholder="Ej: Excelencia Operacional"
                  className="w-full text-xs bg-slate-50 border border-blue-100 rounded-xl p-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary transition-all text-slate-700 font-bold"
                />
              </div>

              {/* Logo de la Plataforma */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
                  Logo de la Plataforma (Dispositivo)
                </label>
                <div className="flex items-center gap-4 p-3 bg-slate-50/50 border border-blue-50 rounded-xl">
                  <div className="w-14 h-14 bg-white border border-blue-100 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                    {platformLogo ? (
                      <img src={platformLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <span className="material-symbols-outlined text-slate-300 text-[28px]">grid_view</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <input
                      type="file"
                      id="logo-upload-input"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                           const reader = new FileReader();
                           reader.onloadend = () => {
                             setPlatformLogo(reader.result as string);
                           };
                           reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                    />
                    <div className="flex gap-2">
                      <label
                        htmlFor="logo-upload-input"
                        className="cursor-pointer bg-brand-primary hover:bg-brand-secondary text-white font-bold py-1 px-3 rounded-lg text-[10px] transition-all uppercase tracking-wider block"
                      >
                        Subir Imagen
                      </label>
                      {platformLogo && (
                        <button
                          type="button"
                          onClick={() => setPlatformLogo("")}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-1 px-3 rounded-lg text-[10px] transition-all uppercase tracking-wider cursor-pointer"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400">Recomendado formato PNG, JPG o SVG (cuadrado).</p>
                  </div>
                </div>
              </div>

              {/* Toggle Permiso Jefe Legal */}
              <div className="flex items-start justify-between p-3 bg-blue-50/30 rounded-xl border border-blue-100">
                <div className="space-y-0.5">
                  <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wide">
                    Habilitar Jefe Legal
                  </label>
                  <span className="text-[10px] text-slate-400 block leading-tight max-w-[160px]">
                    Permitir al Jefe Legal ingresar y parametrizar expedientes.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setJefeLegalToggle(!jefeLegalToggle)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    jefeLegalToggle ? "bg-emerald-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      jefeLegalToggle ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* KPI Visibility Settings for each profile */}
              <div className="p-3 bg-blue-50/30 rounded-xl border border-blue-100 space-y-2">
                <label className="text-[11px] font-bold text-slate-700 block uppercase tracking-wide mb-1">
                  Visibilidad de Estadísticas KPIs por Perfil
                </label>
                {(["Administrador", "Jefe de Ventas", "Jefe Legal", "Asistente Legal"] as UserRole[]).map((role) => (
                  <label key={role} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800">
                    <input
                      type="checkbox"
                      checked={kpiVisibility[role]}
                      onChange={(e) => {
                        const newVis = { ...kpiVisibility, [role]: e.target.checked };
                        setKpiVisibility(newVis);
                        handleSaveSettings({ kpiVisibility: newVis });
                      }}
                      className="rounded text-brand-primary focus:ring-brand-primary h-3.5 w-3.5 border-blue-200"
                    />
                    <span>{role}</span>
                  </label>
                ))}
              </div>

              {/* Shared Excel URL Field */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
                  Enlace de Excel Compartido (Visual)
                </label>
                <input
                  type="text"
                  value={excelUrl}
                  onChange={(e) => setExcelUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/..."
                  className="w-full text-xs bg-slate-50 border border-blue-100 rounded-xl p-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary transition-all text-slate-700"
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-blue-50">
              <button
                onClick={() => handleSaveSettings()}
                disabled={savingSettings}
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-[0.98] cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {savingSettings ? "Guardando..." : "Guardar Configuración"}
              </button>
            </div>
          </div>

          {/* Col 2: Caching Architecture, Force Refresh & Webhook Integration */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Card 2: Tiered Caching Strategy & Force Update */}
            <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-blue-50 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-brand-primary rounded-lg">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Caché y Rendimiento Multi-Usuario</h3>
                    <p className="text-[10px] text-slate-400">Estrategia de carga optimizada para conexiones simultáneas</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Activo v3
                </span>
              </div>

              {/* Tiered Cache Rules Status List */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-150">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    <span className="font-semibold text-slate-700">Configuración</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Caché 5 - 10 min
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-150">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    <span className="font-semibold text-slate-700">Usuarios y Accesos</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Al inicio del día / 10 min
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-150">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                    <span className="font-semibold text-slate-700">Proyectos y Equipos</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Al inicio del día / 10 min
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-150">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    <span className="font-semibold text-slate-700">Estados y Tipos de Operación</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Al inicio del día / 10 min
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold text-emerald-900">Operaciones (Expedientes)</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    Datos Frescos (Tiempo Real)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100 flex items-start gap-2.5 text-[11px] text-blue-800 leading-relaxed">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Auto-Invalidación:</strong> Cuando agregas o editas cualquier proyecto, usuario o estado, la caché se actualiza automáticamente. Las operaciones siempre cargan en tiempo real para todos los asistentes y jefes.
                </p>
              </div>

              {/* Force Update All Button */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleForceSyncAll}
                  disabled={forceSyncing}
                  className="w-full bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-100 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${forceSyncing ? "animate-spin" : ""}`} />
                  {forceSyncing ? "Sincronizando y purgando caché..." : "Actualizar Todo Automáticamente (Forzar Datos Frescos)"}
                </button>

                {syncMessage && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-fadeIn ${
                    syncMessage.type === "success" 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}>
                    {syncMessage.type === "success" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    )}
                    <span>{syncMessage.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: Google Sheets Webhook Integration & Script */}
            <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-blue-50 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-50 text-brand-primary rounded-lg">
                    <Database className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Integración Google Sheets Webhook</h3>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Pega la URL de la aplicación web generada en Google Apps Script para sincronizar tus hojas en la nube.
              </p>

              {/* Webhook Input and Test */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
                  URL del Webhook de Google Apps Script
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showWebHookSecret ? "text" : "password"}
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://script.google.com/macros/s/.../exec"
                      className="w-full text-xs bg-slate-50 border border-blue-100 rounded-xl p-2.5 pr-9 outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary transition-all text-slate-700 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWebHookSecret(!showWebHookSecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showWebHookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection || !webhookUrl}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Activity className={`h-3.5 w-3.5 ${testingConnection ? "animate-spin text-brand-primary" : "text-slate-500"}`} />
                    {testingConnection ? "Probando..." : "Probar"}
                  </button>
                </div>

                {connectionResult && (
                  <div className={`p-2.5 rounded-xl border text-[11px] flex items-center gap-2 animate-fadeIn ${
                    connectionResult.success 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                      : "bg-rose-50 border-rose-200 text-rose-800"
                  }`}>
                    {connectionResult.success ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    )}
                    <span>{connectionResult.message}</span>
                  </div>
                )}
              </div>

              {/* Copy Script Code */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={copyScriptToClipboard}
                  className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Copy className="h-4 w-4 text-slate-500" />
                  {copiedScript ? "¡Código Copiado al Portapapeles!" : "Copiar Código Actualizado de Apps Script"}
                </button>
                <p className="text-[10px] text-slate-400 text-center mt-1.5">
                  Incluye las funciones <code>saveHistory</code>, <code>bootstrap</code> y el motor de caché en servidor.
                </p>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* SUB-PANEL: HORARIO LABORAL Y TIEMPOS DE RESPUESTA */}
      {activeSubTab === "schedule" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn items-start">
          
          {/* Col 1: Configuración de Horas y Días Hábiles */}
          <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-blue-100 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-brand-primary rounded-xl">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                    Jornada y Días Laborables
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Regla estándar: Lunes a Viernes de 9:00 AM a 6:00 PM.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWorkingSchedule(DEFAULT_WORKING_SCHEDULE);
                  handleSaveSettings({ workingSchedule: DEFAULT_WORKING_SCHEDULE });
                  setScheduleSavedMsg(true);
                  setTimeout(() => setScheduleSavedMsg(false), 3000);
                }}
                className="text-[10px] font-bold text-slate-500 hover:text-brand-primary bg-slate-50 hover:bg-blue-50 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                Restablecer Estándar
              </button>
            </div>

            {/* Selector de Días Laborables */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
                <span>Días Laborables Activos</span>
                <span className="text-[10px] text-slate-400 lowercase font-normal">
                  (Haz clic para activar/desactivar)
                </span>
              </label>
              
              <div className="grid grid-cols-7 gap-1.5">
                {[
                  { day: 1, label: "Lun", full: "Lunes" },
                  { day: 2, label: "Mar", full: "Martes" },
                  { day: 3, label: "Mié", full: "Miércoles" },
                  { day: 4, label: "Jue", full: "Jueves" },
                  { day: 5, label: "Vie", full: "Viernes" },
                  { day: 6, label: "Sáb", full: "Sábado" },
                  { day: 0, label: "Dom", full: "Domingo" }
                ].map(({ day, label, full }) => {
                  const isActive = (workingSchedule.workingDays || [1, 2, 3, 4, 5]).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const currentDays = workingSchedule.workingDays || [1, 2, 3, 4, 5];
                        const nextDays = isActive
                          ? currentDays.filter(d => d !== day)
                          : [...currentDays, day].sort();
                        if (nextDays.length === 0) {
                          alert("Debe haber al menos un día laborable.");
                          return;
                        }
                        const updated = { ...workingSchedule, workingDays: nextDays };
                        setWorkingSchedule(updated);
                      }}
                      title={full}
                      className={`py-2.5 px-1 rounded-xl text-xs font-extrabold flex flex-col items-center justify-center transition-all cursor-pointer border ${
                        isActive
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-200"
                          : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <span className="text-[11px]">{label}</span>
                      <span className={`text-[8px] font-mono mt-0.5 ${isActive ? "text-blue-100" : "text-slate-400"}`}>
                        {isActive ? "SÍ" : "NO"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rango de Horas */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                  Hora Inicio de Jornada
                </label>
                <div className="relative">
                  <select
                    value={workingSchedule.startHour ?? 9}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setWorkingSchedule(prev => ({ ...prev, startHour: val }));
                    }}
                    className="w-full text-xs font-bold bg-slate-50 border border-blue-100 rounded-xl p-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary transition-all text-slate-800"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00 {i < 12 ? "AM" : "PM"} ({i}:00 hrs)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                  Hora Fin de Jornada
                </label>
                <div className="relative">
                  <select
                    value={workingSchedule.endHour ?? 18}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setWorkingSchedule(prev => ({ ...prev, endHour: val }));
                    }}
                    className="w-full text-xs font-bold bg-slate-50 border border-blue-100 rounded-xl p-2.5 outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary transition-all text-slate-800"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i} disabled={i <= (workingSchedule.startHour ?? 9)}>
                        {String(i).padStart(2, "0")}:00 {i < 12 ? "AM" : "PM"} ({i}:00 hrs)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Summary Box */}
            <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-100 text-xs text-blue-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Info className="h-4 w-4 text-blue-600 shrink-0" />
                Resumen de Jornada Hábil:
              </p>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                {(workingSchedule.endHour ?? 18) - (workingSchedule.startHour ?? 9)} horas laborables por día hábil. Fuera de esta ventana (noches, madrugadas y fines de semana o feriados), el reloj de respuesta se <strong>detiene de forma automática</strong>.
              </p>
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  handleSaveSettings({ workingSchedule });
                  setScheduleSavedMsg(true);
                  setTimeout(() => setScheduleSavedMsg(false), 3500);
                }}
                disabled={savingSettings}
                className="w-full bg-brand-primary hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-100 transition-all cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {savingSettings ? "Guardando Horario..." : "Guardar Configuración de Horario"}
              </button>

              {scheduleSavedMsg && (
                <p className="text-[11px] text-emerald-600 font-bold text-center mt-2 flex items-center justify-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  ¡Horario laboral actualizado y transmitido en tiempo real a todos los perfiles!
                </p>
              )}
            </div>

            {/* Live Testing Simulator */}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wide">
                  Simulador de Tiempo de Respuesta
                </h4>
              </div>
              <p className="text-[10px] text-slate-500">
                Verifica el cálculo de tiempo hábil ingresando fecha de solicitud y revisión:
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[9px] font-bold text-slate-500 block uppercase">Ingreso / Solicitud</label>
                  <input
                    type="text"
                    value={simStartDate}
                    onChange={(e) => setSimStartDate(e.target.value)}
                    placeholder="YYYY-MM-DD HH:mm"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-1.5 mt-0.5 outline-none focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-500 block uppercase">Revisión / Emisión</label>
                  <input
                    type="text"
                    value={simEndDate}
                    onChange={(e) => setSimEndDate(e.target.value)}
                    placeholder="YYYY-MM-DD HH:mm"
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-1.5 mt-0.5 outline-none focus:bg-white"
                  />
                </div>
              </div>

              {(() => {
                const res = calculateBusinessTime(simStartDate, simEndDate, workingSchedule);
                return (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600">Tiempo Transcurrido:</span>
                    <span className="font-mono font-black text-brand-primary text-sm">
                      {res.formattedDetailed} ({res.totalMinutes} min)
                    </span>
                  </div>
                );
              })()}
            </div>

          </div>

          {/* Col 2: Días Feriados y No Laborables Excepcionales */}
          <div className="lg:col-span-6 bg-white p-6 rounded-3xl border border-blue-100 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
                  Días Feriados y No Laborables Excepcionales
                </h3>
                <p className="text-[11px] text-slate-500">
                  Días en los cuales no se trabaja (el contador de SLA se detiene completamente).
                </p>
              </div>
            </div>

            {/* Formulario para agregar feriado */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-3">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                Agregar Nuevo Día No Laborable
              </span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">
                    Fecha (Año-Mes-Día) *
                  </label>
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 block uppercase mb-1">
                    Motivo / Descripción *
                  </label>
                  <input
                    type="text"
                    value={newHolidayDesc}
                    onChange={(e) => setNewHolidayDesc(e.target.value)}
                    placeholder="Ej: Fiestas Patrias, Asueto"
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:ring-1 focus:ring-brand-primary"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!newHolidayDate) {
                    alert("Por favor selecciona una fecha para el día no laborable.");
                    return;
                  }
                  const currentHolidays = workingSchedule.holidays || [];
                  if (currentHolidays.some(h => h.date === newHolidayDate)) {
                    alert("Esta fecha ya se encuentra registrada como día no laborable.");
                    return;
                  }
                  const newHolidayItem: HolidayConfig = {
                    date: newHolidayDate,
                    description: newHolidayDesc || "Día No Laborable"
                  };
                  const updatedHolidays = [...currentHolidays, newHolidayItem].sort((a, b) => a.date.localeCompare(b.date));
                  const updated = { ...workingSchedule, holidays: updatedHolidays };
                  setWorkingSchedule(updated);
                  setNewHolidayDate("");
                  setNewHolidayDesc("");
                  handleSaveSettings({ workingSchedule: updated });
                }}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Registrar Día No Laborable
              </button>
            </div>

            {/* Listado de Feriados Registrados */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Calendario de Excepciones ({workingSchedule.holidays?.length || 0})
                </span>
                <span className="text-[10px] text-slate-400">
                  Días que pausan el cómputo de SLA
                </span>
              </div>

              {(!workingSchedule.holidays || workingSchedule.holidays.length === 0) ? (
                <div className="p-6 bg-slate-50 border border-slate-150 rounded-2xl text-center text-slate-400 text-xs italic">
                  No hay días feriados o no laborables configurados. La regla aplicada será la estándar (Lunes a Viernes).
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {workingSchedule.holidays.map((h, idx) => (
                    <div
                      key={h.date + idx}
                      className="p-3 bg-white border border-slate-150 rounded-xl flex items-center justify-between shadow-2xs hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-mono text-[10px] font-black shrink-0">
                          {h.date.split("-")[2] || "01"}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{h.description}</p>
                          <p className="text-[10px] font-mono text-slate-400">{h.date}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = {
                            ...workingSchedule,
                            holidays: (workingSchedule.holidays || []).filter(item => item.date !== h.date)
                          };
                          setWorkingSchedule(updated);
                          handleSaveSettings({ workingSchedule: updated });
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Eliminar este feriado"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      )}
      {activeSubTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn items-start" id="admin-user-creation-container">
          
          {/* User Form Left */}
          <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-slate-150 shadow-sm space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-1.5 bg-blue-50 text-brand-primary rounded-lg">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                  {editingUserId ? "Modificar Usuario" : "Registro de Nuevo Usuario"}
                </h4>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Completa las credenciales del personal</p>
              </div>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              
              {/* Username Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5 block">
                  Nombre de Usuario (Login) *
                </label>
                <input
                  type="text"
                  required
                  value={userForm.username || ""}
                  onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="ej: juan.perez"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-medium text-slate-700 placeholder:text-slate-400"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5 block">
                  Clave de Acceso <span className="text-slate-400 font-bold lowercase">(opcional para asistentes)</span>
                </label>
                <input
                  type="text"
                  value={userForm.password || ""}
                  onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="ej: clave789"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-mono text-slate-700 placeholder:text-slate-400"
                />
                <span className="text-[9px] text-slate-400 block leading-tight pt-0.5">
                  🔑 Se permiten cuentas sin clave para facilitar accesos libres en el perfil de Asistente Legal.
                </span>
              </div>

              {/* Role Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5 block">
                  Perfil / Rol Asignado *
                </label>
                <SearchableSelect
                  value={userForm.role || "Asistente Legal"}
                  onChange={(val) => setUserForm(prev => ({ ...prev, role: val as UserRole }))}
                  options={[
                    { value: "Administrador", label: "Administrador" },
                    { value: "Jefe de Ventas", label: "Jefe de Ventas" },
                    { value: "Jefe Legal", label: "Jefe Legal" },
                    { value: "Asistente Legal", label: "Asistente Legal" }
                  ]}
                  placeholder="Seleccionar rol..."
                  className="w-full font-medium"
                />
              </div>

              {/* Toggle User Active */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user-active-checkbox"
                  checked={userForm.active !== false}
                  onChange={(e) => setUserForm(prev => ({ ...prev, active: e.target.checked }))}
                  className="rounded text-brand-primary focus:ring-brand-primary h-4 w-4 border-slate-300 cursor-pointer"
                />
                <label htmlFor="user-active-checkbox" className="text-[11px] font-bold text-slate-600 cursor-pointer select-none">
                  Habilitar inicio de sesión (Cuenta Activa)
                </label>
              </div>

              {/* Projects assignment (particularly relevant for Asistente Legal) */}
              <div className="space-y-2 pt-3 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                    Proyectos a Cargo (Permisos)
                  </label>
                  <span className="text-[9px] bg-slate-100 font-extrabold text-slate-600 px-2 py-0.5 rounded-full">
                    {userForm.assignedProjects?.length || 0} asignados
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 leading-tight">
                  Indica a qué proyectos pertenece este usuario. El Asistente Legal solo evaluará expedientes de sus proyectos autorizados.
                </p>

                <div className="max-h-44 overflow-y-auto space-y-1.5 p-3 bg-slate-50 border border-slate-150 rounded-xl mt-1 pr-1">
                  {proyectos.map((p) => {
                    const isChecked = (userForm.assignedProjects || []).includes(p.name);
                    return (
                      <label key={p.name} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer hover:text-slate-900 font-medium select-none py-0.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleProjectInUser(p.name)}
                          className="rounded text-brand-primary focus:ring-brand-primary h-3.5 w-3.5 border-slate-300"
                        />
                        <span className="text-[11px] font-semibold text-slate-700">
                          {p.name} <span className="text-[9px] text-slate-400">({p.team})</span>
                        </span>
                      </label>
                    );
                  })}
                  {proyectos.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic py-2 text-center">No hay proyectos registrados aún.</p>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white font-extrabold h-10 rounded-xl shadow-xs text-xs transition-all active:scale-[0.98] uppercase tracking-wide cursor-pointer flex items-center justify-center gap-1"
                >
                  <Save className="h-4 w-4" />
                  {editingUserId ? "Grabar Cambios" : "Crear Usuario"}
                </button>
                {editingUserId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUserId(null);
                      setUserForm({ username: "", password: "", role: "Asistente Legal", active: true, assignedProjects: [] });
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 h-10 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    X
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* User accounts list Table */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-blue-50 pb-2 flex justify-between items-center">
              <span>Usuarios del Sistema</span>
              <span className="text-[10px] bg-blue-50 text-brand-primary font-bold px-2.5 py-0.5 rounded-full">
                {users.length} Cuentas
              </span>
            </h4>

            <div className="overflow-x-auto rounded-xl border border-blue-50">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-blue-50/50 border-b border-blue-100 text-slate-600 font-bold">
                    <th className="p-3">Usuario</th>
                    <th className="p-3">Contraseña</th>
                    <th className="p-3">Perfil / Rol</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3">Proyectos a Cargo</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {users.map((u) => {
                    const isRevealed = revealedPasswords[u.id];
                    return (
                      <tr key={u.id} className="hover:bg-blue-50/10">
                        <td className="p-3 font-semibold text-slate-700">{u.username}</td>
                        <td className="p-3">
                          {u.password ? (
                            <div className="flex items-center gap-2 font-mono">
                              <span>{isRevealed ? u.password : "••••••••"}</span>
                              <button
                                onClick={() => toggleRevealPassword(u.id)}
                                className="text-slate-400 hover:text-brand-primary outline-none"
                                title={isRevealed ? "Ocultar Contraseña" : "Ver Contraseña"}
                              >
                                {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[9px]">
                              SIN CLAVE (LIBRE)
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === "Administrador" ? "bg-blue-100 text-blue-800" :
                            u.role === "Jefe de Ventas" ? "bg-indigo-100 text-indigo-800" :
                            u.role === "Jefe Legal" ? "bg-purple-100 text-purple-800" :
                            "bg-amber-100 text-amber-800"
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => toggleUserActive(u)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.active !== false
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                                : "bg-rose-100 text-rose-800 hover:bg-rose-200"
                            } transition-colors`}
                          >
                            {u.active !== false ? "ACTIVO" : "INACTIVO"}
                          </button>
                        </td>
                        <td className="p-3 text-slate-500 font-medium">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {u.role === "Asistente Legal" ? (
                              (u.assignedProjects || []).length > 0 ? (
                                u.assignedProjects.map(p => (
                                  <span key={p} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-semibold border border-slate-200">
                                    {p}
                                  </span>
                                ))
                              ) : (
                                <span className="text-rose-500 font-semibold text-[9px] bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                  SIN PROYECTOS (Ningún acceso)
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">Acceso a todos</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => startEditUser(u)}
                              className="text-slate-500 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 rounded transition-all"
                              title="Editar Usuario"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-slate-500 hover:text-rose-600 p-1 bg-slate-50 hover:bg-rose-50 rounded transition-all"
                              title="Eliminar Usuario"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400 italic">No hay usuarios creados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUB-PANEL 3: DYNAMIC OPERATIONS AND STATUSES */}
      {activeSubTab === "terms" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
          
          {/* Operation Types Panel */}
          <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-blue-50 pb-2 flex justify-between items-center">
              <span>Tipos de Operación</span>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                {tipos.length} opciones
              </span>
            </h4>

            <p className="text-[11px] text-slate-500 leading-tight">
              Agrega, edita o elimina las categorías de la columna <strong>TIPO</strong> de operación para el menú desplegable del Jefe Legal.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value.toUpperCase())}
                placeholder="NUEVO TIPO (ej: ADENDA FINANCIERA)"
                className="flex-1 p-2 bg-slate-50 border border-blue-100 rounded-xl outline-none text-xs font-bold focus:bg-white"
              />
              <button
                onClick={handleAddTipo}
                className="bg-brand-primary hover:bg-brand-secondary text-white px-3 rounded-xl flex items-center justify-center cursor-pointer shadow-md shadow-blue-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {tipos.map((tipo, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/50 rounded-xl border border-blue-50 hover:bg-blue-50/20 transition-colors">
                  {editingTipoIndex === idx ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        value={editingTipoValue}
                        onChange={(e) => setEditingTipoValue(e.target.value.toUpperCase())}
                        className="flex-1 p-1 bg-white border border-blue-100 rounded text-xs font-bold outline-none"
                      />
                      <button
                        onClick={() => handleSaveTipo(idx)}
                        className="p-1 bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingTipoIndex(null)}
                        className="p-1 bg-slate-100 text-slate-800 rounded hover:bg-slate-200"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-slate-700 bg-blue-50/50 px-2.5 py-1 rounded-lg">{tipo}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditTipo(idx)}
                          className="text-slate-400 hover:text-blue-600 p-1"
                          title="Editar opción"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTipo(tipo)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Eliminar opción"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Statuses Panel */}
          <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-blue-50 pb-2 flex justify-between items-center">
              <span>Estados del Expediente (STATUS)</span>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                {statuses.length} opciones
              </span>
            </h4>

            <p className="text-[11px] text-slate-500 leading-tight">
              Agrega, edita o elimina las categorías de la columna <strong>STATUS</strong> para los perfiles de Asistente Legal y Jefe Legal.
            </p>

            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  placeholder="NUEVO ESTADO (ej: Observado por Firma)"
                  className="flex-1 p-2 bg-slate-50 border border-blue-100 rounded-xl outline-none text-xs font-bold focus:bg-white"
                />
                <button
                  onClick={handleAddStatus}
                  className="bg-brand-primary hover:bg-brand-secondary text-white px-3 rounded-xl flex items-center justify-center cursor-pointer shadow-md shadow-blue-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Color picker for new status */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-blue-50 space-y-1.5">
                <span className="text-[9px] text-slate-500 font-bold block uppercase tracking-wider">Asignar Color al Estado:</span>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_COLOR_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setSelectedColorClass(p.bg)}
                      className={`px-2 py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${p.bg} ${
                        selectedColorClass === p.bg ? "ring-2 ring-brand-primary ring-offset-1 scale-105 font-black" : "opacity-60 hover:opacity-100"
                      }`}
                      type="button"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {statuses.map((status, idx) => (
                <div key={idx} className="flex flex-col p-2.5 bg-slate-50/50 rounded-xl border border-blue-50 hover:bg-blue-50/20 transition-colors">
                  {editingStatusIndex === idx ? (
                    <div className="space-y-2 w-full">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editingStatusValue}
                          onChange={(e) => setEditingStatusValue(e.target.value)}
                          className="flex-1 p-1 bg-white border border-blue-100 rounded text-xs font-bold outline-none"
                        />
                        <button
                          onClick={() => handleSaveStatus(idx)}
                          className="p-1 bg-emerald-100 text-emerald-800 rounded hover:bg-emerald-200"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingStatusIndex(null)}
                          className="p-1 bg-slate-100 text-slate-800 rounded hover:bg-slate-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Color picker for editing status */}
                      <div className="pt-1 border-t border-slate-100 space-y-1">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block">Modificar Color:</span>
                        <div className="flex flex-wrap gap-1">
                          {STATUS_COLOR_PRESETS.map((p) => (
                            <button
                              key={p.name}
                              onClick={() => setEditingStatusColorClass(p.bg)}
                              className={`px-1.5 py-0.5 text-[8px] font-bold rounded-md border transition-all cursor-pointer ${p.bg} ${
                                editingStatusColorClass === p.bg ? "ring-2 ring-brand-primary font-black scale-105" : "opacity-60"
                              }`}
                              type="button"
                            >
                              {p.name.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                        statusColors[status] || "bg-slate-100/80 text-slate-700 border-slate-200"
                      }`}>
                        {status}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditStatus(idx)}
                          className="text-slate-400 hover:text-blue-600 p-1"
                          title="Editar opción y color"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteStatus(status)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Eliminar opción"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* SUB-PANEL 4: PROJECTS AND TEAMS */}
      {activeSubTab === "projects" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          
          {/* New project form */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-blue-50 pb-2">
              Agregar Proyecto y Equipo
            </h4>

            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">Nombre del Proyecto *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="ej: Liv 360"
                  className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">Equipo Asignado (A: TEAM) *</label>
                <input
                  type="text"
                  value={newProjectTeam}
                  onChange={(e) => setNewProjectTeam(e.target.value)}
                  placeholder="ej: FRANCISCO"
                  className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-bold"
                />
                <span className="text-[10px] text-slate-400 block leading-normal">
                  "Cada vez que uno elija el proyecto en automático se seleccionará el team..."
                </span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-600 block">Jefe de Ventas Responsable (Opcional)</label>
                <SearchableSelect
                  value={newProjectJefeVentas}
                  onChange={(val) => setNewProjectJefeVentas(val)}
                  options={[
                    { value: "", label: "-- Sin asignar --" },
                    ...users.filter(u => u.role === "Jefe de Ventas").map(u => ({ value: u.username, label: u.username }))
                  ]}
                  placeholder="Seleccionar jefe de ventas..."
                  className="w-full"
                />
                <span className="text-[10px] text-slate-400 block leading-normal">
                  Filtra de forma automática las operaciones que puede ver este Jefe de Ventas.
                </span>
              </div>

              <button
                onClick={handleAddProject}
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white font-bold py-2.5 px-3 rounded-xl shadow-md shadow-blue-100 text-xs transition-all active:scale-[0.98] cursor-pointer"
              >
                Registrar Proyecto
              </button>
            </div>
          </div>

          {/* Projects Mapping Table */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider border-b border-blue-50 pb-2 flex justify-between items-center">
              <span>Catálogo de Proyectos y Equipos</span>
              <span className="text-[10px] bg-blue-50 text-brand-primary font-bold px-2.5 py-0.5 rounded-full">
                {proyectos.length} Proyectos
              </span>
            </h4>

            <div className="overflow-x-auto rounded-xl border border-blue-50 max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-blue-50/50 border-b border-blue-100 text-slate-600 font-bold">
                    <th className="p-3">Proyecto (Columna B)</th>
                    <th className="p-3">Equipo (Columna A: TEAM)</th>
                    <th className="p-3">Jefe de Ventas</th>
                    <th className="p-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {proyectos.map((p, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/10">
                      {editingProjIndex === idx ? (
                        <>
                          <td className="p-3">
                            <input
                              type="text"
                              value={editingProjValue.name}
                              onChange={(e) => setEditingProjValue(prev => ({ ...prev, name: e.target.value }))}
                              className="w-full p-1 border border-blue-100 bg-white rounded outline-none"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={editingProjValue.team}
                              onChange={(e) => setEditingProjValue(prev => ({ ...prev, team: e.target.value.toUpperCase() }))}
                              className="w-full p-1 border border-blue-100 bg-white rounded outline-none font-bold"
                            />
                          </td>
                          <td className="p-3">
                            <SearchableSelect
                              value={editingProjValue.jefeVentas || ""}
                              onChange={(val) => setEditingProjValue(prev => ({ ...prev, jefeVentas: val || undefined }))}
                              options={[
                                { value: "", label: "-- Sin asignar --" },
                                ...users.filter(u => u.role === "Jefe de Ventas").map(u => ({ value: u.username, label: u.username }))
                              ]}
                              placeholder="Buscar..."
                              className="w-32"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center gap-1.5">
                              <button
                                onClick={() => handleSaveProject(idx)}
                                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 p-1.5 rounded"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingProjIndex(null)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-1.5 rounded"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-bold text-slate-700">{p.name}</td>
                          <td className="p-3">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">
                              {p.team}
                            </span>
                          </td>
                          <td className="p-3">
                            {p.jefeVentas ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">
                                {p.jefeVentas}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">Sin asignar</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => handleEditProject(idx)}
                                className="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 rounded"
                                title="Editar Proyecto"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteProject(idx)}
                                className="text-slate-400 hover:text-rose-600 p-1 bg-slate-50 hover:bg-rose-50 rounded"
                                title="Eliminar Proyecto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {proyectos.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-slate-400 italic">No hay proyectos mapeados. Agrega uno a la izquierda.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* SUB-PANEL 5: CORE RECORDS ADMINISTRATION */}
      {activeSubTab === "records" && (
        <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden animate-fadeIn">
          <div className="p-4 border-b border-blue-100 bg-blue-50/20 flex justify-between items-center">
            <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-primary">gavel</span>
              Administración Completa de Filas (Edición Sin Límites)
            </h3>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
              {records.length} Registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead>
                <tr className="bg-blue-50/10 border-b border-blue-100 text-slate-600 text-xs font-semibold">
                  <th className="p-2.5 w-24">Acciones</th>
                  <th className="p-2.5 w-28">TEAM</th>
                  <th className="p-2.5 w-32">PROYECTO</th>
                  <th className="p-2.5 w-20">DPTO.</th>
                  <th className="p-2.5 w-20">ESTAC.</th>
                  <th className="p-2.5 w-20">DEP.</th>
                  <th className="p-2.5 w-36">ASESOR</th>
                  <th className="p-2.5 w-28">TIPO</th>
                  <th className="p-2.5 w-32">SOLICITUD</th>
                  <th className="p-2.5 w-32">EMISION</th>
                  <th className="p-2.5 w-32">STATUS</th>
                  <th className="p-2.5 w-40">COMENTARIO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-50 text-xs">
                {records.map((r) => {
                  const isEditing = editingRecordId === r.id;
                  return (
                    <tr key={r.id} className={`${isEditing ? "bg-blue-50/30" : "hover:bg-blue-50/10"} transition-all`}>
                      {/* Actions Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={saveEditedRecord}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white p-1 rounded transition-colors"
                              title="Guardar"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingRecordId(null)}
                              className="bg-slate-400 hover:bg-slate-500 text-white p-1 rounded transition-colors"
                              title="Cancelar"
                            >
                              <span className="material-symbols-outlined text-[14px] block">close</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => startEditingRecord(r)}
                              className="bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-800 p-1.5 rounded transition-all cursor-pointer"
                              title="Editar"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("¿Estás seguro de eliminar esta operación permanentemente?")) {
                                  onDeleteRecord(r.id);
                                }
                              }}
                              className="bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-800 p-1.5 rounded transition-all cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* TEAM Column */}
                      <td className="p-2 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editTeam}
                            onChange={(e) => setEditTeam(e.target.value)}
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          r.team || "-"
                        )}
                      </td>

                      {/* PROYECTO Column */}
                      <td className="p-2 font-bold text-slate-800">
                        {isEditing ? (
                          <SearchableSelect
                            value={editProyecto}
                            onChange={(val) => {
                              const pName = val;
                              setEditProyecto(pName);
                              // Auto populate team in editor if project exists
                              const pConfig = proyectos.find(item => item.name === pName);
                              if (pConfig) {
                                setEditTeam(pConfig.team);
                              }
                            }}
                            options={[
                              { value: "", label: "Seleccionar..." },
                              ...proyectos.map(p => ({ value: p.name, label: p.name })),
                              ...(r.proyecto && !proyectos.some(p => p.name === r.proyecto)
                                ? [{ value: r.proyecto, label: r.proyecto }]
                                : [])
                            ]}
                            placeholder="Buscar..."
                            className="w-36"
                          />
                        ) : (
                          r.proyecto || "-"
                        )}
                      </td>

                      {/* DPTO Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDpto}
                            onChange={(e) => setEditDpto(e.target.value)}
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs font-mono text-center focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          <span className="font-mono">{r.dpto || "-"}</span>
                        )}
                      </td>

                      {/* ESTAC Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editEstac}
                            onChange={(e) => setEditEstac(e.target.value)}
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs font-mono text-center focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          <span className="font-mono">{r.estac || "-"}</span>
                        )}
                      </td>

                      {/* DEP Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDep}
                            onChange={(e) => setEditDep(e.target.value)}
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs font-mono text-center focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          <span className="font-mono">{r.dep || "-"}</span>
                        )}
                      </td>

                      {/* ASESOR Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editAsesor}
                            onChange={(e) => setEditAsesor(e.target.value)}
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          r.asesor || "-"
                        )}
                      </td>

                      {/* TIPO Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <SearchableSelect
                            value={editTipo}
                            onChange={(val) => setEditTipo(val)}
                            options={[
                              { value: "", label: "(Ninguno)" },
                              ...tipos.map(t => ({ value: t, label: t }))
                            ]}
                            placeholder="Buscar..."
                            className="w-28"
                          />
                        ) : (
                          r.tipo ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-100">
                              {r.tipo}
                            </span>
                          ) : "-"
                        )}
                      </td>

                      {/* SOLICITUD Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editSolicitud}
                            onChange={(e) => setEditSolicitud(e.target.value)}
                            placeholder="AAAA-MM-DD HH:MM"
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs font-mono text-center focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          <span className="font-mono text-slate-500">{r.solicitud || "-"}</span>
                        )}
                      </td>

                      {/* EMISION Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editEmision}
                            onChange={(e) => setEditEmision(e.target.value)}
                            placeholder="AAAA-MM-DD HH:MM"
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs font-mono text-center focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        ) : (
                          <span className="font-mono text-slate-500">{r.emision || "-"}</span>
                        )}
                      </td>

                      {/* STATUS Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <SearchableSelect
                            value={editStatus}
                            onChange={(val) => setEditStatus(val)}
                            options={[
                              { value: "", label: "(Ninguno)" },
                              ...statuses.map(s => ({ value: s, label: s }))
                            ]}
                            placeholder="Buscar..."
                            className="w-28"
                          />
                        ) : (
                          r.status ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100">
                              {r.status}
                            </span>
                          ) : "-"
                        )}
                      </td>

                      {/* COMENTARIO Column */}
                      <td className="p-2">
                        {isEditing ? (
                          <textarea
                            value={editComentario}
                            onChange={(e) => setEditComentario(e.target.value)}
                            rows={1}
                            className="w-full bg-white border border-blue-100 rounded p-1 text-xs focus:ring-1 focus:ring-brand-primary outline-none resize-none"
                          />
                        ) : (
                          <span className="text-slate-500 block truncate max-w-[160px]" title={r.comentario}>
                            {r.comentario || "-"}
                          </span>
                        )}
                      </td>

                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-6 text-center text-slate-400 italic">No hay filas en la base de datos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-PANEL 6: ADVISORS MANAGEMENT */}
      {activeSubTab === "advisors" && (
        <div className="max-w-xl mx-auto w-full animate-fadeIn space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-vibrant">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 pb-2 border-b border-slate-50 flex items-center gap-1.5">
              <UserCheck className="h-5 w-5 text-brand-primary" />
              Gestión de Asesores Inmobiliarios
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Ingresa los nombres de los asesores inmobiliarios autorizados. Los jefes de ventas y el jefe legal podrán seleccionarlos al registrar nuevas solicitudes en el sistema.
            </p>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Nombre del Asesor (Ej: CARLOS TORRES)"
                value={newAsesorName}
                onChange={(e) => setNewAsesorName(e.target.value.toUpperCase())}
                className="flex-1 h-10 px-3 bg-slate-50 border border-blue-100 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary uppercase"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newAsesorName || asesores.includes(newAsesorName)) return;
                  const newList = [...asesores, newAsesorName];
                  setAsesores(newList);
                  setNewAsesorName("");
                  handleSaveSettings({ asesores: newList });
                }}
                className="h-10 bg-brand-primary hover:bg-brand-secondary text-white px-4 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm shadow-blue-100"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </button>
            </div>

            <div className="border border-blue-50 rounded-2xl overflow-hidden divide-y divide-blue-50 max-h-[400px] overflow-y-auto">
              {asesores.map((name, idx) => (
                <div key={idx} className="p-3 bg-white hover:bg-slate-50/50 transition-colors flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-700">{name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar al asesor ${name}?`)) {
                        const newList = asesores.filter(a => a !== name);
                        setAsesores(newList);
                        handleSaveSettings({ asesores: newList });
                      }
                    }}
                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 p-1.5 rounded-lg transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {asesores.length === 0 && (
                <p className="p-6 text-center text-slate-400 italic text-xs">No hay asesores registrados. Se usarán los valores por defecto.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-PANEL 7: OBSERVATION REASONS MANAGEMENT (CHECKLIST CONFIG) */}
      {activeSubTab === "motivos" && (
        <div className="max-w-3xl mx-auto w-full animate-fadeIn space-y-6" id="panel-admin-motivos">
          <div className="bg-white p-6 rounded-3xl border border-blue-100 shadow-sm space-y-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200">
                  <CheckSquare className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Motivos de Observación (Checklist)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                    Administra los motivos que figuran en el checklist de Asistente Legal y Jefe Legal al observar expedientes. Puedes activar o desactivar cada casilla o agregar nuevos motivos.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {observationReasons.filter(r => r.active).length} Activos
                </span>
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {observationReasons.filter(r => !r.active).length} Inactivos
                </span>
              </div>
            </div>

            {/* Success notification banner */}
            {reasonsSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>¡Cambios en los motivos de observación guardados exitosamente!</span>
              </div>
            )}

            {/* Create New Reason Section */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-150 space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-brand-primary" />
                Crear Nuevo Motivo de Observación
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newReasonText}
                  onChange={(e) => setNewReasonText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!newReasonText.trim()) return;
                      const newReasonItem: ObservationReasonConfig = {
                        id: `OBS${Date.now()}`,
                        name: newReasonText.trim(),
                        active: true
                      };
                      const updated = [...observationReasons, newReasonItem];
                      setObservationReasons(updated);
                      setNewReasonText("");
                      handleSaveSettings({ observationReasons: updated });
                      setReasonsSuccessMsg(true);
                      setTimeout(() => setReasonsSuccessMsg(false), 3000);
                    }
                  }}
                  placeholder="Ej: Falta sustento de ingresos o carta de precalificación..."
                  className="flex-1 h-10 px-3.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-brand-primary text-slate-800 font-medium placeholder:text-slate-400"
                  id="input-new-motivo"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newReasonText.trim()) return;
                    const newReasonItem: ObservationReasonConfig = {
                      id: `OBS${Date.now()}`,
                      name: newReasonText.trim(),
                      active: true
                    };
                    const updated = [...observationReasons, newReasonItem];
                    setObservationReasons(updated);
                    setNewReasonText("");
                    handleSaveSettings({ observationReasons: updated });
                    setReasonsSuccessMsg(true);
                    setTimeout(() => setReasonsSuccessMsg(false), 3000);
                  }}
                  className="h-10 px-5 bg-brand-primary hover:bg-brand-secondary text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm transition-all active:scale-95"
                  id="btn-add-motivo"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar Motivo</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Presiona Enter o haz clic en "Agregar Motivo" para registrarlo en el checklist activo.
              </p>
            </div>

            {/* List of Observation Reasons with Activation/Deactivation Toggles */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
              <div className="bg-slate-50/80 px-4 py-2.5 flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-wider">
                <span>Motivo y Estado en Checklist</span>
                <span>Acciones</span>
              </div>

              {observationReasons.map((reason) => (
                <div 
                  key={reason.id} 
                  className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                    reason.active ? "bg-white hover:bg-slate-50/50" : "bg-slate-50/40 opacity-70 hover:opacity-100"
                  }`}
                >
                  {/* Left: Checkbox / Toggle + Name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = observationReasons.map(r => 
                          r.id === reason.id ? { ...r, active: !r.active } : r
                        );
                        setObservationReasons(updated);
                        handleSaveSettings({ observationReasons: updated });
                        setReasonsSuccessMsg(true);
                        setTimeout(() => setReasonsSuccessMsg(false), 2500);
                      }}
                      className={`p-1 rounded-lg border transition-all cursor-pointer ${
                        reason.active 
                          ? "bg-emerald-500 text-white border-emerald-600 shadow-2xs" 
                          : "bg-white text-slate-300 border-slate-300 hover:border-slate-400"
                      }`}
                      title={reason.active ? "Desactivar motivo" : "Activar motivo"}
                      id={`btn-toggle-${reason.id}`}
                    >
                      {reason.active ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>

                    {editingReasonId === reason.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editingReasonText}
                          onChange={(e) => setEditingReasonText(e.target.value)}
                          className="flex-1 h-8 px-2.5 bg-white border border-brand-primary rounded-lg text-xs font-semibold outline-none text-slate-800"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!editingReasonText.trim()) return;
                            const updated = observationReasons.map(r => 
                              r.id === reason.id ? { ...r, name: editingReasonText.trim() } : r
                            );
                            setObservationReasons(updated);
                            setEditingReasonId(null);
                            handleSaveSettings({ observationReasons: updated });
                            setReasonsSuccessMsg(true);
                            setTimeout(() => setReasonsSuccessMsg(false), 2500);
                          }}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingReasonId(null)}
                          className="h-8 px-2.5 text-slate-500 hover:text-slate-800 text-xs font-bold transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-xs font-bold truncate ${reason.active ? "text-slate-800" : "text-slate-400 line-through"}`}>
                          {reason.name}
                        </span>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                          reason.active 
                            ? "bg-emerald-100 text-emerald-800" 
                            : "bg-slate-200 text-slate-500"
                        }`}>
                          {reason.active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  {editingReasonId !== reason.id && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReasonId(reason.id);
                          setEditingReasonText(reason.name);
                        }}
                        className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="Editar texto del motivo"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Estás seguro de eliminar el motivo "${reason.name}" permanentemente?`)) {
                            const updated = observationReasons.filter(r => r.id !== reason.id);
                            setObservationReasons(updated);
                            handleSaveSettings({ observationReasons: updated });
                            setReasonsSuccessMsg(true);
                            setTimeout(() => setReasonsSuccessMsg(false), 2500);
                          }
                        }}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-all cursor-pointer"
                        title="Eliminar motivo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {observationReasons.length === 0 && (
                <p className="p-8 text-center text-slate-400 italic text-xs">
                  No hay motivos de observación configurados. Agrega uno usando el formulario superior.
                </p>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const resetList: ObservationReasonConfig[] = STANDARD_OBSERVATIONS.map((name, idx) => ({
                    id: `OBS${String(idx + 1).padStart(3, "0")}`,
                    name,
                    active: true
                  }));
                  setObservationReasons(resetList);
                  handleSaveSettings({ observationReasons: resetList });
                  setReasonsSuccessMsg(true);
                  setTimeout(() => setReasonsSuccessMsg(false), 3000);
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                Restablecer a lista estándar
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSaveSettings({ observationReasons });
                  setReasonsSuccessMsg(true);
                  setTimeout(() => setReasonsSuccessMsg(false), 3500);
                }}
                disabled={savingSettings}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
                id="btn-save-motivos-all"
              >
                <Save className="h-4 w-4" />
                <span>{savingSettings ? "Guardando..." : "Guardar Todos los Cambios"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-PANEL: ANALYTICS & ADVANCED KPIS (ADMIN EXPANDED) */}
      {activeSubTab === "analytics" && (
        <div className="space-y-6 animate-fadeIn" id="panel-admin-analytics">
          <DailyObservationsControlChart
            records={records}
            settings={settings}
            isAdminView={true}
          />
        </div>
      )}

    </div>
  );
}
