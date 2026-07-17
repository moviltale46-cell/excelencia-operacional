import React, { useState, useEffect } from "react";
import { OperationRecord, AppSettings, UserAccount } from "../types";
import { Edit3, CheckCircle2, Clock, Save, User, List, HelpCircle, History, SlidersHorizontal, Search, Calendar, Briefcase, Plus, AlertCircle, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import StatusHistoryModal from "./StatusHistoryModal";

interface AsistenteLegalPanelProps {
  records: OperationRecord[];
  settings: AppSettings;
  currentUser: UserAccount | null;
  onUpdateRecord: (id: string, updatedFields: Partial<OperationRecord>) => void;
}

export default function AsistenteLegalPanel({
  records,
  settings,
  currentUser,
  onUpdateRecord
}: AsistenteLegalPanelProps) {
  const [selectedRecordId, setSelectedRecordId] = useState("");
  const [statusVal, setStatusVal] = useState("");
  const [commentVal, setCommentVal] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [historyModalRecord, setHistoryModalRecord] = useState<OperationRecord | null>(null);

  // Pending Items Prefilters
  const [pendingFilterProject, setPendingFilterProject] = useState("");
  const [pendingFilterType, setPendingFilterType] = useState("");
  const [pendingSearchQuery, setPendingSearchQuery] = useState("");

  // Expanded actions state for collapsible history list
  const [expandedActionIdx, setExpandedActionIdx] = useState<Record<number, boolean>>({});

  // Editable details for pending item
  const [dptoVal, setDptoVal] = useState("");
  const [estacVal, setEstacVal] = useState("");
  const [depVal, setDepVal] = useState("");
  const [asesorVal, setAsesorVal] = useState("");

  // States for correcting a recently emitted record (30 minutes grace period)
  const [isEditingRecentId, setIsEditingRecentId] = useState<string | null>(null);
  const [recentStatusVal, setRecentStatusVal] = useState("");
  const [recentCommentVal, setRecentCommentVal] = useState("");

  const [tick, setTick] = useState(0);

  // New Tab Navigation State
  const [activeSubTab, setActiveSubTab] = useState<"emisiones" | "historial">("emisiones");

  // Advanced Filters State
  const [filterDate, setFilterDate] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Action Logging State
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState<string | null>(null);
  const [newActionType, setNewActionType] = useState("Observación Legal");
  const [customActionType, setCustomActionType] = useState("");
  const [newActionComment, setNewActionComment] = useState("");

  // Force re-render of timers every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  // Get dynamic options
  const statusesList = settings.statuses && settings.statuses.length > 0
    ? settings.statuses
    : ["Pendiente de Firma", "En Revisión Técnica", "Aprobado para Emisión", "Observado / Rechazado", "Desistido", "Cierre Completo"];

  const advisorOptions = settings.asesores && settings.asesores.length > 0
    ? settings.asesores
    : [
        "ANABEL ALBINO", "SILVANA GODENZZI", "ROSMERY CENTURION", "DERVIS PIÑA", 
        "CARLOS TORRES", "MARIA FERNANDA CHACON", "IVAN SOTO", "CHRISTIAN BARRIENTOS", 
        "PAULA CASAS", "VICTOR SALAS", "MARITZA BRAVO", "EDUARDO BECERRA", 
        "LUIS MANUEL DE LOS RIOS", "ROY OTERO", "FARIHD JASAUI", "ALEJANDRA PEREZ CAMPOS"
      ];

  // Set default status on first load
  useEffect(() => {
    if (statusesList.length > 0 && !statusVal) {
      setStatusVal(statusesList[0]);
    }
  }, [statusesList, statusVal]);

  // Reset expanded actions index when selected history record changes
  useEffect(() => {
    setExpandedActionIdx({});
  }, [selectedHistoryRecordId]);

  // FILTER: Only show records for assigned projects if there's an assigned list
  const myAssignedProjects = currentUser?.assignedProjects || [];
  
  const myRecords = records.filter(r => {
    if (currentUser?.role === "Asistente Legal") {
      return myAssignedProjects.includes(r.proyecto);
    }
    return true;
  });

  // Filter records for "Historial de Acciones" tab
  const filteredAllRecords = myRecords.filter(r => {
    if (filterDate) {
      const recordDate = r.createdAt?.substring(0, 10); // YYYY-MM-DD
      const matchCreated = recordDate === filterDate;
      const matchSolicitud = r.solicitud?.includes(filterDate);
      if (!matchCreated && !matchSolicitud) return false;
    }
    if (filterProject && r.proyecto !== filterProject) {
      return false;
    }
    if (filterStatus && r.status !== filterStatus) {
      return false;
    }
    return true;
  });

  // Items ready for emitting (must have been assigned a TIPO by Jefe Legal, and NOT finalized with Cierre Completo or Desistido)
  // And must match our dynamic prefilters
  const pendingItems = myRecords.filter(r => {
    // Basic criteria: assigned type by Jefe Legal, not fully closed/desisted
    const isPending = r.tipo && r.status !== "Cierre Completo" && r.status !== "Desistido";
    if (!isPending) return false;

    // Filter by Project
    if (pendingFilterProject && r.proyecto !== pendingFilterProject) return false;

    // Filter by Type
    if (pendingFilterType && r.tipo !== pendingFilterType) return false;

    // Filter by general search string (Proyecto, dpto, asesor, id)
    if (pendingSearchQuery.trim()) {
      const query = pendingSearchQuery.toLowerCase();
      const matchProj = r.proyecto?.toLowerCase().includes(query);
      const matchDpto = r.dpto?.toLowerCase().includes(query);
      const matchAsesor = r.asesor?.toLowerCase().includes(query);
      const matchId = r.id?.toLowerCase().includes(query);
      if (!matchProj && !matchDpto && !matchAsesor && !matchId) return false;
    }

    return true;
  });

  // Items already emitted but within the 30-minute grace period for corrections
  const recentlyEmittedItems = myRecords.filter(r => {
    if (!r.emision || !r.emittedAt) return false;
    const elapsedMs = Date.now() - new Date(r.emittedAt).getTime();
    const thirtyMinutesMs = 30 * 60 * 1000;
    return elapsedMs < thirtyMinutesMs;
  });

  const handleSelectRecord = (r: OperationRecord) => {
    setSelectedRecordId(r.id);
    if (r.status) {
      setStatusVal(r.status);
    } else if (statusesList.length > 0) {
      setStatusVal(statusesList[0]);
    }
    setCommentVal(r.comentario || "");
    setDptoVal(r.dpto || "");
    setEstacVal(r.estac || "");
    setDepVal(r.dep || "");
    setAsesorVal(r.asesor || "");
  };

  const handleSave = () => {
    if (!selectedRecordId) {
      alert("Por favor seleccione un expediente de la lista de Items Pendientes.");
      return;
    }

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    onUpdateRecord(selectedRecordId, {
      status: statusVal,
      comentario: commentVal || `Actualizado por Asistente Legal.`,
      dpto: dptoVal,
      estac: estacVal,
      dep: depVal,
      asesor: asesorVal,
      emision: timestamp, 
      emittedAt: now.toISOString(), 
      updatedByUser: currentUser?.username || "Asistente"
    });

    const activeRecord = records.find(r => r.id === selectedRecordId);
    setToastMessage(`La EMISION para ${activeRecord?.proyecto || "el expediente"} ha sido registrada exitosamente el ${timestamp}`);

    setSelectedRecordId("");
    setCommentVal("");

    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const handleCloseProcess = (finalStatus: "Cierre Completo" | "Desistido") => {
    if (!selectedRecordId) {
      alert("Por favor seleccione un expediente de la lista de Items Pendientes.");
      return;
    }

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    onUpdateRecord(selectedRecordId, {
      status: finalStatus,
      comentario: commentVal || `Proceso finalizado con estado: ${finalStatus}.`,
      dpto: dptoVal,
      estac: estacVal,
      dep: depVal,
      asesor: asesorVal,
      emision: timestamp, 
      emittedAt: now.toISOString(), 
      updatedByUser: currentUser?.username || "Asistente"
    });

    const activeRecord = records.find(r => r.id === selectedRecordId);
    setToastMessage(`El trámite para ${activeRecord?.proyecto || "el expediente"} ha sido CERRADO como "${finalStatus}" exitosamente.`);

    setSelectedRecordId("");
    setCommentVal("");

    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const startEditingRecent = (r: OperationRecord) => {
    setIsEditingRecentId(r.id);
    setRecentStatusVal(r.status || statusesList[0]);
    setRecentCommentVal(r.comentario || "");
  };

  const handleSaveRecentCorrection = () => {
    if (!isEditingRecentId) return;

    onUpdateRecord(isEditingRecentId, {
      status: recentStatusVal,
      comentario: recentCommentVal
    });

    setToastMessage("Corrección guardada correctamente.");
    setIsEditingRecentId(null);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const getGraceTimeRemaining = (r: OperationRecord) => {
    if (!r.emittedAt) return "0 min";
    const elapsedMs = Date.now() - new Date(r.emittedAt).getTime();
    const thirtyMinutesMs = 30 * 60 * 1000;
    const remainingMs = thirtyMinutesMs - elapsedMs;
    if (remainingMs <= 0) return "Expirado";
    const mins = Math.ceil(remainingMs / 60000);
    return `${mins} min`;
  };

  // Helper to parse history and summarize counts of actions
  const getActionSummary = (record: OperationRecord) => {
    const historyList = record.history || [];
    const parsed = historyList.map(h => {
      let type = "Cambio de Estado";
      let comment = h.comentario || "";
      
      const tagMatch = comment.match(/^\[(.*?)\]\s*(.*)$/);
      if (tagMatch) {
        type = tagMatch[1];
        comment = tagMatch[2];
      } else if (comment.includes("Asignado tipo") || comment.includes("tipo por Jefe Legal")) {
        type = "Asignación Tipo de Trámite";
      } else if (comment.includes("Reasignado") || comment.includes("Derivado")) {
        type = "Re-asignación de Asistente";
      } else if (comment === "Registro inicial." || comment.includes("inicial")) {
        type = "Registro Inicial";
      }
      return { type, comment, user: h.user, timestamp: h.timestamp, status: h.status };
    });

    const counts: Record<string, number> = {};
    parsed.forEach(p => {
      counts[p.type] = (counts[p.type] || 0) + 1;
    });

    return {
      total: parsed.length,
      actions: parsed,
      counts
    };
  };

  const handleRegisterAction = (recordId: string) => {
    if (!newActionComment.trim()) {
      alert("Por favor escribe un comentario o detalle de la acción.");
      return;
    }
    const finalActionType = newActionType === "Otro" ? (customActionType.trim() || "Otro") : newActionType;
    
    onUpdateRecord(recordId, {
      comentario: `[${finalActionType}] ${newActionComment.trim()}`,
      updatedByUser: currentUser?.username || "Asistente"
    });

    setNewActionComment("");
    setCustomActionType("");
    setToastMessage(`Acción "${finalActionType}" registrada con éxito en el historial.`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Helper for waiting times
  const getWaitingTimeStr = (createdAt?: string) => {
    if (!createdAt) return "Sin tiempo";
    const elapsedMs = Date.now() - new Date(createdAt).getTime();
    const totalMinutes = Math.floor(elapsedMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours === 0) {
      return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  };

  const getWaitingColorClass = (createdAt?: string) => {
    if (!createdAt) return "text-slate-400 bg-slate-50 border-slate-150";
    const elapsedMs = Date.now() - new Date(createdAt).getTime();
    const hours = elapsedMs / (60 * 60 * 1000);
    if (hours < 6) {
      return "text-emerald-700 bg-emerald-50 border-emerald-100";
    } else if (hours < 12) {
      return "text-amber-700 bg-amber-50 border-amber-100";
    } else {
      return "text-rose-700 bg-rose-50 border-rose-100 animate-pulse";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-4" id="asistente-legal-panel-container">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900 text-white p-4 rounded-xl shadow-2xl z-50 animate-bounce-in border border-slate-700 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold leading-tight mb-1 text-emerald-400">Notificación</p>
            <p className="opacity-90">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* Header Section */}
      <section className="bg-blue-50/20 p-5 rounded-3xl border border-blue-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-brand-primary" />
            Panel de Emisiones del Asistente Legal
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Proyectos Inmobiliarios a Cargo: <strong className="text-brand-primary">
              {myAssignedProjects.length > 0 ? myAssignedProjects.join(", ") : "Ninguno asignado"}
            </strong>
          </p>
        </div>
        <div className="bg-slate-900 text-white text-xs font-black px-4 py-2 rounded-2xl shadow-sm tracking-wide uppercase shrink-0">
          Asistente Legal
        </div>
      </section>

      {/* Stats Counter Section (Image 2 style) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="asistente-stats-container">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-primary flex items-center justify-center shrink-0">
            <List className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wide">SOLICITUDES TOTALES</span>
            <span className="text-xl font-extrabold text-slate-800">{pendingItems.length}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wide">OPERACIONES EMITIDAS</span>
            <span className="text-xl font-extrabold text-slate-800">
              {myRecords.filter(r => r.emision).length}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <span className="text-[10px] font-black text-rose-500 block uppercase tracking-wide">OBSERVADAS PENDIENTES</span>
            <span className="text-xl font-extrabold text-slate-800">
              {pendingItems.filter(r => r.status.toLowerCase().includes("observad") || r.status.toLowerCase().includes("rechazad")).length}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wide">TIEMPO RESPUESTA</span>
            <span className="text-xs font-black text-violet-700 block uppercase">SLA &lt; 24 Horas</span>
          </div>
        </div>
      </div>

      {/* Sub Tab Selector */}
      <div className="flex bg-slate-100 p-1 rounded-2xl">
        <button
          onClick={() => setActiveSubTab("emisiones")}
          className={`flex-1 text-center py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === "emisiones" ? "bg-white text-brand-primary shadow-xs" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <List className="h-4 w-4" />
          Mis Emisiones Pendientes
        </button>
        <button
          onClick={() => setActiveSubTab("historial")}
          className={`flex-1 text-center py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            activeSubTab === "historial" ? "bg-white text-brand-primary shadow-xs" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <History className="h-4 w-4" />
          Búsqueda de Expedientes e Historial Completo
        </button>
      </div>

      {activeSubTab === "emisiones" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="asistente-emisiones-container">
          {/* Left Column: Form & Recent corrections (lg:col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Emit Form Card */}
            <section className="bg-white border border-slate-150 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                <Edit3 className="h-4 w-4 text-brand-primary" />
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Emitir Expediente Seleccionado</h3>
              </div>

              {selectedRecordId ? (
                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 text-xs">
                  <p className="font-bold text-brand-primary">Expediente Cargado:</p>
                  <p className="text-slate-700 font-extrabold mt-1 uppercase">
                    {records.find(r => r.id === selectedRecordId)?.proyecto}
                  </p>
                  <p className="text-slate-500 font-medium mt-0.5 font-mono text-[10px]">
                    Lote: DPTO {records.find(r => r.id === selectedRecordId)?.dpto || "-"} • Tipo: {records.find(r => r.id === selectedRecordId)?.tipo || "-"}
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-500 italic text-center leading-relaxed">
                  Por favor, selecciona un expediente de la lista de <strong>Items Pendientes</strong> (columna derecha) para iniciar la evaluación.
                </div>
              )}

              <div className="space-y-4">
                {/* Status Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">
                    ESTADO (STATUS) DE EMISIÓN *
                  </label>
                  <SearchableSelect
                    value={statusVal}
                    onChange={(val) => setStatusVal(val)}
                    disabled={!selectedRecordId}
                    options={statusesList.map(s => ({ value: s, label: s }))}
                    placeholder="Seleccionar estado..."
                    className="w-full"
                  />
                </div>

                {/* Editable properties for items details */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="font-black text-slate-500 block uppercase tracking-wider text-[9px] ml-0.5">Asesor Inmobiliario *</label>
                    <SearchableSelect
                      value={asesorVal}
                      onChange={(val) => setAsesorVal(val)}
                      disabled={!selectedRecordId}
                      options={advisorOptions.map(a => ({ value: a, label: a }))}
                      placeholder="Seleccionar asesor..."
                      className="w-full mt-1"
                      allowCustom={true}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="font-black text-slate-500 block uppercase tracking-wider text-[9px] ml-0.5">Dpto. *</label>
                      <input
                        type="text"
                        value={dptoVal}
                        onChange={(e) => setDptoVal(e.target.value)}
                        disabled={!selectedRecordId}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-xs text-center font-mono focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none disabled:opacity-60"
                        placeholder="ej: 304"
                      />
                    </div>

                    <div>
                      <label className="font-black text-slate-500 block uppercase tracking-wider text-[9px] ml-0.5">Estac.</label>
                      <input
                        type="text"
                        value={estacVal}
                        onChange={(e) => setEstacVal(e.target.value)}
                        disabled={!selectedRecordId}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-xs text-center font-mono focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none disabled:opacity-60"
                        placeholder="ej: E-15"
                      />
                    </div>

                    <div>
                      <label className="font-black text-slate-500 block uppercase tracking-wider text-[9px] ml-0.5">Dep.</label>
                      <input
                        type="text"
                        value={depVal}
                        onChange={(e) => setDepVal(e.target.value)}
                        disabled={!selectedRecordId}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-xs text-center font-mono focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none disabled:opacity-60"
                        placeholder="ej: D-02"
                      />
                    </div>
                  </div>
                </div>

                {/* Comment Area */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">
                    COMENTARIO / OBSERVACIONES DE EMISIÓN
                  </label>
                  <textarea
                    value={commentVal}
                    onChange={(e) => setCommentVal(e.target.value)}
                    disabled={!selectedRecordId}
                    placeholder="Detalla observaciones, firmas faltantes, o justificaciones técnicas..."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none text-xs text-slate-700 disabled:opacity-60 resize-none transition-all placeholder:text-slate-400"
                  />
                </div>

                {/* Action Button & Closure controls */}
                <div className="space-y-2.5 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={!selectedRecordId}
                    className="w-full h-11 bg-brand-primary hover:bg-brand-secondary disabled:bg-slate-100 disabled:text-slate-400 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-xs cursor-pointer uppercase tracking-wider shadow-xs"
                  >
                    <Save className="h-4 w-4" />
                    Registrar Acción / Grabar Emisión
                  </button>

                  {selectedRecordId && (
                    <div className="pt-3 border-t border-slate-100 space-y-2 animate-slideIn">
                      <p className="text-[9px] font-black uppercase text-rose-500 tracking-wider text-center block">
                        ¿Finalizar Trámite y Remover de la Lista?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCloseProcess("Cierre Completo")}
                          className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm uppercase tracking-wide"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Cierre Completo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseProcess("Desistido")}
                          className="h-10 bg-slate-500 hover:bg-slate-600 text-white font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm uppercase tracking-wide"
                        >
                          <AlertCircle className="h-4 w-4" />
                          Desistió
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Recientemente Emitidos - CORRECTION PANEL (30 MINUTES GRACE) */}
            <section className="bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-emerald-600 animate-pulse" />
                  Correcciones Recientes (30 Min)
                </h3>
                <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  {recentlyEmittedItems.length}
                </span>
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed italic">
                Cuentas con una ventana de 30 minutos para corregir cualquier error en estados o comentarios emitidos.
              </p>

              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {recentlyEmittedItems.map((r) => {
                  const isCurrentCorrection = isEditingRecentId === r.id;
                  const timeLeft = getGraceTimeRemaining(r);

                  return (
                    <div key={r.id} className="bg-white border border-slate-150 rounded-2xl p-3.5 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs uppercase">{r.proyecto}</h4>
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            DPTO: {r.dpto} • Emitido: {r.emision} (Hace {timeLeft})
                          </p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wide border border-emerald-100">
                          Corregible
                        </span>
                      </div>

                      {isCurrentCorrection ? (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black text-slate-500 block">NUEVO ESTADO</label>
                            <SearchableSelect
                              value={recentStatusVal}
                              onChange={(val) => setRecentStatusVal(val)}
                              options={statusesList.map(s => ({ value: s, label: s }))}
                              placeholder="Seleccionar estado..."
                              className="w-full"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black text-slate-500 block">NUEVO COMENTARIO</label>
                            <textarea
                              value={recentCommentVal}
                              onChange={(e) => setRecentCommentVal(e.target.value)}
                              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                              rows={2}
                            />
                          </div>

                          <div className="flex gap-2 pt-1.5">
                            <button
                              onClick={handleSaveRecentCorrection}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition-colors cursor-pointer"
                            >
                              Aplicar
                            </button>
                            <button
                              onClick={() => setIsEditingRecentId(null)}
                              className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditingRecent(r)}
                          className="w-full py-2 bg-slate-50 hover:bg-emerald-50 border border-slate-150 rounded-xl text-xs font-bold text-slate-700 hover:text-emerald-800 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Corregir Registro
                        </button>
                      )}
                    </div>
                  );
                })}
                {recentlyEmittedItems.length === 0 && (
                  <p className="text-center text-slate-400 italic text-[10px] py-4 bg-white/50 rounded-2xl border border-dashed border-slate-200">
                    Ningún registro emitido en los últimos 30 minutos.
                  </p>
                )}
              </div>
            </section>

          </div>

          {/* Right Column: Filters & Pending Card List (lg:col-span-7) */}
          <div className="lg:col-span-7 space-y-4">
            
            {/* Prefilters Card */}
            <div className="bg-white border border-slate-150 rounded-3xl p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                <SlidersHorizontal className="h-3.5 w-3.5 text-brand-primary" />
                <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Prefiltros de Expedientes</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar lote, asesor..."
                      value={pendingSearchQuery}
                      onChange={(e) => setPendingSearchQuery(e.target.value)}
                      className="w-full pl-8 h-9 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                    />
                  </div>
                </div>

                <div>
                  <select
                    value={pendingFilterProject}
                    onChange={(e) => setPendingFilterProject(e.target.value)}
                    className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl px-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="">-- Proyectos --</option>
                    {myAssignedProjects.map(proj => (
                      <option key={proj} value={proj}>{proj}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={pendingFilterType}
                    onChange={(e) => setPendingFilterType(e.target.value)}
                    className="w-full h-9 bg-slate-50 border border-slate-200 rounded-xl px-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                  >
                    <option value="">-- Tipos Trámite --</option>
                    {settings.tiposOperacion?.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(pendingFilterProject || pendingFilterType || pendingSearchQuery) && (
                <button
                  onClick={() => {
                    setPendingFilterProject("");
                    setPendingFilterType("");
                    setPendingSearchQuery("");
                  }}
                  className="w-full py-1.5 text-center text-[9px] text-rose-500 font-bold bg-rose-50 hover:bg-rose-100 border border-rose-150 rounded-xl transition-all cursor-pointer"
                >
                  Limpiar Filtros de Búsqueda
                </button>
              )}
            </div>

            {/* List Heading */}
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <List className="h-4 w-4 text-brand-primary" />
                Items de Trámites Pendientes
              </h3>
              <span className="text-[10px] font-black bg-blue-50 border border-blue-100 px-3 py-1 rounded-full text-brand-primary">
                {pendingItems.length} EXPEDIENTES EN COLA
              </span>
            </div>

            {/* Cards List (Image 2 Redesign) */}
            <div className="space-y-4">
              {pendingItems.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-10 text-center text-slate-400 text-xs italic leading-relaxed">
                  No se encontraron expedientes pendientes para tus proyectos asignados.
                </div>
              ) : (
                pendingItems.map((item) => {
                  const refNum = `EXP-${item.id.substr(4, 3).toUpperCase()}`;
                  const isSelected = selectedRecordId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`bg-white border rounded-2xl p-4 flex flex-col gap-3 shadow-xs hover:shadow-sm hover:border-blue-200 transition-all ${
                        isSelected ? "ring-2 ring-brand-primary border-transparent" : "border-slate-150"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-blue-50 text-brand-primary font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-md border border-blue-100">
                            {refNum}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 block">
                            Ingresado: {item.solicitud || "Recién"}
                          </span>
                        </div>
                        {/* Waiting Time badge (Image 2 style!) */}
                        <div className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getWaitingColorClass(item.createdAt)}`}>
                          <Clock className="h-3 w-3" />
                          <span>Espera: {getWaitingTimeStr(item.createdAt)}</span>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-slate-800 text-sm tracking-tight uppercase">{item.proyecto}</h4>
                        {/* Units (Image 2 style!) */}
                        <p className="text-[11px] text-slate-500 font-medium font-mono bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 inline-block mt-1">
                          dpto {item.dpto || "-"} | estac {item.estac || "-"} | dep {item.dep || "-"}
                        </p>
                      </div>

                      <div className="flex justify-between items-center text-[10px] border-t border-slate-100 pt-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-400 uppercase tracking-wide">Asesor:</span>
                          <span className="font-semibold text-slate-700 uppercase">{item.asesor}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide border ${
                            item.status.toLowerCase().includes("observad") || item.status.toLowerCase().includes("rechazad")
                              ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {item.status}
                          </span>
                        </div>
                      </div>

                      {/* Control buttons (Image 2 style!) */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setHistoryModalRecord(item)}
                          className="h-8 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-lg text-[10px] uppercase flex items-center justify-center gap-1 transition-all cursor-pointer"
                        >
                          <History className="h-3 w-3" />
                          Historial
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectRecord(item)}
                          className="h-8 bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded-lg text-[10px] uppercase flex items-center justify-center gap-1 transition-all cursor-pointer"
                        >
                          <Edit3 className="h-3 w-3" />
                          Evaluar / Editar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>
      ) : (
        /* ADVANCED HISTORIAL Y ACCIONES SUB-TAB */
        <div className="space-y-5 animate-fadeIn">
          {/* Advanced Filters Card */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-brand-primary" />
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Filtros de Búsqueda</h3>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {/* Date Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  Fecha de Registro
                </label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                />
              </div>

              {/* Project Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-slate-400" />
                  Proyecto
                </label>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                >
                  <option value="">-- Todos los Proyectos --</option>
                  {settings.proyectos?.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-slate-400" />
                  Estado de Solicitud
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                >
                  <option value="">-- Todos los Estados --</option>
                  {statusesList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {(filterDate || filterProject || filterStatus) && (
              <button
                onClick={() => {
                  setFilterDate("");
                  setFilterProject("");
                  setFilterStatus("");
                }}
                className="w-full py-1.5 text-center text-[10px] text-rose-500 font-bold bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition-all cursor-pointer"
              >
                Limpiar Filtros
              </button>
            )}
          </div>

          {/* Records List */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-slate-700 text-[11px] uppercase tracking-wider flex items-center justify-between">
              <span>Resultados de Expedientes</span>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                {filteredAllRecords.length}
              </span>
            </h4>

            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {filteredAllRecords.map((r) => {
                const isSelected = selectedHistoryRecordId === r.id;
                const summary = getActionSummary(r);
                const refNum = `EXP-${r.id.substr(4, 3).toUpperCase()}`;

                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedHistoryRecordId(r.id);
                      setNewActionComment("");
                    }}
                    className={`p-3 bg-white border border-blue-50 rounded-xl cursor-pointer hover:border-brand-primary hover:bg-blue-50/10 transition-all ${
                      isSelected ? "ring-2 ring-brand-primary border-transparent" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-[9px] text-slate-400 block">{refNum}</span>
                        <h5 className="font-bold text-xs text-slate-800 leading-tight">{r.proyecto}</h5>
                        <p className="text-[10px] text-slate-500">Lote: {r.dpto || "-"} • Tipo: <span className="font-semibold text-brand-primary">{r.tipo || "Sin asignar"}</span></p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1 shrink-0">
                        <span className="bg-blue-50 text-brand-primary font-bold text-[9px] px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                          <History className="h-2.5 w-2.5" />
                          {summary.total} Acciones
                        </span>
                        <span className="text-[9px] font-medium text-slate-500 truncate max-w-[100px]">
                          E: {r.status || "Borrador"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredAllRecords.length === 0 && (
                <div className="text-center p-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-xs italic text-slate-400">
                  Ningún expediente coincide con los filtros especificados.
                </div>
              )}
            </div>
          </div>

          {/* Action Log and History Detail Form */}
          {selectedHistoryRecordId && (() => {
            const selectedRec = records.find(r => r.id === selectedHistoryRecordId);
            if (!selectedRec) return null;
            const summary = getActionSummary(selectedRec);
            
            return (
              <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-md space-y-4 animate-slideIn">
                <div className="pb-3 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wide">Acciones del Expediente</span>
                    <h4 className="font-black text-slate-800 text-xs mt-0.5">{selectedRec.proyecto} (DPTO {selectedRec.dpto || "-"})</h4>
                  </div>
                  <button
                    onClick={() => setSelectedHistoryRecordId(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Cerrar Detalle
                  </button>
                </div>

                {/* KPI/Counts summary of Action types */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                    <History className="h-3.5 w-3.5 text-brand-primary animate-pulse" />
                    Cantidad y Tipo de Acciones Registradas:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-xs shrink-0">
                      Total: {summary.total}
                    </span>
                    {Object.entries(summary.counts).map(([type, count]) => (
                      <span key={type} className="bg-blue-100 text-brand-primary text-[9px] font-bold px-2 py-0.5 rounded-md border border-blue-200 shrink-0">
                        {type}: {count}
                      </span>
                    ))}
                    {summary.total === 0 && (
                      <span className="text-slate-400 italic text-[9px]">Aún no hay acciones registradas.</span>
                    )}
                  </div>
                </div>

                 {/* Timeline list of past actions */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto border border-blue-50 rounded-xl p-2.5 bg-slate-50/20">
                  {summary.actions.map((act, index) => {
                    const isExpanded = !!expandedActionIdx[index];
                    return (
                      <div
                        key={index}
                        onClick={() => {
                          setExpandedActionIdx(prev => ({
                            ...prev,
                            [index]: !prev[index]
                          }));
                        }}
                        className={`p-2.5 bg-white rounded-lg border transition-all duration-200 cursor-pointer hover:bg-slate-50/50 ${
                          isExpanded ? "border-brand-primary/40 shadow-xs ring-1 ring-brand-primary/10" : "border-slate-100"
                        } space-y-1 text-xs`}
                      >
                        <div className="flex justify-between items-center gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="bg-blue-50 text-brand-primary border border-blue-100 text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase truncate">
                              {act.type}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 shrink-0">{act.timestamp}</span>
                          </div>
                          <span className="text-slate-400 shrink-0">
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3 text-brand-primary" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </span>
                        </div>
                        
                        {isExpanded ? (
                          <div className="space-y-1.5 animate-fadeIn">
                            <p className="text-slate-700 text-xs font-medium italic pl-1 border-l-2 border-brand-primary">
                              "{act.comment}"
                            </p>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 border-t border-slate-50">
                              <span className="flex items-center gap-0.5 font-bold text-slate-500">
                                <User className="h-2.5 w-2.5" />
                                {act.user}
                              </span>
                              <span>Estado: {act.status}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-500 text-[11px] truncate pl-1 border-l border-slate-200">
                            {act.comment} <span className="text-[9px] text-brand-primary font-bold ml-1">(Ver más)</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {summary.actions.length === 0 && (
                    <p className="text-center text-slate-400 italic text-xs py-4">Ingreso inicial registrado.</p>
                  )}
                </div>

                {/* Log new Action form */}
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5 text-brand-primary" />
                    Registrar Nueva Acción sobre Operación
                  </p>

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Tipo de Acción *</label>
                      <select
                        value={newActionType}
                        onChange={(e) => setNewActionType(e.target.value)}
                        className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs outline-none focus:bg-white"
                      >
                        <option value="Observación Legal">Observación Legal</option>
                        <option value="Subida de Firma">Subida de Firma</option>
                        <option value="Revisión Técnica">Revisión Técnica</option>
                        <option value="Contacto con Asesor">Contacto con Asesor</option>
                        <option value="Corrección de Datos">Corrección de Datos</option>
                        <option value="Cierre Parcial">Cierre Parcial</option>
                        <option value="Otro">Otro (Especificar...)</option>
                      </select>
                    </div>

                    {newActionType === "Otro" && (
                      <div className="animate-slideIn">
                        <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Especificar Tipo de Acción *</label>
                        <input
                          type="text"
                          value={customActionType}
                          onChange={(e) => setCustomActionType(e.target.value)}
                          placeholder="Nombre de la acción..."
                          className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2.5 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Detalle o Comentario *</label>
                      <textarea
                        value={newActionComment}
                        onChange={(e) => setNewActionComment(e.target.value)}
                        placeholder="Ingresa notas detalladas de la acción realizada..."
                        rows={2.5}
                        className="w-full bg-slate-50 border border-blue-100 rounded-xl p-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRegisterAction(selectedRec.id)}
                      className="w-full h-9 bg-brand-primary hover:bg-brand-secondary text-white font-bold text-xs uppercase rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Grabar Acción en Historial
                    </button>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* Status History Timeline Modal */}
      {historyModalRecord && (
        <StatusHistoryModal
          record={historyModalRecord}
          onClose={() => setHistoryModalRecord(null)}
        />
      )}
    </div>
  );
}
