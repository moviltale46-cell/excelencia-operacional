import React, { useState } from "react";
import { OperationRecord } from "../types";
import { BarChart3, TrendingUp, Clock, AlertTriangle, FileText, CheckCircle2, User, Users, ShieldAlert, Calendar, List, HelpCircle } from "lucide-react";
import SearchableSelect from "./SearchableSelect";

interface KpiDashboardProps {
  records: OperationRecord[];
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

  // Attempt to parse standard dates (might be ISO or Peruvian text format "YYYY-MM-DD HH:MM")
  const parseTimestamp = (str: string): Date | null => {
    try {
      const d = new Date(str.replace(/-/g, "/"));
      if (!isNaN(d.getTime())) return d;
      const iso = new Date(str);
      if (!isNaN(iso.getTime())) return iso;
    } catch {}
    return null;
  };

  const start = parseTimestamp(startStr);
  const end = parseTimestamp(endStr);

  if (!start || !end || start.getTime() >= end.getTime()) {
    return 0;
  }

  const WORK_START_HOUR = 9;
  const WORK_END_HOUR = 18;
  
  let totalMs = 0;
  let current = new Date(start.getTime());

  // Loop day by day to be 100% precise
  while (current.getTime() < end.getTime()) {
    const day = current.getDay(); // 0 = Sun, 6 = Sat
    const isWorkingDay = day >= 1 && day <= 5 && !isPeruHoliday(current); // Mon-Fri and NOT holiday

    if (isWorkingDay) {
      const workStartToday = new Date(current.getTime());
      workStartToday.setHours(WORK_START_HOUR, 0, 0, 0);

      const workEndToday = new Date(current.getTime());
      workEndToday.setHours(WORK_END_HOUR, 0, 0, 0);

      // Overlap calculation
      const startMs = Math.max(current.getTime(), workStartToday.getTime());
      const endMs = Math.min(end.getTime(), workEndToday.getTime());

      if (startMs < endMs) {
        totalMs += (endMs - startMs);
      }
    }

    // Advance to next day midnight
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  // Convert to hours
  return totalMs / (1000 * 60 * 60);
}

// Helper to determine first action timestamp on an operation record (made by assistant or jefe legal)
function getFirstActionTime(r: OperationRecord): string | undefined {
  const startStr = r.solicitudAt || r.createdAt;
  if (!startStr) return undefined;

  const parseTimestamp = (str: string): Date | null => {
    try {
      const d = new Date(str.replace(/-/g, "/"));
      if (!isNaN(d.getTime())) return d;
      const iso = new Date(str);
      if (!isNaN(iso.getTime())) return iso;
    } catch {}
    return null;
  };

  const start = parseTimestamp(startStr);
  if (!start) return undefined;

  let earliestAction: Date | null = null;

  // 1. Look for history entries after start date
  if (r.history && r.history.length > 0) {
    r.history.forEach(h => {
      if (!h.timestamp) return;
      const hDate = parseTimestamp(h.timestamp);
      if (hDate && !isNaN(hDate.getTime())) {
        // Tolerancia de 60 segundos para evitar detectar la inicialización del registro original
        if (hDate.getTime() > start.getTime() + 60000) {
          if (!earliestAction || hDate.getTime() < earliestAction.getTime()) {
            earliestAction = hDate;
          }
        }
      }
    });
  }

  // 2. Look for emittedAt as a fallback
  if (r.emittedAt) {
    const emitDate = parseTimestamp(r.emittedAt);
    if (emitDate && !isNaN(emitDate.getTime())) {
      if (emitDate.getTime() > start.getTime() + 60000) {
        if (!earliestAction || emitDate.getTime() < earliestAction.getTime()) {
          earliestAction = emitDate;
        }
      }
    }
  }

  return earliestAction ? earliestAction.toISOString() : undefined;
}

export default function KpiDashboard({ records }: KpiDashboardProps) {
  // Filters
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedTeam, setSelectedTeam] = useState("All");
  const [selectedAssistant, setSelectedAssistant] = useState("All");
  
  // Interactive KPI card/button filter state
  const [activeKpiFilter, setActiveKpiFilter] = useState<"all" | "pending" | "approved" | "observed">("all");

  // Extract unique projects, teams, and assistants for filters
  const uniqueProjects = Array.from(new Set(records.map(r => r.proyecto))).filter(Boolean);
  const uniqueTeams = Array.from(new Set(records.map(r => r.team))).filter(Boolean);
  const uniqueAssistants = Array.from(new Set(records.map(r => r.derivadoA))).filter(Boolean);

  // Apply filters to records used for KPIs
  const filteredRecords = records.filter(r => {
    const projMatch = selectedProject === "All" || r.proyecto === selectedProject;
    const teamMatch = selectedTeam === "All" || r.team === selectedTeam;
    const assistantMatch = selectedAssistant === "All" || r.derivadoA === selectedAssistant;
    return projMatch && teamMatch && assistantMatch;
  });

  const totalRecords = filteredRecords.length;
  const pendingCount = filteredRecords.filter(r => r.status === "Pendiente de Firma" || r.status === "En Revisión Técnica").length;
  const approvedCount = filteredRecords.filter(r => r.status === "Aprobado para Emisión" || r.status === "Cierre Completo").length;
  const observedCount = filteredRecords.filter(r => r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observado") || r.status?.toLowerCase().includes("rechazado")).length;

  // Calculate working hours response times using first action taken
  const workingHoursList: number[] = [];
  filteredRecords.forEach(r => {
    const startTime = r.solicitudAt || r.createdAt;
    const actionTime = getFirstActionTime(r) || r.emittedAt;

    if (startTime && actionTime) {
      const diffHrs = getWorkingHoursDiff(startTime, actionTime);
      if (diffHrs > 0) {
        workingHoursList.push(diffHrs);
      }
    }
  });

  const avgWorkingResponseHrs = workingHoursList.length > 0
    ? (workingHoursList.reduce((a, b) => a + b, 0) / workingHoursList.length).toFixed(1)
    : "0.0";

  // Calculate observations by advisor
  const advisorObservations: { [key: string]: { total: number; current: number; team: string } } = {};
  filteredRecords.forEach(r => {
    const isCurrentlyObserved = r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observado") || r.status?.toLowerCase().includes("rechazado");
    
    let historicObsCount = 0;
    if (r.history) {
      r.history.forEach(h => {
        const isObs = h.status === "Observado / Rechazado" || h.status?.toLowerCase().includes("observado") || h.status?.toLowerCase().includes("rechazado");
        if (isObs) {
          historicObsCount++;
        }
      });
    }

    const totalObs = (isCurrentlyObserved ? 1 : 0) + historicObsCount;
    if (totalObs > 0) {
      if (!advisorObservations[r.asesor]) {
        advisorObservations[r.asesor] = { total: 0, current: 0, team: r.team || "A" };
      }
      advisorObservations[r.asesor].total += totalObs;
      if (isCurrentlyObserved) {
        advisorObservations[r.asesor].current += 1;
      }
    }
  });

  // Calculate response times per Legal Assistant (Asistente Legal)
  const assistantResponseTimes: { [key: string]: { totalHrs: number; count: number } } = {};
  filteredRecords.forEach(r => {
    const assistant = r.derivadoA;
    if (assistant) {
      const startTime = r.solicitudAt || r.createdAt;
      const actionTime = getFirstActionTime(r) || r.emittedAt;

      if (startTime && actionTime) {
        const diffHrs = getWorkingHoursDiff(startTime, actionTime);
        if (diffHrs > 0) {
          if (!assistantResponseTimes[assistant]) {
            assistantResponseTimes[assistant] = { totalHrs: 0, count: 0 };
          }
          assistantResponseTimes[assistant].totalHrs += diffHrs;
          assistantResponseTimes[assistant].count += 1;
        }
      }
    }
  });

  // Sort advisors by most observations descending
  const sortedAdvisors = Object.entries(advisorObservations)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.total - a.total);

  // Group Observations by Team for visual overview
  const observationsByTeam: { [key: string]: number } = {};
  Object.values(advisorObservations).forEach(obs => {
    observationsByTeam[obs.team] = (observationsByTeam[obs.team] || 0) + obs.total;
  });

  // Filter records for detailed listing at the bottom based on activeKpiFilter selection
  const recordsToDisplay = filteredRecords.filter(r => {
    if (activeKpiFilter === "all") return true;
    if (activeKpiFilter === "pending") {
      return r.status === "Pendiente de Firma" || r.status === "En Revisión Técnica";
    }
    if (activeKpiFilter === "approved") {
      return r.status === "Aprobado para Emisión" || r.status === "Cierre Completo";
    }
    if (activeKpiFilter === "observed") {
      return r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observado") || r.status?.toLowerCase().includes("rechazado");
    }
    return true;
  });

  return (
    <div className="space-y-6" id="kpi-dashboard-container">
      
      {/* Dynamic Filters Bar */}
      <section className="bg-slate-50 p-4 rounded-2xl border border-blue-50 flex flex-wrap gap-4 items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-brand-primary" />
          <span className="font-bold text-xs text-slate-700 uppercase tracking-wide">Filtros Avanzados KPI</span>
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
                { value: "All", label: "-- Todos --" },
                ...uniqueProjects.map(p => ({ value: p, label: p }))
              ]}
              placeholder="Buscar proyecto..."
              className="w-40"
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
                { value: "All", label: "-- Todos --" },
                ...uniqueTeams.map(t => ({ value: t, label: t }))
              ]}
              placeholder="Buscar equipo..."
              className="w-40"
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
                { value: "All", label: "-- Todos --" },
                ...uniqueAssistants.map(a => ({ value: a, label: a }))
              ]}
              placeholder="Buscar asistente..."
              className="w-40"
            />
          </div>
        </div>
      </section>

      {/* Bento Grid Stats - Clickable buttons to filter */}
      <section className="space-y-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
          Presiona una tarjeta para filtrar el listado detallado al final de la pestaña
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {/* Total records button */}
          <button 
            onClick={() => setActiveKpiFilter("all")}
            className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
              activeKpiFilter === "all" 
                ? "bg-blue-50/70 border-brand-primary ring-2 ring-brand-primary/20 shadow-md scale-[1.02]" 
                : "bg-white border-blue-100 hover:border-blue-300 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-2.5 bg-blue-100 text-brand-primary rounded-xl shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Operac.</p>
              <h4 className="text-xl font-black text-slate-900 mt-0.5">{totalRecords}</h4>
            </div>
          </button>

          {/* Pending button */}
          <button 
            onClick={() => setActiveKpiFilter("pending")}
            className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
              activeKpiFilter === "pending" 
                ? "bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20 shadow-md scale-[1.02]" 
                : "bg-white border-blue-100 hover:border-amber-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">Pendientes</p>
              <h4 className="text-xl font-black text-slate-900 mt-0.5">{pendingCount}</h4>
            </div>
          </button>

          {/* Approved button */}
          <button 
            onClick={() => setActiveKpiFilter("approved")}
            className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
              activeKpiFilter === "approved" 
                ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md scale-[1.02]" 
                : "bg-white border-blue-100 hover:border-emerald-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">Aprobadas</p>
              <h4 className="text-xl font-black text-slate-900 mt-0.5">{approvedCount}</h4>
            </div>
          </button>

          {/* Observed button */}
          <button 
            onClick={() => setActiveKpiFilter("observed")}
            className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
              activeKpiFilter === "observed" 
                ? "bg-rose-50/70 border-rose-500 ring-2 ring-rose-500/20 shadow-md scale-[1.02]" 
                : "bg-white border-blue-100 hover:border-rose-400 hover:bg-slate-50/40 shadow-xs"
            }`}
          >
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">Observadas</p>
              <h4 className="text-xl font-black text-slate-900 mt-0.5">{observedCount}</h4>
            </div>
          </button>

          {/* Response time card (no click action, but updates with filters) */}
          <div className="p-3.5 bg-white border border-blue-100 shadow-xs rounded-2xl flex items-center gap-3 relative group">
            <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">Tiempo Resp.</p>
                <div 
                  className="text-slate-400 cursor-help text-[9px] bg-slate-100 h-3.5 w-3.5 rounded-full flex items-center justify-center font-bold font-mono" 
                  title="Calculado desde sellado por Jefe Legal hasta primera acción del asistente o jefe legal (Lunes a Viernes 9am-6pm, sin feriados)"
                >
                  ?
                </div>
              </div>
              <h4 className="text-xl font-black text-slate-900 mt-0.5 truncate">
                {avgWorkingResponseHrs} <span className="text-[10px] font-bold text-slate-400">hrs</span>
              </h4>
            </div>
          </div>
        </div>
      </section>

      {/* Main KPI Analysis Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Advisor Observations Leaderboard */}
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Observaciones por Asesor</h4>
            </div>
            <span className="text-[10px] bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full font-bold">Historial + Actual</span>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto max-h-[280px] pr-1">
            {sortedAdvisors.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-8">No se registran asesores observados con los filtros actuales.</p>
            ) : (
              sortedAdvisors.map((adv) => {
                const totalObs = adv.total;
                const maxObs = Math.max(...sortedAdvisors.map(a => a.total), 1);
                const pct = (totalObs / maxObs) * 100;

                return (
                  <div key={adv.name} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-slate-400" />
                        <span className="font-bold text-slate-700">{adv.name}</span>
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-mono uppercase">{adv.team}</span>
                      </div>
                      <div className="font-bold text-slate-900">
                        {totalObs} {totalObs === 1 ? 'obs' : 'obs.'} <span className="text-[10px] text-slate-400 font-normal">({adv.current} act.)</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-rose-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

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
                        {avgHrs.toFixed(1)} hrs <span className="text-[10px] text-slate-400 font-normal">({data.count} exp.)</span>
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

      </div>

      {/* Observations by Team overview */}
      <section className="bg-white p-5 rounded-2xl border border-blue-100 shadow-xs">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-1">
          <BarChart3 className="h-4 w-4 text-rose-500" />
          Acumulado de Observaciones por Team / Equipo
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {uniqueTeams.map((teamName) => {
            const count = observationsByTeam[teamName] || 0;
            return (
              <div key={teamName} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{teamName}</span>
                <p className="text-xl font-black text-slate-800 mt-1">{count}</p>
                <span className="text-[9px] text-slate-400 font-medium">Observaciones</span>
              </div>
            );
          })}
          {uniqueTeams.length === 0 && (
            <p className="text-xs text-slate-400 italic col-span-4 text-center">Sin datos de equipos para agrupar.</p>
          )}
        </div>
      </section>

      {/* NEW SECTION: Click-filtered records detailed view */}
      <section className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4 animate-fadeIn">
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
          
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Filtro Activo:</span>
            <span className="bg-blue-50 text-brand-primary border border-blue-100 text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              {activeKpiFilter === "all" && "Todas las Operaciones"}
              {activeKpiFilter === "pending" && "Pendientes de Firma / Revisión"}
              {activeKpiFilter === "approved" && "Aprobadas / Cierre Completo"}
              {activeKpiFilter === "observed" && "Observadas / Rechazadas"}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border border-blue-50/70 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-blue-50 text-slate-500 font-bold text-[9px] uppercase tracking-wider">
                <th className="p-3">EXPEDIENTE / PROYECTO</th>
                <th className="p-3">ASESOR / TEAM</th>
                <th className="p-3">TIPO</th>
                <th className="p-3">ASISTENTE</th>
                <th className="p-3">ESTADO ACTUAL</th>
                <th className="p-3 text-center">TIEMPO RESPUESTA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-50/50">
              {recordsToDisplay.map((r) => {
                const startTime = r.solicitudAt || r.createdAt;
                const actionTime = getFirstActionTime(r) || r.emittedAt;
                
                let responseText = "No accionado aún";
                let responseHours = 0;
                
                if (startTime) {
                  if (actionTime) {
                    responseHours = getWorkingHoursDiff(startTime, actionTime);
                    responseText = `${responseHours.toFixed(1)} hrs`;
                  } else {
                    // Pending - calculate current elapsed working hours
                    responseHours = getWorkingHoursDiff(startTime, new Date().toISOString());
                    responseText = `${responseHours.toFixed(1)} hrs (transc.)`;
                  }
                }

                return (
                  <tr key={r.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="p-3">
                      <div className="font-mono text-[9px] text-slate-400">EXP-{r.id.substr(4, 3).toUpperCase()}</div>
                      <div className="font-bold text-slate-700">{r.proyecto}</div>
                      <div className="text-[10px] text-slate-400">DPTO: {r.dpto || "-"} • ESTAC: {r.estac || "-"} • DEP: {r.dep || "-"}</div>
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
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${
                        r.status === "Aprobado para Emisión" || r.status === "Cierre Completo"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observado")
                          ? "bg-rose-50 text-rose-700 border-rose-100"
                          : "bg-amber-50 text-amber-700 border-amber-100"
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
                  </tr>
                );
              })}
              {recordsToDisplay.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 italic text-xs">
                    Ningún expediente coincide con los criterios de filtrado seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
