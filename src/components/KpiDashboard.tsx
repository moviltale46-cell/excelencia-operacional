import React, { useState } from "react";
import { AppSettings, OperationRecord, STANDARD_OBSERVATIONS, UserAccount } from "../types";
import { 
  BarChart3, TrendingUp, Clock, AlertTriangle, FileText, CheckCircle2, 
  User, Users, ShieldAlert, Calendar, List, Edit3, ShieldCheck, 
  Eye, History, ChevronRight, CheckSquare, XCircle, PieChart, Layers
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import StatusHistoryModal from "./StatusHistoryModal";
import DailyObservationsControlChart from "./DailyObservationsControlChart";
import { safeParseDate, formatHoursHHMM } from "../utils/dateUtils";
import { calculateBusinessTime } from "../utils/workingHours";

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

// Precise business hours difference calculator (Mon-Fri 9:00 AM - 6:00 PM) excluding holidays
function getWorkingHoursDiff(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;

  const start = safeParseDate(startStr);
  const end = safeParseDate(endStr);

  if (!start || !end || start.getTime() >= end.getTime()) {
    return 0;
  }

  const WORK_START_HOUR = 9;
  const WORK_END_HOUR = 18;
  
  let totalMs = 0;
  let current = new Date(start.getTime());

  while (current < end) {
    const dayOfWeek = current.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = isPeruHoliday(current);

    if (!isWeekend && !isHoliday) {
      const currentYear = current.getFullYear();
      const currentMonth = current.getMonth();
      const currentDate = current.getDate();

      const dayWorkStart = new Date(currentYear, currentMonth, currentDate, WORK_START_HOUR, 0, 0, 0);
      const dayWorkEnd = new Date(currentYear, currentMonth, currentDate, WORK_END_HOUR, 0, 0, 0);

      const segmentStart = current.getTime() < dayWorkStart.getTime() ? dayWorkStart : current;
      const segmentEnd = end.getTime() > dayWorkEnd.getTime() ? dayWorkEnd : end;

      if (segmentStart < segmentEnd) {
        totalMs += (segmentEnd.getTime() - segmentStart.getTime());
      }

      current = new Date(currentYear, currentMonth, currentDate + 1, WORK_START_HOUR, 0, 0, 0);
    } else {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, WORK_START_HOUR, 0, 0, 0);
    }
  }

  return totalMs / (1000 * 60 * 60);
}

// Find first action taken in history
function getFirstActionTime(record: OperationRecord): string | null {
  if (record.history && record.history.length > 0) {
    const sorted = [...record.history]
      .map(h => ({ ...h, parsedDate: safeParseDate(h.timestamp) }))
      .filter(h => h.parsedDate !== null)
      .sort((a, b) => a.parsedDate!.getTime() - b.parsedDate!.getTime());
    
    if (sorted.length > 0 && sorted[0].timestamp) {
      return sorted[0].timestamp;
    }
  }
  return null;
}

interface AdvisorMetric {
  name: string;
  team: string;
  totalOps: number;
  observedCount: number; // Columna 1: Observado (errores, rechazos, documentación incompleta)
  modifiedCount: number; // Columna 2: Modificado (cambios, reajustes, correcciones)
  totalIncidents: number; // Total toques/errores = observedCount + modifiedCount
  affectedOps: number;
  errorRate: number; // % of operations with incidents
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

  // Helper to normalize request type
  const normalizeTipo = (t?: string) => {
    const s = (t || "").toUpperCase();
    if (s.includes("EMISI")) return "EMISION";
    if (s.includes("MODIFIC")) return "MODIFICACION";
    if (s.includes("ADENDA")) return "ADENDA";
    return "OTROS";
  };

  // Extract unique filter dropdown values
  const uniqueProjects = Array.from(new Set(records.map(r => r.proyecto).filter(Boolean))).sort();
  const uniqueTeams = Array.from(new Set(records.map(r => r.team).filter(Boolean))).sort();
  const uniqueAssistants = Array.from(new Set(records.map(r => r.derivadoA).filter(Boolean))).sort() as string[];

  // Filter records based on active dropdowns
  const filteredRecords = records.filter(r => {
    const projMatch = selectedProject === "All" || r.proyecto === selectedProject;
    const teamMatch = selectedTeam === "All" || r.team === selectedTeam;
    const assistantMatch = selectedAssistant === "All" || r.derivadoA === selectedAssistant;
    const advisorMatch = !filterAdvisorName || r.asesor === filterAdvisorName;
    return projMatch && teamMatch && assistantMatch && advisorMatch;
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

  const totalRecords = filteredRecords.length;
  const pendingCount = filteredRecords.filter(r => r.status === "Pendiente de Firma" || r.status === "En Revisión Técnica").length;
  const approvedCount = filteredRecords.filter(r => r.status === "Aprobado para Emisión" || r.status === "Cierre Completo").length;
  
  // Count records with observations vs modifications
  const isObservedRecord = (r: OperationRecord) => {
    const isCur = r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observad") || r.status?.toLowerCase().includes("rechazad");
    const hasHist = r.history?.some(h => (h.status && (h.status.toLowerCase().includes("observad") || h.status.toLowerCase().includes("rechazad"))) || (h.comentario && h.comentario.toLowerCase().includes("[observación]")));
    return isCur || Boolean(hasHist);
  };

  const isModifiedRecord = (r: OperationRecord) => {
    const isCur = r.status === "Modificado" || r.status?.toLowerCase().includes("modificad");
    const hasHist = r.history?.some(h => (h.status && h.status.toLowerCase().includes("modificad")) || (h.comentario && (h.comentario.toLowerCase().includes("[modificación]") || h.comentario.toLowerCase().includes("se actualizaron"))));
    return isCur || Boolean(hasHist);
  };

  const observedCount = filteredRecords.filter(isObservedRecord).length;
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
    if (reason === "Otros." && (fullText.includes("otros") || fullText.includes("otro motivo"))) return true;

    return false;
  };

  // Calculate observation counts across all filtered records
  const observationReasonCounts: { [reason: string]: number } = {};
  STANDARD_OBSERVATIONS.forEach(reason => {
    observationReasonCounts[reason] = 0;
  });

  filteredRecords.forEach(r => {
    STANDARD_OBSERVATIONS.forEach(reason => {
      if (matchesObservationReason(r, reason)) {
        observationReasonCounts[reason] += 1;
      }
    });
  });

  const totalObservationReasonHits = Object.values(observationReasonCounts).reduce((a, b) => a + b, 0);

  const sortedObservationReasons = STANDARD_OBSERVATIONS.map(reason => ({
    reason,
    count: observationReasonCounts[reason] || 0,
    percentage: totalObservationReasonHits > 0 ? Math.round(((observationReasonCounts[reason] || 0) / totalObservationReasonHits) * 100) : 0
  })).sort((a, b) => b.count - a.count);

  // Calculate working minutes response times using first action taken
  const workingMinutesList: number[] = [];
  const workingHoursList: number[] = [];

  filteredRecords.forEach(r => {
    const startTime = r.solicitudAt || r.createdAt;
    const actionTime = getFirstActionTime(r) || r.emittedAt;

    if (startTime && actionTime) {
      const diffHrs = getWorkingHoursDiff(startTime, actionTime);
      if (diffHrs > 0) {
        workingHoursList.push(diffHrs);
        workingMinutesList.push(Math.round(diffHrs * 60));
      }
    }
  });

  const avgWorkingResponseMinutes = workingMinutesList.length > 0
    ? Math.round(workingMinutesList.reduce((a, b) => a + b, 0) / workingMinutesList.length)
    : 0;

  const avgWorkingResponseHrs = workingHoursList.length > 0
    ? (workingHoursList.reduce((a, b) => a + b, 0) / workingHoursList.length).toFixed(1)
    : "0.0";

  // Calculate Advisor Response Time (Hours/Minutes from Observation to Advisor Correction/Response)
  const advisorResponseMinutesList: number[] = [];
  filteredRecords.forEach(r => {
    const obsIndex = (r.history || []).findIndex(h =>
      (h.status && (h.status.toLowerCase().includes("observad") || h.status.toLowerCase().includes("rechazad"))) ||
      (h.comentario && h.comentario.toLowerCase().includes("[observación]"))
    );

    if (obsIndex !== -1 && r.history) {
      const obsTime = r.history[obsIndex]?.timestamp;
      const subsequentAction = r.history.slice(obsIndex + 1).find(h =>
        (h.status && !h.status.toLowerCase().includes("observad")) ||
        (h.comentario && !h.comentario.toLowerCase().includes("[observación]"))
      );

      const endTime = subsequentAction?.timestamp || (r.status?.toLowerCase().includes("observad") ? new Date().toISOString() : null);
      if (obsTime && endTime) {
        const diffHrs = getWorkingHoursDiff(obsTime, endTime);
        if (diffHrs >= 0) {
          advisorResponseMinutesList.push(Math.round(diffHrs * 60));
        }
      }
    } else if (r.status?.toLowerCase().includes("observad") || r.status?.toLowerCase().includes("rechazad")) {
      const obsTime = r.updatedAt || r.solicitudAt || r.createdAt;
      if (obsTime) {
        const diffHrs = getWorkingHoursDiff(obsTime, new Date().toISOString());
        if (diffHrs >= 0) {
          advisorResponseMinutesList.push(Math.round(diffHrs * 60));
        }
      }
    }
  });

  const avgAdvisorResponseMinutes = advisorResponseMinutesList.length > 0
    ? Math.round(advisorResponseMinutesList.reduce((a, b) => a + b, 0) / advisorResponseMinutesList.length)
    : 0;

  // Calculate detailed advisor metrics distinguishing OBSERVADO vs MODIFICADO
  const advisorMap: { [key: string]: AdvisorMetric } = {};

  filteredRecords.forEach(r => {
    const advName = (r.asesor || "").trim() || "Sin Asesor Asignado";
    if (!advisorMap[advName]) {
      advisorMap[advName] = {
        name: advName,
        team: r.team || "A",
        totalOps: 0,
        observedCount: 0,
        modifiedCount: 0,
        totalIncidents: 0,
        affectedOps: 0,
        errorRate: 0
      };
    }

    advisorMap[advName].totalOps += 1;

    let obsInRec = 0;
    let modInRec = 0;

    if (r.history && r.history.length > 0) {
      r.history.forEach(h => {
        const hIsObs = (h.status && (h.status.toLowerCase().includes("observad") || h.status.toLowerCase().includes("rechazad"))) ||
                       (h.comentario && h.comentario.toLowerCase().includes("[observación]"));
        const hIsMod = (h.status && h.status.toLowerCase().includes("modificad")) ||
                       (h.comentario && (h.comentario.toLowerCase().includes("[modificación]") || h.comentario.toLowerCase().includes("se actualizaron")));
        
        if (hIsObs) obsInRec++;
        else if (hIsMod) modInRec++;
      });
    }

    // Check current status if history doesn't capture it
    const isCurObs = r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observad") || r.status?.toLowerCase().includes("rechazad");
    const isCurMod = r.status === "Modificado" || r.status?.toLowerCase().includes("modificad");

    if (obsInRec === 0 && isCurObs) obsInRec = 1;
    if (modInRec === 0 && isCurMod) modInRec = 1;

    advisorMap[advName].observedCount += obsInRec;
    advisorMap[advName].modifiedCount += modInRec;
    advisorMap[advName].totalIncidents += (obsInRec + modInRec);

    if (obsInRec > 0 || modInRec > 0) {
      advisorMap[advName].affectedOps += 1;
    }
  });

  Object.values(advisorMap).forEach(adv => {
    adv.errorRate = adv.totalOps > 0 ? Math.min(100, Math.round((adv.totalIncidents / adv.totalOps) * 100)) : 0;
  });

  // Sort advisors by most total incidents, then observations
  const sortedAdvisorMetrics = Object.values(advisorMap).sort((a, b) => {
    if (b.totalIncidents !== a.totalIncidents) return b.totalIncidents - a.totalIncidents;
    if (b.observedCount !== a.observedCount) return b.observedCount - a.observedCount;
    return b.totalOps - a.totalOps;
  });

  // Group Observations and Modifications by Team
  const teamMetrics: { [key: string]: { observed: number; modified: number; totalOps: number } } = {};
  filteredRecords.forEach(r => {
    const t = r.team || "Sin Team";
    if (!teamMetrics[t]) {
      teamMetrics[t] = { observed: 0, modified: 0, totalOps: 0 };
    }
    teamMetrics[t].totalOps += 1;
    if (isObservedRecord(r)) teamMetrics[t].observed += 1;
    if (isModifiedRecord(r)) teamMetrics[t].modified += 1;
  });

  // Calculate response times per Legal Assistant using configured business working hours
  const assistantResponseTimes: { [key: string]: { totalMins: number; totalHrs: number; count: number } } = {};
  filteredRecords.forEach(r => {
    const assistant = r.derivadoA;
    if (assistant) {
      const startTime = r.solicitudAt || r.solicitud || r.createdAt;
      const actionTime = getFirstActionTime(r) || r.emittedAt || r.emision;

      if (startTime && actionTime) {
        const bRes = calculateBusinessTime(startTime, actionTime, settings?.workingSchedule);
        if (bRes.totalMinutes >= 0) {
          if (!assistantResponseTimes[assistant]) {
            assistantResponseTimes[assistant] = { totalMins: 0, totalHrs: 0, count: 0 };
          }
          assistantResponseTimes[assistant].totalHrs += bRes.totalHours;
          assistantResponseTimes[assistant].totalMins += bRes.totalMinutes;
          assistantResponseTimes[assistant].count += 1;
        }
      }
    }
  });

  // Filter records for detailed listing at the bottom based on activeKpiFilter selection
  const recordsToDisplay = filteredRecords.filter(r => {
    if (filterObservationReason) {
      if (!matchesObservationReason(r, filterObservationReason)) return false;
    }
    if (activeKpiFilter === "all") return true;
    if (activeKpiFilter === "pending") {
      return r.status === "Pendiente de Firma" || r.status === "En Revisión Técnica" || r.status === "Pendiente";
    }
    if (activeKpiFilter === "approved") {
      return r.status === "Aprobado para Emisión" || r.status === "Cierre Completo";
    }
    if (activeKpiFilter === "observed") {
      return isObservedRecord(r);
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
      
      {/* Dynamic Filters Bar */}
      <section className="bg-slate-50 p-4 rounded-2xl border border-blue-50 flex flex-wrap gap-4 items-center justify-between shadow-xs">
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

          {/* Card 2: Pendientes de Firma */}
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
                Pendientes de Firma
              </p>
              <h4 className="text-2xl font-black text-slate-900 mt-1">{pendingCount}</h4>
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">En trámite y revisión técnica</p>
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

        {/* ROW 2: 3 Incident & Quality KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card 4: Observadas / Rechazadas */}
          <button 
            onClick={() => setActiveKpiFilter("observed")}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all cursor-pointer ${
              activeKpiFilter === "observed" 
                ? "bg-rose-50/80 border-rose-500 ring-2 ring-rose-500/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-rose-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl shrink-0 mt-0.5">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                  Observadas / Rechazos
                </p>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mt-1">{observedCount}</h4>
              <p className="text-[10px] text-rose-600 font-medium mt-0.5">Errores u observaciones detectadas por Legal</p>
            </div>
          </button>

          {/* Card 5: Modificaciones / Correcciones */}
          <button 
            onClick={() => setActiveKpiFilter("modified")}
            className={`p-5 rounded-2xl border text-left flex items-start gap-4 transition-all cursor-pointer ${
              activeKpiFilter === "modified" 
                ? "bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 shadow-md scale-[1.01]" 
                : "bg-white border-blue-100 hover:border-amber-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl shrink-0 mt-0.5">
              <Edit3 className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                  Modificaciones / Cambios
                </p>
              </div>
              <h4 className="text-2xl font-black text-slate-900 mt-1">{modifiedCount}</h4>
              <p className="text-[10px] text-amber-600 font-medium mt-0.5">Reajustes de datos o campos tras emisión</p>
            </div>
          </button>

          {/* Card 6: Tiempos de Respuesta (Legal & Asesor) */}
          <div className="p-5 bg-white border border-blue-100 shadow-xs rounded-2xl flex items-start gap-4 relative group hover:border-purple-300 transition-all">
            <div className="p-3 bg-purple-100 text-purple-700 rounded-2xl shrink-0 mt-0.5">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-black text-slate-500 uppercase tracking-wide">
                  Tiempos de Respuesta
                </p>
                <div 
                  className="text-purple-600 cursor-help text-[9px] bg-purple-50 px-1.5 py-0.2 rounded-md font-bold font-mono border border-purple-100" 
                  title="Calculado en minutos hábiles (Lunes a Viernes 9:00 - 18:00, sin feriados)."
                >
                  Horario Hábil
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-1 border-t border-slate-100">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 block uppercase">Atención Legal</span>
                  <div className="flex items-baseline gap-1">
                    <h4 className="text-xl font-black text-purple-900">
                      {avgWorkingResponseMinutes} <span className="text-xs font-bold text-purple-600">min</span>
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">({avgWorkingResponseHrs}h)</span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium">Solicitud → Acción</p>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-rose-600 block uppercase">Respuesta Asesor</span>
                  <div className="flex items-baseline gap-1">
                    <h4 className="text-xl font-black text-rose-900">
                      {avgAdvisorResponseMinutes} <span className="text-xs font-bold text-rose-600">min</span>
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">({(avgAdvisorResponseMinutes / 60).toFixed(1)}h)</span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium">Observado → Respuesta</p>
                </div>
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

      {/* Control de Calidad e Incidentes por Asesor (2 DISTINCT COLUMNS: OBSERVADO & MODIFICADO) */}
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
                Mide cuántas veces se equivoca un asesor diferenciando en 2 columnas: <strong>Observado (Rechazos)</strong> vs <strong>Modificado (Correcciones)</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {sortedAdvisorMetrics.length} Asesores Evaluados
            </span>
          </div>
        </div>

        {/* Table with 2 distinct columns */}
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
                <th className="p-3.5 text-center">TOTAL INCIDENTES</th>
                <th className="p-3.5 text-center">OPERACIONES TOTALES</th>
                <th className="p-3.5 text-center">TASA DE INCIDENCIA</th>
                <th className="p-3.5 text-center">CALIDAD</th>
                <th className="p-3.5 text-center">VER DETALLE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAdvisorMetrics.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic text-xs">
                    No se registran datos de asesores para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                sortedAdvisorMetrics.map((adv) => {
                  const isSelected = filterAdvisorName === adv.name;
                  // User rule: Differentiate between modification and observation; higher observations trigger the critical alert
                  const isCritical = adv.observedCount >= 2 || (adv.observedCount >= 1 && adv.modifiedCount >= 2) || adv.modifiedCount >= 4;
                  const isAttention = !isCritical && (adv.observedCount === 1 || adv.modifiedCount >= 1);
                  const isOptimal = adv.observedCount === 0 && adv.modifiedCount === 0;

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
        
        {/* Legal Assistant response times */}
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-primary" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Eficiencia Asistentes Legales</h4>
            </div>
            <span className="text-[10px] bg-purple-50 text-purple-800 px-2.5 py-0.5 rounded-full font-bold">Tiempo hábil (Horas)</span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto max-h-[280px] pr-1">
            {Object.keys(assistantResponseTimes).length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">No se registran mediciones de tiempo de respuesta para asistentes legales.</p>
            ) : (
              Object.entries(assistantResponseTimes).map(([username, data]) => {
                const avgHrs = data.count > 0 ? (data.totalHrs / data.count) : 0;
                const maxAvgHrs = Math.max(...Object.values(assistantResponseTimes).map(d => d.count > 0 ? d.totalHrs / d.count : 0), 1);
                const pct = (avgHrs / maxAvgHrs) * 100;

                return (
                  <div key={username} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full bg-brand-secondary"></div>
                        <span className="font-extrabold text-slate-700 capitalize">{username}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatHoursHHMM(avgHrs)} <span className="text-[10px] text-slate-400 font-normal">({avgHrs.toFixed(1)} hrs • {data.count} exp.)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-brand-primary h-full rounded-full transition-all duration-500"
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
              return (
                <div key={teamName} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">TEAM {teamName}</span>
                    <span className="text-[9px] text-slate-400">{data.totalOps} ops</span>
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
                    ? "bg-rose-50/90 border-rose-300 ring-2 ring-rose-300/60 shadow-xs"
                    : hasHits
                    ? "bg-white hover:bg-slate-50/80 border-slate-200 hover:border-slate-300 shadow-2xs"
                    : "bg-slate-50/50 border-slate-100 opacity-60 hover:opacity-100"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="text-[10px] font-mono font-extrabold text-slate-400 bg-slate-100 w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold leading-snug break-words ${
                        isSelected ? "text-rose-950" : hasHits ? "text-slate-800" : "text-slate-500"
                      }`}>
                        {item.reason}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                        {item.percentage}% del total de incidencias
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block font-mono text-sm font-black px-2.5 py-0.5 rounded-lg ${
                      isSelected
                        ? "bg-rose-600 text-white"
                        : hasHits
                        ? "bg-rose-100 text-rose-800"
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
                      isSelected ? "bg-rose-600" : hasHits ? "bg-rose-500" : "bg-slate-300"
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

      {/* Click-filtered records detailed view */}
      <section id="expedientes-detallados-kpi" className="bg-white p-5 rounded-3xl border border-blue-100 shadow-sm space-y-4 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <List className="h-4.5 w-4.5 text-brand-primary" />
            <div>
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                Expedientes Detallados ({recordsToDisplay.length})
              </h4>
              <p className="text-[10px] text-slate-400 font-medium">Lista de operaciones correspondientes al filtro seleccionado</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {filterAdvisorName && (
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold px-2 py-0.5 rounded-full">
                Asesor: {filterAdvisorName}
              </span>
            )}
            {filterObservationReason && (
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[9px] font-bold px-2 py-0.5 rounded-full">
                Motivo: {filterObservationReason}
              </span>
            )}
            <span className="bg-blue-50 text-brand-primary border border-blue-100 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              {activeKpiFilter === "all" && "Todas las Operaciones"}
              {activeKpiFilter === "pending" && "Pendientes de Firma / Revisión"}
              {activeKpiFilter === "approved" && "Aprobadas / Cierre Completo"}
              {activeKpiFilter === "observed" && "Observadas / Rechazadas"}
              {activeKpiFilter === "modified" && "Modificadas / Con Reajustes"}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-blue-50/70 rounded-2xl">
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
                const startTime = r.solicitudAt || r.createdAt;
                const actionTime = getFirstActionTime(r) || r.emittedAt;
                
                let responseText = "No accionado aún";
                let responseHours = 0;
                let responseMins = 0;
                
                if (startTime) {
                  if (actionTime) {
                    responseHours = getWorkingHoursDiff(startTime, actionTime);
                    responseMins = Math.round(responseHours * 60);
                    responseText = `${responseMins} min (${formatHoursHHMM(responseHours)})`;
                  } else {
                    responseHours = getWorkingHoursDiff(startTime, new Date().toISOString());
                    responseMins = Math.round(responseHours * 60);
                    responseText = `${responseMins} min transc. (${formatHoursHHMM(responseHours)})`;
                  }
                }

                const historyCount = (r.history && r.history.length) || 0;

                return (
                  <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="p-3">
                      <div className="font-mono text-[9px] text-slate-400">ID: {r.id.toUpperCase()}</div>
                      <div className="font-bold text-slate-700">{r.proyecto}</div>
                      <div className="text-[10px] text-slate-400 font-mono">dpto: {r.dpto || "-"} | estac: {r.estac || "-"} | dep: {r.dep || "-"}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-700 uppercase">{r.asesor}</div>
                      <div className="text-[9px] text-slate-400 font-bold">TEAM: {r.team || "Sin asignar"}</div>
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
                        actionTime 
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
      </section>

      {/* History Modal Popup */}
      {selectedHistoryRecord && (
        <StatusHistoryModal
          record={selectedHistoryRecord}
          statusColors={statusColors}
          onClose={() => setSelectedHistoryRecord(null)}
        />
      )}

    </div>
  );
}
