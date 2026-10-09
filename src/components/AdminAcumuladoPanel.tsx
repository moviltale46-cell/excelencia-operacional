import React, { useState, useMemo } from "react";
import { 
  BarChart3, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Users, 
  Building, 
  Layers, 
  ShieldCheck, 
  Filter, 
  Calendar, 
  Search, 
  TrendingUp, 
  Download, 
  ArrowUpRight, 
  Sparkles,
  Mail,
  Send,
  ChevronDown,
  Check,
  Percent,
  Edit3,
  Trash2,
  X,
  Save
} from "lucide-react";
import * as XLSX from "xlsx";
import { OperationRecord, AppSettings, UserAccount, FileReviewRecord, DEFAULT_FILE_REVIEW_OBSERVATIONS } from "../types";
import { safeParseDate, formatDateTimeFull, isOtherAreasObservation } from "../utils/dateUtils";

interface AdminAcumuladoPanelProps {
  records: OperationRecord[];
  fileReviews: FileReviewRecord[];
  settings: AppSettings;
  currentUser: UserAccount | null;
  onOpenFileReview?: () => void;
  onUpdateFileReview?: (id: string, updates: Partial<FileReviewRecord>) => Promise<void>;
  onDeleteFileReview?: (id: string) => Promise<void>;
}

export default function AdminAcumuladoPanel({
  records,
  fileReviews,
  settings,
  currentUser,
  onOpenFileReview,
  onUpdateFileReview,
  onDeleteFileReview
}: AdminAcumuladoPanelProps) {
  // Filter States
  const [selectedMonth, setSelectedMonth] = useState<string>("ALL");
  const [selectedProject, setSelectedProject] = useState<string>("ALL");
  const [selectedAsistente, setSelectedAsistente] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"consolidado" | "fileReviews" | "operaciones">("consolidado");
  const [editingReviewRecord, setEditingReviewRecord] = useState<FileReviewRecord | null>(null);

  const activeChecklistItems = useMemo(() => {
    const list = (settings.fileReviewObservations && settings.fileReviewObservations.length > 0)
      ? settings.fileReviewObservations
      : DEFAULT_FILE_REVIEW_OBSERVATIONS;
    return list.filter(item => item.active !== false);
  }, [settings.fileReviewObservations]);

  // Check role: Only Administrator
  const isAdmin = currentUser?.role === "Administrador";

  // Available months from both records and fileReviews
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      const d = safeParseDate(r.solicitudAt || r.solicitud || r.createdAt);
      if (d) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    fileReviews.forEach(fr => {
      const d = safeParseDate(fr.createdAt);
      if (d) set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(set).sort().reverse();
  }, [records, fileReviews]);

  // Available projects
  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    if (settings.proyectos) settings.proyectos.forEach(p => p.name && set.add(p.name.trim()));
    records.forEach(r => r.proyecto && set.add(r.proyecto.trim()));
    fileReviews.forEach(fr => fr.proyecto && set.add(fr.proyecto.trim()));
    return Array.from(set).sort();
  }, [settings.proyectos, records, fileReviews]);

  // Available Assistants (Revisores)
  const availableAssistants = useMemo(() => {
    const set = new Set<string>();
    if (settings.users) {
      settings.users
        .filter(u => u.role === "Asistente Legal" || u.role === "Jefe Legal")
        .forEach(u => set.add(u.username));
    }
    fileReviews.forEach(fr => fr.reviewedBy && set.add(fr.reviewedBy));
    records.forEach(r => r.derivadoA && set.add(r.derivadoA));
    return Array.from(set).sort();
  }, [settings.users, fileReviews, records]);

  // Filtered File Reviews
  const filteredFileReviews = useMemo(() => {
    return fileReviews.filter(fr => {
      // Month
      if (selectedMonth !== "ALL") {
        const d = safeParseDate(fr.createdAt);
        if (d) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (mKey !== selectedMonth) return false;
        }
      }
      // Date Range
      if (startDate) {
        const d = safeParseDate(fr.createdAt);
        if (d && d < new Date(startDate + "T00:00:00")) return false;
      }
      if (endDate) {
        const d = safeParseDate(fr.createdAt);
        if (d && d > new Date(endDate + "T23:59:59")) return false;
      }
      // Project
      if (selectedProject !== "ALL" && fr.proyecto.toLowerCase() !== selectedProject.toLowerCase()) {
        return false;
      }
      // Assistant
      if (selectedAsistente !== "ALL" && fr.reviewedBy.toLowerCase() !== selectedAsistente.toLowerCase()) {
        return false;
      }
      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${fr.proyecto} ${fr.unidades} ${fr.asesor} ${fr.reviewedBy} ${fr.observaciones.join(" ")} ${fr.comentarios || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [fileReviews, selectedMonth, startDate, endDate, selectedProject, selectedAsistente, searchQuery]);

  // Filtered Operation Records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // Month
      if (selectedMonth !== "ALL") {
        const d = safeParseDate(r.solicitudAt || r.solicitud || r.createdAt);
        if (d) {
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (mKey !== selectedMonth) return false;
        }
      }
      // Date Range
      if (startDate) {
        const d = safeParseDate(r.solicitudAt || r.solicitud || r.createdAt);
        if (d && d < new Date(startDate + "T00:00:00")) return false;
      }
      if (endDate) {
        const d = safeParseDate(r.solicitudAt || r.solicitud || r.createdAt);
        if (d && d > new Date(endDate + "T23:59:59")) return false;
      }
      // Project
      if (selectedProject !== "ALL" && r.proyecto.toLowerCase() !== selectedProject.toLowerCase()) {
        return false;
      }
      // Assistant (derivadoA or updatedByUser)
      if (selectedAsistente !== "ALL") {
        const deriv = (r.derivadoA || "").toLowerCase();
        const updater = (r.updatedByUser || "").toLowerCase();
        const target = selectedAsistente.toLowerCase();
        if (deriv !== target && updater !== target) return false;
      }
      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${r.proyecto} ${r.asesor} ${r.tipo} ${r.status} ${r.dpto || ""} ${r.comentario || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [records, selectedMonth, startDate, endDate, selectedProject, selectedAsistente, searchQuery]);

  // Cumulative Metrics Calculations
  const metrics = useMemo(() => {
    // 1. File Reviews
    const totalFiles = filteredFileReviews.length;
    const filesConformes = filteredFileReviews.filter(f => f.isConforme).length;
    const filesObservados = totalFiles - filesConformes;
    const filesConformeRate = totalFiles > 0 ? ((filesConformes / totalFiles) * 100).toFixed(1) : "0.0";
    const filesEmailsSent = filteredFileReviews.filter(f => f.emailSent).length;

    // 2. Operaciones
    const totalOps = filteredRecords.length;
    const opsEmitidas = filteredRecords.filter(r => {
      const st = (r.status || "").toLowerCase();
      return st.includes("emitid") || st.includes("cierre") || Boolean(r.emision);
    }).length;
    const opsPendientes = totalOps - opsEmitidas;
    const opsObservadas = filteredRecords.filter(r => {
      const st = (r.status || "").toLowerCase();
      return st.includes("observad") || st.includes("rechazad");
    }).length;
    const opsEmitidasRate = totalOps > 0 ? ((opsEmitidas / totalOps) * 100).toFixed(1) : "0.0";

    // 3. Consolidated Grand Total
    const granTotalTramites = totalFiles + totalOps;
    const granTotalFinalizados = filesConformes + opsEmitidas;

    return {
      totalFiles,
      filesConformes,
      filesObservados,
      filesConformeRate,
      filesEmailsSent,
      totalOps,
      opsEmitidas,
      opsPendientes,
      opsObservadas,
      opsEmitidasRate,
      granTotalTramites,
      granTotalFinalizados
    };
  }, [filteredFileReviews, filteredRecords]);

  // Breakdown by Project (Consolidated)
  const projectBreakdown = useMemo(() => {
    const map: Record<string, {
      proyecto: string;
      totalFiles: number;
      filesConformes: number;
      filesObservados: number;
      totalOps: number;
      opsEmitidas: number;
      totalTramites: number;
    }> = {};

    availableProjects.forEach(p => {
      map[p] = {
        proyecto: p,
        totalFiles: 0,
        filesConformes: 0,
        filesObservados: 0,
        totalOps: 0,
        opsEmitidas: 0,
        totalTramites: 0
      };
    });

    filteredFileReviews.forEach(fr => {
      const p = fr.proyecto.trim();
      if (!map[p]) {
        map[p] = { proyecto: p, totalFiles: 0, filesConformes: 0, filesObservados: 0, totalOps: 0, opsEmitidas: 0, totalTramites: 0 };
      }
      map[p].totalFiles += 1;
      if (fr.isConforme) map[p].filesConformes += 1;
      else map[p].filesObservados += 1;
      map[p].totalTramites += 1;
    });

    filteredRecords.forEach(r => {
      const p = r.proyecto.trim();
      if (!map[p]) {
        map[p] = { proyecto: p, totalFiles: 0, filesConformes: 0, filesObservados: 0, totalOps: 0, opsEmitidas: 0, totalTramites: 0 };
      }
      map[p].totalOps += 1;
      const st = (r.status || "").toLowerCase();
      if (st.includes("emitid") || st.includes("cierre") || Boolean(r.emision)) {
        map[p].opsEmitidas += 1;
      }
      map[p].totalTramites += 1;
    });

    return Object.values(map)
      .filter(item => item.totalTramites > 0)
      .sort((a, b) => b.totalTramites - a.totalTramites);
  }, [availableProjects, filteredFileReviews, filteredRecords]);

  // Breakdown by Assistant
  const assistantBreakdown = useMemo(() => {
    const map: Record<string, {
      asistente: string;
      filesRevisados: number;
      filesConformes: number;
      filesObservados: number;
      opsAsignadas: number;
      opsEmitidas: number;
    }> = {};

    availableAssistants.forEach(a => {
      map[a] = {
        asistente: a,
        filesRevisados: 0,
        filesConformes: 0,
        filesObservados: 0,
        opsAsignadas: 0,
        opsEmitidas: 0
      };
    });

    filteredFileReviews.forEach(fr => {
      const a = fr.reviewedBy || "No registrado";
      if (!map[a]) {
        map[a] = { asistente: a, filesRevisados: 0, filesConformes: 0, filesObservados: 0, opsAsignadas: 0, opsEmitidas: 0 };
      }
      map[a].filesRevisados += 1;
      if (fr.isConforme) map[a].filesConformes += 1;
      else map[a].filesObservados += 1;
    });

    filteredRecords.forEach(r => {
      const a = r.derivadoA || r.updatedByUser || "Sin Asignar";
      if (!map[a]) {
        map[a] = { asistente: a, filesRevisados: 0, filesConformes: 0, filesObservados: 0, opsAsignadas: 0, opsEmitidas: 0 };
      }
      map[a].opsAsignadas += 1;
      const st = (r.status || "").toLowerCase();
      if (st.includes("emitid") || st.includes("cierre") || Boolean(r.emision)) {
        map[a].opsEmitidas += 1;
      }
    });

    return Object.values(map)
      .filter(item => item.filesRevisados > 0 || item.opsAsignadas > 0)
      .sort((a, b) => (b.filesRevisados + b.opsAsignadas) - (a.filesRevisados + a.opsAsignadas));
  }, [availableAssistants, filteredFileReviews, filteredRecords]);

  // Top File Review Observations
  const topObservations = useMemo(() => {
    const map: Record<string, number> = {};
    filteredFileReviews.forEach(fr => {
      if (!fr.isConforme && fr.observaciones) {
        fr.observaciones.forEach(obs => {
          map[obs] = (map[obs] || 0) + 1;
        });
      }
    });

    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredFileReviews]);

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Consolidado General
    const summaryData = [
      { Concepto: "Total Revisiones de FILE", Cantidad: metrics.totalFiles },
      { Concepto: "Files Conformes (Todo Conforme)", Cantidad: metrics.filesConformes },
      { Concepto: "Files con Observaciones", Cantidad: metrics.filesObservados },
      { Concepto: "Tasa de Conformidad de Files", Cantidad: `${metrics.filesConformeRate}%` },
      { Concepto: "Correos Corporativos Emitidos", Cantidad: metrics.filesEmailsSent },
      { Concepto: "Total Operaciones Legales", Cantidad: metrics.totalOps },
      { Concepto: "Operaciones Emitidas / Atendidas", Cantidad: metrics.opsEmitidas },
      { Concepto: "Operaciones Pendientes", Cantidad: metrics.opsPendientes },
      { Concepto: "Tasa de Emisión de Operaciones", Cantidad: `${metrics.opsEmitidasRate}%` },
      { Concepto: "Gran Total Trámites Acumulados", Cantidad: metrics.granTotalTramites }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "RESUMEN_ACUMULADO");

    // Sheet 2: Desglose por Proyecto
    const wsProjects = XLSX.utils.json_to_sheet(projectBreakdown);
    XLSX.utils.book_append_sheet(wb, wsProjects, "POR_PROYECTO");

    // Sheet 3: Desglose por Asistente Legal
    const wsAssistants = XLSX.utils.json_to_sheet(assistantBreakdown);
    XLSX.utils.book_append_sheet(wb, wsAssistants, "POR_ASISTENTE");

    // Sheet 4: Detalle Revisiones de FILE
    const fileReviewsRows = filteredFileReviews.map(f => ({
      ID: f.id,
      Fecha: f.dateFormatted || f.createdAt,
      Proyecto: f.proyecto,
      Unidades: f.unidades,
      Asesor: f.asesor,
      JefeVentas: f.jefeVentas,
      Tipo: f.tipoSolicitud,
      Estado: f.isConforme ? "TODO CONFORME" : "OBSERVADO",
      Observaciones: f.observaciones.join("; "),
      Comentarios: f.comentarios || "",
      Revisor: f.reviewedBy,
      CorreoEnviado: f.emailSent ? "SI" : "NO",
      Destinatario: f.emailTo,
      Copia: f.emailCc
    }));
    const wsFiles = XLSX.utils.json_to_sheet(fileReviewsRows);
    XLSX.utils.book_append_sheet(wb, wsFiles, "REVISIONES_FILE");

    // Sheet 5: Detalle Operaciones
    const opsRows = filteredRecords.map(r => ({
      ID: r.id,
      Proyecto: r.proyecto,
      Unidad: `${r.dpto || ""} ${r.estac || ""} ${r.dep || ""}`.trim(),
      Asesor: r.asesor,
      Team: r.team,
      Tipo: r.tipo,
      Solicitud: r.solicitud,
      Emision: r.emision,
      Estado: r.status,
      AsignadoA: r.derivadoA || "",
      Comentario: r.comentario || ""
    }));
    const wsOps = XLSX.utils.json_to_sheet(opsRows);
    XLSX.utils.book_append_sheet(wb, wsOps, "SOLICITUDES_OPERACIONES");

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Acumulado_Admin_Revisiones_y_Solicitudes_${dateStr}.xlsx`);
  };

  if (!isAdmin) {
    return (
      <div className="p-8 bg-white rounded-3xl border border-red-200 shadow-sm text-center max-w-xl mx-auto space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto text-2xl font-black">
          🔒
        </div>
        <h3 className="text-lg font-black text-slate-800">Acceso Exclusivo de Administrador</h3>
        <p className="text-xs text-slate-500">
          Este apartado contiene información confidencial de acumulados de revisiones de file y solicitudes emitidas reservada únicamente para el perfil de Administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" id="admin-acumulado-panel-container">
      {/* Header Banner in Corporate Navy Blue */}
      <div className="bg-gradient-to-r from-[#0B3B60] via-[#0D4672] to-[#082a45] text-white p-6 rounded-3xl shadow-md border border-blue-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center font-black text-2xl shadow-inner text-blue-200">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase">
                Acumulado de Revisiones y Solicitudes Emitidas
              </h1>
              <span className="bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Exclusivo Admin
              </span>
            </div>
            <p className="text-xs text-blue-150 font-medium mt-1">
              Consolidado integral del flujo legal: expedientes de ventas revisados (FILE) y solicitudes de operaciones tramitadas en plataforma.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-sm border border-emerald-500 flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            title="Exportar consolidado acumulado a Excel multihoja"
          >
            <Download className="h-4 w-4" />
            <span>Descargar Reporte Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-blue-150 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-black text-slate-700">
            <Filter className="h-4 w-4 text-[#0B3B60]" />
            <span className="uppercase tracking-wider">Filtros de Análisis Acumulado</span>
          </div>
          <span className="text-[11px] text-slate-400 font-bold">
            Mostrando {filteredFileReviews.length} files y {filteredRecords.length} operaciones
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Mes Selector */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Periodo / Mes
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3B60]"
            >
              <option value="ALL">Histórico Completo (Todos los meses)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Proyecto Selector */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Proyecto Inmobiliario
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3B60]"
            >
              <option value="ALL">Todos los Proyectos ({availableProjects.length})</option>
              {availableProjects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Asistente Revisor */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Asistente / Revisor Legal
            </label>
            <select
              value={selectedAsistente}
              onChange={(e) => setSelectedAsistente(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3B60]"
            >
              <option value="ALL">Todos los Asistentes ({availableAssistants.length})</option>
              {availableAssistants.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Fecha Inicio */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Desde
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3B60]"
            />
          </div>

          {/* Fecha Fin */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3B60]"
            />
          </div>
        </div>

        {/* Text Search */}
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por proyecto, asesor, unidad, observación o revisor..."
            className="w-full text-xs font-medium pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B3B60]"
          />
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Revisiones de FILE */}
        <div className="bg-white p-4 rounded-2xl border border-blue-150 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-wider">
              <span>Revisiones de FILE</span>
              <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-mono">FILE</span>
            </div>
            <div className="text-3xl font-black text-slate-800 mt-2">
              {metrics.totalFiles}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
            <span className="text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {metrics.filesConformes} Conformes ({metrics.filesConformeRate}%)
            </span>
            <span className="text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {metrics.filesObservados} Obs.
            </span>
          </div>
        </div>

        {/* Card 2: Solicitudes de Operaciones */}
        <div className="bg-white p-4 rounded-2xl border border-blue-150 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-wider">
              <span>Solicitudes Tramitadas</span>
              <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-mono">OPER</span>
            </div>
            <div className="text-3xl font-black text-slate-800 mt-2">
              {metrics.totalOps}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
            <span className="text-blue-600 flex items-center gap-1">
              <Check className="h-3 w-3" />
              {metrics.opsEmitidas} Emitidas ({metrics.opsEmitidasRate}%)
            </span>
            <span className="text-purple-600 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {metrics.opsPendientes} Pend.
            </span>
          </div>
        </div>

        {/* Card 3: Gran Acumulado Combinado */}
        <div className="bg-gradient-to-br from-[#0B3B60] to-[#082a45] text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-black text-blue-200 uppercase tracking-wider">
              <span>Gran Total Acumulado</span>
              <span className="text-white bg-white/20 px-2 py-0.5 rounded-md text-[10px] font-bold">GLOBAL</span>
            </div>
            <div className="text-3xl font-black text-white mt-2">
              {metrics.granTotalTramites}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-[11px] font-bold text-blue-150">
            <span>Finalizados: {metrics.granTotalFinalizados}</span>
            <span>Efectividad: {metrics.granTotalTramites > 0 ? ((metrics.granTotalFinalizados / metrics.granTotalTramites) * 100).toFixed(0) : 0}%</span>
          </div>
        </div>

        {/* Card 4: Correos Corporativos Despachados */}
        <div className="bg-white p-4 rounded-2xl border border-blue-150 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-wider">
              <span>Correos @taleinmobiliaria</span>
              <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md font-mono">POP/SMTP</span>
            </div>
            <div className="text-3xl font-black text-emerald-600 mt-2">
              {metrics.filesEmailsSent}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1 text-emerald-700">
              <Send className="h-3 w-3 text-emerald-600" />
              Notificación a Asesor y Jefe
            </span>
            <span>100% Interno</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("consolidado")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "consolidado"
              ? "bg-[#0B3B60] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span>Consolidado por Proyecto & Asistente</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("fileReviews")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "fileReviews"
              ? "bg-[#0B3B60] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FolderCheck className="h-4 w-4" />
          <span>Registro Acumulado de FILE ({filteredFileReviews.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("operaciones")}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === "operaciones"
              ? "bg-[#0B3B60] text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Registro Acumulado de Operaciones ({filteredRecords.length})</span>
        </button>
      </div>

      {/* Tab 1: Consolidado General */}
      {activeTab === "consolidado" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Breakdown by Project */}
            <div className="bg-white p-5 rounded-3xl border border-blue-150 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-[#0B3B60]" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                    Acumulado por Proyecto Inmobiliario
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  {projectBreakdown.length} proyectos con movimiento
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 font-black text-[10px] uppercase">
                      <th className="py-2.5 px-3">Proyecto</th>
                      <th className="py-2.5 px-3 text-center">Files</th>
                      <th className="py-2.5 px-3 text-center">Conf. / Obs.</th>
                      <th className="py-2.5 px-3 text-center">Operaciones</th>
                      <th className="py-2.5 px-3 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectBreakdown.map((item, idx) => (
                      <tr key={item.proyecto} className="hover:bg-blue-50/30">
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {item.proyecto}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-blue-700">
                          {item.totalFiles}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[11px] font-medium">
                          <span className="text-emerald-700 font-bold">{item.filesConformes}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-amber-700 font-bold">{item.filesObservados}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-700">
                          {item.totalOps} ({item.opsEmitidas} emit.)
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-slate-900 bg-slate-50/50">
                          {item.totalTramites}
                        </td>
                      </tr>
                    ))}
                    {projectBreakdown.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          No se encontraron registros con los filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Breakdown by Assistant */}
            <div className="bg-white p-5 rounded-3xl border border-blue-150 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#0B3B60]" />
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                    Acumulado por Asistente Legal
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  Desempeño acumulado
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-y border-slate-200 text-slate-500 font-black text-[10px] uppercase">
                      <th className="py-2.5 px-3">Asistente</th>
                      <th className="py-2.5 px-3 text-center">Files Revisados</th>
                      <th className="py-2.5 px-3 text-center">Conformes</th>
                      <th className="py-2.5 px-3 text-center">Operaciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assistantBreakdown.map((item) => (
                      <tr key={item.asistente} className="hover:bg-blue-50/30">
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {item.asistente}
                        </td>
                        <td className="py-2.5 px-3 text-center font-black text-blue-700">
                          {item.filesRevisados}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[11px] font-bold text-emerald-700">
                          {item.filesConformes} ({item.filesRevisados > 0 ? ((item.filesConformes / item.filesRevisados) * 100).toFixed(0) : 0}%)
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-700">
                          {item.opsAsignadas} ({item.opsEmitidas} emitidas)
                        </td>
                      </tr>
                    ))}
                    {assistantBreakdown.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-slate-400">
                          No se encontraron registros de asistentes para este periodo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Top Observaciones en Files */}
          <div className="bg-white p-5 rounded-3xl border border-blue-150 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  Ranking Acumulado de Motivos de Observación en Files
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400">
                Puntos críticos identificados
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topObservations.slice(0, 9).map((obs, idx) => (
                <div key={obs.name} className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-700 truncate" title={obs.name}>
                      {obs.name}
                    </span>
                  </div>
                  <span className="bg-amber-600 text-white font-mono text-xs font-black px-2 py-0.5 rounded-lg shrink-0">
                    {obs.count}
                  </span>
                </div>
              ))}
              {topObservations.length === 0 && (
                <div className="col-span-full py-6 text-center text-slate-400 text-xs">
                  No se registraron observaciones en el periodo seleccionado.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Detalle Revisiones de FILE */}
      {activeTab === "fileReviews" && (
        <div className="bg-white p-5 rounded-3xl border border-blue-150 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderCheck className="h-5 w-5 text-[#0B3B60]" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                Historial Acumulado de Revisiones de FILE ({filteredFileReviews.length})
              </h3>
            </div>
            {onOpenFileReview && (
              <button
                type="button"
                onClick={onOpenFileReview}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
              >
                <span>Abrir Módulo Completo</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase">
                  <th className="py-2.5 px-3">Fecha y Hora</th>
                  <th className="py-2.5 px-3">Proyecto</th>
                  <th className="py-2.5 px-3">Unidad(es)</th>
                  <th className="py-2.5 px-3">Asesor</th>
                  <th className="py-2.5 px-3">Revisor</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3">Observaciones / Comentario</th>
                  <th className="py-2.5 px-3 text-center">Correo</th>
                  <th className="py-2.5 px-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredFileReviews.map(fr => (
                  <tr key={fr.id} className="hover:bg-blue-50/30">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {fr.dateFormatted || formatDateTimeFull(fr.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      {fr.proyecto}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {fr.unidades}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-bold">
                      {fr.asesor}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {fr.reviewedBy}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {fr.isConforme ? (
                        <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200 text-[10px]">
                          Todo Conforme
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-md border border-amber-200 text-[10px]">
                          Observado
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs">
                      {fr.isConforme ? (
                        <span className="text-slate-400 italic">Sin observaciones</span>
                      ) : (
                        <div>
                          <div className="font-bold text-amber-800">
                            {fr.observaciones.join(", ")}
                          </div>
                          {fr.comentarios && (
                            <div className="text-slate-500 text-[10px] mt-0.5">
                              {fr.comentarios}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {fr.emailSent ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          <Check className="h-3 w-3" />
                          Enviado
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingReviewRecord({ ...fr })}
                          className="p-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-lg transition-colors cursor-pointer"
                          title="Editar revisión de FILE"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {onDeleteFileReview && (
                          <button
                            type="button"
                            onClick={() => onDeleteFileReview(fr.id)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar revisión de FILE"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredFileReviews.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No se encontraron revisiones de file con los criterios actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Detalle Operaciones */}
      {activeTab === "operaciones" && (
        <div className="bg-white p-5 rounded-3xl border border-blue-150 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-[#0B3B60]" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                Historial Acumulado de Solicitudes de Operaciones ({filteredRecords.length})
              </h3>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase">
                  <th className="py-2.5 px-3">Solicitud</th>
                  <th className="py-2.5 px-3">Proyecto</th>
                  <th className="py-2.5 px-3">Unidades</th>
                  <th className="py-2.5 px-3">Asesor</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Emisión</th>
                  <th className="py-2.5 px-3">Asignado A</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredRecords.map(r => (
                  <tr key={r.id} className="hover:bg-blue-50/30">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {r.solicitud || r.solicitudAt || formatDateTimeFull(r.createdAt)}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      {r.proyecto}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 text-[11px]">
                      {[r.dpto, r.estac, r.dep].filter(Boolean).join(" / ") || "S/U"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-bold">
                      {r.asesor}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                      {r.tipo}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        (r.status || "").toLowerCase().includes("emitid")
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : (r.status || "").toLowerCase().includes("observad")
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>
                        {r.status || "Pendiente"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {r.emision || "-"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {r.derivadoA || r.updatedByUser || "-"}
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No se encontraron solicitudes registradas con los filtros actuales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADMIN EDIT FILE REVIEW RECORD MODAL */}
      {editingReviewRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl border border-blue-100 flex flex-col overflow-hidden">
            <div className="p-4 bg-[#0B3B60] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-sky-300" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Editar Revisión de FILE ({editingReviewRecord.id})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingReviewRecord(null)}
                className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Proyecto</label>
                  <select
                    value={editingReviewRecord.proyecto}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, proyecto: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  >
                    {availableProjects.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Unidades (Dpto / Estac / Dep)</label>
                  <input
                    type="text"
                    value={editingReviewRecord.unidades}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, unidades: e.target.value, dpto: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Asesor Inmobiliario</label>
                  <input
                    type="text"
                    value={editingReviewRecord.asesor}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, asesor: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Tipo de Solicitud</label>
                  <select
                    value={editingReviewRecord.tipoSolicitud || "EMISION"}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, tipoSolicitud: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  >
                    <option value="EMISION">EMISION</option>
                    <option value="MODIFICACION">MODIFICACION</option>
                    <option value="ADENDA">ADENDA</option>
                    <option value="ACUERDO INTERNO">ACUERDO INTERNO</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Resultado de la Revisión</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingReviewRecord({ ...editingReviewRecord, isConforme: true, observaciones: [] })}
                    className={`px-4 py-2 rounded-xl font-black text-xs border cursor-pointer transition-all ${
                      editingReviewRecord.isConforme
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    ✓ Todo Conforme
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingReviewRecord({ ...editingReviewRecord, isConforme: false })}
                    className={`px-4 py-2 rounded-xl font-black text-xs border cursor-pointer transition-all ${
                      !editingReviewRecord.isConforme
                        ? "bg-rose-600 text-white border-rose-700"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    🔴 Observado
                  </button>
                </div>
              </div>

              {!editingReviewRecord.isConforme && (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Observaciones Seleccionadas</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {activeChecklistItems.map(item => {
                      const checked = (editingReviewRecord.observaciones || []).includes(item.name);
                      return (
                        <label key={item.id} className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const curr = editingReviewRecord.observaciones || [];
                              const next = checked ? curr.filter(o => o !== item.name) : [...curr, item.name];
                              setEditingReviewRecord({ ...editingReviewRecord, observaciones: next, isConforme: next.length === 0 });
                            }}
                            className="mt-0.5 rounded accent-rose-600"
                          />
                          <span>{item.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Comentarios Adicionales</label>
                <textarea
                  rows={2}
                  value={editingReviewRecord.comentarios || ""}
                  onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, comentarios: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingReviewRecord(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onUpdateFileReview && editingReviewRecord) {
                    await onUpdateFileReview(editingReviewRecord.id, editingReviewRecord);
                  }
                  setEditingReviewRecord(null);
                }}
                className="px-5 py-2 bg-[#0B3B60] hover:bg-[#072B47] text-white rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderCheck(props: any) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
      <path d="m9 13 2 2 4-4"/>
    </svg>
  );
}
