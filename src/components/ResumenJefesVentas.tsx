import React, { useState, useMemo } from "react";
import { OperationRecord, AppSettings, UserAccount } from "../types";
import { 
  Calendar, 
  Search, 
  Copy, 
  Check, 
  Building2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet,
  Download,
  Share2,
  RefreshCw
} from "lucide-react";
import { 
  safeParseDate, 
  formatProjectAndUnits, 
  resolveRecordActionInRange, 
  ResolvedRecordAction,
  isCierreCompletoStatus,
  isObservadoStatus 
} from "../utils/dateUtils";

interface ResumenJefesVentasProps {
  records: OperationRecord[];
  settings: AppSettings;
  currentUser: UserAccount;
  statusColors?: Record<string, string>;
  onRefresh?: () => void;
}

interface JefeVentasGroup {
  name: string;
  assignedProjects: string[];
  records: (OperationRecord & { _resolvedAction?: ResolvedRecordAction })[];
}

// Format Date to YYYY-MM-DD for input value
function formatDateToInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ResumenJefesVentas({
  records,
  settings,
  currentUser,
  statusColors,
  onRefresh
}: ResumenJefesVentasProps) {
  // Automatically default to TODAY
  const todayStr = useMemo(() => formatDateToInput(new Date()), []);
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [filterJefe, setFilterJefe] = useState<string>("All");
  const [filterProject, setFilterProject] = useState<string>("All");
  const [copiedGroup, setCopiedGroup] = useState<string | null>(null);

  // Checkboxes for filtering (Image 8: Incluir emisiones y/o cambios de status, multi-select status filters)
  const [includeEmisiones, setIncludeEmisiones] = useState<boolean>(true);
  const [includeStatusChanges, setIncludeStatusChanges] = useState<boolean>(true);
  const [onlyCierresCompletos, setOnlyCierresCompletos] = useState<boolean>(false);
  const [onlyObservados, setOnlyObservados] = useState<boolean>(false);
  const [onlyObservadasOtrasAreas, setOnlyObservadasOtrasAreas] = useState<boolean>(false);

  // Helper to normalize project name
  const normalizeProjectName = (p?: string): string => {
    if (!p) return "Lima 41";
    if (p === "PRO000029" || p.trim() === "") return "Lima 41";
    return p;
  };

  // Helper to normalize team name
  const normalizeTeamName = (t?: string, asesor?: string): string => {
    if (t === "EQ000001") return "FRANCISCO";
    if (t === "EQ000002") return "JHAZMIN";
    if (t === "EQ000003") return "NINOSKA";
    if (t === "EQ000004" || (asesor && asesor.toUpperCase().includes("PAULA CASAS"))) return "TEAM PAULA";
    return t || "FRANCISCO";
  };

  // Determine all Jefes de Ventas and their assigned projects
  const jefesList = useMemo(() => {
    const list: { name: string; projects: string[]; teamName?: string }[] = [];
    const seenNames = new Set<string>();

    // 1. From settings.users with role "Jefe de Ventas"
    (settings?.users || []).forEach(u => {
      if (u.role === "Jefe de Ventas" && u.active !== false) {
        const norm = u.username.trim();
        if (!seenNames.has(norm.toLowerCase())) {
          seenNames.add(norm.toLowerCase());
          list.push({
            name: norm,
            projects: u.assignedProjects || [],
            teamName: u.teamName
          });
        }
      }
    });

    // 2. From settings.equipos
    (settings?.equipos || []).forEach(eq => {
      const jv = (eq.JefeVentas || "").trim();
      if (jv && !seenNames.has(jv.toLowerCase())) {
        seenNames.add(jv.toLowerCase());
        list.push({
          name: jv,
          projects: [],
          teamName: eq.NombreEquipo || eq.name
        });
      }
    });

    // 3. Known standard Jefes de Ventas if not yet in list
    const defaults = [
      { name: "Francisco", teamName: "FRANCISCO" },
      { name: "Jhazmin", teamName: "JHAZMIN" },
      { name: "Ninoska", teamName: "NINOSKA" },
      { name: "Paula Casas", teamName: "TEAM PAULA" }
    ];

    defaults.forEach(def => {
      if (!seenNames.has(def.name.toLowerCase())) {
        seenNames.add(def.name.toLowerCase());
        list.push({
          name: def.name,
          projects: [],
          teamName: def.teamName
        });
      }
    });

    // Resolve assigned projects for each Jefe de Ventas
    return list.map(item => {
      const assigned = new Set<string>(item.projects);

      // Check settings.proyectos for matching jefeVentas or matching team
      (settings?.proyectos || []).forEach(p => {
        const pName = normalizeProjectName(p.name);
        const pJefe = (p.jefeVentas || "").trim().toLowerCase();
        const pTeam = (p.team || "").trim().toUpperCase();

        if (pJefe && pJefe === item.name.toLowerCase()) {
          assigned.add(pName);
        } else if (item.teamName && pTeam === item.teamName.toUpperCase()) {
          assigned.add(pName);
        }
      });

      // Special standard project mappings
      if (item.name.toLowerCase() === "francisco" && assigned.size === 0) {
        assigned.add("Lima 41");
        assigned.add("Salaverry District");
      }

      return {
        name: item.name,
        projects: Array.from(assigned),
        teamName: item.teamName
      };
    });
  }, [settings]);

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

  // Helper to check if a record falls within the selected date range considering both checkboxes (Image 8)
  const isRecordInDateRange = (r: OperationRecord): boolean => {
    if (!startDate && !endDate) return true;

    // Check 1: Emisiones registradas en esas fechas (solicitud, emisión, creación)
    const hasEmissionInRange = 
      isDateWithinRange(r.solicitudAt) ||
      isDateWithinRange(r.solicitud) ||
      isDateWithinRange(r.createdAt) ||
      isDateWithinRange(r.emision) ||
      isDateWithinRange(r.emittedAt);

    // Check 2: Cambios de status realizados en esas fechas (historial de cambios o updatedAt)
    const hasStatusChangeInRange = 
      isDateWithinRange(r.updatedAt) ||
      (Array.isArray(r.history) && r.history.some(h => isDateWithinRange(h.timestamp)));

    if (includeEmisiones && includeStatusChanges) {
      return hasEmissionInRange || hasStatusChangeInRange;
    }
    if (includeEmisiones) {
      return hasEmissionInRange;
    }
    if (includeStatusChanges) {
      return hasStatusChangeInRange;
    }
    return false;
  };

  // Helper to extract clean observation reasons
  const getObservationReasons = (r: OperationRecord): string[] => {
    const reasons: string[] = [];
    if (r.observationReasons && Array.isArray(r.observationReasons) && r.observationReasons.length > 0) {
      r.observationReasons.forEach(res => {
        if (res && res.trim()) reasons.push(res.trim());
      });
    }

    // Also inspect history entries if not explicitly in r.observationReasons
    if (reasons.length === 0 && r.history && r.history.length > 0) {
      r.history.forEach(h => {
        if (h.observationReasons && Array.isArray(h.observationReasons)) {
          h.observationReasons.forEach(res => {
            if (res && !reasons.includes(res.trim())) reasons.push(res.trim());
          });
        }
      });
    }

    return reasons;
  };

  // Helper to get clean comment
  const getComment = (r: OperationRecord): string => {
    if (r.observacion && r.observacion.trim()) return r.observacion.trim();
    if (r.comentario && r.comentario.trim()) return r.comentario.trim();

    // Check latest history comment
    if (r.history && r.history.length > 0) {
      for (let i = r.history.length - 1; i >= 0; i--) {
        const h = r.history[i];
        if (h.comentario && h.comentario.trim()) {
          return h.comentario.trim();
        }
      }
    }

    return "";
  };

  // Group records by Jefe de Ventas strictly for their assigned projects
  const groupedData: JefeVentasGroup[] = useMemo(() => {
    return jefesList.map(jefe => {
      const jefeProjects = jefe.projects.map(p => p.toLowerCase());

      const matchingRecords: (OperationRecord & { _resolvedAction?: ResolvedRecordAction })[] = [];

      records.forEach(r => {
        // Resolve latest action on the selected date range
        const resolved = resolveRecordActionInRange(
          r,
          startDate,
          endDate,
          includeEmisiones,
          includeStatusChanges,
          onlyCierresCompletos,
          onlyObservados,
          onlyObservadasOtrasAreas
        );

        // If the record had no operational action in the selected range (or doesn't match status filters), exclude it
        if (!resolved.inRange) return;

        const recProj = normalizeProjectName(r.proyecto).toLowerCase();
        const recTeam = normalizeTeamName(r.team, r.asesor).toLowerCase();
        const rJefe = (r.jefeVentas || "").toLowerCase();

        // Check if project belongs to this Jefe de Ventas
        const isAssignedProject = jefeProjects.includes(recProj);
        const isDirectJefeMatch = rJefe === jefe.name.toLowerCase();
        const isTeamMatch = jefe.teamName && recTeam === jefe.teamName.toLowerCase();

        // Paula Casas special handling
        if (jefe.name.toLowerCase().includes("paula")) {
          const a = (r.asesor || "").toUpperCase();
          const t = (r.team || "").toUpperCase();
          const isPaulaOp = a.includes("PAULA CASAS") || t.includes("PAULA") || t === "EQ000004" || a === "ASE000028";
          if (!isPaulaOp) return;
          matchingRecords.push({ ...r, _resolvedAction: resolved });
          return;
        }

        // Exclude Agentes team operations from regular Jefes de Ventas
        const isAgente = (r.team || "").toUpperCase().includes("AGENTE");
        if (isAgente) return;

        // Regular Jefe de Ventas matches only assigned projects or direct assignment
        if (isAssignedProject || isDirectJefeMatch || isTeamMatch) {
          matchingRecords.push({ ...r, _resolvedAction: resolved });
        }
      });

      // Sort matching records by latest action date descending (newest first)
      matchingRecords.sort((a, b) => {
        const dateA = a._resolvedAction?.latestDate || a.solicitudAt || a.solicitud || a.createdAt;
        const dateB = b._resolvedAction?.latestDate || b.solicitudAt || b.solicitud || b.createdAt;
        const timeA = safeParseDate(dateA)?.getTime() || 0;
        const timeB = safeParseDate(dateB)?.getTime() || 0;
        return timeB - timeA;
      });

      return {
        name: jefe.name,
        assignedProjects: jefe.projects,
        records: matchingRecords
      };
    });
  }, [jefesList, records, startDate, endDate, includeEmisiones, includeStatusChanges, onlyCierresCompletos, onlyObservados, onlyObservadasOtrasAreas]);

  // Quick Preset Handlers
  const handleSetToday = () => {
    const today = formatDateToInput(new Date());
    setStartDate(today);
    setEndDate(today);
  };

  const handleSetYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = formatDateToInput(d);
    setStartDate(yesterday);
    setEndDate(yesterday);
  };

  const handleSetThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // 1 = Monday, 7 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek - 1));
    setStartDate(formatDateToInput(monday));
    setEndDate(formatDateToInput(now));
  };

  const handleSetThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(formatDateToInput(firstDay));
    setEndDate(formatDateToInput(now));
  };

  const handleClearDates = () => {
    setStartDate("");
    setEndDate("");
  };

  // Helper to format units cleanly for WhatsApp (DPTO 1219, ESTAC 89, etc.)
  const formatWhatsAppUnits = (r: OperationRecord): string => {
    const parts: string[] = [];
    if (r.dpto && r.dpto.trim()) {
      const d = r.dpto.trim();
      parts.push(d.toUpperCase().startsWith("DPTO") ? d.toUpperCase() : `DPTO ${d}`);
    }
    if (r.estac && r.estac.trim()) {
      const e = r.estac.trim();
      parts.push(e.toUpperCase().startsWith("ESTAC") ? e.toUpperCase() : `ESTAC ${e}`);
    }
    if (r.dep && r.dep.trim()) {
      const dep = r.dep.trim();
      parts.push(dep.toUpperCase().startsWith("DEP") ? dep.toUpperCase() : `DEP ${dep}`);
    }
    return parts.length > 0 ? parts.join(", ") : "SIN UNIDAD";
  };

  // Copy plain text summary formatted strictly for WhatsApp (matching Image 7)
  const handleCopySummary = (group: JefeVentasGroup) => {
    const dateLabel = startDate === endDate 
      ? (startDate ? `Fecha: ${startDate}` : "Histórico General")
      : `Período: ${startDate} al ${endDate}`;

    let text = `📋 *REPORTE DE OPERACIONES - JEFE DE VENTAS: ${group.name.toUpperCase()}*\n`;
    text += `${dateLabel}\n`;
    text += `Proyectos asignados: ${group.assignedProjects.join(", ") || "Todos"}\n`;
    text += `Total solicitudes: ${group.records.length}\n\n`;

    if (group.records.length === 0) {
      text += `_Sin solicitudes registradas en este período._`;
    } else {
      group.records.forEach((r, idx) => {
        const proj = normalizeProjectName(r.proyecto);
        const unit = formatWhatsAppUnits(r);
        const resolved = r._resolvedAction;
        const status = resolved?.latestStatus || r.status || "Pendiente";
        const comment = resolved?.latestComment !== undefined ? resolved.latestComment : getComment(r);
        const commentPart = comment ? ` | Comentario: ${comment}` : "";

        text += `${idx + 1}. *${proj}* - ${unit} | Estado: *${status}*${commentPart}\n`;
      });
    }

    navigator.clipboard.writeText(text.trim()).then(() => {
      setCopiedGroup(group.name);
      setTimeout(() => setCopiedGroup(null), 2500);
    });
  };

  // Filtered groups according to user selection
  const displayedGroups = useMemo(() => {
    let list = groupedData;

    // Filter by specific Jefe de Ventas if selected
    if (filterJefe !== "All") {
      list = list.filter(g => g.name.toLowerCase() === filterJefe.toLowerCase());
    }

    // Filter by project if selected
    if (filterProject !== "All") {
      list = list.map(g => ({
        ...g,
        records: g.records.filter(r => normalizeProjectName(r.proyecto) === filterProject)
      }));
    }

    return list;
  }, [groupedData, filterJefe, filterProject]);

  const totalFilteredOps = displayedGroups.reduce((acc, g) => acc + g.records.length, 0);

  // Helper for Status badge styling
  const getStatusBadgeClass = (status?: string): string => {
    if (!status) return "bg-slate-100 text-slate-700 border-slate-200";
    const colors = statusColors || settings.statusColors || {};
    if (colors[status]) return colors[status];
    const s = status.toLowerCase();
    if (s.includes("aprobado") || s.includes("cierre") || s.includes("entregado") || s.includes("emitid")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (s.includes("observad") || s.includes("rechazad")) {
      return "bg-rose-50 text-rose-800 border-rose-200";
    }
    if (s.includes("modificad")) {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    return "bg-blue-50 text-blue-800 border-blue-200";
  };

  return (
    <div className="space-y-6" id="resumen-jefes-ventas-container">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">
                Reporte para Jefes de Ventas
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Cuadro informativo dividido por cada Jefe de Ventas y sus solicitudes en proyectos asignados. Se actualiza en tiempo real.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Actualizar datos"
              >
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                <span>Actualizar</span>
              </button>
            )}
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-extrabold text-blue-800">
              Total: {totalFilteredOps} solicitudes
            </div>
          </div>
        </div>

        {/* Date Range Selector & Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px] uppercase">
              <Calendar className="h-4 w-4 text-brand-primary" />
              <span>Rango de Fecha:</span>
            </div>

            {/* Fecha Desde */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[10px] font-semibold uppercase">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-blue-100 rounded-xl bg-slate-50/50 text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            {/* Fecha Hasta */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 text-[10px] font-semibold uppercase">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-blue-100 rounded-xl bg-slate-50/50 text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={handleSetToday}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                  startDate === todayStr && endDate === todayStr
                    ? "bg-brand-primary text-white shadow-xs"
                    : "bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                Hoy
              </button>
              <button
                onClick={handleSetYesterday}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Ayer
              </button>
              <button
                onClick={handleSetThisWeek}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Esta Semana
              </button>
              <button
                onClick={handleSetThisMonth}
                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Este Mes
              </button>
              {(startDate || endDate) && (
                <button
                  onClick={handleClearDates}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all cursor-pointer"
                  title="Ver todo el historial sin filtro de fecha"
                >
                  Ver Todo
                </button>
              )}
            </div>
          </div>

          {/* Quick Filter by Jefe dropdown */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[10px] font-semibold uppercase">Filtrar Jefe:</span>
            <select
              value={filterJefe}
              onChange={(e) => setFilterJefe(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-blue-100 rounded-xl bg-slate-50/50 text-slate-700 font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary"
            >
              <option value="All">-- Todos los Jefes de Ventas --</option>
              {jefesList.map(j => (
                <option key={j.name} value={j.name}>{j.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Checkboxes for inclusion and status filtering (Images 2, 8, 9) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2.5 border-t border-blue-100/60">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Filtros:</span>
          
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={includeEmisiones}
              onChange={(e) => setIncludeEmisiones(e.target.checked)}
              className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer accent-blue-700"
            />
            <span>Incluir Emisiones registradas en las fechas seleccionadas</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors">
            <input
              type="checkbox"
              checked={includeStatusChanges}
              onChange={(e) => setIncludeStatusChanges(e.target.checked)}
              className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer accent-blue-700"
            />
            <span>Incluir Cambios de Status realizados en las fechas seleccionadas</span>
          </label>

          <div className="h-4 w-px bg-slate-200 hidden sm:block mx-1" />

          {/* Cierres Completos Filter Checkbox */}
          <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1.5 rounded-xl border transition-all ${
            onlyCierresCompletos 
              ? "bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs font-extrabold" 
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}>
            <input
              type="checkbox"
              checked={onlyCierresCompletos}
              onChange={(e) => setOnlyCierresCompletos(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Solo Cierres Completos
            </span>
          </label>

          {/* Observados (Asesor) Filter Checkbox */}
          <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1.5 rounded-xl border transition-all ${
            onlyObservados 
              ? "bg-rose-50 text-rose-800 border-rose-300 shadow-2xs font-extrabold" 
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}>
            <input
              type="checkbox"
              checked={onlyObservados}
              onChange={(e) => setOnlyObservados(e.target.checked)}
              className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Solo Observados (Asesor)
            </span>
          </label>

          {/* Observados (Otras Áreas) Filter Checkbox */}
          <label className={`flex items-center gap-2 text-xs font-bold cursor-pointer select-none px-3 py-1.5 rounded-xl border transition-all ${
            onlyObservadasOtrasAreas 
              ? "bg-blue-50 text-blue-800 border-blue-300 shadow-2xs font-extrabold" 
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}>
            <input
              type="checkbox"
              checked={onlyObservadasOtrasAreas}
              onChange={(e) => setOnlyObservadasOtrasAreas(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer accent-blue-600"
            />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Solo Observados (Otras Áreas)
            </span>
          </label>
        </div>
      </div>

      {/* Sections Divided by Jefe de Ventas */}
      <div className="space-y-6">
        {displayedGroups.map(group => {
          const opCount = group.records.length;
          const isCopied = copiedGroup === group.name;

          return (
            <div 
              key={group.name} 
              className="bg-white rounded-2xl border border-blue-100 shadow-xs overflow-hidden transition-all"
              id={`jefe-ventas-card-${group.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {/* Card Header for this Jefe de Ventas */}
              <div className="bg-slate-50/80 px-5 py-3.5 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-xs shadow-xs">
                    {group.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wide">
                        Jefe de Ventas: {group.name}
                      </h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        opCount > 0 
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                          : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}>
                        {opCount} {opCount === 1 ? "solicitud" : "solicitudes"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                      <span className="font-semibold text-slate-400 text-[10px] uppercase">Proyectos Asignados:</span>
                      <span className="font-medium text-slate-700">
                        {group.assignedProjects.length > 0 
                          ? group.assignedProjects.join(", ") 
                          : "Todos los proyectos del equipo"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Action: Copy Summary for WhatsApp */}
                <button
                  onClick={() => handleCopySummary(group)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto ${
                    isCopied 
                      ? "bg-emerald-600 text-white shadow-xs" 
                      : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                  title="Copiar resumen para WhatsApp o correo"
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copiado al portapapeles</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copiar para WhatsApp</span>
                    </>
                  )}
                </button>
              </div>

              {/* Table of Solicitudes */}
              {opCount === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <div className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-300">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <p className="font-semibold text-slate-500">Sin solicitudes registradas en este período</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {startDate && endDate 
                      ? `Rango: ${startDate} al ${endDate}` 
                      : "No hay operaciones registradas para los proyectos asignados"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider border-b border-slate-100">
                        <th className="py-2.5 px-4 w-44">Proyecto</th>
                        <th className="py-2.5 px-4 w-36">Unidad</th>
                        <th className="py-2.5 px-4 w-44">Status</th>
                        <th className="py-2.5 px-4 min-w-56">Motivos de Observación</th>
                        <th className="py-2.5 px-4 min-w-64">Comentario</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.records.map((record) => {
                        const resolved = record._resolvedAction;
                        const displayStatus = resolved?.latestStatus || record.status || "Pendiente";
                        const displayDate = resolved?.latestDate || record.solicitud || record.createdAt || "";
                        const comment = resolved?.latestComment !== undefined ? resolved.latestComment : getComment(record);
                        const obsReasons = resolved?.latestObservationReasons && resolved.latestObservationReasons.length > 0
                          ? resolved.latestObservationReasons
                          : getObservationReasons(record);
                        const unitFormatted = formatProjectAndUnits(record);
                        const projName = normalizeProjectName(record.proyecto);
                        const isObserved = displayStatus.toLowerCase().includes("observad") || displayStatus.toLowerCase().includes("rechazad");

                        return (
                          <tr 
                            key={record.id} 
                            className={`hover:bg-blue-50/30 transition-colors ${
                              isObserved ? "bg-rose-50/15" : ""
                            }`}
                          >
                            {/* 1. Proyecto */}
                            <td className="py-3 px-4 font-bold text-slate-800 align-top">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                                <span>{projName}</span>
                              </div>
                              {displayDate && (
                                <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                  {displayDate}
                                </div>
                              )}
                            </td>

                            {/* 2. Unidad */}
                            <td className="py-3 px-4 text-slate-700 font-semibold align-top">
                              <div className="inline-block bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md font-mono text-[11px]">
                                {unitFormatted || record.dpto || "—"}
                              </div>
                              {record.asesor && (
                                <div className="text-[10px] text-slate-400 mt-1">
                                  Asesor: <span className="text-slate-600 font-medium">{record.asesor}</span>
                                </div>
                              )}
                            </td>

                            {/* 3. Status */}
                            <td className="py-3 px-4 align-top">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border shadow-2xs ${
                                getStatusBadgeClass(displayStatus)
                              }`}>
                                {isObserved && <AlertCircle className="h-3 w-3 shrink-0" />}
                                <span>{displayStatus}</span>
                              </span>
                            </td>

                            {/* 4. Motivos de Observación (En caso lo hubiera) */}
                            <td className="py-3 px-4 align-top">
                              {obsReasons.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {obsReasons.map((reason, rIdx) => (
                                    <span 
                                      key={rIdx} 
                                      className="inline-block bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs"
                                    >
                                      {reason}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-300 font-mono text-xs">—</span>
                              )}
                            </td>

                            {/* 5. Comentario (En caso lo hubiera) */}
                            <td className="py-3 px-4 align-top">
                              {comment ? (
                                <p className="text-slate-700 text-xs leading-relaxed bg-slate-50/70 p-2 rounded-lg border border-slate-100 max-w-lg">
                                  {comment}
                                </p>
                              ) : (
                                <span className="text-slate-300 font-mono text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
