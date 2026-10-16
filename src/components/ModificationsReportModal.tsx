import React, { useState, useMemo } from "react";
import { 
  FileText, 
  FileSpreadsheet, 
  Download, 
  X, 
  Search, 
  Filter, 
  ArrowUpDown, 
  ArrowDown, 
  ArrowUp, 
  Users, 
  Building, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  List, 
  Layers, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw,
  Sparkles,
  BarChart3
} from "lucide-react";
import { AppSettings, OperationRecord } from "../types";
import { 
  extractAllModificationsReport, 
  downloadModificationsExcel, 
  OperationModificationItem, 
  AdvisorModificationRanking 
} from "../utils/exportModificationsReport";
import { generateModificationsReportPdf } from "../utils/generateModificationsReportPdf";

interface ModificationsReportModalProps {
  records: OperationRecord[];
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

export default function ModificationsReportModal({
  records,
  settings,
  isOpen,
  onClose,
  initialStartDate = "",
  initialEndDate = ""
}: ModificationsReportModalProps) {
  const [activeTab, setActiveTab] = useState<"advisors" | "operations" | "summaries">("advisors");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [advisorSortDir, setAdvisorSortDir] = useState<"desc" | "asc">("desc");
  const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState<string | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState<string>(initialStartDate);
  const [endDate, setEndDate] = useState<string>(initialEndDate);
  const [datePreset, setDatePreset] = useState<string>("all");

  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Extract base modifications report
  const rawReportData = useMemo(() => {
    return extractAllModificationsReport(records, settings, startDate, endDate);
  }, [records, settings, startDate, endDate]);

  // Date Presets Handler
  const handleApplyDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const formatYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const t = formatYMD(now);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === "this_month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatYMD(first));
      setEndDate(formatYMD(now));
    } else if (preset === "last_month") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatYMD(first));
      setEndDate(formatYMD(last));
    } else if (preset === "last_30_days") {
      const past = new Date(now);
      past.setDate(now.getDate() - 30);
      setStartDate(formatYMD(past));
      setEndDate(formatYMD(now));
    }
  };

  // Filtered Advisors ranking
  const filteredAdvisors = useMemo(() => {
    let list = rawReportData.advisorRankings;

    if (selectedProject !== "ALL") {
      list = list.filter(adv => 
        adv.operations.some(op => op.proyecto.trim().toLowerCase() === selectedProject.trim().toLowerCase())
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(adv => 
        adv.advisorName.toLowerCase().includes(q) ||
        adv.team.toLowerCase().includes(q) ||
        adv.jefeVentas.toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      return advisorSortDir === "asc" 
        ? a.modificationsCount - b.modificationsCount 
        : b.modificationsCount - a.modificationsCount;
    });
  }, [rawReportData.advisorRankings, selectedProject, searchQuery, advisorSortDir]);

  // Filtered Operations
  const filteredOperations = useMemo(() => {
    let list = rawReportData.operations;

    if (selectedAdvisorFilter) {
      list = list.filter(op => op.asesor.trim().toLowerCase() === selectedAdvisorFilter.trim().toLowerCase());
    }

    if (selectedProject !== "ALL") {
      list = list.filter(op => op.proyecto.trim().toLowerCase() === selectedProject.trim().toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(op => 
        op.id.toLowerCase().includes(q) ||
        op.proyecto.toLowerCase().includes(q) ||
        op.unidad.toLowerCase().includes(q) ||
        op.asesor.toLowerCase().includes(q) ||
        op.team.toLowerCase().includes(q) ||
        op.modificationEvents.some(e => e.comment.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => b.modificationsCount - a.modificationsCount);
  }, [rawReportData.operations, selectedAdvisorFilter, selectedProject, searchQuery]);

  // Unique projects list
  const uniqueProjects = useMemo(() => {
    const set = new Set<string>();
    rawReportData.operations.forEach(op => {
      if (op.proyecto) set.add(op.proyecto);
    });
    return Array.from(set).sort();
  }, [rawReportData.operations]);

  const handleExportExcel = () => {
    setIsExportingExcel(true);
    try {
      downloadModificationsExcel(records, settings, startDate, endDate);
    } catch (e: any) {
      alert("Error al exportar Excel: " + e.message);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    setIsExportingPdf(true);
    try {
      const doc = generateModificationsReportPdf(records, settings, {
        startDate,
        endDate,
        advisorSortDir,
        customData: rawReportData
      });
      const dateStr = new Date().toISOString().split("T")[0];
      doc.save(`Reporte_Modificaciones_Asesores_${dateStr}.pdf`);
    } catch (e: any) {
      alert("Error al exportar PDF: " + e.message);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-indigo-100 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleUp">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-300">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white uppercase">
                  Reporte Especializado de Modificaciones de Minutas
                </h2>
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Exclusivo Modificaciones
                </span>
              </div>
              <p className="text-xs text-blue-200/80 font-medium">
                Conoce la cantidad de emisiones que solicitaron modificaciones por operación y los asesores con más cambios pedidos.
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Descargar libro Excel con Ranking de Asesores, Detalle por Operación y Resumen por Proyecto"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>{isExportingExcel ? "Exportando..." : "Descargar Excel"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Descargar informe oficial en PDF para gerencia"
            >
              <FileText className="h-4 w-4" />
              <span>{isExportingPdf ? "Generando..." : "Descargar PDF"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer ml-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="bg-slate-50 border-b border-slate-200/70 p-4 shrink-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-2xl border border-blue-100 shadow-2xs">
              <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider block">
                Total Emisiones Período
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {rawReportData.totalEmissionsCount}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">minutas</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-rose-100 shadow-2xs">
              <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider block">
                Operaciones Modificadas
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-rose-700 font-mono">
                  {rawReportData.operationsWithModificationsCount}
                </span>
                <span className="text-[10px] text-rose-600 font-bold">con cambios</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-purple-100 shadow-2xs">
              <span className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider block">
                Total Modificaciones Pedidas
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-purple-900 font-mono">
                  {rawReportData.totalModificationsCount}
                </span>
                <span className="text-[10px] text-purple-600 font-bold">solicitudes</span>
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-emerald-100 shadow-2xs">
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider block">
                Tasa Global de Modificación
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-emerald-900 font-mono">
                  {rawReportData.overallModificationRate}%
                </span>
                <span className="text-[10px] text-emerald-600 font-medium">de emisiones</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3.5 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[200px] sm:min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar asesor, proyecto, unidad o ID..."
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:bg-white focus:border-brand-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Project Filter */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Proyecto:</span>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none cursor-pointer"
              >
                <option value="ALL">Todos los Proyectos ({rawReportData.operations.length})</option>
                {uniqueProjects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Advisor filter active indicator */}
            {selectedAdvisorFilter && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span>Asesor: {selectedAdvisorFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedAdvisorFilter(null)}
                  className="hover:text-indigo-950 font-black cursor-pointer"
                  title="Quitar filtro de asesor"
                >
                  ×
                </button>
              </span>
            )}
          </div>

          {/* Date range & direction controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Presets */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-[10px]">
              <button
                type="button"
                onClick={() => handleApplyDatePreset("all")}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  datePreset === "all" ? "bg-white text-brand-primary shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Todo
              </button>
              <button
                type="button"
                onClick={() => handleApplyDatePreset("this_month")}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  datePreset === "this_month" ? "bg-white text-brand-primary shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Este Mes
              </button>
              <button
                type="button"
                onClick={() => handleApplyDatePreset("last_month")}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  datePreset === "last_month" ? "bg-white text-brand-primary shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Mes Anterior
              </button>
              <button
                type="button"
                onClick={() => handleApplyDatePreset("last_30_days")}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  datePreset === "last_30_days" ? "bg-white text-brand-primary shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                30 Días
              </button>
            </div>

            {/* Custom Dates */}
            <div className="flex items-center gap-1 text-[10px]">
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setDatePreset("custom"); }}
                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none"
              />
              <span className="text-slate-400 font-bold">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setDatePreset("custom"); }}
                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none"
              />
            </div>

            {/* Sort direction toggle */}
            <button
              type="button"
              onClick={() => setAdvisorSortDir(prev => prev === "desc" ? "asc" : "desc")}
              className="h-8 px-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 transition-all cursor-pointer"
              title="Cambiar orden de clasificación"
            >
              {advisorSortDir === "desc" ? <ArrowDown className="h-3.5 w-3.5 text-rose-600" /> : <ArrowUp className="h-3.5 w-3.5 text-blue-600" />}
              <span>{advisorSortDir === "desc" ? "Mayor a Menor" : "Menor a Mayor"}</span>
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-100 p-1 border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("advisors")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "advisors"
                ? "bg-white text-brand-primary shadow-xs"
                : "text-slate-600 hover:bg-white/50"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Ranking de Asesores ({filteredAdvisors.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("operations")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "operations"
                ? "bg-white text-brand-primary shadow-xs"
                : "text-slate-600 hover:bg-white/50"
            }`}
          >
            <List className="h-4 w-4" />
            <span>Detalle por Operación ({filteredOperations.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("summaries")}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "summaries"
                ? "bg-white text-brand-primary shadow-xs"
                : "text-slate-600 hover:bg-white/50"
            }`}
          >
            <Building className="h-4 w-4" />
            <span>Por Proyecto & Equipo</span>
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* TAB 1: RANKING DE ASESORES */}
          {activeTab === "advisors" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                    Asesores Inmobiliarios que Solicitaron Más Modificaciones
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Clasificación ordenada por cantidad total de modificaciones solicitadas a minutas emitidas.
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {filteredAdvisors.length} asesores encontrados
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3 text-center w-12">#</th>
                      <th className="py-2.5 px-3">Asesor Inmobiliario</th>
                      <th className="py-2.5 px-3">Equipo Comercial</th>
                      <th className="py-2.5 px-3">Jefe de Ventas</th>
                      <th className="py-2.5 px-3 text-center">Modificaciones Pedidas</th>
                      <th className="py-2.5 px-3 text-center">Operaciones Afectadas</th>
                      <th className="py-2.5 px-3 text-center">Total Operaciones</th>
                      <th className="py-2.5 px-3 text-center">% Tasa Modificación</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAdvisors.map((adv, idx) => (
                      <tr 
                        key={adv.advisorName}
                        className={`hover:bg-blue-50/50 transition-colors ${
                          idx < 3 ? "bg-amber-50/20" : idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center font-extrabold font-mono">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                            idx === 0 
                              ? "bg-amber-500 text-white shadow-2xs" 
                              : idx === 1 
                              ? "bg-slate-400 text-white" 
                              : idx === 2 
                              ? "bg-amber-700 text-white" 
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {adv.advisorName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">
                          {adv.team}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">
                          {adv.jefeVentas}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="inline-block bg-rose-100 text-rose-800 font-mono font-black text-xs px-2.5 py-0.5 rounded-full border border-rose-200">
                            {adv.modificationsCount} modif.
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-700 font-mono">
                          {adv.affectedOperationsCount}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                          {adv.totalOperationsCount}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-rose-500 h-full rounded-full"
                                style={{ width: `${Math.min(adv.modificationRate, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-slate-700 text-[11px]">
                              {adv.modificationRate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAdvisorFilter(adv.advisorName);
                              setActiveTab("operations");
                            }}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[10px] transition-all cursor-pointer"
                          >
                            Ver Operaciones ({adv.operations.length})
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAdvisors.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                          No se encontraron asesores con modificaciones para el criterio seleccionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: DETALLE POR OPERACIÓN */}
          {activeTab === "operations" && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                    Detalle de Emisiones que Solicitaron Modificaciones
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Cantidad de modificaciones registradas por cada operación individual, con historial cronológico de cambios.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAdvisorFilter && (
                    <button
                      type="button"
                      onClick={() => setSelectedAdvisorFilter(null)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer"
                    >
                      Mostrar Todos los Asesores
                    </button>
                  )}
                  <span className="text-xs font-bold text-slate-400">
                    {filteredOperations.length} operaciones
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">ID</th>
                      <th className="py-2.5 px-3">Proyecto & Unidad</th>
                      <th className="py-2.5 px-3">Asesor</th>
                      <th className="py-2.5 px-3">Equipo Comercial</th>
                      <th className="py-2.5 px-3 text-center">Nº Modificaciones</th>
                      <th className="py-2.5 px-3 text-center">Estado Actual</th>
                      <th className="py-2.5 px-3">Última Modificación</th>
                      <th className="py-2.5 px-3">Asistente Legal</th>
                      <th className="py-2.5 px-3 text-center">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOperations.map((op) => {
                      const isExpanded = expandedOpId === op.id;
                      return (
                        <React.Fragment key={op.id}>
                          <tr className={`hover:bg-blue-50/50 transition-colors ${op.modificationsCount > 1 ? "bg-rose-50/20" : "bg-white"}`}>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                              {op.id}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              <div>{op.proyecto}</div>
                              <div className="text-[10px] text-slate-500 font-normal">{op.unidad}</div>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">
                              {op.asesor}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-medium">
                              {op.team}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`inline-flex items-center gap-1 font-mono font-black text-xs px-2.5 py-0.5 rounded-full ${
                                op.modificationsCount > 1 
                                  ? "bg-rose-100 text-rose-800 border border-rose-200" 
                                  : "bg-amber-100 text-amber-800 border border-amber-200"
                              }`}>
                                {op.modificationsCount}x
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {op.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[10px]">
                              {op.ultimaModificacionFecha}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 font-medium">
                              {op.asistenteLegal}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => setExpandedOpId(isExpanded ? null : op.id)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
                                title="Ver historial de cambios de esta operación"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded History Drawer */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                              <td colSpan={9} className="p-3 pl-8">
                                <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                                    <span className="text-[10px] font-extrabold text-slate-700 uppercase">
                                      Eventos de Modificación Registrados ({op.modificationEvents.length})
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      Ingreso inicial: {op.fechaIngreso} | Emisión inicial: {op.fechaEmisionInicial}
                                    </span>
                                  </div>

                                  <div className="space-y-1.5">
                                    {op.modificationEvents.map((evt, eIdx) => (
                                      <div key={eIdx} className="flex items-start gap-2.5 text-[11px] p-1.5 rounded bg-slate-50 border border-slate-100">
                                        <span className="font-bold text-rose-700 font-mono bg-rose-50 px-1.5 py-0.5 rounded text-[10px]">
                                          Modif. #{eIdx + 1}
                                        </span>
                                        <div className="flex-1">
                                          <div className="font-medium text-slate-800">
                                            {evt.comment}
                                          </div>
                                          <div className="text-[9px] text-slate-400 mt-0.5">
                                            Fecha: {evt.date} | Solicitado por: {evt.user} | Asistente: {evt.assistant}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {filteredOperations.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                          No hay operaciones con modificaciones registradas en este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: POR PROYECTO & EQUIPO */}
          {activeTab === "summaries" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Project summary */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-brand-primary" />
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                      Modificaciones por Proyecto Inmobiliario
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {rawReportData.projectSummaries.length} proyectos
                  </span>
                </div>

                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase border-b border-slate-100">
                      <th className="py-2 px-3">Proyecto</th>
                      <th className="py-2 px-3 text-center">Modificaciones</th>
                      <th className="py-2 px-3 text-center">Ops. Afectadas</th>
                      <th className="py-2 px-3 text-center">% Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawReportData.projectSummaries.map((proj) => (
                      <tr key={proj.project} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-800">{proj.project}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-rose-700">{proj.modificationsCount}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-600">{proj.affectedOperationsCount}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{proj.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Team summary */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-indigo-600" />
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                      Modificaciones por Equipo Comercial
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {rawReportData.teamSummaries.length} equipos
                  </span>
                </div>

                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase border-b border-slate-100">
                      <th className="py-2 px-3">Equipo</th>
                      <th className="py-2 px-3">Jefe de Ventas</th>
                      <th className="py-2 px-3 text-center">Modificaciones</th>
                      <th className="py-2 px-3 text-center">% Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rawReportData.teamSummaries.map((team) => (
                      <tr key={team.team} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-800">{team.team}</td>
                        <td className="py-2 px-3 text-slate-600 font-medium">{team.jefeVentas}</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-rose-700">{team.modificationsCount}</td>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">{team.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <span>Mostrando datos de modificaciones exclusivamente para minutas emitidas.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 font-bold transition-all cursor-pointer text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
