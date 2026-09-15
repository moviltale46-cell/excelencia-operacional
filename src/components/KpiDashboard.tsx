import React, { useState } from "react";
import { AppSettings, OperationRecord, STANDARD_OBSERVATIONS, STANDARD_OTHER_AREAS_OBSERVATIONS, getActiveObservationReasons, UserAccount } from "../types";
import { 
  BarChart3, TrendingUp, Clock, AlertTriangle, FileText, CheckCircle2, 
  User, Users, ShieldAlert, Calendar, List, Edit3, ShieldCheck, 
  Eye, History, ChevronRight, ChevronDown, ChevronUp, CheckSquare, XCircle, PieChart, Layers,
  Activity, HelpCircle, ArrowRight, ExternalLink, Filter, Search, X
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import StatusHistoryModal from "./StatusHistoryModal";
import DailyObservationsControlChart from "./DailyObservationsControlChart";
import { 
  safeParseDate, 
  safeGetTime, 
  formatHoursHHMM, 
  isOtherAreasObservation, 
  isInitialHistoryEntry,
  resolveRecordActionInRange,
  isCierreCompletoStatus,
  isObservadoStatus 
} from "../utils/dateUtils";
import { calculateBusinessTime, calculateOperationTimeBreakdown } from "../utils/workingHours";

interface KpiDashboardProps {
  records: OperationRecord[];
  statusColors?: Record<string, string>;
  settings?: AppSettings;
  currentUser?: UserAccount | null;
}

// Fixed Holidays in Peru (including 2025-2027 specific variable Easter dates)
function isPeruHoliday(date: Date): boolean {
  const month = date.getMonth() + 1; // 1-indexed (1 = Jan, 12 = Dec)
  const day = date.getDate();
  const year = date.getFullYear();

  // Fixed Holidays in Peru
  if (month === 1 && day === 1) return true;   // Año Nuevo
  if (month === 5 && day === 1) return true;   // Día del Trabajo
  if (month === 6 && day === 7) return true;   // Batalla de Arica / Día de la Bandera
  if (month === 6 && day === 29) return true;  // San Pedro y San Pablo
  if (month === 7 && day === 23) return true;  // Día de la Fuerza Aérea
  if (month === 7 && day === 28) return true;  // Fiestas Patrias
  if (month === 7 && day === 29) return true;  // Fiestas Patrias
  if (month === 8 && day === 6) return true;   // Batalla de Junín
  if (month === 8 && day === 30) return true;  // Santa Rosa de Lima
  if (month === 10 && day === 8) return true;  // Combate de Angamos
  if (month === 11 && day === 1) return true;  // Todos los Santos
  if (month === 12 && day === 8) return true;  // Inmaculada Concepción
  if (month === 12 && day === 9) return true;  // Batalla de Ayacucho
  if (month === 12 && day === 25) return true; // Navidad

  // Movable Easter Holidays in Peru (Jueves Santo and Viernes Santo)
  // 2025: Jueves Santo (Apr 17), Viernes Santo (Apr 18)
  if (year === 2025 && month === 4 && (day === 17 || day === 18)) return true;
  // 2026: Jueves Santo (Apr 2), Viernes Santo (Apr 3)
  if (year === 2026 && month === 4 && (day === 2 || day === 3)) return true;
  // 2027: Jueves Santo (Mar 25), Viernes Santo (Mar 26)
  if (year === 2027 && month === 3 && (day === 25 || day === 26)) return true;

  return false;
}

// Precise business hours difference calculator using business schedule
function getWorkingHoursDiff(startStr: string, endStr: string, schedule?: any): number {
  if (!startStr || !endStr) return 0;
  const res = calculateBusinessTime(startStr, endStr, schedule);
  return res.totalHours;
}

// Find first actual response or action taken by legal staff in history (excluding initial request entry)
function getFirstActionTime(record: OperationRecord, specificActor?: string): string | null {
  if (record.history && record.history.length > 0) {
    const normActor = specificActor ? specificActor.toLowerCase().trim() : null;

    const actionEntries = record.history.filter(h => {
      if (!h.timestamp) return false;
      if (isInitialHistoryEntry(h, record.solicitud)) return false;

      // If a specific actor is provided, check if user matches
      if (normActor) {
        const u = (h.user || "").toLowerCase().trim();
        if (!u.includes(normActor) && !normActor.includes(u)) {
          return false;
        }
      }
      return true;
    });

    if (actionEntries.length > 0) {
      const sorted = [...actionEntries]
        .map(h => ({ ...h, parsedDate: safeParseDate(h.timestamp) }))
        .filter(h => h.parsedDate !== null)
        .sort((a, b) => a.parsedDate!.getTime() - b.parsedDate!.getTime());
      
      if (sorted.length > 0 && sorted[0].timestamp) {
        return sorted[0].timestamp;
      }
    }
  }

  // Fallback to emittedAt or emision if emitted
  return record.emittedAt || record.emision || null;
}

interface AdvisorMetric {
  name: string;
  team: string;
  totalOps: number;
  observedCount: number; // Columna 1: Observado (errores, rechazos, documentación incompleta del Asesor)
  modifiedCount: number; // Columna 2: Modificado (cambios, reajustes, correcciones)
  otherAreasObsCount: number; // Columna 3: Observaciones de otras áreas (NO afecta al asesor)
  totalIncidents: number; // Total toques/errores del Asesor = observedCount + modifiedCount
  affectedOps: number;
  errorRate: number; // % of operations with incidents (observedCount / totalOps * 100)
}

export default function KpiDashboard({ records, statusColors, settings, currentUser }: KpiDashboardProps) {
  const [selectedProject, setSelectedProject] = useState<string>("All");
  const [selectedTeam, setSelectedTeam] = useState<string>("All");
  const [selectedAssistant, setSelectedAssistant] = useState<string>("All");
  const [activeKpiFilter, setActiveKpiFilter] = useState<"all" | "pending" | "approved" | "observed" | "modified" | "tipo_emision" | "tipo_modificacion" | "tipo_adenda">("all");
  const [filterAdvisorName, setFilterAdvisorName] = useState<string | null>(null);
  const [filterObservationReason, setFilterObservationReason] = useState<string | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<OperationRecord | null>(null);
  const [showOnlyMyRegistrations, setShowOnlyMyRegistrations] = useState<boolean>(false);

  // Date Range Filters (Image 8: debajo de Filtros Avanzados KPI)
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  // Checkboxes for inclusion (Image 8: Incluir emisiones y/o cambios de status, multi-select status filters)
  const [includeEmisiones, setIncludeEmisiones] = useState<boolean>(true);
  const [includeStatusChanges, setIncludeStatusChanges] = useState<boolean>(true);
  const [onlyCierresCompletos, setOnlyCierresCompletos] = useState<boolean>(false);
  const [onlyObservados, setOnlyObservados] = useState<boolean>(false);
  const [onlyObservadasOtrasAreas, setOnlyObservadasOtrasAreas] = useState<boolean>(false);

  // Collapsible state for Expedientes Detallados list (Image 5)
  const [isDetailedListExpanded, setIsDetailedListExpanded] = useState<boolean>(false);

  // Modal and filter states for Jefe Legal Actions & Assistant Support (Images 5 & 6)
  const [jefeDetailModalOpen, setJefeDetailModalOpen] = useState<boolean>(false);
  const [jefeModalFilterAssistant, setJefeModalFilterAssistant] = useState<string>("All");
  const [jefeModalFilterDate, setJefeModalFilterDate] = useState<string>("All");
  const [jefeModalSearchQuery, setJefeModalSearchQuery] = useState<string>("");

  // Helper to normalize request type
  const normalizeTipo = (t?: string) => {
    const s = (t || "").toUpperCase();
    if (s.includes("EMISI")) return "EMISION";
    if (s.includes("MODIFIC")) return "MODIFICACION";
    if (s.includes("ADENDA")) return "ADENDA";
    return "OTROS";
  };

  // Helper to identify if a record was emitted or handled by a Jefe Legal
  const getJefeLegalActor = (r: OperationRecord): string | null => {
    const jefeUsers = (settings?.users || []).filter(u => u.role === "Jefe Legal");
    const jefeNames = jefeUsers.map(u => (u.username || "").toLowerCase());
    if (currentUser?.role === "Jefe Legal") {
      const cName = (currentUser.username || "").toLowerCase();
      if (cName && !jefeNames.includes(cName)) jefeNames.push(cName);
    }
    // Also include Marilyn Saona
    if (!jefeNames.includes("marilyn saona")) jefeNames.push("marilyn saona");
    if (!jefeNames.includes("marilyn")) jefeNames.push("marilyn");

    const updatedBy = (r.updatedByUser || "").toLowerCase();
    const derivadoLower = (r.derivadoA || "").toLowerCase();

    // 1. Is derivadoA explicitly a Jefe Legal?
    if (derivadoLower && jefeNames.includes(derivadoLower)) {
      const matched = jefeUsers.find(u => (u.username || "").toLowerCase() === derivadoLower)?.username || r.derivadoA;
      return `${matched} (Jefe Legal)`;
    }

    // 2. Was it emitted or closed by a Jefe Legal?
    const isEmitted = !!r.emittedAt || !!r.emision;
    if (isEmitted && updatedBy && jefeNames.includes(updatedBy)) {
      const matched = jefeUsers.find(u => (u.username || "").toLowerCase() === updatedBy)?.username || r.updatedByUser;
      return `${matched} (Jefe Legal)`;
    }

    // 3. Check history for action / emission by Jefe Legal
    if (r.history && r.history.length > 0) {
      const histJefe = r.history.find(h => {
        const u = (h.user || "").toLowerCase();
        return jefeNames.some(jn => u.includes(jn) || jn.includes(u)) && (h.status ? (!h.status.toLowerCase().includes("pendiente") && !h.status.toLowerCase().includes("observad")) : true);
      });
      if (histJefe) {
        const matched = jefeUsers.find(u => (u.username || "").toLowerCase() === (histJefe.user || "").toLowerCase())?.username || histJefe.user;
        return `${matched} (Jefe Legal)`;
      }
    }

    // 4. Registered by Jefe Legal with emission
    if (isEmitted && r.comentario?.toLowerCase().includes("jefe legal")) {
      const defaultJefe = jefeUsers[0]?.username || currentUser?.username || "Marilyn Saona";
      return `${defaultJefe} (Jefe Legal)`;
    }

    return null;
  };

  // Helper to normalize project display
  const normalizeProjectName = (p?: string): string => {
    if (!p) return "Lima 41";
    if (p === "PRO000029" || p.trim() === "") return "Lima 41";
    return p;
  };

  // Helper to normalize team display
  const normalizeTeamName = (t?: string, asesor?: string): string => {
    if (t === "EQ000001") return "FRANCISCO";
    if (t === "EQ000002") return "JHAZMIN";
    if (t === "EQ000003") return "NINOSKA";
    if (t === "EQ000004" || (asesor && asesor.toUpperCase().includes("PAULA CASAS"))) return "TEAM PAULA";
    return t || "FRANCISCO";
  };

  // Extract unique filter dropdown values (including Jefe Legal in legal actor filter)
  const uniqueProjects = Array.from(new Set(records.map(r => normalizeProjectName(r.proyecto)).filter(Boolean))).sort();
  if (!uniqueProjects.includes("Lima 41")) uniqueProjects.unshift("Lima 41");

  const uniqueTeams = Array.from(new Set(records.map(r => normalizeTeamName(r.team, r.asesor)).filter(Boolean))).sort();
  if (!uniqueTeams.includes("FRANCISCO")) uniqueTeams.unshift("FRANCISCO");
  if (!uniqueTeams.includes("TEAM PAULA")) uniqueTeams.push("TEAM PAULA");
  
  const jefeUsersList = (settings?.users || []).filter(u => u.role === "Jefe Legal" && u.active);
  const jefeLabels = jefeUsersList.map(u => `${u.username} (Jefe Legal)`);
  if (currentUser?.role === "Jefe Legal" && currentUser.username) {
    const myLabel = `${currentUser.username} (Jefe Legal)`;
    if (!jefeLabels.includes(myLabel)) jefeLabels.push(myLabel);
  }
  if (!jefeLabels.some(l => l.toLowerCase().includes("marilyn"))) {
    jefeLabels.push("Marilyn Saona (Jefe Legal)");
  }

  const uniqueAssistants = Array.from(new Set([
    ...records.map(r => r.derivadoA).filter(Boolean),
    ...((settings?.users || []).filter(u => u.role === "Asistente Legal" && u.active).map(u => u.username)),
    ...jefeLabels
  ])).sort() as string[];

  // Helper to detect if a record belongs to the Agentes team (isolated from Jefe de Ventas)
  const isAgenteRecord = (r: OperationRecord): boolean => {
    const t = (r.team || "").toUpperCase().trim();
    if (t.includes("AGENTE")) return true;
    if (currentUser?.role === "Jefe de Agentes") {
      const myAdvisors = (currentUser.assignedAdvisors || []).map(a => a.toLowerCase().trim());
      if (r.asesor && myAdvisors.includes(r.asesor.toLowerCase().trim())) return true;
    }
    return false;
  };

  // Helper to detect if a record belongs to TEAM PAULA (Paula Casas can have sales across multiple projects, isolated from other Jefes de Ventas)
  const isPaulaRecord = (r: OperationRecord): boolean => {
    const t = (r.team || "").toUpperCase().trim();
    const a = (r.asesor || "").toUpperCase().trim();
    return t.includes("PAULA") || a.includes("PAULA CASAS") || t === "EQ000004" || a === "ASE000028";
  };

  // Helper to check if a specific timestamp or date falls within the selected range
  const isDateWithinRange = (dateCandidate?: string | Date | null): boolean => {
    if (!startDate && !endDate) return true;
    if (!dateCandidate) return false;
    const d = safeParseDate(dateCandidate);
    if (!d) return false;
    if (startDate) {
      const [sYear, sMonth, sDay] = startDate.split("-").map(Number);
      const startBoundary = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
      if (d.getTime() < startBoundary.getTime()) return false;
    }
    if (endDate) {
      const [eYear, eMonth, eDay] = endDate.split("-").map(Number);
      const endBoundary = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
      if (d.getTime() > endBoundary.getTime()) return false;
    }
    return true;
  };

  // Helper to check if a record falls within the selected date range filter considering inclusion and status filters
  const isDateInRange = (r: OperationRecord): boolean => {
    const res = resolveRecordActionInRange(
      r,
      startDate,
      endDate,
      includeEmisiones,
      includeStatusChanges,
      onlyCierresCompletos,
      onlyObservados,
      onlyObservadasOtrasAreas
    );
    return res.inRange;
  };

  // Filter records based on active dropdowns, role-based KPI isolation and date range
  const filteredRecords = records.filter(r => {
    // KPI Isolation Rule for Jefe de Ventas:
    if (currentUser?.role === "Jefe de Ventas") {
      const isMePaula = (currentUser.username || "").toLowerCase().includes("paula");
      if (isMePaula) {
        // Paula Casas sees her operations (TEAM PAULA) across any project without restriction
        if (!isPaulaRecord(r)) return false;
      } else {
        // Other Jefes de Ventas (Francisco, Jhazmin, Ninoska) do NOT sum Paula's operations nor Agente operations
        if (isAgenteRecord(r) || isPaulaRecord(r)) return false;
      }
    }
    // If logged in as Jefe de Agentes, they see their own team's isolated KPIs
    if (currentUser?.role === "Jefe de Agentes") {
      if (!isAgenteRecord(r)) return false;
    }

    const recProj = normalizeProjectName(r.proyecto);
    const projMatch = selectedProject === "All" || recProj === selectedProject;

    const recTeam = normalizeTeamName(r.team, r.asesor);
    const teamMatch = selectedTeam === "All" || recTeam === selectedTeam;
    
    let assistantMatch = selectedAssistant === "All";
    if (!assistantMatch) {
      if (selectedAssistant.includes("(Jefe Legal)")) {
        const rawJefeName = selectedAssistant.replace(" (Jefe Legal)", "").toLowerCase();
        const actor = getJefeLegalActor(r);
        const matchActor = actor === selectedAssistant;
        const matchDerivado = (r.derivadoA || "").toLowerCase() === rawJefeName;
        const matchUpdated = (r.updatedByUser || "").toLowerCase() === rawJefeName;
        assistantMatch = matchActor || matchDerivado || matchUpdated;
      } else {
        assistantMatch = r.derivadoA === selectedAssistant;
      }
    }

    let recAsesor = (r.asesor || "").trim();
    if (recAsesor === "ASE000010") recAsesor = "DERVIS PIÑA";
    if (recAsesor === "ASE000028") recAsesor = "PAULA CASAS";
    const advisorMatch = !filterAdvisorName || recAsesor === filterAdvisorName;
    const dateMatch = isDateInRange(r);
    return projMatch && teamMatch && assistantMatch && advisorMatch && dateMatch;
  });

  // Identify records registered by current user (Jefe Legal)
  const isJefeLegal = currentUser?.role === "Jefe Legal";
  const myName = (currentUser?.username || "").toLowerCase();

  const myRegisteredRecords = filteredRecords.filter(r => {
    const updatedByMe = (r.updatedByUser || "").toLowerCase() === myName;
    const createdByMe = (r.comentario || "").toLowerCase().includes(myName);
    const inHistoryByMe = r.history?.some(h => (h.user || "").toLowerCase() === myName);
    return updatedByMe || createdByMe || inHistoryByMe;
  });

  const baseTypeRecords = (isJefeLegal && showOnlyMyRegistrations) ? myRegisteredRecords : filteredRecords;

  const typeCounts = {
    emision: baseTypeRecords.filter(r => normalizeTipo(r.tipo) === "EMISION").length,
    modificacion: baseTypeRecords.filter(r => normalizeTipo(r.tipo) === "MODIFICACION").length,
    adenda: baseTypeRecords.filter(r => normalizeTipo(r.tipo) === "ADENDA").length,
    otros: baseTypeRecords.filter(r => normalizeTipo(r.tipo) === "OTROS").length,
    total: baseTypeRecords.length
  };

  const isPendingEmissionRecord = (r: OperationRecord) => {
    const isEmission = normalizeTipo(r.tipo) === "EMISION";
    if (!isEmission) return false;
    const s = (r.status || "").toLowerCase().trim();
    if (s.includes("observad") || s.includes("rechazad") || s.includes("aprobad") || s.includes("cierre") || s.includes("desistido") || s.includes("emitid") || s.includes("entregad")) {
      return false;
    }
    return s.includes("pendiente") || s.includes("revis") || s === "" || s === "borrador" || !r.emision;
  };

  const totalRecords = filteredRecords.length;
  const pendingCount = filteredRecords.filter(isPendingEmissionRecord).length;
  const approvedCount = filteredRecords.filter(r => r.status === "Aprobado para Emisión" || r.status === "Cierre Completo").length;
  
  // Count records with observations vs modifications
  const isObservedRecord = (r: OperationRecord) => {
    if (isOtherAreasObservation(r)) return false;
    const isCur = (r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observad") || r.status?.toLowerCase().includes("rechazad")) && !isOtherAreasObservation(r);
    const hasHist = r.history?.some(h => !isOtherAreasObservation(h) && ((h.status && (h.status.toLowerCase().includes("observad") || h.status.toLowerCase().includes("rechazad"))) || (h.comentario && h.comentario.toLowerCase().includes("[observación]"))));
    return isCur || Boolean(hasHist);
  };

  const isOtherAreasRecord = (r: OperationRecord) => {
    if (isOtherAreasObservation(r)) return true;
    return Boolean(r.history?.some(h => isOtherAreasObservation(h)));
  };

  const isModifiedRecord = (r: OperationRecord) => {
    const isCur = r.status === "Modificado" || r.status?.toLowerCase().includes("modificad");
    const hasHist = r.history?.some(h => (h.status && h.status.toLowerCase().includes("modificad")) || (h.comentario && (h.comentario.toLowerCase().includes("[modificación]") || h.comentario.toLowerCase().includes("se actualizaron"))));
    return isCur || Boolean(hasHist);
  };

  const observedCount = filteredRecords.filter(isObservedRecord).length;
  const otherAreasCount = filteredRecords.filter(isOtherAreasRecord).length;
  const modifiedCount = filteredRecords.filter(isModifiedRecord).length;

  // Helper to match an observation reason against record comments & history
  const matchesObservationReason = (r: OperationRecord, reason: string): boolean => {
    const commentsList: string[] = [];
    if (r.comentario) commentsList.push(r.comentario);
    if (r.history && r.history.length > 0) {
      r.history.forEach(h => {
        if (h.comentario) commentsList.push(h.comentario);
      });
    }
    const fullText = commentsList.join(" | ").toLowerCase();
    const cleanReason = reason.replace(".", "").toLowerCase();

    if (fullText.includes(cleanReason)) return true;
    if (reason.startsWith("Falta Documento") && (fullText.includes("documento de identidad") || fullText.includes("falta dni") || fullText.includes("documento ident"))) return true;
    if (reason.startsWith("Falta contrato") && (fullText.includes("contrato de separación") || fullText.includes("contrato de separacion") || fullText.includes("contrato firmado"))) return true;
    if (reason.startsWith("No completó la DJ") && (fullText.includes("dj con estado civil") || fullText.includes("declaración jurada") || fullText.includes("declaracion jurada") || fullText.includes("dj incompleta"))) return true;
    if (reason.startsWith("Falta voucher") && (fullText.includes("voucher") || fullText.includes("voucher de separación") || fullText.includes("voucher separacion"))) return true;
    if (reason.startsWith("Error en el cronograma") && (fullText.includes("cronograma") || fullText.includes("error cronograma"))) return true;
    if (reason.startsWith("Faltan documentos adicionales") && (fullText.includes("documentos adicionales") || fullText.includes("documento adicional"))) return true;
    if (reason.startsWith("Falta Precalificación") && (fullText.includes("precalificación") || fullText.includes("precalificacion") || fullText.includes("carta de aprobación") || fullText.includes("carta de aprobacion"))) return true;
    if (reason.startsWith("No indicó el banco") && (fullText.includes("banco que otorgará") || fullText.includes("crédito hipotecario") || fullText.includes("credito hipotecario") || fullText.includes("no indico banco"))) return true;
    if (reason.startsWith("Dirección Incompleta") && (fullText.includes("dirección incompleta") || fullText.includes("direccion incompleta"))) return true;
    if (reason.startsWith("Observación de Créditos") && (fullText.includes("créditos") || fullText.includes("creditos"))) return true;
    if (reason.startsWith("Observación de Cobranzas") && (fullText.includes("cobranzas") || fullText.includes("voucher") || fullText.includes("pago"))) return true;
    if (reason.startsWith("Observación de Operaciones") && (fullText.includes("operaciones") || fullText.includes("plano") || fullText.includes("memoria"))) return true;
    if (reason.startsWith("Observación de Arquitectura") && (fullText.includes("arquitectura") || fullText.includes("diseño") || fullText.includes("diseno"))) return true;
    if (reason.startsWith("Observación de Post-Venta") && (fullText.includes("post-venta") || fullText.includes("postventa"))) return true;
    if (reason.startsWith("Observaciones de otras áreas") && (fullText.includes("otras áreas") || fullText.includes("otras areas") || isOtherAreasObservation(r))) return true;
    if (reason === "Otros." && (fullText.includes("otros") || fullText.includes("otro motivo"))) return true;

    return false;
  };

  // Get active observation reasons (both legal and other areas)
  const allActiveReasons = Array.from(new Set([
    ...STANDARD_OBSERVATIONS,
    ...STANDARD_OTHER_AREAS_OBSERVATIONS,
    ...getActiveObservationReasons(settings)
  ]));

  // Calculate observation counts across all filtered records
  const observationReasonCounts: { [reason: string]: number } = {};
  allActiveReasons.forEach(reason => {
    observationReasonCounts[reason] = 0;
  });

  filteredRecords.forEach(r => {
    allActiveReasons.forEach(reason => {
      if (matchesObservationReason(r, reason)) {
        observationReasonCounts[reason] += 1;
      }
    });
  });

  const totalObservationReasonHits = Object.values(observationReasonCounts).reduce((a, b) => a + b, 0);

  const sortedObservationReasons = allActiveReasons.map(reason => ({
    reason,
    count: observationReasonCounts[reason] || 0,
    percentage: totalObservationReasonHits > 0 ? Math.round(((observationReasonCounts[reason] || 0) / totalObservationReasonHits) * 100) : 0,
    isOtherAreas: STANDARD_OTHER_AREAS_OBSERVATIONS.includes(reason as any) || reason.toLowerCase().includes("otras áreas") || reason.toLowerCase().includes("otras areas")
  })).sort((a, b) => b.count - a.count);

  // Calculate working minutes response times using unified cumulative calculation
  // (Excludes time while closed when re-opened, excludes time while observed)
  const workingMinutesList: number[] = [];
  const workingHoursList: number[] = [];

  filteredRecords.forEach(r => {
    const breakdown = calculateOperationTimeBreakdown(r, settings?.workingSchedule);
    if (breakdown.legalMinutes > 0) {
      workingHoursList.push(breakdown.legalHours);
      workingMinutesList.push(breakdown.legalMinutes);
    }
  });

  const avgWorkingResponseMinutes = workingMinutesList.length > 0
    ? Math.round(workingMinutesList.reduce((a, b) => a + b, 0) / workingMinutesList.length)
    : 0;

  const avgWorkingResponseHrs = workingHoursList.length > 0
    ? (workingHoursList.reduce((a, b) => a + b, 0) / workingHoursList.length).toFixed(1)
    : "0.0";

  // Calculate Advisor Response Time (Cumulative minutes during observations affecting advisor)
  // Stops when observation is lifted ("se levantó la observación"). Observaciones de otras áreas no penalizan al asesor.
  const advisorResponseMinutesList: number[] = [];
  filteredRecords.forEach(r => {
    const breakdown = calculateOperationTimeBreakdown(r, settings?.workingSchedule);
    if (breakdown.advisorMinutes > 0) {
      advisorResponseMinutesList.push(breakdown.advisorMinutes);
    }
  });

  const avgAdvisorResponseMinutes = advisorResponseMinutesList.length > 0
    ? Math.round(advisorResponseMinutesList.reduce((a, b) => a + b, 0) / advisorResponseMinutesList.length)
    : 0;

  // Calculate detailed advisor metrics distinguishing OBSERVADO vs MODIFICADO vs OTRAS ÁREAS
  const advisorMap: { [key: string]: AdvisorMetric } = {};

  filteredRecords.forEach(r => {
    let advName = (r.asesor || "").trim() || "Sin Asesor Asignado";
    if (advName === "ASE000010") advName = "DERVIS PIÑA";
    if (advName === "ASE000028") advName = "PAULA CASAS";

    const teamNormalized = normalizeTeamName(r.team, r.asesor);

    if (!advisorMap[advName]) {
      advisorMap[advName] = {
        name: advName,
        team: teamNormalized,
        totalOps: 0,
        observedCount: 0,
        modifiedCount: 0,
        otherAreasObsCount: 0,
        totalIncidents: 0,
        affectedOps: 0,
        errorRate: 0
      };
    }

    advisorMap[advName].totalOps += 1;

    let obsInRec = 0;
    let modInRec = 0;
    let otherAreasObsInRec = 0;

    if (r.history && r.history.length > 0) {
      r.history.forEach(h => {
        const hIsOther = isOtherAreasObservation(h);
        const hIsObs = !hIsOther && (
          (h.status && (h.status.toLowerCase().includes("observad") || h.status.toLowerCase().includes("rechazad"))) ||
          (h.comentario && h.comentario.toLowerCase().includes("[observación]"))
        );
        const hIsMod = (h.status && h.status.toLowerCase().includes("modificad")) ||
                       (h.comentario && (h.comentario.toLowerCase().includes("[modificación]") || h.comentario.toLowerCase().includes("se actualizaron")));
        
        if (hIsOther) otherAreasObsInRec++;
        else if (hIsObs) obsInRec++;
        else if (hIsMod) modInRec++;
      });
    }

    // Check current status if history doesn't capture it
    const isCurOther = isOtherAreasObservation(r);
    const isCurObs = !isCurOther && (r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observad") || r.status?.toLowerCase().includes("rechazad"));
    const isCurMod = r.status === "Modificado" || r.status?.toLowerCase().includes("modificad");

    if (otherAreasObsInRec === 0 && isCurOther) otherAreasObsInRec = 1;
    if (obsInRec === 0 && isCurObs) obsInRec = 1;
    if (modInRec === 0 && isCurMod) modInRec = 1;

    advisorMap[advName].observedCount += obsInRec;
    advisorMap[advName].modifiedCount += modInRec;
    advisorMap[advName].otherAreasObsCount += otherAreasObsInRec;
    // Incidents strictly measures advisor errors/modifications (does not penalize for other areas)
    advisorMap[advName].totalIncidents += (obsInRec + modInRec);

    if (obsInRec > 0 || modInRec > 0) {
      advisorMap[advName].affectedOps += 1;
    }
  });

  // Ensure Paula Casas appears in advisor table if not filtered to another Jefe de Ventas
  const isOtherJefeDeVentas = currentUser?.role === "Jefe de Ventas" && !(currentUser.username || "").toLowerCase().includes("paula");
  if (!isOtherJefeDeVentas && !advisorMap["PAULA CASAS"]) {
    advisorMap["PAULA CASAS"] = {
      name: "PAULA CASAS",
      team: "TEAM PAULA",
      totalOps: 0,
      observedCount: 0,
      modifiedCount: 0,
      otherAreasObsCount: 0,
      totalIncidents: 0,
      affectedOps: 0,
      errorRate: 0
    };
  }

  Object.values(advisorMap).forEach(adv => {
    // User requirement: Tasa de Incidencia percentage is calculated strictly as observations over total operations (operaciones totales entre observaciones)
    adv.errorRate = adv.totalOps > 0 ? Math.min(100, Math.round((adv.observedCount / adv.totalOps) * 100)) : 0;
  });

  // Sort advisors by most observations first, then error rate, then total incidents
  const sortedAdvisorMetrics = Object.values(advisorMap).sort((a, b) => {
    if (b.observedCount !== a.observedCount) return b.observedCount - a.observedCount;
    if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
    if (b.totalIncidents !== a.totalIncidents) return b.totalIncidents - a.totalIncidents;
    return b.totalOps - a.totalOps;
  });

  // Group Observations and Modifications by Team
  const teamMetrics: { [key: string]: { observed: number; modified: number; totalOps: number } } = {};
  filteredRecords.forEach(r => {
    const t = normalizeTeamName(r.team, r.asesor);
    if (!teamMetrics[t]) {
      teamMetrics[t] = { observed: 0, modified: 0, totalOps: 0 };
    }
    teamMetrics[t].totalOps += 1;
    if (isObservedRecord(r)) teamMetrics[t].observed += 1;
    if (isModifiedRecord(r)) teamMetrics[t].modified += 1;
  });

  // Ensure TEAM PAULA is represented in team metrics
  if (!isOtherJefeDeVentas && !teamMetrics["TEAM PAULA"]) {
    teamMetrics["TEAM PAULA"] = { observed: 0, modified: 0, totalOps: 0 };
  }

  // Calculate response times per Legal Actor (Legal Assistants & Jefe Legal) using configured business working hours
  const assistantResponseTimes: { [key: string]: { totalMins: number; totalHrs: number; count: number; isJefe?: boolean } } = {};
  filteredRecords.forEach(r => {
    const startTime = r.solicitudAt || r.solicitud || r.createdAt;
    if (!startTime) return;

    // Collect all actors involved in this record
    const recordActors = new Set<string>();
    
    // 1. Assigned assistant
    if (r.derivadoA && r.derivadoA.trim()) {
      recordActors.add(r.derivadoA.trim());
    }

    // 2. Jefe Legal actor
    const jefeActor = getJefeLegalActor(r);
    if (jefeActor) {
      recordActors.add(jefeActor);
    }

    // 3. Assistants who took action in history
    const legalUsers = (settings?.users || []).filter(u => u.role === "Asistente Legal");
    if (r.history && r.history.length > 0) {
      r.history.forEach(h => {
        if (!h.user || isInitialHistoryEntry(h, r.solicitud)) return;
        const normUser = h.user.trim().toLowerCase();
        const matched = legalUsers.find(u => u.username.toLowerCase() === normUser);
        if (matched) {
          recordActors.add(matched.username);
        } else if (normUser.includes("franco") || normUser.includes("daniel") || normUser.includes("sthief") || normUser.includes("odar")) {
          recordActors.add(h.user.trim());
        }
      });
    }

    // 4. updatedByUser if it is an assistant
    if (r.updatedByUser) {
      const matched = legalUsers.find(u => u.username.toLowerCase() === r.updatedByUser!.trim().toLowerCase());
      if (matched) {
        recordActors.add(matched.username);
      }
    }

    // Calculate response time for each identified actor
    recordActors.forEach(actor => {
      const isJefe = actor.includes("(Jefe Legal)");
      const rawName = isJefe ? actor.replace(" (Jefe Legal)", "").trim() : actor;

      // Find first actual action by this actor, or fallback to first legal action or emission
      const actionTime = getFirstActionTime(r, rawName) || 
                         (r.derivadoA?.toLowerCase() === rawName.toLowerCase() ? getFirstActionTime(r) : null) ||
                         r.emittedAt || r.emision;

      // Use unified cumulative legal breakdown to exclude closed pause and observation intervals
      const breakdown = calculateOperationTimeBreakdown(r, settings?.workingSchedule);
      if (breakdown.legalMinutes > 0 || actionTime) {
        const minsToAdd = breakdown.legalMinutes > 0 ? breakdown.legalMinutes : Math.round(calculateBusinessTime(startTime, actionTime, settings?.workingSchedule).totalMinutes);
        const hoursToAdd = Number((minsToAdd / 60).toFixed(2));

        if (minsToAdd >= 0) {
          if (!assistantResponseTimes[actor]) {
            assistantResponseTimes[actor] = { totalMins: 0, totalHrs: 0, count: 0, isJefe };
          }
          assistantResponseTimes[actor].totalHrs += hoursToAdd;
          assistantResponseTimes[actor].totalMins += minsToAdd;
          assistantResponseTimes[actor].count += 1;
        }
      }
    });
  });

  // --- JEFE LEGAL OPERATIONAL ACTIONS & ASSISTANT SUPPORT (Image 5 & 6) ---
  interface JefeActionItem {
    id: string;
    opId: string;
    user: string;
    date: string; // DD/MM/YYYY
    timestamp: string;
    status: string;
    comentario: string;
    assistantHelped: string;
    proyecto: string;
    dpto: string;
    asesor: string;
    team: string;
    record: OperationRecord;
  }

  const jefeActionsList: JefeActionItem[] = [];
  const dailyIngresosMap: { [date: string]: number } = {};

  records.forEach(r => {
    // 1. Daily Ingresos count
    const rawReq = r.solicitud || r.createdAt || "";
    if (rawReq) {
      let datePart = rawReq.includes(" / ") ? rawReq.split(" / ")[0].trim() : rawReq.split(" ")[0].split("T")[0].trim();
      if (datePart.includes("-")) {
        const parts = datePart.split("-");
        if (parts.length === 3) datePart = `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
      }
      if (datePart && datePart.includes("/")) {
        dailyIngresosMap[datePart] = (dailyIngresosMap[datePart] || 0) + 1;
      }
    }

    const projDisplay = normalizeProjectName(r.proyecto);
    const teamDisplay = normalizeTeamName(r.team, r.asesor);
    let asesorDisplay = (r.asesor || "").trim();
    if (asesorDisplay === "ASE000010") asesorDisplay = "DERVIS PIÑA";
    if (asesorDisplay === "ASE000028") asesorDisplay = "PAULA CASAS";

    // Assistant helped by Jefe Legal
    let asst = (r.derivadoA || "").trim();
    if (!asst || asst === "Sin Asignar") {
      const histAsst = r.history?.find(h => {
        const hu = (h.user || "").toLowerCase();
        return hu.includes("franco") || hu.includes("sthief") || hu.includes("daniel");
      });
      if (histAsst?.user) asst = histAsst.user;
    }
    if (!asst || asst === "Sin Asignar") {
      asst = "Franco Odar"; // Default to primary assistant
    }

    // Actions in history performed by Jefe Legal
    if (Array.isArray(r.history) && r.history.length > 0) {
      r.history.forEach((h, idx) => {
        const hu = (h.user || "").toLowerCase().trim();
        const isJefeAction = jefeLabels.some(l => {
          const lClean = l.replace(" (Jefe Legal)", "").toLowerCase().trim();
          return hu.includes(lClean) || lClean.includes(hu);
        }) || hu.includes("marilyn") || hu.includes("jefe legal");

        if (isJefeAction) {
          // Excluir el registro/ingreso inicial de la operación (Requerimiento Usuario Imagen 1)
          const isInitial = isInitialHistoryEntry(h, r.solicitud) ||
            (h.status || "").toLowerCase().includes("registro") ||
            (h.status || "").toLowerCase().includes("pendiente") ||
            (h.comentario || "").toLowerCase().includes("solicitud registrada") ||
            (h.comentario || "").toLowerCase().includes("registro inicial") ||
            (idx === 0 && ((h.status || "").toLowerCase().includes("pendiente") || (h.status || "").toLowerCase().includes("registro")));
          if (isInitial) {
            return;
          }

          const rawTs = h.timestamp || "";
          let actDate = rawTs.includes(" / ") ? rawTs.split(" / ")[0].trim() : rawTs.split(" ")[0].split("T")[0].trim();
          if (actDate.includes("-")) {
            const parts = actDate.split("-");
            if (parts.length === 3) actDate = `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
          }

          jefeActionsList.push({
            id: `${r.id}-jact-${idx}`,
            opId: r.id,
            user: h.user || "Marilyn Saona",
            date: actDate || "08/09/2026",
            timestamp: h.timestamp || "",
            status: h.status || "Acción Registrada",
            comentario: h.comentario || "",
            assistantHelped: asst,
            proyecto: projDisplay,
            dpto: r.dpto || "-",
            asesor: asesorDisplay || "-",
            team: teamDisplay,
            record: r
          });
        }
      });
    }
  });

  // Assistant Help Summary (A quién ayudó el Jefe Legal)
  const assistantHelpMap: { [asst: string]: { count: number; actions: JefeActionItem[] } } = {};
  jefeActionsList.forEach(act => {
    const asst = act.assistantHelped;
    if (!assistantHelpMap[asst]) {
      assistantHelpMap[asst] = { count: 0, actions: [] };
    }
    assistantHelpMap[asst].count += 1;
    assistantHelpMap[asst].actions.push(act);
  });

  // Chronological Activity Dates
  const allComparisonDates = Array.from(new Set([
    ...Object.keys(dailyIngresosMap),
    ...jefeActionsList.map(a => a.date)
  ])).filter(d => d && d.includes("/")).sort((a, b) => {
    const [dA, mA, yA] = a.split("/").map(Number);
    const [dB, mB, yB] = b.split("/").map(Number);
    return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
  });

  // Filter records for detailed listing at the bottom based on activeKpiFilter selection
  const recordsToDisplay = filteredRecords.filter(r => {
    if (filterObservationReason) {
      if (!matchesObservationReason(r, filterObservationReason)) return false;
    }
    if (activeKpiFilter === "all") return true;
    if (activeKpiFilter === "pending") {
      return isPendingEmissionRecord(r);
    }
    if (activeKpiFilter === "approved") {
      return r.status === "Aprobado para Emisión" || r.status === "Cierre Completo";
    }
    if (activeKpiFilter === "observed") {
      return isObservedRecord(r);
    }
    if (activeKpiFilter === "other_areas") {
      return isOtherAreasRecord(r);
    }
    if (activeKpiFilter === "modified") {
      return isModifiedRecord(r);
    }
    if (activeKpiFilter === "tipo_emision") {
      return normalizeTipo(r.tipo) === "EMISION";
    }
    if (activeKpiFilter === "tipo_modificacion") {
      return normalizeTipo(r.tipo) === "MODIFICACION";
    }
    if (activeKpiFilter === "tipo_adenda") {
      return normalizeTipo(r.tipo) === "ADENDA";
    }
    return true;
  });

  return (
    <div className="space-y-6" id="kpi-dashboard-container">
      
      {/* Role-specific KPI isolation notice banner */}
      {currentUser?.role === "Jefe de Agentes" && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-sm shrink-0">
              JA
            </div>
            <div>
              <h4 className="text-xs font-black text-teal-950 uppercase tracking-wide">
                KPIs Exclusivos de Jefe de Agentes (Team Agentes)
              </h4>
              <p className="text-[11px] text-teal-800 font-medium">
                Métricas independientes de sus asesores a cargo en todos los proyectos inmobiliarios. No interfieren con los Jefes de Ventas.
              </p>
            </div>
          </div>
          <span className="text-[9px] font-extrabold bg-teal-200/80 text-teal-900 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Todos los Proyectos
          </span>
        </div>
      )}

      {currentUser?.role === "Jefe de Ventas" && (
        <div className="bg-indigo-50 border border-indigo-150 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0">
              JV
            </div>
            <div>
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                KPIs de Proyectos Asignados — Jefe de Ventas ({currentUser.username})
              </h4>
              <p className="text-[10px] text-indigo-700 font-medium">
                Las operaciones pertenecientes al Team Agentes están aisladas y no afectan las métricas de sus proyectos.
              </p>
            </div>
          </div>
          <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            KPIs Protegidos
          </span>
        </div>
      )}

      {/* Dynamic Filters Bar */}
      <section className="bg-slate-50 p-4 rounded-2xl border border-blue-50 shadow-xs space-y-3">
        {/* Row 1: Main Dropdowns */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-primary" />
            <span className="font-bold text-xs text-slate-700 uppercase tracking-wide">Filtros Avanzados KPI</span>
            {filterAdvisorName && (
              <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                Asesor: {filterAdvisorName}
                <button 
                  onClick={() => setFilterAdvisorName(null)}
                  className="hover:text-rose-950 font-black cursor-pointer ml-1"
                  title="Limpiar filtro de asesor"
                >
                  ×
                </button>
              </span>
            )}
            {filterObservationReason && (
              <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                Motivo: {filterObservationReason}
                <button 
                  onClick={() => setFilterObservationReason(null)}
                  className="hover:text-rose-950 font-black cursor-pointer ml-1"
                  title="Limpiar filtro de motivo"
                >
                  ×
                </button>
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Project select */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold text-[10px] uppercase">Proyecto:</span>
              <SearchableSelect
                value={selectedProject}
                onChange={(val) => {
                  setSelectedProject(val);
                  setActiveKpiFilter("all");
                }}
                options={[
                  { value: "All", label: "-- Todos los Proyectos --" },
                  ...uniqueProjects.map(p => ({ value: p, label: p }))
                ]}
                placeholder="Buscar proyecto..."
                className="w-44"
              />
            </div>

            {/* Team select */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold text-[10px] uppercase">Equipo:</span>
              <SearchableSelect
                value={selectedTeam}
                onChange={(val) => {
                  setSelectedTeam(val);
                  setActiveKpiFilter("all");
                }}
                options={[
                  { value: "All", label: "-- Todos los Equipos --" },
                  ...uniqueTeams.map(t => ({ value: t, label: t }))
                ]}
                placeholder="Buscar equipo..."
                className="w-44"
              />
            </div>

            {/* Assistant select */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold text-[10px] uppercase">Asistente:</span>
              <SearchableSelect
                value={selectedAssistant}
                onChange={(val) => {
                  setSelectedAssistant(val);
                  setActiveKpiFilter("all");
                }}
                options={[
                  { value: "All", label: "-- Todos los Asistentes --" },
                  ...uniqueAssistants.map(a => ({ value: a, label: a }))
                ]}
                placeholder="Buscar asistente..."
                className="w-44"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Date Filters for KPI analysis (Image 8: fila de filtros por fechas debajo de Filtros Avanzados) */}
        <div className="pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[10px] uppercase">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              <span>Rango de Fechas:</span>
            </div>

            {/* Fecha Desde */}
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[10px] font-semibold uppercase">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 text-xs border border-blue-100 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            {/* Fecha Hasta */}
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[10px] font-semibold uppercase">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 text-xs border border-blue-100 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 ml-1">
              <button
                type="button"
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                  !startDate && !endDate
                    ? "bg-brand-primary text-white shadow-xs"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Todo
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const y = now.getFullYear();
                  const m = String(now.getMonth() + 1).padStart(2, "0");
                  const d = String(now.getDate()).padStart(2, "0");
                  const tStr = `${y}-${m}-${d}`;
                  setStartDate(tStr);
                  setEndDate(tStr);
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                  startDate && startDate === endDate
                    ? "bg-blue-100 border-blue-300 text-blue-800"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const dayOfWeek = now.getDay() || 7;
                  const monday = new Date(now);
                  monday.setDate(now.getDate() - (dayOfWeek - 1));
                  const f = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
                  setStartDate(f(monday));
                  setEndDate(f(now));
                }}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Esta Semana
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const first = new Date(now.getFullYear(), now.getMonth(), 1);
                  const f = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
                  setStartDate(f(first));
                  setEndDate(f(now));
                }}
                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
              >
                Este Mes
              </button>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all cursor-pointer ml-1"
                  title="Limpiar fechas"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Records count badge */}
          <div className="text-[11px] font-semibold">
            {startDate || endDate ? (
              <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full font-bold">
                {filteredRecords.length} operaciones entre {startDate || "inicio"} y {endDate || "hoy"}
              </span>
            ) : (
              <span className="text-slate-400 text-[10px]">
                Mostrando todo el período ({filteredRecords.length} operaciones)
              </span>
            )}
          </div>
        </div>

        {/* Row 3: Checkboxes to include Emissions and/or Status Changes (Image 8 & 9) */}
        <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Filtros:</span>
          
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-white hover:bg-slate-100 px-3 py-1 rounded-xl border border-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={includeEmisiones}
              onChange={(e) => setIncludeEmisiones(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-brand-primary focus:ring-brand-primary cursor-pointer accent-blue-700"
            />
            <span>Incluir Emisiones registradas en las fechas seleccionadas</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-white hover:bg-slate-100 px-3 py-1 rounded-xl border border-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={includeStatusChanges}
              onChange={(e) => setIncludeStatusChanges(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-brand-primary focus:ring-brand-primary cursor-pointer accent-blue-700"
            />
            <span>Incluir Cambios de Status realizados en las fechas seleccionadas</span>
          </label>

          <div className="h-4 w-px bg-slate-200 hidden sm:block mx-1" />

          {/* Cierres Completos Filter Checkbox */}
          <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1 rounded-xl border transition-all ${
            onlyCierresCompletos 
              ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs font-extrabold" 
              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}>
            <input
              type="checkbox"
              checked={onlyCierresCompletos}
              onChange={(e) => setOnlyCierresCompletos(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Solo Cierres Completos
            </span>
          </label>

          {/* Observados (Asesor) Filter Checkbox */}
          <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1 rounded-xl border transition-all ${
            onlyObservados 
              ? "bg-rose-50 text-rose-800 border-rose-300 shadow-2xs font-extrabold" 
              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}>
            <input
              type="checkbox"
              checked={onlyObservados}
              onChange={(e) => setOnlyObservados(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Solo Observados (Asesor)
            </span>
          </label>

          {/* Observados (Otras Áreas) Filter Checkbox */}
          <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1 rounded-xl border transition-all ${
            onlyObservadasOtrasAreas 
              ? "bg-blue-50 text-blue-800 border-blue-300 shadow-2xs font-extrabold" 
              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}>
            <input
              type="checkbox"
              checked={onlyObservadasOtrasAreas}
              onChange={(e) => setOnlyObservadasOtrasAreas(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Solo Observados (Otras Áreas)
            </span>
          </label>
        </div>
      </section>

      {/* KPI Cards in EXACTLY 2 ROWS */}
      <section className="space-y-3" id="kpi-two-rows-container">
        
        {/* ROW 1: 3 Main Status KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card 1: Total de Operaciones */}
          <button 
            onClick={() => setActiveKpiFilter("all")}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all cursor-pointer ${
              activeKpiFilter === "all" 
                ? "bg-blue-50/80 border-brand-primary ring-2 ring-brand-primary/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-blue-300 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-3 bg-blue-100 text-brand-primary rounded-2xl shrink-0 mt-0.5">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Total de Operaciones
              </p>
              <h4 className="text-2xl font-black text-slate-900 mt-1">{totalRecords}</h4>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Todas las solicitudes registradas</p>
            </div>
          </button>

          {/* Card 2: Emisiones Pendientes */}
          <button 
            onClick={() => setActiveKpiFilter("pending")}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all cursor-pointer ${
              activeKpiFilter === "pending" 
                ? "bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-amber-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl shrink-0 mt-0.5">
              <Clock className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Emisiones Pendientes
              </p>
              <h4 className="text-2xl font-black text-slate-900 mt-1">{pendingCount}</h4>
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">Solicitudes de emisión en trámite</p>
            </div>
          </button>

          {/* Card 3: Aprobadas para Emisión */}
          <button 
            onClick={() => setActiveKpiFilter("approved")}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all cursor-pointer ${
              activeKpiFilter === "approved" 
                ? "bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-emerald-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl shrink-0 mt-0.5">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Aprobadas para Emisión
              </p>
              <h4 className="text-2xl font-black text-slate-900 mt-1">{approvedCount}</h4>
              <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Expedientes listos y aprobados</p>
            </div>
          </button>

        </div>

        {/* ROW 2: 4 Incident & Quality KPI Cards (Styled according to Image 3 reference) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 4: Observadas / Rechazos (Asesor) */}
          <button 
            onClick={() => {
              setActiveKpiFilter("observed");
              setIsDetailedListExpanded(true);
            }}
            className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
              activeKpiFilter === "observed" 
                ? "bg-rose-50/80 border-rose-500 ring-2 ring-rose-500/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-rose-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="w-full text-center">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Observadas / Rechazos
              </p>
            </div>
            <div className="flex items-center justify-center gap-3.5 my-3">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h4 className="text-4xl sm:text-5xl font-black text-slate-900 leading-none">{observedCount}</h4>
            </div>
            <div className="w-full text-center">
              <p className="text-xs text-rose-600 font-semibold">Errores u observaciones del Asesor</p>
            </div>
          </button>

          {/* Card 5: Modificaciones / Correcciones */}
          <button 
            onClick={() => {
              setActiveKpiFilter("modified");
              setIsDetailedListExpanded(true);
            }}
            className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
              activeKpiFilter === "modified" 
                ? "bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-amber-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="w-full text-center">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                Modificaciones / Cambios
              </p>
            </div>
            <div className="flex items-center justify-center gap-3.5 my-3">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs">
                <Edit3 className="h-6 w-6" />
              </div>
              <h4 className="text-4xl sm:text-5xl font-black text-slate-900 leading-none">{modifiedCount}</h4>
            </div>
            <div className="w-full text-center">
              <p className="text-xs text-amber-700 font-semibold">Reajustes de datos o campos tras emisión</p>
            </div>
          </button>

          {/* Card 6: Observaciones de otras áreas (COLOR AZUL - NO AFECTA AL ASESOR) */}
          <button 
            onClick={() => {
              setActiveKpiFilter("other_areas");
              setIsDetailedListExpanded(true);
            }}
            className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
              activeKpiFilter === "other_areas" 
                ? "bg-blue-50/90 border-blue-600 ring-2 ring-blue-500/30 shadow-md scale-[1.01]" 
                : "bg-white border-blue-200 hover:border-blue-400 hover:bg-blue-50/20 shadow-xs"
            }`}
          >
            <div className="w-full flex items-center justify-center gap-2">
              <p className="text-xs font-black text-blue-950 uppercase tracking-wide">
                Otras Áreas
              </p>
              <span className="text-[9px] font-extrabold text-blue-700 bg-blue-100/90 px-2 py-0.5 rounded-full border border-blue-300">
                No afecta Asesor
              </span>
            </div>
            <div className="flex items-center justify-center gap-3.5 my-3">
              <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="text-4xl sm:text-5xl font-black text-blue-700 leading-none">{otherAreasCount}</h4>
            </div>
            <div className="w-full text-center">
              <p className="text-xs text-blue-600 font-semibold">Observaciones de otras áreas (Tiempo detenido)</p>
            </div>
          </button>

          {/* Card 7: Tiempos de Respuesta (Legal & Asesor) */}
          <div className="p-5 bg-white border border-blue-100 shadow-xs rounded-2xl flex flex-col justify-between relative group hover:border-purple-300 transition-all">
            <div className="w-full flex items-center justify-center gap-2">
              <p className="text-xs font-black text-slate-600 uppercase tracking-wide">
                Tiempos de Respuesta
              </p>
              <div 
                className="text-purple-600 cursor-help text-[9px] bg-purple-50 px-1.5 py-0.5 rounded-md font-bold font-mono border border-purple-100" 
                title="Calculado en minutos hábiles (Lunes a Viernes 9:00 - 18:00, sin feriados)."
              >
                Horario Hábil
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 my-2.5 pt-2 border-t border-slate-100">
              <div className="text-center border-r border-slate-100 pr-1">
                <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Atención Legal</span>
                <div className="flex items-baseline justify-center gap-1 mt-1">
                  <h4 className="text-2xl sm:text-3xl font-black text-purple-900 leading-none">
                    {avgWorkingResponseMinutes}
                  </h4>
                  <span className="text-xs font-bold text-purple-600">min</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 block mt-0.5">({avgWorkingResponseHrs}h)</span>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">Solicitud → Acción</p>
              </div>
              <div className="text-center pl-1">
                <span className="text-[9px] font-bold text-rose-600 block uppercase tracking-wider">Respuesta Asesor</span>
                <div className="flex items-baseline justify-center gap-1 mt-1">
                  <h4 className="text-2xl sm:text-3xl font-black text-rose-900 leading-none">
                    {avgAdvisorResponseMinutes}
                  </h4>
                  <span className="text-xs font-bold text-rose-600">min</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 block mt-0.5">({(avgAdvisorResponseMinutes / 60).toFixed(1)}h)</span>
                <p className="text-[9px] text-slate-400 font-medium mt-0.5">Observado → Respuesta</p>
              </div>
            </div>
          </div>

        </div>

      </section>

      {/* Gráfica y Evolución Operacional: Cantidades enteras por Día/Semana, Tipos, Asistentes, Asesores y Recursos */}
      <DailyObservationsControlChart
        records={records}
        settings={settings}
      />

      {/* Operaciones Registradas por Tipo (Emisión, Modificación, Adenda) - KPIs Jefe Legal */}
      <section className="bg-white p-6 rounded-3xl border border-blue-100 shadow-xs space-y-5" id="kpi-operaciones-por-tipo">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100/80 shadow-2xs">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
                  Operaciones Registradas por Tipo de Solicitud
                </h3>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-100">
                  KPIs Jefe Legal
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Cantidad de operaciones registradas separadas por <strong>Emisión</strong>, <strong>Modificación</strong> o <strong>Adenda</strong>
              </p>
            </div>
          </div>

          {/* Toggle between user-only or global when logged in as Jefe Legal */}
          {isJefeLegal && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setShowOnlyMyRegistrations(true)}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  showOnlyMyRegistrations ? "bg-white text-brand-primary shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Mis Registros ({currentUser?.username})
              </button>
              <button
                type="button"
                onClick={() => setShowOnlyMyRegistrations(false)}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  !showOnlyMyRegistrations ? "bg-white text-brand-primary shadow-xs" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Total Área Legal
              </button>
            </div>
          )}
        </div>

        {/* 3 Main Type Metric Cards + Total */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* EMISION CARD */}
          <div
            onClick={() => setActiveKpiFilter(activeKpiFilter === "tipo_emision" ? "all" : "tipo_emision")}
            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeKpiFilter === "tipo_emision"
                ? "bg-blue-50/90 border-blue-300 ring-2 ring-blue-400/40 shadow-sm"
                : "bg-slate-50/60 border-slate-150 hover:bg-blue-50/40 hover:border-blue-200"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-black text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-600 inline-block"></span>
                  1. Emisión
                </span>
                <span className="text-[10px] font-extrabold text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-full font-mono">
                  {typeCounts.total > 0 ? Math.round((typeCounts.emision / typeCounts.total) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <h4 className="text-3xl font-black text-blue-900 font-mono">
                  {typeCounts.emision}
                </h4>
                <span className="text-xs font-bold text-slate-400">operaciones</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span>Trámites de emisión inicial</span>
              <span className="font-bold text-blue-600 hover:underline">Filtrar →</span>
            </p>
          </div>

          {/* MODIFICACION CARD */}
          <div
            onClick={() => setActiveKpiFilter(activeKpiFilter === "tipo_modificacion" ? "all" : "tipo_modificacion")}
            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeKpiFilter === "tipo_modificacion"
                ? "bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/40 shadow-sm"
                : "bg-slate-50/60 border-slate-150 hover:bg-amber-50/40 hover:border-amber-200"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-black text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block"></span>
                  2. Modificación
                </span>
                <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full font-mono">
                  {typeCounts.total > 0 ? Math.round((typeCounts.modificacion / typeCounts.total) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <h4 className="text-3xl font-black text-amber-950 font-mono">
                  {typeCounts.modificacion}
                </h4>
                <span className="text-xs font-bold text-slate-400">operaciones</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span>Reajustes y cambios solicitados</span>
              <span className="font-bold text-amber-700 hover:underline">Filtrar →</span>
            </p>
          </div>

          {/* ADENDA CARD */}
          <div
            onClick={() => setActiveKpiFilter(activeKpiFilter === "tipo_adenda" ? "all" : "tipo_adenda")}
            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
              activeKpiFilter === "tipo_adenda"
                ? "bg-purple-50/90 border-purple-300 ring-2 ring-purple-400/40 shadow-sm"
                : "bg-slate-50/60 border-slate-150 hover:bg-purple-50/40 hover:border-purple-200"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-black text-purple-800 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-600 inline-block"></span>
                  3. Adenda
                </span>
                <span className="text-[10px] font-extrabold text-purple-800 bg-purple-100/80 px-2 py-0.5 rounded-full font-mono">
                  {typeCounts.total > 0 ? Math.round((typeCounts.adenda / typeCounts.total) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <h4 className="text-3xl font-black text-purple-950 font-mono">
                  {typeCounts.adenda}
                </h4>
                <span className="text-xs font-bold text-slate-400">operaciones</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between">
              <span>Adendas contractuales anexadas</span>
              <span className="font-bold text-purple-700 hover:underline">Filtrar →</span>
            </p>
          </div>

          {/* TOTAL CARD */}
          <div
            onClick={() => setActiveKpiFilter("all")}
            className="p-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col justify-between shadow-xs cursor-pointer hover:opacity-95"
          >
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-black text-slate-200 uppercase tracking-wide">
                  Total Registradas
                </span>
                <span className="text-[10px] font-extrabold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full">
                  100%
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <h4 className="text-3xl font-black text-white font-mono">
                  {typeCounts.total}
                </h4>
                <span className="text-xs font-medium text-slate-400">operaciones</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-300 font-medium mt-2 pt-2 border-t border-slate-700 flex items-center justify-between">
              <span>{isJefeLegal && showOnlyMyRegistrations ? `Por ${currentUser?.username}` : "Área Legal"}</span>
              <span className="font-bold text-slate-300 hover:underline">Ver todas →</span>
            </p>
          </div>

        </div>
      </section>

      {/* KPI: Actividad Operativa del Jefe Legal & Apoyo a Asistentes Legales (Acciones vs. Ingresos - Imágenes 5 y 6) */}
      <section className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-xs space-y-6" id="kpi-jefe-legal-actividad">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-200/80 shadow-2xs">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base text-slate-900 uppercase tracking-wider">
                  Actividad Operativa del Jefe Legal & Apoyo a Asistentes
                </h3>
                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-indigo-200">
                  KPIs Acciones vs. Ingresos
                </span>
                <span className="bg-purple-50 text-purple-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-purple-200">
                  Marilyn Saona
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Contabiliza las <strong>acciones operativas</strong> del Jefe Legal (cierres, revisiones, observaciones) en el transcurso de los días, comparando los ingresos con las acciones realizadas y mostrando <strong>a qué asistente legal ayudó</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setJefeModalFilterAssistant("All");
                setJefeModalFilterDate("All");
                setJefeModalSearchQuery("");
                setJefeDetailModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              Ver Detalle de Acciones (Imagen 6)
            </button>
          </div>
        </div>

        {/* 4 Key Stat Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Acciones Totales Realizadas</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-indigo-900 font-mono">{jefeActionsList.length}</span>
              <span className="text-xs font-bold text-indigo-600">toques / acciones</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium mt-1 block">Cierres, revisiones y observaciones</span>
          </div>

          <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Solicitudes Ingresadas</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-blue-900 font-mono">
                {Object.values(dailyIngresosMap).reduce((a, b) => a + b, 0)}
              </span>
              <span className="text-xs font-bold text-blue-600">ingresos totales</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium mt-1 block">Nuevas solicitudes registradas</span>
          </div>

          <div className="bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Asistentes Legales Apoyados</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-purple-950 font-mono">
                {Object.keys(assistantHelpMap).length}
              </span>
              <span className="text-xs font-bold text-purple-600">asistentes activos</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium mt-1 block">Franco, Sthief, Daniel</span>
          </div>

          <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Ratio Acciones / Ingresos</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-emerald-950 font-mono">
                {Object.values(dailyIngresosMap).reduce((a, b) => a + b, 0) > 0
                  ? (jefeActionsList.length / Object.values(dailyIngresosMap).reduce((a, b) => a + b, 0)).toFixed(2)
                  : "1.00"}
              </span>
              <span className="text-xs font-bold text-emerald-600">acciones / ingreso</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium mt-1 block">Intensidad de acompañamiento</span>
          </div>
        </div>

        {/* 2 Main Columns: Cuadro Comparativo por Días (Left) & Desglose de Apoyo por Asistente (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left: Cuadro Comparativo Diario (Ingresos vs Acciones) */}
          <div className="lg:col-span-7 bg-slate-50/60 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-indigo-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Cuadro Comparativo por Día: Ingresos vs. Acciones
                </h4>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                {allComparisonDates.length} días con actividad
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 bg-white rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-bold text-[9px] uppercase tracking-wider">
                    <th className="p-3">FECHA</th>
                    <th className="p-3 text-center">INGRESOS</th>
                    <th className="p-3 text-center">ACCIONES JEFE LEGAL</th>
                    <th className="p-3">ASISTENTES APOYADOS</th>
                    <th className="p-3 text-center">DETALLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allComparisonDates.map(dateStr => {
                    const ingresosDay = dailyIngresosMap[dateStr] || 0;
                    const dayActions = jefeActionsList.filter(a => a.date === dateStr);
                    const actionsCount = dayActions.length;

                    // Breakdown of assistants supported on this date
                    const asstsOnDate: { [asst: string]: number } = {};
                    dayActions.forEach(a => {
                      asstsOnDate[a.assistantHelped] = (asstsOnDate[a.assistantHelped] || 0) + 1;
                    });

                    return (
                      <tr key={dateStr} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-800">
                          {dateStr}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center justify-center font-mono font-black text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                            {ingresosDay}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center justify-center font-mono font-black text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                            {actionsCount}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(asstsOnDate).map(([asstName, cnt]) => (
                              <span
                                key={asstName}
                                className="text-[10px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md border border-purple-100 flex items-center gap-1"
                              >
                                <span>{asstName.split(" ")[0]}:</span>
                                <span className="font-mono font-black text-purple-900">{cnt}</span>
                              </span>
                            ))}
                            {Object.keys(asstsOnDate).length === 0 && (
                              <span className="text-[10px] text-slate-400 italic">Sin acciones registradas</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setJefeModalFilterDate(dateStr);
                              setJefeModalFilterAssistant("All");
                              setJefeModalSearchQuery("");
                              setJefeDetailModalOpen(true);
                            }}
                            className="text-[10px] font-extrabold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-all cursor-pointer inline-flex items-center gap-1"
                          >
                            Ver ({actionsCount})
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {allComparisonDates.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 italic text-xs">
                        No se registran fechas con actividad para comparar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Desglose de Apoyo por Asistente Legal (A quién ayudó) */}
          <div className="lg:col-span-5 bg-slate-50/60 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Apoyo Brindado por Asistente Legal
                </h4>
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                ¿A quién ayudó?
              </span>
            </div>

            <div className="space-y-2.5">
              {Object.entries(assistantHelpMap)
                .sort((a, b) => b[1].count - a[1].count)
                .map(([asstName, data]) => {
                  const percent = jefeActionsList.length > 0 ? Math.round((data.count / jefeActionsList.length) * 100) : 0;
                  return (
                    <div
                      key={asstName}
                      className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs space-y-2 hover:border-indigo-300 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center border border-indigo-200">
                            {asstName.charAt(0)}
                          </div>
                          <div>
                            <h5 className="font-extrabold text-xs text-slate-800">{asstName}</h5>
                            <span className="text-[10px] text-slate-400 font-medium">Asistente Legal</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-black text-base text-indigo-900">{data.count}</span>
                          <span className="text-[10px] text-slate-400 font-bold block">{percent}% del apoyo</span>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-[9px] text-slate-400 font-mono">
                          {new Set(data.actions.map(a => a.opId)).size} expedientes intervenidos
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setJefeModalFilterAssistant(asstName);
                            setJefeModalFilterDate("All");
                            setJefeModalSearchQuery("");
                            setJefeDetailModalOpen(true);
                          }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 cursor-pointer"
                        >
                          Ver operaciones apoyadas →
                        </button>
                      </div>
                    </div>
                  );
                })}
              {Object.keys(assistantHelpMap).length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-6">Sin acciones registradas.</p>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Control de Calidad e Incidentes por Asesor (3 DISTINCT COLUMNS: OBSERVADO, MODIFICADO & OTRAS ÁREAS) */}
      <section className="bg-white p-6 rounded-3xl border border-blue-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
                Control de Calidad e Incidentes por Asesor Inmobiliario
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Mide incidentes diferenciando en columnas: <strong>1. Observado (Rechazos Asesor)</strong> vs <strong>2. Modificado (Correcciones)</strong> vs <strong className="text-blue-600">3. Otras Áreas (No afecta al Asesor)</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {sortedAdvisorMetrics.length} Asesores Evaluados
            </span>
          </div>
        </div>

        {/* Table with 3 distinct columns including Observaciones de otras áreas in blue */}
        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-wider">
                <th className="p-3.5">ASESOR INMOBILIARIO</th>
                <th className="p-3.5">TEAM COMERCIAL</th>
                <th className="p-3.5 text-center bg-rose-50/50 text-rose-800 border-x border-rose-100">
                  <div className="flex items-center justify-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    <span>1. OBSERVADO</span>
                  </div>
                  <span className="text-[8px] text-rose-600/80 font-normal block lowercase">(rechazos / errores)</span>
                </th>
                <th className="p-3.5 text-center bg-amber-50/50 text-amber-800 border-r border-amber-100">
                  <div className="flex items-center justify-center gap-1">
                    <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                    <span>2. MODIFICADO</span>
                  </div>
                  <span className="text-[8px] text-amber-600/80 font-normal block lowercase">(cambios / ajustes)</span>
                </th>
                <th className="p-3.5 text-center bg-blue-50/70 text-blue-900 border-r border-blue-200">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-blue-600" />
                    <span>3. OTRAS ÁREAS</span>
                  </div>
                  <span className="text-[8px] text-blue-700 font-bold block lowercase">(no afecta al asesor)</span>
                </th>
                <th className="p-3.5 text-center">TOTAL INCIDENTES</th>
                <th className="p-3.5 text-center">OPERACIONES TOTALES</th>
                <th className="p-3.5 text-center">
                  <div>TASA DE INCIDENCIA</div>
                  <span className="text-[8px] text-slate-500 font-normal block lowercase">(obs / ops totales)</span>
                </th>
                <th className="p-3.5 text-center">
                  <div>CALIDAD</div>
                  <span className="text-[8px] text-slate-500 font-normal block lowercase">(solo observaciones)</span>
                </th>
                <th className="p-3.5 text-center">VER DETALLE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAdvisorMetrics.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 italic text-xs">
                    No se registran datos de asesores para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                sortedAdvisorMetrics.map((adv) => {
                  const isSelected = filterAdvisorName === adv.name;
                  // User requirement: Calidad is determined EXCLUSIVELY by observedCount (modifications and other areas do not affect Calidad)
                  const isCritical = adv.observedCount >= 2;
                  const isAttention = adv.observedCount === 1;
                  const isOptimal = adv.observedCount === 0;

                  return (
                    <tr 
                      key={adv.name}
                      className={`hover:bg-blue-50/40 transition-colors ${isSelected ? 'bg-blue-50/80 font-semibold' : ''}`}
                    >
                      <td className="p-3.5">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-slate-400" />
                          <span className="font-bold text-slate-800 uppercase tracking-tight">{adv.name}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold uppercase">
                          {adv.team}
                        </span>
                      </td>
                      
                      {/* COLUMN 1: OBSERVADO */}
                      <td className="p-3.5 text-center bg-rose-50/20 border-x border-rose-100">
                        {adv.observedCount >= 2 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-black text-xs px-2.5 py-0.5 rounded-full bg-rose-600 text-white shadow-xs" title="Alerta Crítica: múltiples observaciones de Legal">
                            <AlertTriangle className="h-3 w-3" /> {adv.observedCount} (Crítico)
                          </span>
                        ) : (
                          <span className={`inline-flex items-center justify-center font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-full ${
                            adv.observedCount > 0 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : 'text-slate-400 font-normal'
                          }`}>
                            {adv.observedCount}
                          </span>
                        )}
                      </td>

                      {/* COLUMN 2: MODIFICADO */}
                      <td className="p-3.5 text-center bg-amber-50/20 border-r border-amber-100">
                        <span className={`inline-flex items-center justify-center font-mono font-extrabold text-xs px-2.5 py-0.5 rounded-full ${
                          adv.modifiedCount > 0 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'text-slate-400 font-normal'
                        }`}>
                          {adv.modifiedCount}
                        </span>
                      </td>

                      {/* COLUMN 3: OTRAS ÁREAS (COLOR AZUL - NO AFECTA AL ASESOR) */}
                      <td className="p-3.5 text-center bg-blue-50/30 border-r border-blue-200">
                        <span className={`inline-flex items-center justify-center font-mono text-xs px-2.5 py-0.5 rounded-full ${
                          adv.otherAreasObsCount > 0 
                            ? 'bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs font-black' 
                            : 'text-slate-400 font-normal'
                        }`} title="Observaciones de otras áreas: NO incrementa incidentes del asesor ni afecta su Calidad">
                          {adv.otherAreasObsCount}
                        </span>
                      </td>

                      {/* TOTAL INCIDENTES */}
                      <td className="p-3.5 text-center font-mono font-extrabold text-slate-800">
                        {adv.totalIncidents}
                      </td>

                      {/* TOTAL EXPEDIENTES */}
                      <td className="p-3.5 text-center font-mono text-slate-600 font-semibold">
                        {adv.totalOps}
                      </td>

                      {/* TASA DE INCIDENCIA */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${
                                isCritical ? 'bg-rose-500' : isAttention ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.min(adv.errorRate, 100)}%` }}
                            ></div>
                          </div>
                          <span className="font-mono text-[10px] font-bold text-slate-600">
                            {adv.errorRate}%
                          </span>
                        </div>
                      </td>

                      {/* CALIDAD BADGE */}
                      <td className="p-3.5 text-center">
                        {isOptimal && (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                            <ShieldCheck className="h-3 w-3" /> Óptimo
                          </span>
                        )}
                        {isAttention && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                            <AlertTriangle className="h-3 w-3" /> Atención
                          </span>
                        )}
                        {isCritical && (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase">
                            <ShieldAlert className="h-3 w-3" /> Crítico
                          </span>
                        )}
                      </td>

                      {/* VER DETALLE BUTTON */}
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => {
                            if (filterAdvisorName === adv.name) {
                              setFilterAdvisorName(null);
                            } else {
                              setFilterAdvisorName(adv.name);
                              // Smooth scroll to records table
                              const el = document.getElementById("expedientes-detallados-kpi");
                              if (el) el.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 mx-auto ${
                            isSelected 
                              ? 'bg-rose-600 text-white shadow-xs' 
                              : 'bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800'
                          }`}
                        >
                          {isSelected ? 'Quitar Filtro' : 'Filtrar Ops'}
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Main KPI Analysis Grid: Assistant Efficiency & Team Aggregations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Legal Assistant and Jefe Legal response times */}
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-primary" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Eficiencia del Equipo Legal (Asistentes y Jefe Legal)
              </h4>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-800 px-2.5 py-0.5 rounded-full font-bold">Tiempo hábil (Horas)</span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto max-h-[280px] pr-1">
            {Object.keys(assistantResponseTimes).length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">No se registran mediciones de tiempo de respuesta para el área legal.</p>
            ) : (
              Object.entries(assistantResponseTimes).map(([username, data]) => {
                const avgHrs = data.count > 0 ? (data.totalHrs / data.count) : 0;
                const maxAvgHrs = Math.max(...Object.values(assistantResponseTimes).map(d => d.count > 0 ? d.totalHrs / d.count : 0), 1);
                const pct = (avgHrs / maxAvgHrs) * 100;
                const isJefe = data.isJefe || username.includes("(Jefe Legal)");

                return (
                  <div key={username} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className={`h-2 w-2 rounded-full ${isJefe ? "bg-indigo-600" : "bg-brand-secondary"}`}></div>
                        <span className="font-extrabold text-slate-700 capitalize">{username}</span>
                        {isJefe && (
                          <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase shadow-2xs">
                            <ShieldCheck className="h-2.5 w-2.5" /> Jefe Legal
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatHoursHHMM(avgHrs)} <span className="text-[10px] text-slate-400 font-normal">({avgHrs.toFixed(1)} hrs • {data.count} exp.)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${isJefe ? "bg-indigo-600" : "bg-brand-primary"}`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Observations and Modifications by Team overview */}
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-rose-500" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Acumulado por Team / Equipo</h4>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">Obs. vs Modif.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto max-h-[280px]">
            {Object.entries(teamMetrics).map(([teamName, data]) => {
              const isAgenteTeam = teamName.toUpperCase().includes("AGENTE");
              const isPaulaTeam = teamName.toUpperCase().includes("PAULA");
              const displayLabel = teamName.startsWith("TEAM ") ? teamName : `TEAM ${teamName}`;
              return (
                <div key={teamName} className={`p-3 border rounded-xl space-y-2 ${
                  isAgenteTeam 
                    ? "bg-teal-50/70 border-teal-200" 
                    : isPaulaTeam
                    ? "bg-purple-50/70 border-purple-200"
                    : "bg-slate-50 border-slate-100"
                }`}>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">{displayLabel}</span>
                      {isAgenteTeam && (
                        <span className="text-[8px] bg-teal-600 text-white font-extrabold px-1.5 py-0.2 rounded-full uppercase shadow-2xs">
                          Apartado
                        </span>
                      )}
                      {isPaulaTeam && (
                        <span className="text-[8px] bg-purple-600 text-white font-extrabold px-1.5 py-0.2 rounded-full uppercase shadow-2xs">
                          Paula Casas
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono">{data.totalOps} ops</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                    <div className="text-center bg-rose-50/80 p-1.5 rounded-lg border border-rose-100">
                      <span className="text-[8px] font-bold text-rose-700 uppercase block">Observados</span>
                      <span className="text-base font-black text-rose-800 font-mono">{data.observed}</span>
                    </div>
                    <div className="text-center bg-amber-50/80 p-1.5 rounded-lg border border-amber-100">
                      <span className="text-[8px] font-bold text-amber-700 uppercase block">Modificados</span>
                      <span className="text-base font-black text-amber-800 font-mono">{data.modified}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {Object.keys(teamMetrics).length === 0 && (
              <p className="text-xs text-slate-400 italic col-span-2 text-center py-8">Sin datos de equipos para agrupar.</p>
            )}
          </div>
        </div>

      </div>

      {/* KPI: Motivos de Observación Más Comunes (Checklist Analytics) */}
      <section className="bg-white p-6 rounded-3xl border border-blue-100 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">
                KPI: Observaciones Más Comunes (Frecuencia por Motivo)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Mide la frecuencia de cada tipo de observación estandarizada para identificar los errores más recurrentes de los asesores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-150 px-2.5 py-0.5 rounded-full uppercase">
              {totalObservationReasonHits} Registros Detectados
            </span>
          </div>
        </div>

        {/* Motivos Grid & Bar Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {sortedObservationReasons.map((item, idx) => {
            const isSelected = filterObservationReason === item.reason;
            const maxCount = sortedObservationReasons[0]?.count || 1;
            const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            const hasHits = item.count > 0;

            return (
              <div
                key={item.reason}
                onClick={() => {
                  if (filterObservationReason === item.reason) {
                    setFilterObservationReason(null);
                  } else {
                    setFilterObservationReason(item.reason);
                    const el = document.getElementById("expedientes-detallados-kpi");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? item.isOtherAreas
                      ? "bg-blue-50/90 border-blue-400 ring-2 ring-blue-400/50 shadow-xs"
                      : "bg-rose-50/90 border-rose-300 ring-2 ring-rose-300/60 shadow-xs"
                    : hasHits
                    ? item.isOtherAreas
                      ? "bg-blue-50/20 hover:bg-blue-50/40 border-blue-200 hover:border-blue-300 shadow-2xs"
                      : "bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 shadow-2xs"
                    : "bg-slate-50/50 border-slate-100 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className={`text-[10px] font-mono font-extrabold w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      item.isOtherAreas ? "text-blue-600 bg-blue-100" : "text-slate-400 bg-slate-100"
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className={`text-xs font-bold leading-snug break-words ${
                          isSelected 
                            ? item.isOtherAreas ? "text-blue-950" : "text-rose-950" 
                            : hasHits 
                            ? item.isOtherAreas ? "text-blue-900" : "text-slate-800" 
                            : "text-slate-500"
                        }`}>
                          {item.reason}
                        </p>
                        {item.isOtherAreas && (
                          <span className="text-[9px] font-extrabold text-blue-700 bg-blue-100/90 px-1.5 py-0.2 rounded-md border border-blue-200">
                            Otras Áreas
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        {item.percentage}% del total de incidencias
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block font-mono text-sm font-black px-2.5 py-0.5 rounded-lg ${
                      isSelected
                        ? item.isOtherAreas ? "bg-blue-600 text-white" : "bg-rose-600 text-white"
                        : hasHits
                        ? item.isOtherAreas ? "bg-blue-100 text-blue-800 border border-blue-200" : "bg-rose-100 text-rose-800"
                        : "bg-slate-100 text-slate-400"
                    }`}>
                      {item.count}
                    </span>
                  </div>
                </div>

                {/* Progress bar representing proportion */}
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2.5">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      isSelected 
                        ? item.isOtherAreas ? "bg-blue-600" : "bg-rose-600" 
                        : hasHits 
                        ? item.isOtherAreas ? "bg-blue-500" : "bg-rose-500" 
                        : "bg-slate-300"
                    }`}
                    style={{ width: `${barWidth}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        {filterObservationReason && (
          <div className="flex items-center justify-between p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs">
            <span className="text-rose-900 font-bold">
              Filtrando expedientes por motivo: <strong>{filterObservationReason}</strong>
            </span>
            <button
              onClick={() => setFilterObservationReason(null)}
              className="text-rose-700 hover:text-rose-900 font-extrabold underline cursor-pointer text-[11px]"
            >
              Restablecer filtro
            </button>
          </div>
        )}
      </section>

      {/* Click-filtered records detailed view (Collapsible on click to avoid heavy window loading - Image 5) */}
      <section id="expedientes-detallados-kpi" className="bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden transition-all">
        <div 
          onClick={() => setIsDetailedListExpanded(!isDetailedListExpanded)}
          className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-brand-primary rounded-2xl shrink-0">
              <List className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">
                  Expedientes Detallados ({recordsToDisplay.length})
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isDetailedListExpanded ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                }`}>
                  {isDetailedListExpanded ? "Desplegado" : "Plegado"}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                {isDetailedListExpanded 
                  ? "Haz clic para contraer y ocultar la lista detallada" 
                  : "Haz clic para desplegar la lista de operaciones y no sobrecargar la ventana"}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {filterAdvisorName && (
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                Asesor: {filterAdvisorName}
              </span>
            )}
            {filterObservationReason && (
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                Motivo: {filterObservationReason}
              </span>
            )}
            <span className="bg-blue-50 text-brand-primary border border-blue-100 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase">
              {activeKpiFilter === "all" && "Todas las Operaciones"}
              {activeKpiFilter === "pending" && "Emisiones Pendientes"}
              {activeKpiFilter === "approved" && "Aprobadas / Cierre Completo"}
              {activeKpiFilter === "observed" && "Observadas / Rechazadas"}
              {activeKpiFilter === "modified" && "Modificadas / Con Reajustes"}
              {activeKpiFilter === "other_areas" && "Otras Áreas"}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDetailedListExpanded(!isDetailedListExpanded);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer ml-1"
            >
              <span>{isDetailedListExpanded ? "Contraer Lista" : "Desplegar Lista"}</span>
              {isDetailedListExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {isDetailedListExpanded && (
          <div className="p-5 pt-0 border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
            <div className="overflow-x-auto border border-blue-50/70 rounded-2xl mt-4">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-blue-50 text-slate-500 font-bold text-[9px] uppercase tracking-wider">
                <th className="p-3">EXPEDIENTE / PROYECTO</th>
                <th className="p-3">ASESOR / TEAM</th>
                <th className="p-3">TIPO</th>
                <th className="p-3">ASISTENTE</th>
                <th className="p-3">ESTADO ACTUAL</th>
                <th className="p-3 text-center">TIEMPO RESPUESTA</th>
                <th className="p-3 text-center">HISTORIAL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50/50">
              {recordsToDisplay.map((r) => {
                const breakdown = calculateOperationTimeBreakdown(r, settings?.workingSchedule);
                
                let responseText = "No accionado aún";
                const responseHours = breakdown.legalHours;
                const responseMins = breakdown.legalMinutes;
                
                if (breakdown.legalMinutes > 0 || r.solicitudAt || r.createdAt) {
                  if (!breakdown.isCurrentlyActive) {
                    responseText = `${responseMins} min (${formatHoursHHMM(responseHours)})`;
                  } else {
                    responseText = `${responseMins} min transc. (${formatHoursHHMM(responseHours)})`;
                  }
                }

                const historyCount = (r.history && r.history.length) || 0;

                return (
                  <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="p-3">
                      <div className="font-mono text-[9px] text-slate-400">ID: {r.id.toUpperCase()}</div>
                      <div className="font-bold text-slate-700">{normalizeProjectName(r.proyecto)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">dpto: {r.dpto || "-"} | estac: {r.estac || "-"} | dep: {r.dep || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-700 uppercase">
                        {r.asesor === "ASE000010" ? "DERVIS PIÑA" : (r.asesor === "ASE000028" ? "PAULA CASAS" : (r.asesor || "-"))}
                      </div>
                      <div className="text-[9px] text-slate-400 font-bold">TEAM: {normalizeTeamName(r.team, r.asesor)}</div>
                    </td>
                    <td className="p-3">
                      {r.tipo ? (
                        <span className="bg-blue-50 text-brand-primary border border-blue-100 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          {r.tipo}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No asignado</span>
                      )}
                    </td>
                    <td className="p-3">
                      {r.derivadoA ? (
                        <span className="text-[10px] text-slate-600 font-semibold capitalize">{r.derivadoA}</span>
                      ) : (
                        <span className="text-[10px] text-rose-500 font-bold italic">Sin Asistente</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`text-[9px] font-extrabold px-2.5 py-1 rounded-full border ${
                        statusColors?.[r.status] || (
                          r.status === "Aprobado para Emisión" || r.status === "Cierre Completo"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observado")
                            ? "bg-rose-50 text-rose-700 border-rose-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        )
                      }`}>
                        {r.status || "Pendiente de Firma"}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-mono text-xs font-bold ${
                        breakdown.legalMinutes > 0 
                          ? "text-brand-primary" 
                          : "text-slate-400 italic"
                      }`}>
                        {responseText}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setSelectedHistoryRecord(r)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        title="Ver cronología histórica de acciones"
                      >
                        <History className="h-3 w-3" />
                        <span>{historyCount > 0 ? `${historyCount} acciones` : "Ver"}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {recordsToDisplay.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic text-xs">
                    Ningún expediente coincide con los criterios de filtrado seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </div>
        )}
      </section>

      {/* History Modal Popup */}
      {selectedHistoryRecord && (
        <StatusHistoryModal
          record={selectedHistoryRecord}
          statusColors={statusColors}
          onClose={() => setSelectedHistoryRecord(null)}
        />
      )}

      {/* Modal: Detalle de Acciones del Jefe Legal & Apoyo a Asistentes Legales (Imagen 6) */}
      {jefeDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Detalle de Acciones del Jefe Legal & Apoyo a Asistentes (Imagen 6)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Listado cronológico de toques, cierres y revisiones efectuadas por Marilyn Saona
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setJefeDetailModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Filter Bar */}
            <div className="p-4 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Filter by Assistant */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Asistente Legal Apoyado:
                </label>
                <select
                  value={jefeModalFilterAssistant}
                  onChange={(e) => setJefeModalFilterAssistant(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-700 focus:outline-hidden focus:border-indigo-400"
                >
                  <option value="All">Todos los Asistentes ({jefeActionsList.length})</option>
                  {Object.entries(assistantHelpMap).map(([asst, data]) => (
                    <option key={asst} value={asst}>
                      {asst} ({data.count} acciones)
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter by Date */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Fecha de la Acción:
                </label>
                <select
                  value={jefeModalFilterDate}
                  onChange={(e) => setJefeModalFilterDate(e.target.value)}
                  className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-700 focus:outline-hidden focus:border-indigo-400"
                >
                  <option value="All">Todas las Fechas ({allComparisonDates.length} días)</option>
                  {allComparisonDates.map(d => (
                    <option key={d} value={d}>
                      {d} ({jefeActionsList.filter(a => a.date === d).length} acciones)
                    </option>
                  ))}
                </select>
              </div>

              {/* Search query */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Buscar Operación / Dpto / Comentario:
                </label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    value={jefeModalSearchQuery}
                    onChange={(e) => setJefeModalSearchQuery(e.target.value)}
                    className="w-full text-xs font-medium pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden focus:border-indigo-400"
                  />
                </div>
              </div>
            </div>

            {/* Modal Content Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const filteredModalActions = jefeActionsList.filter(act => {
                  const matchAsst = jefeModalFilterAssistant === "All" || act.assistantHelped === jefeModalFilterAssistant;
                  const matchDate = jefeModalFilterDate === "All" || act.date === jefeModalFilterDate;
                  const q = jefeModalSearchQuery.trim().toLowerCase();
                  const matchQ = !q || (
                    act.opId.toLowerCase().includes(q) ||
                    act.dpto.toLowerCase().includes(q) ||
                    act.proyecto.toLowerCase().includes(q) ||
                    act.comentario.toLowerCase().includes(q) ||
                    act.status.toLowerCase().includes(q)
                  );
                  return matchAsst && matchDate && matchQ;
                });

                return (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-medium px-1">
                      <span>Mostrando <strong>{filteredModalActions.length}</strong> de <strong>{jefeActionsList.length}</strong> acciones registradas</span>
                      {(jefeModalFilterAssistant !== "All" || jefeModalFilterDate !== "All" || jefeModalSearchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            setJefeModalFilterAssistant("All");
                            setJefeModalFilterDate("All");
                            setJefeModalSearchQuery("");
                          }}
                          className="text-indigo-600 hover:underline font-bold"
                        >
                          Limpiar Filtros
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 font-bold text-[9px] uppercase tracking-wider">
                            <th className="p-3">OPERACIÓN / PROYECTO</th>
                            <th className="p-3">ASISTENTE APOYADO</th>
                            <th className="p-3">ACCIÓN / ESTADO</th>
                            <th className="p-3">FECHA Y HORA</th>
                            <th className="p-3">DETALLE / COMENTARIO</th>
                            <th className="p-3 text-center">HISTORIAL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredModalActions.map(act => (
                            <tr key={act.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="p-3">
                                <div className="font-mono font-bold text-indigo-700 text-xs">{act.opId}</div>
                                <div className="font-extrabold text-slate-800">{act.proyecto}</div>
                                <div className="text-[10px] text-slate-400 font-mono">Dpto: {act.dpto}</div>
                              </td>
                              <td className="p-3">
                                <div className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-800 border border-purple-200 px-2 py-1 rounded-lg text-xs font-bold">
                                  <User className="h-3 w-3 text-purple-600" />
                                  {act.assistantHelped}
                                </div>
                              </td>
                              <td className="p-3">
                                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                                  act.status === "Cierre Completo" || act.status === "Aprobado para Emisión"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : act.status?.toLowerCase().includes("observad")
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                }`}>
                                  {act.status}
                                </span>
                              </td>
                              <td className="p-3">
                                <div className="font-mono text-xs font-bold text-slate-700">{act.date}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{act.timestamp.includes(" / ") ? act.timestamp.split(" / ")[1] : ""}</div>
                              </td>
                              <td className="p-3 max-w-xs">
                                <p className="text-xs text-slate-600 font-medium line-clamp-2" title={act.comentario}>
                                  {act.comentario || <span className="text-slate-300 italic">Sin comentario</span>}
                                </p>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedHistoryRecord(act.record)}
                                  className="text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  <History className="h-3 w-3" />
                                  Ver
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filteredModalActions.length === 0 && (
                            <tr>
                              <td colSpan={6} className="p-8 text-center text-slate-400 italic text-xs">
                                No se encontraron acciones con los filtros seleccionados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                Acciones auditadas y registradas desde el historial de operaciones
              </span>
              <button
                type="button"
                onClick={() => setJefeDetailModalOpen(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
