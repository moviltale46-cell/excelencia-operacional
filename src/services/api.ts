import * as XLSX from "xlsx";
import { 
  db, 
  dbDefault,
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  writeBatch,
  onSnapshot
} from "./firebase";
import { AppSettings, OperationRecord, UserAccount, UserRole, ProjectConfig, TeamConfig, StatusHistoryEntry, WorkingScheduleConfig, DEFAULT_WORKING_SCHEDULE, ObservationReasonConfig, STANDARD_OBSERVATIONS, STANDARD_OTHER_AREAS_OBSERVATIONS } from "../types";
import { safeToISOString, safeGetTime, normalizeText, formatDateTimeFull } from "../utils/dateUtils";

// Robust Firestore collection reader supporting offline persistence
async function fetchCollectionDocs(collectionName: string) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    if (!snap.empty) return snap;
  } catch (err: any) {
    const isUnavailable = err?.code === "unavailable" || (err?.message && err.message.includes("offline"));
    if (isUnavailable) {
      console.warn(`Firestore read on [${collectionName}]: connection initializing or offline mode.`);
    } else {
      console.warn(`Firestore read on [${collectionName}]:`, err?.message || err);
    }
  }

  return null;
}

// Robust Firestore doc reader
async function fetchDocument(collectionName: string, docId: string) {
  try {
    const snap = await getDoc(doc(db, collectionName, docId));
    if (snap.exists()) return snap;
  } catch (err: any) {
    const isUnavailable = err?.code === "unavailable" || (err?.message && err.message.includes("offline"));
    if (isUnavailable) {
      console.warn(`Firestore getDoc on [${collectionName}/${docId}]: connection initializing or offline mode.`);
    } else {
      console.warn(`Firestore getDoc on [${collectionName}/${docId}]:`, err?.message || err);
    }
  }

  return null;
}

// Robust Firestore doc sanitizer: Recursively strips undefined values so setDoc never rejects
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null) return null as any;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof data === "object") {
    if (data instanceof Date) return data.toISOString() as any;
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean as any;
  }
  return data;
}

// Robust Firestore doc writer
async function writeDocument(collectionName: string, docId: string, data: any, merge: boolean = false) {
  try {
    const cleanData = sanitizeForFirestore(data);
    if (merge) {
      await setDoc(doc(db, collectionName, docId), cleanData, { merge: true });
    } else {
      await setDoc(doc(db, collectionName, docId), cleanData);
    }
    return true;
  } catch (err: any) {
    console.error(`Firestore write on [${collectionName}/${docId}]:`, err?.message || err);
    throw err;
  }
}

// Robust Firestore doc deleter
async function removeDocument(collectionName: string, docId: string) {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (err: any) {
    console.warn(`Firestore deleteDoc on [${collectionName}/${docId}]:`, err?.message || err);
  }
}

// Function to retrieve Google Sheets Webhook URL for background mirror/backup
function getGasUrl(): string {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const localWebhookUrl = localStorage.getItem("sheets_webhook_url");
      if (localWebhookUrl && localWebhookUrl.trim().startsWith("http")) {
        return localWebhookUrl.trim();
      }
    }
  } catch (e) {
    // Ignore localStorage access errors
  }
  return "https://script.google.com/macros/s/AKfycbyyi5tXsWY_-Apa2gBcnS9ck0VcsBOkwGx8YtFv9XmS_rgnV5f2DUlh5WIY8o2zndhHXw/exec";
}

// Background non-blocking dispatcher to mirror actions into Google Sheets as a backup
async function sendBackgroundGasBackup(action: string, data: any): Promise<void> {
  const url = getGasUrl();
  if (!url || !url.startsWith("http")) return;

  try {
    const payload = {
      action,
      data,
      ...data,
      _isBackupMirror: true,
      timestamp: new Date().toISOString()
    };
    
    // Non-blocking fetch in background
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload),
      mode: "no-cors" // Fire-and-forget backup
    }).catch(err => {
      console.warn("Background backup to Google Sheets notice:", err?.message || err);
    });
  } catch (e) {
    // Non-blocking
  }
}

// In-memory catalog caches
let cachedUsers: any[] = [];
let cachedTeams: any[] = [];
let cachedAdvisors: any[] = [];
let cachedProjects: any[] = [];
let cachedStatuses: any[] = [];
let cachedTypes: any[] = [];
let cachedHistory: any[] = [];

// Tiered Cache TTL (10 minutes for catalogs)
const LOOKUPS_CACHE_TTL_MS = 10 * 60 * 1000;
const LOCAL_LOOKUPS_KEY = "excelencia_firestore_lookups_v1";
let lastLookupsFetchTime = 0;

export function invalidateLocalCache() {
  lastLookupsFetchTime = 0;
  try {
    localStorage.removeItem(LOCAL_LOOKUPS_KEY);
  } catch (e) {
    // ignore
  }
}

// Format date-time exactly as specified: DD/MM/AAAA / HH:MM:SS
export function getFormattedSystemDateTime(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} / ${hours}:${minutes}:${seconds}`;
}

/**
 * Load catalog lookups directly from Firestore collections:
 * - usuarios
 * - equipos
 * - asesores
 * - proyectos
 * - estados
 * - tiposOperacion
 * - historial
 */
export async function loadLookups(forceRefresh = false): Promise<void> {
  const isExpired = Date.now() - lastLookupsFetchTime > LOOKUPS_CACHE_TTL_MS;
  const hasInMemory = cachedUsers.length > 0 && cachedProjects.length > 0 && cachedStatuses.length > 0;

  if (!forceRefresh && hasInMemory && !isExpired) {
    return;
  }

  try {
    const [usersSnap, teamsSnap, advisorsSnap, projectsSnap, statusesSnap, typesSnap, historySnap] = await Promise.all([
      fetchCollectionDocs("usuarios"),
      fetchCollectionDocs("equipos"),
      fetchCollectionDocs("asesores"),
      fetchCollectionDocs("proyectos"),
      fetchCollectionDocs("estados"),
      fetchCollectionDocs("tiposOperacion"),
      fetchCollectionDocs("historial")
    ]);

    if (usersSnap && !usersSnap.empty) {
      cachedUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else if (cachedUsers.length === 0) {
      // Ensure admin user exists with password 1506
      cachedUsers = [
        {
          id: "USR000001",
          IdUsuario: "USR000001",
          Usuario: "admin",
          username: "admin",
          Password: "1506",
          password: "1506",
          Rol: "Administrador",
          role: "Administrador",
          Nombre: "Administrador",
          Activo: true,
          active: true,
          Proyectos: []
        }
      ];
      // Seed to Firestore in background
      writeDocument("usuarios", "USR000001", {
        IdUsuario: "USR000001",
        Usuario: "admin",
        Password: "1506",
        Nombre: "Administrador",
        Rol: "Administrador",
        Activo: true,
        Proyectos: [],
        FechaCreacion: getFormattedSystemDateTime()
      }).catch(e => console.warn("Notice seeding admin:", e));
    }

    if (teamsSnap && !teamsSnap.empty) {
      cachedTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (advisorsSnap && !advisorsSnap.empty) {
      cachedAdvisors = advisorsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (projectsSnap && !projectsSnap.empty) {
      cachedProjects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (statusesSnap && !statusesSnap.empty) {
      cachedStatuses = statusesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (typesSnap && !typesSnap.empty) {
      cachedTypes = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (historySnap && !historySnap.empty) {
      cachedHistory = historySnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    lastLookupsFetchTime = Date.now();
  } catch (error) {
    console.error("Error loading lookups from Firestore:", error);
  }
}

// Helper to identify if two history entries represent the same action
function isSameHistoryEvent(
  a: { status?: string; comentario?: string; timestamp?: string; user?: string },
  b: { status?: string; comentario?: string; timestamp?: string; user?: string }
): boolean {
  if (!a || !b) return false;
  
  const normCommentA = (a.comentario || "").trim().toLowerCase();
  const normCommentB = (b.comentario || "").trim().toLowerCase();
  const cleanA = normCommentA.replace(/^\[[^\]]+\]\s*/, "");
  const cleanB = normCommentB.replace(/^\[[^\]]+\]\s*/, "");
  const sameComment = normCommentA === normCommentB || (cleanA && cleanA === cleanB);

  const normUserA = (a.user || "").trim().toLowerCase();
  const normUserB = (b.user || "").trim().toLowerCase();
  const sameUser = !normUserA || !normUserB || normUserA === normUserB;

  const normStatusA = (a.status || "").trim().toLowerCase();
  const normStatusB = (b.status || "").trim().toLowerCase();
  const sameStatus = !normStatusA || !normStatusB || normStatusA === normStatusB;

  const tA = safeGetTime(a.timestamp);
  const tB = safeGetTime(b.timestamp);
  const closeTime = Boolean(tA && tB && Math.abs(tA - tB) <= 180000);

  const normTimeA = (a.timestamp || "").replace(/[\s/:-]/g, "");
  const normTimeB = (b.timestamp || "").replace(/[\s/:-]/g, "");
  const sameNormTime = Boolean(normTimeA && normTimeB && normTimeA === normTimeB);

  if (sameComment && (sameNormTime || closeTime || (sameStatus && (!tA || !tB)))) {
    return true;
  }

  const isInitialA = normCommentA.includes("solicitud registrada") || normCommentA.includes("registro inicial") || normCommentA.includes("ingreso inicial");
  const isInitialB = normCommentB.includes("solicitud registrada") || normCommentB.includes("registro inicial") || normCommentB.includes("ingreso inicial");
  if (isInitialA && isInitialB && (closeTime || sameNormTime || (!tA && !tB))) {
    return true;
  }

  return false;
}

// Map a Firestore Operation document to React OperationRecord
function mapFirestoreToReactRecord(data: any, docId: string): OperationRecord {
  const id = data.IdOperacion || data.id || docId;
  
  // Resolve Project: Ensure PRO000029 maps strictly to Lima 41
  let projectName = data.Proyecto || data.NombreProyecto || data.proyecto || "";
  const projMatch = cachedProjects.find(p => 
    p.IdProyecto === projectName || 
    p.id === projectName || 
    p.NombreProyecto === projectName ||
    p.IdProyecto === data.IdProyecto || 
    p.id === data.IdProyecto
  );
  if (projMatch) {
    projectName = projMatch.NombreProyecto || projMatch.name || projectName;
  } else if (projectName === "PRO000029" || data.IdProyecto === "PRO000029") {
    projectName = "Lima 41";
  }
  if (!projectName) projectName = data.IdProyecto || "";

  // Resolve Team: Ensure EQ000001 maps to FRANCISCO, EQ000002 to JHAZMIN, EQ000003 to NINOSKA, EQ000004 to TEAM PAULA
  let teamName = data.Team || data.NombreEquipo || data.team || "";
  let teamMatch = cachedTeams.find(t => 
    t.IdEquipo === teamName || 
    t.id === teamName || 
    t.NombreEquipo === teamName ||
    t.IdEquipo === data.IdEquipo || 
    t.id === data.IdEquipo
  );
  if (teamMatch) {
    teamName = teamMatch.NombreEquipo || teamMatch.name || teamName;
  } else if (teamName === "EQ000001" || data.IdEquipo === "EQ000001") {
    teamName = "FRANCISCO";
  } else if (teamName === "EQ000002" || data.IdEquipo === "EQ000002") {
    teamName = "JHAZMIN";
  } else if (teamName === "EQ000003" || data.IdEquipo === "EQ000003") {
    teamName = "NINOSKA";
  } else if (teamName === "EQ000004" || data.IdEquipo === "EQ000004") {
    teamName = "TEAM PAULA";
  }
  if (!teamName && projMatch && projMatch.IdEquipo) {
    const tMatch = cachedTeams.find(t => t.IdEquipo === projMatch.IdEquipo || t.id === projMatch.IdEquipo);
    if (tMatch) teamName = tMatch.NombreEquipo || "";
  }

  // Resolve Advisor (Ensure Paula Casas is in TEAM PAULA, and ASE000010 is DERVIS PIÑA)
  let advisorName = data.NombreAsesor || data.Asesor || data.asesor || "";
  const advMatch = cachedAdvisors.find(a => 
    a.IdAsesor === advisorName || 
    a.id === advisorName || 
    a.Nombre === advisorName ||
    a.IdAsesor === data.Asesor
  );
  if (advMatch) {
    advisorName = advMatch.Nombre || advMatch.nombre || advisorName;
  } else if (advisorName === "ASE000010" || data.Asesor === "ASE000010") {
    advisorName = "DERVIS PIÑA";
  }

  // Paula Casas rule: belongs to TEAM PAULA
  if (advisorName.toUpperCase().includes("PAULA CASAS")) {
    teamName = "TEAM PAULA";
  }

  // Resolve Type
  let typeName = data.TipoOperacion || data.Tipo || data.tipo || data.NombreTipo || "";
  if (typeName && cachedTypes.length > 0) {
    const typeMatch = cachedTypes.find(t => t.IdTipo === typeName || t.id === typeName || t.NombreTipo === typeName);
    if (typeMatch) typeName = typeMatch.NombreTipo || typeName;
  }

  // Resolve Status
  let statusName = data.Estado || data.Status || data.status || data.NombreEstado || "";
  if (statusName && cachedStatuses.length > 0) {
    const statusMatch = cachedStatuses.find(s => s.IdEstado === statusName || s.id === statusName || s.NombreEstado === statusName);
    if (statusMatch) statusName = statusMatch.NombreEstado || statusName;
  }

  // Resolve History: Prioritize record's own history array if present, keeping clean of undefined values
  const historyList: StatusHistoryEntry[] = [];
  if (Array.isArray(data.history)) {
    data.history.forEach((h: any) => {
      const entry: StatusHistoryEntry = {
        status: h.status || h.Estado || "Acción Registrada",
        comentario: h.comentario || h.Comentario || "",
        timestamp: h.timestamp || h.FechaRegistro || h.FechaModificacion || "",
        user: h.user || h.UsuarioRegistro || h.UsuarioModificacion || "Sistema"
      };
      if (h.affectsAdvisor !== undefined && h.affectsAdvisor !== null) entry.affectsAdvisor = Boolean(h.affectsAdvisor);
      if (h.tipoObservacion) entry.tipoObservacion = h.tipoObservacion;
      if (Array.isArray(h.observationReasons) && h.observationReasons.length > 0) entry.observationReasons = h.observationReasons;
      if (h.derivadoA) entry.derivadoA = h.derivadoA;
      historyList.push(entry);
    });
  } else {
    if (Array.isArray(data.HistorialAcciones)) {
      data.HistorialAcciones.forEach((h: any) => {
        const entry: StatusHistoryEntry = {
          status: h.status || h.Estado || "Acción Registrada",
          comentario: h.comentario || h.Comentario || "",
          timestamp: h.timestamp || h.FechaRegistro || h.FechaModificacion || "",
          user: h.user || h.UsuarioRegistro || h.UsuarioModificacion || "Sistema"
        };
        historyList.push(entry);
      });
    }

    // Only fallback to matching collection 'historial' if document has no history array
    const matchingCollectionHistory = cachedHistory.filter(h => 
      String(h.IdOperacion || "").trim().toLowerCase() === String(id).trim().toLowerCase()
    );

    matchingCollectionHistory.forEach(h => {
      const hStatus = cachedStatuses.find(s => s.IdEstado === h.Estado || s.NombreEstado === h.Estado);
      const timeVal = h.FechaRegistro || h.FechaModificacion || h.timestamp || "";
      const candidateEntry: StatusHistoryEntry = {
        status: hStatus ? hStatus.NombreEstado : (h.Estado || h.status || "Acción Registrada"),
        comentario: h.Comentario || h.comentario || "",
        timestamp: timeVal,
        user: h.UsuarioRegistro || h.UsuarioModificacion || h.user || "Sistema"
      };
      const exists = historyList.some(item => isSameHistoryEvent(item, candidateEntry));
      if (!exists && (candidateEntry.comentario || candidateEntry.status)) {
        historyList.push(candidateEntry);
      }
    });
  }

  // Sort history chronologically
  historyList.sort((a, b) => (safeGetTime(a.timestamp) || 0) - (safeGetTime(b.timestamp) || 0));

  // Strictly deduplicate historyList to prevent duplicate initial or modification events
  const deduplicatedHistory: StatusHistoryEntry[] = [];
  historyList.forEach(entry => {
    const existingIndex = deduplicatedHistory.findIndex(existing => isSameHistoryEvent(existing, entry));
    if (existingIndex >= 0) {
      if (entry.timestamp.includes(" / ") && !deduplicatedHistory[existingIndex].timestamp.includes(" / ")) {
        deduplicatedHistory[existingIndex] = entry;
      }
    } else {
      deduplicatedHistory.push(entry);
    }
  });

  const finalId = String(data.IdOperacion || id || "").trim();

  return {
    id: finalId,
    proyecto: projectName,
    team: teamName,
    dpto: String(data.Dpto || data.dpto || ""),
    estac: String(data.Estacionamiento || data.Estacionamie || data.estac || ""),
    dep: String(data.Deposito || data.dep || ""),
    asesor: String(advisorName || ""),
    tipo: String(typeName || ""),
    solicitud: String(data.FechaSolicitud || data.solicitud || ""),
    solicitudAt: safeToISOString(data.solicitudAt || data.FechaRegistro || data.FechaSolicitud),
    emision: String(data.FechaEmision || data.emision || ""),
    emittedAt: data.emittedAt ? safeToISOString(data.emittedAt) : (data.FechaEmision ? safeToISOString(data.FechaEmision) : undefined),
    status: String(statusName || "Pendiente"),
    comentario: String(data.Comentario || data.comentario || ""),
    derivadoA: String(data.DerivadoA || data.derivadoA || ""),
    updatedByUser: String(data.UsuarioModificacion || data.UsuarioRegistro || data.updatedByUser || "Sistema"),
    history: deduplicatedHistory,
    createdAt: safeToISOString(data.FechaRegistro || data.createdAt) || new Date().toISOString(),
    tipoObservacion: data.tipoObservacion || (data.Comentario && data.Comentario.toLowerCase().includes("otras áreas") ? "Observaciones de otras áreas" : undefined),
    affectsAdvisor: data.affectsAdvisor !== undefined ? Boolean(data.affectsAdvisor) : (data.tipoObservacion === "Observaciones de otras áreas" || (data.Comentario && data.Comentario.toLowerCase().includes("otras áreas")) ? false : true),
    observationReasons: Array.isArray(data.observationReasons) ? data.observationReasons : [],
    observacion: String(data.observacion || data.Observacion || ""),
    reingresadoAt: safeToISOString(data.reingresadoAt) || (data.reingresadoAt ? String(data.reingresadoAt) : undefined)
  };
}

// Convert React OperationRecord to Firestore Document format
function mapReactToFirestoreRecord(record: Partial<OperationRecord>): any {
  let projName = record.proyecto || "";
  let teamName = record.team || "";
  let advisorName = record.asesor || "";

  if (projName === "PRO000029") projName = "Lima 41";
  if (teamName === "EQ000001") teamName = "FRANCISCO";
  if (teamName === "EQ000002") teamName = "JHAZMIN";
  if (teamName === "EQ000003") teamName = "NINOSKA";
  if (teamName === "EQ000004") teamName = "TEAM PAULA";

  if (advisorName.toUpperCase().includes("PAULA CASAS")) {
    teamName = "TEAM PAULA";
  }

  const project = cachedProjects.find(p => p.NombreProyecto === projName || p.name === projName || p.IdProyecto === projName || p.id === projName);
  const team = cachedTeams.find(t => t.NombreEquipo === teamName || t.name === teamName || t.IdEquipo === teamName || t.id === teamName);
  const advisor = cachedAdvisors.find(a => a.Nombre === advisorName || a.nombre === advisorName || a.IdAsesor === advisorName || a.id === advisorName);
  const type = cachedTypes.find(t => t.NombreTipo === record.tipo || t.nombre === record.tipo || t.IdTipo === record.tipo);
  const status = cachedStatuses.find(s => s.NombreEstado === record.status || s.nombre === record.status || s.IdEstado === record.status);

  const cleanHistory = (record.history || []).map(h => {
    const entry: Record<string, any> = {
      status: h.status || "Acción Registrada",
      comentario: h.comentario || "",
      timestamp: h.timestamp || getFormattedSystemDateTime(),
      user: h.user || "Sistema"
    };
    if (h.affectsAdvisor !== undefined && h.affectsAdvisor !== null) entry.affectsAdvisor = Boolean(h.affectsAdvisor);
    if (h.tipoObservacion) entry.tipoObservacion = h.tipoObservacion;
    if (Array.isArray(h.observationReasons) && h.observationReasons.length > 0) entry.observationReasons = h.observationReasons;
    if (h.derivadoA) entry.derivadoA = h.derivadoA;
    return entry;
  });

  return sanitizeForFirestore({
    IdOperacion: record.id,
    IdProyecto: project ? project.IdProyecto || project.id : (projName === "Lima 41" ? "PRO000029" : (record.proyecto || "")),
    Proyecto: project ? project.NombreProyecto : (projName || "Lima 41"),
    IdEquipo: team ? team.IdEquipo || team.id : (teamName === "FRANCISCO" ? "EQ000001" : (teamName === "TEAM PAULA" ? "EQ000004" : (record.team || ""))),
    Team: team ? team.NombreEquipo : (teamName || ""),
    Dpto: record.dpto || "",
    Estacionamiento: record.estac || null,
    Deposito: record.dep || null,
    Asesor: advisor ? advisor.IdAsesor || advisor.id : (record.asesor || ""),
    NombreAsesor: advisor ? advisor.Nombre : (advisorName || ""),
    TipoOperacion: type ? type.IdTipo || type.id : (record.tipo || ""),
    Tipo: record.tipo || (type ? type.NombreTipo : ""),
    FechaSolicitud: record.solicitud || "",
    solicitudAt: record.solicitudAt || null,
    FechaEmision: record.emision || "",
    emittedAt: record.emittedAt || null,
    Estado: status ? status.IdEstado || status.id : (record.status || ""),
    Status: record.status || (status ? status.NombreEstado : ""),
    Comentario: record.comentario || "",
    DerivadoA: record.derivadoA || "",
    UsuarioRegistro: record.updatedByUser || "Sistema",
    FechaRegistro: record.createdAt || getFormattedSystemDateTime(),
    UsuarioModificacion: record.updatedByUser || "Sistema",
    FechaModificacion: getFormattedSystemDateTime(),
    Activo: true,
    history: cleanHistory,
    tipoObservacion: record.tipoObservacion || null,
    affectsAdvisor: record.affectsAdvisor !== undefined ? Boolean(record.affectsAdvisor) : null,
    observationReasons: Array.isArray(record.observationReasons) ? record.observationReasons : [],
    observacion: record.observacion || "",
    reingresadoAt: record.reingresadoAt || null
  });
}

/**
 * Bootstrap the application directly from Firestore.
 */
export async function getBootstrapData(forceRefresh = false): Promise<{ records: OperationRecord[]; settings: AppSettings }> {
  if (forceRefresh) {
    invalidateLocalCache();
  }

  await loadLookups(forceRefresh);
  const [records, settings] = await Promise.all([
    getRecords(),
    getSettings()
  ]);

  return { records, settings };
}

/**
 * Force clear all local caches and re-fetch directly from Firestore.
 */
export async function clearAllCache(): Promise<{ success: boolean; message: string }> {
  invalidateLocalCache();
  await loadLookups(true);
  return { success: true, message: "Caché de Firestore y datos locales actualizados con éxito." };
}

/**
 * Fetch all operations from Firestore collection 'operaciones'.
 */
export async function getRecords(): Promise<OperationRecord[]> {
  await loadLookups(false);

  try {
    const snapshot = await fetchCollectionDocs("operaciones");

    if (!snapshot || snapshot.empty) {
      return [];
    }

    const records: OperationRecord[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.Activo !== false) {
        records.push(mapFirestoreToReactRecord(data, docSnap.id));
      }
    });

    // Sort by createdAt / solicitud descending
    records.sort((a, b) => (safeGetTime(b.createdAt || b.solicitud) || 0) - (safeGetTime(a.createdAt || a.solicitud) || 0));
    return records;
  } catch (error) {
    console.error("Error fetching operations from Firestore:", error);
    return [];
  }
}

/**
 * Helper to generate sequential IDs like "OPE000031" matching the existing Firestore convention
 */
export async function generateNextOperationId(): Promise<string> {
  try {
    const snap = await fetchCollectionDocs("operaciones");
    let maxNum = 0;
    if (snap && !snap.empty) {
      snap.forEach(docSnap => {
        const data = docSnap.data();
        const idToCheck = String(data.IdOperacion || docSnap.id || "");
        const match = idToCheck.match(/OPE0*(\d+)/i);
        if (match) {
          const val = parseInt(match[1], 10);
          if (val > maxNum) maxNum = val;
        }
      });
    }
    const nextNum = maxNum > 0 ? maxNum + 1 : 1;
    return `OPE${nextNum.toString().padStart(6, "0")}`;
  } catch (e) {
    return `OPE${Date.now().toString().slice(-6)}`;
  }
}

/**
 * Real-time listener for 'operaciones' collection.
 * Triggers across all connected browsers whenever any user (Jefe Legal, Asistente, Jefe de Ventas, Admin)
 * creates, emits, or updates an operation.
 */
export function subscribeToRecords(
  onUpdate: (records: OperationRecord[]) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const colRef = collection(db, "operaciones");
    const unsubscribe = onSnapshot(colRef, async (snapshot) => {
      try {
        await loadLookups(false);
        const records: OperationRecord[] = [];
        const seenIds = new Set<string>();
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.Activo !== false) {
            const r = mapFirestoreToReactRecord(data, docSnap.id);
            if (r.id) {
              if (!seenIds.has(r.id)) {
                seenIds.add(r.id);
                records.push(r);
              }
            } else {
              records.push(r);
            }
          }
        });
        // Sort by createdAt / solicitud descending
        records.sort((a, b) => (safeGetTime(b.createdAt || b.solicitud) || 0) - (safeGetTime(a.createdAt || a.solicitud) || 0));
        onUpdate(records);
      } catch (err) {
        console.warn("Notice processing operations snapshot:", err);
        if (onError) onError(err);
      }
    }, (error) => {
      const isUnavailable = error?.code === "unavailable" || (error?.message && error.message.includes("offline"));
      if (isUnavailable) {
        console.warn("Firestore snapshot notice (operaciones): backend temporarily unreachable, running in offline cache mode.");
      } else {
        console.warn("Firestore onSnapshot notice on operaciones:", error?.message || error);
        if (onError) onError(error);
      }
    });

    return unsubscribe;
  } catch (err) {
    console.warn("Failed to subscribe to operaciones:", err);
    return () => {};
  }
}

/**
 * Real-time listener for general configuration / settings.
 */
export function subscribeToSettings(
  onUpdate: (settings: AppSettings) => void,
  onError?: (err: any) => void
): () => void {
  try {
    const docRef = doc(db, "configuracion", "general");
    const unsubscribe = onSnapshot(docRef, async () => {
      try {
        const freshSettings = await getSettings();
        onUpdate(freshSettings);
      } catch (err) {
        console.warn("Notice reloading real-time settings:", err);
        if (onError) onError(err);
      }
    }, (error) => {
      const isUnavailable = error?.code === "unavailable" || (error?.message && error.message.includes("offline"));
      if (isUnavailable) {
        console.warn("Firestore snapshot notice (configuracion): backend temporarily unreachable, running in offline cache mode.");
      } else {
        console.warn("Firestore onSnapshot notice on configuracion:", error?.message || error);
        if (onError) onError(error);
      }
    });

    return unsubscribe;
  } catch (err) {
    console.warn("Failed to subscribe to configuracion:", err);
    return () => {};
  }
}

/**
 * Create a new operation in Firestore + non-blocking background backup to Google Sheets.
 */
export async function createRecord(recordData: Partial<OperationRecord>): Promise<OperationRecord> {
  await loadLookups(false);

  const docId = recordData.id || await generateNextOperationId();
  const nowStr = getFormattedSystemDateTime();

  // If this docId was previously used or has any lingering orphan history in 'historial',
  // purge them now so the new operation starts with an entirely clean history
  try {
    const histSnap = await fetchCollectionDocs("historial");
    if (histSnap && !histSnap.empty) {
      const deletePromises: Promise<any>[] = [];
      const targetDocIdLower = String(docId).trim().toLowerCase();
      histSnap.forEach(docSnap => {
        const data = docSnap.data();
        const opVal = String(data.IdOperacion || "").trim().toLowerCase();
        if (opVal === targetDocIdLower) {
          deletePromises.push(removeDocument("historial", docSnap.id));
        }
      });
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    }
  } catch (e) {
    console.warn("Notice checking lingering history for new record:", e);
  }

  // Remove from cachedHistory in memory as well
  cachedHistory = cachedHistory.filter(h => 
    String(h.IdOperacion || "").trim().toLowerCase() !== String(docId).trim().toLowerCase()
  );

  const initialTimestamp = recordData.solicitud ? formatDateTimeFull(recordData.solicitud) : nowStr;

  const initialHistoryEntry: StatusHistoryEntry = {
    status: recordData.status || "Pendiente",
    comentario: recordData.comentario || "Registro inicial del expediente en el sistema.",
    timestamp: initialTimestamp,
    user: recordData.updatedByUser || "Sistema"
  };

  const fullRecord: OperationRecord = {
    id: docId,
    proyecto: recordData.proyecto || "",
    team: recordData.team || "",
    dpto: recordData.dpto || "",
    estac: recordData.estac || "",
    dep: recordData.dep || "",
    asesor: recordData.asesor || "",
    tipo: recordData.tipo || "",
    solicitud: initialTimestamp,
    solicitudAt: safeToISOString(recordData.solicitud || nowStr),
    emision: recordData.emision || "",
    emittedAt: recordData.emision ? safeToISOString(recordData.emision) : undefined,
    status: recordData.status || "Pendiente",
    comentario: recordData.comentario || "",
    derivadoA: recordData.derivadoA || "",
    updatedByUser: recordData.updatedByUser || "Sistema",
    createdAt: recordData.createdAt || new Date().toISOString(),
    history: [initialHistoryEntry]
  };

  const firestoreData = mapReactToFirestoreRecord(fullRecord);

  // 1. Primary Save to Firestore
  await writeDocument("operaciones", docId, firestoreData);

  // 2. Also save to historial collection in Firestore
  const histDocId = `HIS-${docId}-${Date.now()}`;
  writeDocument("historial", histDocId, {
    IdHistorial: histDocId,
    IdOperacion: docId,
    Estado: fullRecord.status,
    Comentario: initialHistoryEntry.comentario,
    UsuarioRegistro: fullRecord.updatedByUser,
    FechaRegistro: initialTimestamp
  }).catch(e => console.warn("Notice saving initial history doc:", e));

  // Update in-memory history cache to maintain strict synchronization
  cachedHistory.push({
    id: histDocId,
    IdHistorial: histDocId,
    IdOperacion: docId,
    Estado: fullRecord.status,
    Comentario: initialHistoryEntry.comentario,
    UsuarioRegistro: fullRecord.updatedByUser,
    FechaRegistro: initialTimestamp
  });

  // 3. Background Non-Blocking Backup to Google Sheets
  sendBackgroundGasBackup("saveOperation", firestoreData);
  sendBackgroundGasBackup("saveHistory", {
    IdHistorial: histDocId,
    IdOperacion: docId,
    Estado: fullRecord.status,
    Comentario: initialHistoryEntry.comentario,
    UsuarioRegistro: fullRecord.updatedByUser,
    FechaRegistro: initialTimestamp
  });

  return fullRecord;
}

/**
 * Update an existing operation in Firestore + record audit action + background backup to Google Sheets.
 */
export async function updateRecord(
  id: string, 
  updatedFields: Partial<OperationRecord>,
  isEditOnly: boolean = false
): Promise<OperationRecord> {
  await loadLookups(false);

  // Read current operation from Firestore
  const opSnap = await fetchDocument("operaciones", id);
  
  let currentReact: OperationRecord | null = null;
  if (opSnap && opSnap.exists()) {
    currentReact = mapFirestoreToReactRecord(opSnap.data(), opSnap.id);
  }

  // Admin and direct edits without history
  const shouldSkipHistory = isEditOnly || updatedFields.skipHistory === true;

  let updatedHistory = updatedFields.history !== undefined ? [...updatedFields.history] : (currentReact?.history || []);
  let newHistoryEntry: StatusHistoryEntry | null = null;

  if (!shouldSkipHistory) {
    const nowStr = getFormattedSystemDateTime();
    const modifiedKeys: string[] = [];
    const fieldsToCheck: (keyof OperationRecord)[] = ["proyecto", "team", "dpto", "estac", "dep", "asesor", "tipo", "status", "comentario", "derivadoA", "emision"];
    
    if (currentReact) {
      fieldsToCheck.forEach(key => {
        if (updatedFields[key] !== undefined && String(updatedFields[key]) !== String(currentReact![key])) {
          modifiedKeys.push(key);
        }
      });
    }

    const isStatusObserved = (updatedFields.status && (updatedFields.status.toLowerCase().includes("observado") || updatedFields.status.toLowerCase().includes("rechazado")));
    
    let historyComment = updatedFields.comentario || "";
    if (!historyComment || historyComment === currentReact?.comentario) {
      if (isStatusObserved) {
        historyComment = `[Observación] Expediente observado por el área legal.`;
      } else if (modifiedKeys.length > 0) {
        historyComment = `[Modificación] Se actualizaron los campos: ${modifiedKeys.join(", ")}.`;
      } else {
        historyComment = `[Acción] Actualización de estado a ${updatedFields.status || "registrado"}.`;
      }
    } else if (isStatusObserved && !historyComment.startsWith("[Observación]")) {
      historyComment = `[Observación] ${historyComment}`;
    } else if (!isStatusObserved && modifiedKeys.length > 0 && !historyComment.startsWith("[Modificación]") && !historyComment.startsWith("[")) {
      historyComment = `[Modificación] ${historyComment}`;
    }

    const eventTimestamp = updatedFields.emision ? formatDateTimeFull(updatedFields.emision) : nowStr;

    newHistoryEntry = {
      status: updatedFields.status || (currentReact ? currentReact.status : "MODIFICADO"),
      comentario: historyComment,
      timestamp: eventTimestamp,
      user: updatedFields.updatedByUser || (currentReact ? currentReact.updatedByUser : "Usuario")
    };

    // Filter out any identical existing entry to strictly avoid duplicating actions
    const previousHistory = (currentReact?.history || []).filter(h => !isSameHistoryEvent(h, newHistoryEntry!));
    updatedHistory = [...previousHistory, newHistoryEntry];
  } else if (updatedFields.history !== undefined) {
    // If admin explicitly modified or deleted history blocks without audit trail:
    updatedHistory = [...updatedFields.history];
    // Purge cached history documents for this operation so they do not resurrect
    cachedHistory = cachedHistory.filter(h => 
      String(h.IdOperacion || "").trim().toLowerCase() !== String(id).trim().toLowerCase()
    );

    // Sync Firestore 'historial' collection by purging obsolete documents for this operation
    try {
      fetchCollectionDocs("historial").then(histSnap => {
        if (histSnap && !histSnap.empty) {
          const targetOpIdLower = String(id).trim().toLowerCase();
          histSnap.forEach(docSnap => {
            const d = docSnap.data();
            const opVal = String(d.IdOperacion || "").trim().toLowerCase();
            if (opVal === targetOpIdLower || docSnap.id.toLowerCase().includes(targetOpIdLower)) {
              removeDocument("historial", docSnap.id).catch(() => {});
            }
          });
        }
      }).catch(() => {});
    } catch (e) {
      console.warn("Notice syncing historial collection:", e);
    }
  }

  const mergedRecord: OperationRecord = {
    ...(currentReact || {
      id,
      proyecto: "",
      team: "",
      dpto: "",
      estac: "",
      dep: "",
      asesor: "",
      tipo: "",
      solicitud: "",
      emision: "",
      status: "",
      comentario: "",
      createdAt: new Date().toISOString()
    }),
    ...updatedFields,
    id,
    history: updatedHistory,
    updatedByUser: updatedFields.updatedByUser || (currentReact ? currentReact.updatedByUser : "Usuario")
  };

  const firestoreData = mapReactToFirestoreRecord(mergedRecord);

  // 1. Primary Update in Firestore
  await writeDocument("operaciones", id, firestoreData, true);

  // 2. Also save to historial collection in Firestore ONLY if not skipped
  if (!shouldSkipHistory && newHistoryEntry) {
    const histDocId = `HIS-${id}-${Date.now()}`;
    writeDocument("historial", histDocId, {
      IdHistorial: histDocId,
      IdOperacion: id,
      Estado: newHistoryEntry.status,
      Comentario: newHistoryEntry.comentario,
      UsuarioRegistro: newHistoryEntry.user,
      FechaRegistro: newHistoryEntry.timestamp
    }).catch(e => console.warn("Notice saving history doc:", e));

    // Update in-memory history cache to maintain strict synchronization
    cachedHistory.push({
      id: histDocId,
      IdHistorial: histDocId,
      IdOperacion: id,
      Estado: newHistoryEntry.status,
      Comentario: newHistoryEntry.comentario,
      UsuarioRegistro: newHistoryEntry.user,
      FechaRegistro: newHistoryEntry.timestamp
    });

    sendBackgroundGasBackup("saveHistory", {
      IdHistorial: histDocId,
      IdOperacion: id,
      Estado: newHistoryEntry.status,
      Comentario: newHistoryEntry.comentario,
      UsuarioRegistro: newHistoryEntry.user,
      FechaRegistro: newHistoryEntry.timestamp
    });
  }

  // 3. Background Non-Blocking Backup to Google Sheets
  sendBackgroundGasBackup("evaluateOperation", firestoreData);

  return mergedRecord;
}

/**
 * Rectify records recorded/modified today or with mismatched affectsAdvisor flags.
 * Corrects records where Legal / Asesor checklist items were erroneously marked as "Otras Áreas" or affectsAdvisor: false,
 * or where Otras Áreas items were marked as affectsAdvisor: true.
 */
export async function rectifyTodayRecords(onlyToday: boolean = true): Promise<{ count: number; rectifiedIds: string[] }> {
  try {
    await loadLookups(false);
    const snap = await fetchCollectionDocs("operaciones");
    if (!snap || snap.empty) return { count: 0, rectifiedIds: [] };

    const todayIso = new Date().toISOString().slice(0, 10);
    const todaySlash = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    const legalStatus = cachedStatuses.find(s => 
      (s.NombreEstado?.toLowerCase().includes("observad") || s.NombreEstado?.toLowerCase().includes("rechazad")) &&
      !s.NombreEstado?.toLowerCase().includes("otras")
    )?.NombreEstado || "Observado / Rechazado";

    const otherAreasStatus = cachedStatuses.find(s => 
      s.NombreEstado?.toLowerCase().includes("otras áreas") || s.NombreEstado?.toLowerCase().includes("otras areas")
    )?.NombreEstado || "Observado (Otras Áreas)";

    const rectifiedIds: string[] = [];
    const updatePromises: Promise<any>[] = [];

    snap.forEach(docSnap => {
      const data = docSnap.data();
      if (data.Activo === false) return;

      const record = mapFirestoreToReactRecord(data, docSnap.id);

      // Check if recorded or updated today
      const datesToCheck = [
        record.solicitud,
        record.solicitudAt,
        record.emision,
        record.emittedAt,
        record.createdAt,
        data.FechaRegistro,
        data.FechaModificacion,
        data.FechaEmision,
        data.FechaSolicitud
      ].map(d => String(d || "").slice(0, 10));

      const isToday = datesToCheck.some(d => d === todayIso || d === todaySlash);

      if (onlyToday && !isToday) {
        return;
      }

      const obsList = record.observationReasons || [];
      const comment = record.comentario || "";
      const status = record.status || "";

      // Determine whether this record represents a Legal / Asesor observation or Otras Áreas
      const hasLegalChecklist = obsList.some(o => 
        STANDARD_OBSERVATIONS.includes(o as any) ||
        (!STANDARD_OTHER_AREAS_OBSERVATIONS.includes(o as any) && !o.toLowerCase().includes("otras áreas") && !o.toLowerCase().includes("otras areas"))
      );

      const hasOtherAreasChecklist = obsList.some(o => 
        STANDARD_OTHER_AREAS_OBSERVATIONS.includes(o as any) || 
        o.toLowerCase().includes("otras áreas") || 
        o.toLowerCase().includes("otras areas")
      );

      const commentMentionsOther = comment.toLowerCase().includes("otras áreas") || comment.toLowerCase().includes("otras areas");
      const statusIsOther = status.toLowerCase().includes("otras áreas") || status.toLowerCase().includes("otras areas");
      const statusIsObserved = status.toLowerCase().includes("observad") || status.toLowerCase().includes("rechazad");

      let shouldBeAffectsAdvisor: boolean | null = null;
      let shouldBeStatus: string | null = null;
      let shouldBeTipoObs: "Observaciones de otras áreas" | "Asesor" | null = null;

      if (hasLegalChecklist) {
        // Image 4: Entire list of legal items strictly affects advisor in time
        shouldBeAffectsAdvisor = true;
        shouldBeStatus = legalStatus;
        shouldBeTipoObs = "Asesor";
      } else if (hasOtherAreasChecklist || (commentMentionsOther && !hasLegalChecklist) || statusIsOther) {
        // Other areas: strictly does NOT affect advisor in time
        shouldBeAffectsAdvisor = false;
        shouldBeStatus = otherAreasStatus;
        shouldBeTipoObs = "Observaciones de otras áreas";
      }

      if (shouldBeAffectsAdvisor !== null) {
        const needsUpdate = 
          record.affectsAdvisor !== shouldBeAffectsAdvisor ||
          (shouldBeStatus && record.status !== shouldBeStatus && statusIsObserved) ||
          (shouldBeTipoObs && record.tipoObservacion !== shouldBeTipoObs);

        if (needsUpdate) {
          rectifiedIds.push(record.id);
          const updatedFields: Partial<OperationRecord> = {
            affectsAdvisor: shouldBeAffectsAdvisor,
            tipoObservacion: shouldBeTipoObs || undefined
          };
          if (shouldBeStatus && statusIsObserved) {
            updatedFields.status = shouldBeStatus;
          }

          // Clean comment if it has wrong prefix
          if (shouldBeAffectsAdvisor && comment.startsWith("[Observación - Otras Áreas]")) {
            updatedFields.comentario = comment.replace("[Observación - Otras Áreas]", "[Observación]");
          } else if (!shouldBeAffectsAdvisor && comment.startsWith("[Observación]") && !comment.startsWith("[Observación - Otras Áreas]")) {
            updatedFields.comentario = comment.replace("[Observación]", "[Observación - Otras Áreas]");
          }

          updatePromises.push(updateRecord(record.id, updatedFields, true));
        }
      }
    });

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    return { count: rectifiedIds.length, rectifiedIds };
  } catch (err) {
    console.error("Error during rectifyTodayRecords:", err);
    return { count: 0, rectifiedIds: [] };
  }
}

/**
 * Delete an operation from Firestore + backup log.
 * Also permanently removes all associated history records from collection 'historial'
 * and in-memory cache so no orphan history records leak if the ID is reused.
 */
export async function deleteRecord(id: string, deletedByUser?: string): Promise<{ success: boolean; deletedId: string }> {
  try {
    // 1. Delete operation document from 'operaciones'
    await removeDocument("operaciones", id);

    // 2. Permanently purge ALL related history documents from collection 'historial'
    try {
      const histSnap = await fetchCollectionDocs("historial");
      if (histSnap && !histSnap.empty) {
        const deletePromises: Promise<any>[] = [];
        const targetIdLower = String(id).trim().toLowerCase();
        histSnap.forEach(docSnap => {
          const data = docSnap.data();
          const targetOp = String(data.IdOperacion || "").trim().toLowerCase();
          const docIdLower = docSnap.id.toLowerCase();
          
          if (targetOp === targetIdLower || docIdLower.includes(targetIdLower)) {
            deletePromises.push(removeDocument("historial", docSnap.id));
          }
        });
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises);
        }
      }
    } catch (e) {
      console.warn("Notice cleaning up history documents for deleted record:", e);
    }

    // 3. Purge from in-memory cache immediately
    cachedHistory = cachedHistory.filter(h => 
      String(h.IdOperacion || "").trim().toLowerCase() !== String(id).trim().toLowerCase()
    );

    // 4. Background Non-Blocking Backup to Google Sheets
    sendBackgroundGasBackup("deleteOperation", { IdOperacion: id });

    return { success: true, deletedId: id };
  } catch (err) {
    console.error("Error deleting record from Firestore:", err);
    throw err;
  }
}

/**
 * Load global settings from Firestore collection 'configuracion' doc 'general'.
 */
export async function getSettings(): Promise<AppSettings> {
  await loadLookups(false);

  // Defaults
  let platformName = "Excelencia Operacional";
  let platformLogo = "";
  let jefeLegalEnabled = true;
  let sharedExcelLink = "";
  let sheetsWebhookUrl = "";
  let workingSchedule: WorkingScheduleConfig = DEFAULT_WORKING_SCHEDULE;
  let observationReasons: ObservationReasonConfig[] = STANDARD_OBSERVATIONS.map((name, idx) => ({
    id: `OBS${String(idx + 1).padStart(3, "0")}`,
    name,
    active: true
  }));
  let kpiVisibility: Record<any, boolean> = {
    "Administrador": true,
    "Jefe de Ventas": false,
    "Jefe Legal": true,
    "Asistente Legal": false
  };
  let configDocData: any = null;

  try {
    const configSnap = await fetchDocument("configuracion", "general");
    if (configSnap && configSnap.exists()) {
      const data = configSnap.data();
      configDocData = data;
      if (data.platformName !== undefined) platformName = data.platformName;
      if (data.platformLogo !== undefined) platformLogo = data.platformLogo;
      if (data.jefeLegalEnabled !== undefined) jefeLegalEnabled = data.jefeLegalEnabled;
      if (data.sharedExcelLink !== undefined) sharedExcelLink = data.sharedExcelLink;
      if (data.sheetsWebhookUrl !== undefined) sheetsWebhookUrl = data.sheetsWebhookUrl;
      if (data.kpiVisibility !== undefined) kpiVisibility = data.kpiVisibility;
      if (data.workingSchedule !== undefined) workingSchedule = { ...DEFAULT_WORKING_SCHEDULE, ...data.workingSchedule };
      if (data.observationReasons !== undefined && Array.isArray(data.observationReasons) && data.observationReasons.length > 0) {
        observationReasons = data.observationReasons;
      }
    }
  } catch (e) {
    console.warn("Notice reading Firestore configuracion:", e);
  }

  // Also check localStorage fallbacks
  if (!platformName || platformName === "Excelencia Operacional") {
    const localName = localStorage.getItem("platform_name");
    if (localName) platformName = localName;
  }
  const localObs = localStorage.getItem("observation_reasons");
  if (localObs) {
    try {
      const parsed = JSON.parse(localObs);
      if (Array.isArray(parsed) && parsed.length > 0) observationReasons = parsed;
    } catch (_) {}
  }
  if (!sharedExcelLink) {
    const localLink = localStorage.getItem("shared_excel_link");
    if (localLink) sharedExcelLink = localLink;
  }
  if (!sheetsWebhookUrl) {
    const localWebhook = localStorage.getItem("sheets_webhook_url");
    if (localWebhook) sheetsWebhookUrl = localWebhook;
  }

  // Map Users from cachedUsers / Firestore
  let usersMapped: UserAccount[] = cachedUsers.map(u => {
    let rawAssigned = u.assignedProjects || u.Proyectos || u.proyectos || u.AssignedProjects || [];
    let parsedAssigned: string[] = [];
    if (Array.isArray(rawAssigned)) {
      parsedAssigned = rawAssigned.map((p: any) => String(p).trim()).filter(Boolean);
    } else if (typeof rawAssigned === "string" && rawAssigned.trim()) {
      parsedAssigned = rawAssigned.split(",").map((p: string) => p.trim()).filter(Boolean);
    }

    // Resolve any Project IDs to Project Names for user filter matches
    const resolvedAssigned = parsedAssigned.map(pNameOrId => {
      const projMatch = cachedProjects.find(cp => cp.IdProyecto === pNameOrId || cp.id === pNameOrId || cp.NombreProyecto === pNameOrId || cp.name === pNameOrId);
      return projMatch ? (projMatch.NombreProyecto || projMatch.name || pNameOrId) : pNameOrId;
    });

    const username = String(u.username || u.Usuario || u.Nombre || "").trim();
    
    // Preserve existing password from Firestore
    let passwordVal = u.password !== undefined && u.password !== null 
      ? String(u.password) 
      : (u.Password !== undefined && u.Password !== null ? String(u.Password) : "");
      
    if (username.toLowerCase() === "admin" && (!passwordVal || passwordVal === "admin" || passwordVal === "0000")) {
      passwordVal = "1506";
    }

    // Preserve active / disabled state from Firestore
    let isActive = true;
    const rawActive = u.Activo !== undefined ? u.Activo : (u.active !== undefined ? u.active : (u.Habilitado !== undefined ? u.Habilitado : u.habilitado));
    if (rawActive === false || rawActive === "false" || rawActive === "FALSE" || rawActive === "NO" || rawActive === "no" || rawActive === 0 || rawActive === "0") {
      isActive = false;
    } else if (rawActive === true || rawActive === "true" || rawActive === "TRUE" || rawActive === "SI" || rawActive === "si" || rawActive === 1 || rawActive === "1") {
      isActive = true;
    }

    return {
      id: u.id || u.IdUsuario || `u-${username || "user"}`,
      username,
      password: passwordVal,
      role: u.role || u.Rol || "Asistente Legal",
      active: isActive,
      assignedProjects: resolvedAssigned
    };
  });

  // Ensure Admin user exists with password 1506
  const adminIndex = usersMapped.findIndex(u => u.username.toLowerCase() === "admin");
  if (adminIndex === -1) {
    usersMapped.unshift({
      id: "USR000001",
      username: "admin",
      password: "1506",
      role: "Administrador",
      active: true,
      assignedProjects: []
    });
  } else {
    // Admin password is guaranteed to be 1506 if set to default
    if (!usersMapped[adminIndex].password || usersMapped[adminIndex].password === "0000") {
      usersMapped[adminIndex].password = "1506";
    }
  }

  // Ensure real team accounts from Image 2 exist with active status
  const ensureTeamUser = (username: string, role: UserRole, defaultPass: string, projects: string[] = []) => {
    const existing = usersMapped.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!existing) {
      usersMapped.push({
        id: `USR-${username.toLowerCase().replace(/\s+/g, "_")}`,
        username,
        password: defaultPass,
        role,
        active: true,
        assignedProjects: projects
      });
    } else {
      existing.active = true;
      if (!existing.role) existing.role = role;
    }
  };

  ensureTeamUser("Marilyn Saona", "Jefe Legal", "1506");
  ensureTeamUser("Sthief Vidalon", "Asistente Legal", "");
  ensureTeamUser("Daniel Hurtado", "Asistente Legal", "");
  ensureTeamUser("Franco Odar", "Asistente Legal", "");

  // Filter out any artificial test user accounts so they never pollute the login options
  usersMapped = usersMapped.filter(u => {
    const norm = u.username.toLowerCase();
    return !["jefe_legal", "asistente_legal", "jefe_ventas", "jefe_agentes"].includes(norm);
  });

  // Map Projects
  const projectsMapped: ProjectConfig[] = cachedProjects.map(p => {
    let pName = p.NombreProyecto || p.name || "";
    if (p.IdProyecto === "PRO000029" || pName === "PRO000029") pName = "Lima 41";
    let teamId = p.IdEquipo || "";
    if (teamId === "EQ000001") teamId = "FRANCISCO";
    const team = cachedTeams.find(t => t.IdEquipo === p.IdEquipo || t.id === p.IdEquipo || t.NombreEquipo === p.IdEquipo);
    return {
      name: pName,
      team: team ? (team.NombreEquipo || team.name || "") : (teamId || ""),
      jefeVentas: team ? (team.JefeVentas || "") : (teamId === "FRANCISCO" ? "Francisco" : "")
    };
  });

  // Map Advisors
  const advisorsMapped: string[] = cachedAdvisors.map(a => a.Nombre || a.nombre).filter(Boolean);
  if (!advisorsMapped.includes("PAULA CASAS")) advisorsMapped.push("PAULA CASAS");
  if (!advisorsMapped.includes("DERVIS PIÑA")) advisorsMapped.push("DERVIS PIÑA");

  // Map Teams
  const teamsMapped: TeamConfig[] = cachedTeams.map(t => {
    let tName = t.NombreEquipo || t.name || "";
    if (t.IdEquipo === "EQ000001" || tName === "EQ000001") tName = "FRANCISCO";
    if (t.IdEquipo === "EQ000002" || tName === "EQ000002") tName = "JHAZMIN";
    if (t.IdEquipo === "EQ000003" || tName === "EQ000003") tName = "NINOSKA";
    if (t.IdEquipo === "EQ000004" || tName === "EQ000004") tName = "TEAM PAULA";
    return {
      id: t.IdEquipo || t.id || "",
      name: tName,
      jefeVentas: t.JefeVentas || (tName === "TEAM PAULA" ? "Paula Casas" : (tName === "FRANCISCO" ? "Francisco" : ""))
    };
  });
  if (!teamsMapped.some(t => t.name === "TEAM PAULA" || t.id === "EQ000004")) {
    teamsMapped.push({
      id: "EQ000004",
      name: "TEAM PAULA",
      jefeVentas: "Paula Casas"
    });
  }

  // Map Status Colors with Image 1 defaults + persisted custom config
  const savedStatusColors = configDocData?.statusColors || (() => {
    try {
      const ls = typeof localStorage !== "undefined" ? localStorage.getItem("status_colors") : null;
      return ls ? JSON.parse(ls) : null;
    } catch { return null; }
  })();

  const defaultImage1Colors: Record<string, string> = {
    "Modificado": "bg-amber-100 text-amber-800 border-amber-300",
    "En Revisión": "bg-blue-100 text-blue-800 border-blue-300",
    "Emitido": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Observado / Rechazado": "bg-rose-100 text-rose-800 border-rose-300",
    "ACUERDO INTERNO": "bg-purple-100 text-purple-800 border-purple-300",
    "Cierre Completo": "bg-blue-50 text-blue-700 border-blue-300",
    "Pendiente": "bg-rose-50 text-rose-700 border-rose-200"
  };
  const statusColors: Record<string, string> = { 
    ...defaultImage1Colors,
    ...(savedStatusColors || {})
  };
  
  // If no custom saved color was found for a status, fallback to catalog color mapping
  cachedStatuses.forEach(s => {
    const sName = s.NombreEstado || s.nombre || "";
    if (!sName) return;
    if (savedStatusColors && savedStatusColors[sName]) {
      // User explicitly customized this color - preserve it!
      statusColors[sName] = savedStatusColors[sName];
      return;
    }
    if (s.Color === "#FACC15" || s.Color === "yellow") {
      statusColors[sName] = "bg-amber-100 text-amber-800 border-amber-300";
    } else if (s.Color === "#3B82F6" || s.Color === "blue") {
      statusColors[sName] = "bg-blue-100 text-blue-800 border-blue-300";
    } else if (s.Color === "#10B981" || s.Color === "emerald" || s.Color === "green") {
      statusColors[sName] = "bg-emerald-100 text-emerald-800 border-emerald-300";
    } else if (s.Color === "#EF4444" || s.Color === "rose" || s.Color === "red") {
      statusColors[sName] = "bg-rose-100 text-rose-800 border-rose-300";
    } else if (s.Color === "#A855F7" || s.Color === "purple" || s.Color === "#9D00FF") {
      statusColors[sName] = "bg-purple-100 text-purple-800 border-purple-300";
    } else if (!statusColors[sName]) {
      statusColors[sName] = "bg-slate-100 text-slate-800 border-slate-200";
    }
  });

  return {
    platformName,
    platformLogo,
    jefeLegalEnabled,
    sharedExcelLink,
    sheetsWebhookUrl,
    tiposOperacion: cachedTypes.map(t => t.NombreTipo || t.nombre).filter(Boolean),
    statuses: cachedStatuses.length > 0 
      ? cachedStatuses.map(s => s.NombreEstado || s.nombre).filter(Boolean) 
      : ["Modificado", "En Revisión", "Emitido", "Observado / Rechazado", "ACUERDO INTERNO", "Cierre Completo", "Pendiente"],
    statusColors,
    proyectos: projectsMapped,
    users: usersMapped,
    kpiVisibility,
    asesores: advisorsMapped.length > 0 ? advisorsMapped : [
      "ANABEL ALBINO", "SILVANA GODENZZI", "ROSMERY CENTURION", "DERVIS PIÑA", 
      "CARLOS TORRES", "MARIA FERNANDA CHACON", "IVAN SOTO", "CHRISTIAN BARRIENTOS", 
      "PAULA CASAS", "VICTOR SALAS", "MARITZA BRAVO", "EDUARDO BECERRA", 
      "LUIS MANUEL DE LOS RIOS", "ROY OTERO", "FARIHD JASAUI", "ALEJANDRA PEREZ CAMPOS"
    ],
    equipos: teamsMapped,
    workingSchedule,
    observationReasons
  };
}

/**
 * Update global settings directly in Firestore + catalogs sync + background mirror.
 */
export async function updateSettings(newSettings: Partial<AppSettings>, oldSettings: AppSettings): Promise<AppSettings> {
  // 1. Update general configuration doc in Firestore
  const configUpdate: any = {};
  if (newSettings.platformName !== undefined) configUpdate.platformName = newSettings.platformName;
  if (newSettings.platformLogo !== undefined) configUpdate.platformLogo = newSettings.platformLogo;
  if (newSettings.jefeLegalEnabled !== undefined) configUpdate.jefeLegalEnabled = newSettings.jefeLegalEnabled;
  if (newSettings.sharedExcelLink !== undefined) configUpdate.sharedExcelLink = newSettings.sharedExcelLink;
  if (newSettings.sheetsWebhookUrl !== undefined) configUpdate.sheetsWebhookUrl = newSettings.sheetsWebhookUrl;
  if (newSettings.kpiVisibility !== undefined) configUpdate.kpiVisibility = newSettings.kpiVisibility;
  if (newSettings.workingSchedule !== undefined) configUpdate.workingSchedule = newSettings.workingSchedule;
  if (newSettings.observationReasons !== undefined) configUpdate.observationReasons = newSettings.observationReasons;
  if (newSettings.statusColors !== undefined) configUpdate.statusColors = newSettings.statusColors;

  if (Object.keys(configUpdate).length > 0) {
    await writeDocument("configuracion", "general", configUpdate, true);
    // Also save in localStorage for offline availability
    if (newSettings.platformName !== undefined) localStorage.setItem("platform_name", newSettings.platformName);
    if (newSettings.platformLogo !== undefined) localStorage.setItem("platform_logo", newSettings.platformLogo);
    if (newSettings.jefeLegalEnabled !== undefined) localStorage.setItem("jefe_legal_enabled", String(newSettings.jefeLegalEnabled));
    if (newSettings.sharedExcelLink !== undefined) localStorage.setItem("shared_excel_link", newSettings.sharedExcelLink);
    if (newSettings.sheetsWebhookUrl !== undefined) localStorage.setItem("sheets_webhook_url", newSettings.sheetsWebhookUrl);
    if (newSettings.kpiVisibility !== undefined) localStorage.setItem("kpi_visibility", JSON.stringify(newSettings.kpiVisibility));
    if (newSettings.workingSchedule !== undefined) localStorage.setItem("working_schedule", JSON.stringify(newSettings.workingSchedule));
    if (newSettings.observationReasons !== undefined) localStorage.setItem("observation_reasons", JSON.stringify(newSettings.observationReasons));
    if (newSettings.statusColors !== undefined) localStorage.setItem("status_colors", JSON.stringify(newSettings.statusColors));
  }

  // 1.1 If status colors were updated, sync them to Firestore 'estados' collection
  if (newSettings.statusColors) {
    const mapTailwindColorToHex = (cls: string) => {
      if (cls.includes("emerald") || cls.includes("green")) return "#10B981";
      if (cls.includes("blue")) return "#3B82F6";
      if (cls.includes("amber") || cls.includes("yellow")) return "#FACC15";
      if (cls.includes("rose") || cls.includes("red")) return "#EF4444";
      if (cls.includes("purple") || cls.includes("violet")) return "#A855F7";
      if (cls.includes("indigo")) return "#6366F1";
      if (cls.includes("cyan")) return "#06B6D4";
      if (cls.includes("orange")) return "#F97316";
      if (cls.includes("teal")) return "#14B8A6";
      return "#64748B";
    };

    for (const [stName, colorCls] of Object.entries(newSettings.statusColors)) {
      const matchDoc = cachedStatuses.find(s => (s.NombreEstado || s.nombre) === stName);
      if (matchDoc) {
        const docId = matchDoc.id || matchDoc.IdEstado;
        if (docId) {
          await writeDocument("estados", docId, {
            Color: mapTailwindColorToHex(colorCls),
            colorClass: colorCls
          }, true);
        }
      }
    }
  }

  // 2. Sync Users in Firestore
  if (newSettings.users !== undefined) {
    for (const u of newSettings.users) {
      const docId = u.id || `USR-${u.username}`;
      const passwordToSave = (u.username.toLowerCase() === "admin" && (!u.password || u.password === "admin")) ? "1506" : (u.password || "");
      
      const firestoreUserData = {
        IdUsuario: docId,
        Usuario: u.username,
        username: u.username,
        Password: passwordToSave,
        password: passwordToSave,
        Rol: u.role,
        role: u.role,
        Nombre: u.username,
        Activo: u.active,
        active: u.active,
        Proyectos: u.assignedProjects || [],
        assignedProjects: u.assignedProjects || [],
        FechaActualizacion: getFormattedSystemDateTime()
      };

      await writeDocument("usuarios", docId, firestoreUserData, true);
      sendBackgroundGasBackup("saveUser", firestoreUserData);
    }
  }

  // 3. Sync Advisors in Firestore
  if (newSettings.asesores !== undefined) {
    const oldAdvisors = oldSettings.asesores || [];
    const newAdvisors = newSettings.asesores || [];

    for (const name of newAdvisors) {
      if (!oldAdvisors.includes(name)) {
        const docId = `ASE${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const advData = {
          IdAsesor: docId,
          Nombre: name,
          IdEquipo: "EQ000001",
          Activo: true,
          FechaCreacion: getFormattedSystemDateTime()
        };
        await writeDocument("asesores", docId, advData);
        sendBackgroundGasBackup("saveAdvisor", advData);
      }
    }
  }

  // 4. Sync Projects in Firestore
  if (newSettings.proyectos !== undefined) {
    const oldProjects = oldSettings.proyectos || [];
    const newProjects = newSettings.proyectos || [];

    for (const p of newProjects) {
      const oldProj = oldProjects.find(op => op.name === p.name);
      if (!oldProj) {
        const docId = `PRO${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const projData = {
          IdProyecto: docId,
          NombreProyecto: p.name,
          IdEquipo: p.team || "EQ000001",
          Activo: true,
          FechaCreacion: getFormattedSystemDateTime()
        };
        await writeDocument("proyectos", docId, projData);
        sendBackgroundGasBackup("saveProject", projData);
      }
    }
  }

  // 5. Sync Statuses in Firestore
  if (newSettings.statuses !== undefined) {
    const oldStatuses = oldSettings.statuses || [];
    const newStatuses = newSettings.statuses || [];

    for (const s of newStatuses) {
      const oldStat = oldStatuses.find(os => os === s);
      if (!oldStat) {
        const docId = `EST${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const statusData = {
          IdEstado: docId,
          NombreEstado: s,
          Color: s.includes("Firma") ? "#FACC15" : s.includes("Revisión") ? "#3B82F6" : s.includes("Aprobado") ? "#10B981" : "#EF4444",
          Orden: 5,
          Activo: true
        };
        await writeDocument("estados", docId, statusData);
        sendBackgroundGasBackup("saveStatus", statusData);
      }
    }
  }

  // 6. Sync Types of Operation in Firestore
  if (newSettings.tiposOperacion !== undefined) {
    const oldTypes = oldSettings.tiposOperacion || [];
    const newTypes = newSettings.tiposOperacion || [];

    for (const t of newTypes) {
      const oldTy = oldTypes.find(ot => ot === t);
      if (!oldTy) {
        const docId = `TIP${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const typeData = {
          IdTipo: docId,
          NombreTipo: t,
          Activo: true
        };
        await writeDocument("tiposOperacion", docId, typeData);
        sendBackgroundGasBackup("saveType", typeData);
      }
    }
  }

  invalidateLocalCache();
  await loadLookups(true);
  return getSettings();
}

/**
 * Client-Side Excel Import directly to Firestore.
 */
export async function importExcel(fileBase64: string): Promise<{ success: boolean; count: number }> {
  try {
    const buffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws);

    await loadLookups();

    let count = 0;
    for (const row of rows as any[]) {
      const getVal = (keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined) return String(row[k]);
        }
        return "";
      };

      const proyectoName = getVal(["PROYECTO", "proyecto", "Proyecto", "Project"]);
      let teamName = getVal(["TEAM", "team", "Team", "Francisco", "Francisco/Jhazmin/Ninoska"]);
      
      if (proyectoName) {
        const matchedProj = cachedProjects.find(p => (p.NombreProyecto || p.name || "").toLowerCase() === proyectoName.toLowerCase());
        if (matchedProj) {
          const matchedTeam = cachedTeams.find(t => t.IdEquipo === matchedProj.IdEquipo || t.id === matchedProj.IdEquipo);
          if (matchedTeam) teamName = matchedTeam.NombreEquipo || matchedTeam.name || teamName;
        }
      }

      const newRecordData: Partial<OperationRecord> = {
        id: `OPE-IMP-${Date.now()}-${count}`,
        team: teamName,
        proyecto: proyectoName,
        dpto: getVal(["DPTO.", "DPTO", "dpto", "Dpto", "dpto."]),
        estac: getVal(["ESTAC.", "ESTAC", "estac", "Estac", "estac."]),
        dep: getVal(["DEP.", "DEP", "dep", "Dep", "dep."]),
        asesor: getVal(["ASESOR", "asesor", "Asesor", "Advisor"]),
        tipo: (getVal(["TIPO", "tipo", "Tipo"]).toUpperCase() || ""),
        solicitud: getVal(["SOLICITUD (Fecha y Hora)", "SOLICITUD (Fecha Y Hora)", "SOLICITUD", "solicitud", "Solicitud"]) || getFormattedSystemDateTime(),
        emision: getVal(["EMISION (Fecha y Hora)", "EMISION", "emision", "Emision", "emision."]),
        status: getVal(["STATUS", "status", "Status"]) || "Pendiente de Firma",
        comentario: getVal(["COMENTARIO", "comentario", "Comentario", "Comment"]),
        createdAt: new Date().toISOString()
      };

      await createRecord(newRecordData);
      count++;
    }

    return { success: true, count };
  } catch (err) {
    console.error("Excel Client Import Error:", err);
    throw err;
  }
}

/**
 * Client-Side Excel Export from Firestore records.
 */
export function exportExcel(records: OperationRecord[]) {
  const excelRows = records.map((r) => ({
    "ID OPERACION": r.id,
    "TEAM": r.team,
    "PROYECTO": r.proyecto,
    "DPTO.": r.dpto,
    "ESTAC.": r.estac,
    "DEP.": r.dep,
    "ASESOR": r.asesor,
    "TIPO": r.tipo,
    "SOLICITUD (Fecha y Hora)": r.solicitud,
    "EMISION (Fecha y Hora)": r.emision,
    "STATUS ACTUAL": r.status,
    "COMENTARIO ACTUAL": r.comentario,
    "ASISTENTE DERIVADO": r.derivadoA || "",
    "RESPONSABLE ULTIMA ACCION": r.updatedByUser || "",
    "TOTAL ACCIONES HISTORICAS": (r.history && r.history.length) || 0
  }));

  const historyRows: any[] = [];
  records.forEach((r) => {
    if (r.history && r.history.length > 0) {
      r.history.forEach((h, idx) => {
        const isObs = h.status === "Observado / Rechazado" || h.status?.toLowerCase().includes("observad") || h.comentario?.toLowerCase().includes("[observación]");
        const isMod = h.status === "Modificado" || h.comentario?.toLowerCase().includes("[modificación]");
        
        historyRows.push({
          "NRO. ACCION": idx + 1,
          "ID OPERACION": r.id,
          "PROYECTO": r.proyecto,
          "TEAM": r.team,
          "ASESOR": r.asesor,
          "TIPO DE ACCION": isObs ? "OBSERVADO" : isMod ? "MODIFICADO" : "ACCION / EMISION",
          "ESTADO REGISTRADO": h.status,
          "COMENTARIO / OBSERVACION": h.comentario,
          "USUARIO REGISTRO": h.user,
          "FECHA REGISTRO": h.timestamp
        });
      });
    } else {
      historyRows.push({
        "NRO. ACCION": 1,
        "ID OPERACION": r.id,
        "PROYECTO": r.proyecto,
        "TEAM": r.team,
        "ASESOR": r.asesor,
        "TIPO DE ACCION": "REGISTRO INICIAL",
        "ESTADO REGISTRADO": r.status || "Pendiente",
        "COMENTARIO / OBSERVACION": r.comentario || "Registro inicial",
        "USUARIO REGISTRO": r.updatedByUser || "Sistema",
        "FECHA REGISTRO": r.solicitud || r.createdAt
      });
    }
  });

  const wb = XLSX.utils.book_new();
  const wsOps = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, wsOps, "OPERACIONES");

  const wsHist = XLSX.utils.json_to_sheet(historyRows);
  XLSX.utils.book_append_sheet(wb, wsHist, "HISTORIAL_ACCIONES");
  
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Excelencia_Operacional_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
