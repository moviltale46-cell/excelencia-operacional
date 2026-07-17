import React, { useState, useEffect } from "react";
import { AppSettings, OperationRecord, UserAccount } from "../types";
import { Save, Info, AlertOctagon, CheckCircle2, List, FileCheck, Edit3, Clock, PlusCircle, History, SlidersHorizontal, Calendar, Briefcase, Plus, User, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import SearchableSelect from "./SearchableSelect";

interface JefeLegalPanelProps {
  records: OperationRecord[];
  settings: AppSettings;
  currentUser: UserAccount;
  onUpdateRecord: (id: string, updatedFields: Partial<OperationRecord>) => void;
  onAddRecord: (recordData: Partial<OperationRecord>) => void;
}

export default function JefeLegalPanel({ 
  records, 
  settings, 
  currentUser,
  onUpdateRecord, 
  onAddRecord 
}: JefeLegalPanelProps) {
  // Sub-navigation inside Jefe Legal Panel
  const [jefeSubTab, setJefeSubTab] = useState<"new_request" | "register" | "emit" | "edit" | "actions_history">("new_request");

  // FORM FOR BRAND NEW REQUEST (Jefe Legal)
  const [newProjName, setNewProjName] = useState("");
  const [newJefeVentas, setNewJefeVentas] = useState("");
  const [newDpto, setNewDpto] = useState("");
  const [newEstac, setNewEstac] = useState("");
  const [newDep, setNewDep] = useState("");
  const [newAsesor, setNewAsesor] = useState("ANABEL ALBINO");
  const [newTipo, setNewTipo] = useState("");
  const [newComment, setNewComment] = useState("");

  // MODE 1: REGISTER SOLICITUD (TIPO) FOR INCOMPLETE VENTAS OPERATIONS
  const [selectedRegRecordId, setSelectedRegRecordId] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [regObservations, setRegObservations] = useState("");
  const [showRegPreview, setShowRegPreview] = useState(false);

  // MODE 2: EMIT OPERATION (STATUS)
  const [selectedEmitRecordId, setSelectedEmitRecordId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [emitComment, setEmitComment] = useState("");
  const [showEmitPreview, setShowEmitPreview] = useState(false);

  // MODE 3: EDIT RECORDS (6-HOUR LIMIT)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<OperationRecord>>({});

  // Advanced Filters State
  const [filterDate, setFilterDate] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Action Logging & Re-assignment State
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState<string | null>(null);
  const [newActionType, setNewActionType] = useState("Observación Legal");
  const [customActionType, setCustomActionType] = useState("");
  const [newActionComment, setNewActionComment] = useState("");
  const [assignedAssistant, setAssignedAssistant] = useState("");

  // Expanded actions state for collapsible history list
  const [expandedActionIdx, setExpandedActionIdx] = useState<Record<number, boolean>>({});

  // Reset expanded actions index when selected history record changes
  useEffect(() => {
    setExpandedActionIdx({});
  }, [selectedHistoryRecordId]);

  // Live system clock states
  const [currentDateStr, setCurrentDateStr] = useState("--/--/----");
  const [currentTimeStr, setCurrentTimeStr] = useState("--:--");
  const [isSuccessState, setIsSuccessState] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Get dynamic options
  const tiposOperacion = settings.tiposOperacion && settings.tiposOperacion.length > 0
    ? settings.tiposOperacion
    : ["EMISION", "MODIFICACION", "ADENDA"];

  const statusesList = settings.statuses && settings.statuses.length > 0
    ? settings.statuses
    : ["Pendiente de Firma", "En Revisión Técnica", "Aprobado para Emisión", "Observado / Rechazado"];

  const projectOptions = settings.proyectos || [];

  const advisorOptions = settings.asesores && settings.asesores.length > 0
    ? settings.asesores
    : [
        "ANABEL ALBINO", "SILVANA GODENZZI", "ROSMERY CENTURION", "DERVIS PIÑA", 
        "CARLOS TORRES", "MARIA FERNANDA CHACON", "IVAN SOTO", "CHRISTIAN BARRIENTOS", 
        "PAULA CASAS", "VICTOR SALAS", "MARITZA BRAVO", "EDUARDO BECERRA", 
        "LUIS MANUEL DE LOS RIOS", "ROY OTERO", "FARIHD JASAUI", "ALEJANDRA PEREZ CAMPOS"
      ];

  // Available records for assigning TIPO
  const regAvailableRecords = records.filter(r => !r.tipo);

  // Available records for emitting (must have a type assigned, but can update status)
  const emitAvailableRecords = records.filter(r => r.tipo);

  // Update clock periodically
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentDateStr(now.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }));
      setCurrentTimeStr(now.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Set default project and tipo options
  useEffect(() => {
    if (projectOptions.length > 0 && !newProjName) {
      setNewProjName(projectOptions[0].name);
    }
    if (tiposOperacion.length > 0 && !newTipo) {
      setNewTipo(tiposOperacion[0]);
    }
  }, [projectOptions, tiposOperacion, newProjName, newTipo]);

  // Auto-resolve Jefe de Ventas based on selected project for brand new request
  useEffect(() => {
    if (newProjName && projectOptions.length > 0) {
      const matched = projectOptions.find(p => p.name === newProjName);
      if (matched) {
        setNewJefeVentas(matched.jefeVentas || "Sin asignar");
      }
    }
  }, [newProjName, projectOptions]);

  // Update register preview
  useEffect(() => {
    setShowRegPreview(!!selectedType);
  }, [selectedType]);

  // Update emit preview
  useEffect(() => {
    setShowEmitPreview(!!selectedStatus);
  }, [selectedStatus]);

  // Handler: Register brand new Request
  const handleAddNewRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName) {
      alert("Por favor seleccione un proyecto.");
      return;
    }

    const matchedProj = projectOptions.find(p => p.name === newProjName);
    const finalTeam = matchedProj?.team || "A";

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    onAddRecord({
      proyecto: newProjName,
      team: finalTeam,
      dpto: newDpto,
      estac: newEstac,
      dep: newDep,
      asesor: newAsesor,
      tipo: newTipo,
      solicitud: timestampStr,
      solicitudAt: now.toISOString(),
      comentario: newComment || "Solicitud registrada por Jefe Legal.",
      status: statusesList[0] || "Pendiente de Firma",
      updatedByUser: currentUser.username
    });

    setSuccessMsg(`¡Solicitud registrada con éxito! El expediente se derivará automáticamente.`);
    setIsSuccessState(true);

    setTimeout(() => {
      setNewDpto("");
      setNewEstac("");
      setNewDep("");
      setNewComment("");
      setIsSuccessState(false);
    }, 2500);
  };

  // Handler: Register Solicitud (Tipo) for incomplete Ventas records
  const handleRegisterOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegRecordId) {
      alert("Por favor seleccione un expediente.");
      return;
    }
    if (!selectedType) {
      alert("Por favor seleccione un tipo de operación.");
      return;
    }

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timestampStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    onUpdateRecord(selectedRegRecordId, {
      tipo: selectedType,
      solicitud: timestampStr,
      solicitudAt: now.toISOString(),
      comentario: regObservations || `Asignado tipo por Jefe Legal.`,
      updatedByUser: currentUser.username
    });

    setSuccessMsg(`¡Operación registrada! Tipo: ${selectedType}. Solicitud sellada.`);
    setIsSuccessState(true);

    setTimeout(() => {
      setSelectedRegRecordId("");
      setSelectedType("");
      setRegObservations("");
      setIsSuccessState(false);
    }, 2500);
  };

  // Handler: Emit Operation (Status & Comment)
  const handleEmitOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmitRecordId) {
      alert("Por favor seleccione un expediente.");
      return;
    }
    if (!selectedStatus) {
      alert("Por favor seleccione un estado (status).");
      return;
    }

    onUpdateRecord(selectedEmitRecordId, {
      status: selectedStatus,
      comentario: emitComment || "Emitido por Jefe Legal.",
      updatedByUser: currentUser.username
    });

    setSuccessMsg(`¡Expediente Emitido! Estado: ${selectedStatus}. Emisión sellada.`);
    setIsSuccessState(true);

    setTimeout(() => {
      setSelectedEmitRecordId("");
      setSelectedStatus("");
      setEmitComment("");
      setIsSuccessState(false);
    }, 2500);
  };

  // Check if a record is within the 6-hour edit limit for Jefe Legal
  const isWithinSixHours = (record: OperationRecord) => {
    const basisTime = record.emittedAt || record.solicitudAt || record.createdAt;
    if (!basisTime) return true;
    
    const elapsedMs = Date.now() - new Date(basisTime).getTime();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return elapsedMs < sixHoursMs;
  };

  // Time remaining helper
  const getRemainingTimeStr = (record: OperationRecord) => {
    const basisTime = record.emittedAt || record.solicitudAt || record.createdAt;
    if (!basisTime) return "Sin límite";
    
    const elapsedMs = Date.now() - new Date(basisTime).getTime();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    const remainingMs = sixHoursMs - elapsedMs;
    
    if (remainingMs <= 0) return "Bloqueado";
    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const startEditingRecord = (r: OperationRecord) => {
    setEditingRecordId(r.id);
    setEditFields({
      team: r.team,
      proyecto: r.proyecto,
      dpto: r.dpto,
      estac: r.estac,
      dep: r.dep,
      asesor: r.asesor,
      tipo: r.tipo,
      status: r.status,
      solicitud: r.solicitud,
      emision: r.emision,
      comentario: r.comentario
    });
  };

  const handleSaveEdit = () => {
    if (!editingRecordId) return;
    onUpdateRecord(editingRecordId, {
      ...editFields,
      updatedByUser: currentUser.username
    });
    setEditingRecordId(null);
    setSuccessMsg("Expediente actualizado exitosamente.");
    setIsSuccessState(true);
    setTimeout(() => setIsSuccessState(false), 2000);
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
    
    // Check if we are also assigning/reassigning an assistant
    const updatedFields: Partial<OperationRecord> = {
      comentario: assignedAssistant 
        ? `[${finalActionType}] ${newActionComment.trim()} (Asignado/Derivado a: ${assignedAssistant})`
        : `[${finalActionType}] ${newActionComment.trim()}`,
      updatedByUser: currentUser.username
    };

    if (assignedAssistant) {
      updatedFields.derivadoA = assignedAssistant;
    }

    onUpdateRecord(recordId, updatedFields);

    setNewActionComment("");
    setCustomActionType("");
    setAssignedAssistant("");
    setSuccessMsg(`Acción "${finalActionType}" registrada con éxito en el historial.`);
    setIsSuccessState(true);
    setTimeout(() => setIsSuccessState(false), 3000);
  };

  // Filter records for "Historial de Acciones" tab
  const filteredAllRecords = records.filter(r => {
    if (filterDate) {
      const recordDate = r.createdAt?.substring(0, 10); // YYYY-MM-DD
      const matchCreated = recordDate === filterDate;
      const matchSolicitud = r.solicitud?.substring(0, 10);
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

  // If disabled by administrator
  if (!settings.jefeLegalEnabled) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-rose-100 shadow-sm text-center max-w-lg mx-auto space-y-4" id="jefe-legal-disabled">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100 animate-pulse">
          <AlertOctagon className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Registro Deshabilitado</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          El Administrador de la plataforma ha desactivado la capacidad de registro para el perfil de <strong>Jefe Legal</strong>.
        </p>
        <div className="p-3 bg-slate-50 rounded-xl text-slate-600 text-xs font-semibold border border-slate-150 inline-block">
          Comunícate con el Administrador para volver a activar el servicio.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6" id="jefe-legal-panel-container">
      
      {/* Dashboard Greeting */}
      <section className="flex justify-between items-center bg-blue-50/20 p-4 rounded-2xl border border-blue-100/50">
        <div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Flujo de Trabajo</p>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Consola Jefe Legal</h2>
        </div>
        <div className="text-right font-mono text-[10px] text-slate-400 leading-tight">
          <div>{currentDateStr}</div>
          <div className="font-bold text-brand-primary">{currentTimeStr}</div>
        </div>
      </section>

      {/* Jefe Legal Sub Tab options */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setJefeSubTab("new_request")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "new_request" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <PlusCircle className="h-3.5 w-3.5 inline mr-1" />
          Ingresar Solicitud
        </button>
        <button
          onClick={() => setJefeSubTab("register")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "register" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <List className="h-3.5 w-3.5 inline mr-1" />
          Trámites Pendientes
        </button>
        <button
          onClick={() => setJefeSubTab("emit")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "emit" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <FileCheck className="h-3.5 w-3.5 inline mr-1" />
          Emitir Status
        </button>
        <button
          onClick={() => setJefeSubTab("edit")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "edit" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <Edit3 className="h-3.5 w-3.5 inline mr-1" />
          Editar (6 Hrs)
        </button>
        <button
          onClick={() => setJefeSubTab("actions_history")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "actions_history" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <History className="h-3.5 w-3.5 inline mr-1" />
          Historial y Acciones
        </button>
      </div>

      {/* Success Banner */}
      {isSuccessState && (
        <div className="bg-emerald-600 text-white p-4 rounded-xl shadow-lg flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 text-emerald-200 shrink-0" />
          <p className="text-xs font-bold">{successMsg}</p>
        </div>
      )}

      {/* SUB-PANEL 0: NEW REQUEST REGISTRATION (JEFE LEGAL - IMAGE 4 REDESIGN) */}
      {jefeSubTab === "new_request" && (
        <form onSubmit={handleAddNewRequest} className="space-y-5 animate-fadeIn bg-white p-6 rounded-3xl border border-slate-150 shadow-sm" id="jefe-new-request-form">
          <div className="flex items-center gap-2 pb-3.5 border-b border-slate-100">
            <div className="p-1.5 bg-blue-50 text-brand-primary rounded-lg">
              <PlusCircle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Ingresar Nueva Solicitud Legal
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Auto-asignación activa basada en proyecto y equipo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Proyecto selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">PROYECTO *</label>
              <SearchableSelect
                value={newProjName}
                onChange={(val) => setNewProjName(val)}
                options={projectOptions.map(p => ({ value: p.name, label: p.name }))}
                placeholder="Seleccionar proyecto..."
                className="w-full font-medium"
              />
            </div>

            {/* Auto-resolved Jefe de Ventas */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wide ml-0.5">Jefe de Ventas Responsable</label>
              <input
                type="text"
                disabled
                value={newJefeVentas}
                className="h-10 border border-slate-200 bg-slate-50 rounded-xl px-3 font-semibold text-slate-500 outline-none cursor-not-allowed text-xs"
              />
            </div>

            {/* Dpto, Estac, Dep */}
            <div className="md:col-span-2 grid grid-cols-3 gap-2 bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide text-center">Dpto *</label>
                <input
                  type="text"
                  required
                  placeholder="ej: 304"
                  value={newDpto}
                  onChange={(e) => setNewDpto(e.target.value)}
                  className="h-10 border border-slate-200 bg-white rounded-xl px-3 outline-none text-center font-mono font-bold text-xs text-slate-700 focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide text-center">Estac.</label>
                <input
                  type="text"
                  placeholder="ej: E-15"
                  value={newEstac}
                  onChange={(e) => setNewEstac(e.target.value)}
                  className="h-10 border border-slate-200 bg-white rounded-xl px-3 outline-none text-center font-mono font-bold text-xs text-slate-700 focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide text-center">Dep.</label>
                <input
                  type="text"
                  placeholder="ej: D-02"
                  value={newDep}
                  onChange={(e) => setNewDep(e.target.value)}
                  className="h-10 border border-slate-200 bg-white rounded-xl px-3 outline-none text-center font-mono font-bold text-xs text-slate-700 focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>

            {/* Asesor Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">Asesor Inmobiliario *</label>
              <SearchableSelect
                value={newAsesor}
                onChange={(val) => setNewAsesor(val)}
                options={advisorOptions.map(adv => ({ value: adv, label: adv }))}
                placeholder="Seleccionar asesor..."
                className="w-full font-medium"
                allowCustom={true}
              />
            </div>

            {/* Tipo de solicitud selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">Tipo de Solicitud *</label>
              <SearchableSelect
                value={newTipo}
                onChange={(val) => setNewTipo(val)}
                options={tiposOperacion.map(t => ({ value: t, label: t }))}
                placeholder="Seleccionar tipo de solicitud..."
                className="w-full font-medium"
              />
            </div>

            {/* Initial Comment */}
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">Comentarios de Apertura</label>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Indica las instrucciones iniciales, prioridad o detalles clave del expediente..."
                rows={2.5}
                className="border border-slate-200 bg-slate-50 rounded-xl p-3 outline-none focus:bg-white text-xs text-slate-700 font-medium placeholder:text-slate-400 focus:ring-1 focus:ring-brand-primary resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.99] shadow-md shadow-blue-100 cursor-pointer mt-2"
          >
            Aperturar Expediente Legal e Iniciar Flujo
          </button>
        </form>
      )}

      {/* SUB-PANEL 1: REGISTER SOLICITUD (TIPO) FOR INCOMPLETE VENTAS OPERATIONS */}
      {jefeSubTab === "register" && (
        <form onSubmit={handleRegisterOperation} className="space-y-4 animate-fadeIn">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
              Seleccionar Expediente Registrado por Ventas (Sin Tipo)
            </label>
            <SearchableSelect
              value={selectedRegRecordId}
              onChange={(val) => setSelectedRegRecordId(val)}
              options={[
                { value: "", label: "-- Selecciona un expediente --" },
                ...regAvailableRecords.map(r => ({
                  value: r.id,
                  label: `${r.proyecto} (DPTO: ${r.dpto || "-"}) - Ingresado por ${r.team}`
                }))
              ]}
              placeholder="Buscar expediente de ventas..."
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 ml-0.5">
              Asignar Tipo de Trámite Legal (TIPO)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {tiposOperacion.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectedType(t)}
                  className={`py-3 px-2 border rounded-xl font-bold text-[11px] transition-all active:scale-[0.98] ${
                    selectedType === t
                      ? "ring-2 ring-brand-primary bg-blue-50 border-brand-primary text-brand-primary"
                      : "bg-white border-blue-100 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Panel */}
          {showRegPreview && (
            <div className="bg-brand-primary p-4 rounded-xl shadow-lg text-white space-y-2 animate-fadeIn">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider opacity-90">
                <span>Acción Legal</span>
                <span>Sello Automático SOLICITUD</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1.5 text-xs">
                <span className="font-bold text-emerald-300">SOLICITUD DE {selectedType}</span>
                <span className="font-mono font-bold text-white">{currentTimeStr}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
              Observaciones del Trámite (Comentario Opcional)
            </label>
            <textarea
              value={regObservations}
              onChange={(e) => setRegObservations(e.target.value)}
              placeholder="Indica notas o instrucciones específicas para este expediente..."
              rows={3}
              className="w-full bg-white border border-blue-100 rounded-xl p-3 focus:ring-1 focus:ring-brand-primary outline-none text-xs text-slate-700 placeholder:text-slate-400"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-blue-100 cursor-pointer"
          >
            Registrar Tipo Legal y Sellar Solicitud
          </button>
        </form>
      )}

      {/* SUB-PANEL 2: EMIT EXPEDIENT (STATUS & COMMENT) */}
      {jefeSubTab === "emit" && (
        <form onSubmit={handleEmitOperation} className="space-y-4 animate-fadeIn">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
              Seleccionar Expediente para Emitir / Actualizar Estado
            </label>
            <SearchableSelect
              value={selectedEmitRecordId}
              onChange={(val) => setSelectedEmitRecordId(val)}
              options={[
                { value: "", label: "-- Selecciona un expediente --" },
                ...emitAvailableRecords.map(r => ({
                  value: r.id,
                  label: `${r.proyecto} (DPTO: ${r.dpto}) - Tipo: ${r.tipo} [${r.status || "Sin Estado"}]`
                }))
              ]}
              placeholder="Buscar expediente..."
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 ml-0.5">
              Asignar Estado Legal (STATUS)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {statusesList.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedStatus(s)}
                  className={`py-3 px-2 border rounded-xl font-bold text-[10px] transition-all active:scale-[0.98] ${
                    selectedStatus === s
                      ? "ring-2 ring-brand-primary bg-emerald-50 border-emerald-400 text-emerald-800"
                      : "bg-white border-blue-100 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Emit Card */}
          {showEmitPreview && (
            <div className="bg-emerald-700 p-4 rounded-xl shadow-lg text-white space-y-2 animate-fadeIn">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider opacity-90">
                <span>Emitir Proceso</span>
                <span>Sello Automático EMISION</span>
              </div>
              <div className="flex justify-between border-t border-white/20 pt-1.5 text-xs">
                <span className="font-bold text-emerald-200">{selectedStatus}</span>
                <span className="font-mono font-bold text-white">{currentTimeStr}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
              Comentarios / Observaciones del Proceso (Opcional)
            </label>
            <textarea
              value={emitComment}
              onChange={(e) => setEmitComment(e.target.value)}
              placeholder="Escribe un comentario o veredicto legal del expediente..."
              rows={3}
              className="w-full bg-white border border-blue-100 rounded-xl p-3 focus:ring-1 focus:ring-brand-primary outline-none text-xs text-slate-700 placeholder:text-slate-400"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-emerald-50 cursor-pointer"
          >
            Emitir Expediente y Sellar Emisión
          </button>
        </form>
      )}

      {/* SUB-PANEL 3: EDIT RECORDS (6-HOUR LOCK) */}
      {jefeSubTab === "edit" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-slate-600 text-xs leading-normal">
            <p className="font-bold text-brand-primary flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Regla de Edición de 6 Horas:
            </p>
            <p className="mt-0.5">
              Como <strong>Jefe Legal</strong>, puedes editar y corregir cualquier dato de los expedientes de todos los perfiles hasta <strong>6 horas después</strong> de su registro. Transcurrido ese plazo, los registros quedarán bloqueados para resguardar la integridad.
            </p>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {records.map((r) => {
              const isEditable = r.createdAt ? (Date.now() - new Date(r.createdAt).getTime() < 6 * 60 * 60 * 1000) : true;
              const remainingStr = r.createdAt 
                ? `${Math.max(0, Math.ceil((6 * 60 * 60 * 1000 - (Date.now() - new Date(r.createdAt).getTime())) / 60000))} min` 
                : "6 hrs";
              const isCurrentEditing = editingRecordId === r.id;

              return (
                <div key={r.id} className={`p-4 rounded-xl border transition-all ${
                  isCurrentEditing ? "bg-blue-50/30 border-blue-400" : "bg-white border-slate-100 hover:border-blue-100"
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">
                        {r.proyecto} <span className="font-mono text-slate-400">(DPTO: {r.dpto})</span>
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Asesor: {r.asesor} • Team: {r.team} • Tipo: {r.tipo || "Sin asignar"} • Estado: {r.status || "Borrador"}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        isEditable ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}>
                        {isEditable ? `Editable: ${remainingStr}` : "Bloqueado (>6 Hrs)"}
                      </span>
                    </div>
                  </div>

                  {isCurrentEditing ? (
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                      <div className="col-span-2 grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Proyecto *</label>
                          <SearchableSelect
                            value={editFields.proyecto || ""}
                            onChange={(val) => {
                              const matchedProj = projectOptions.find(p => p.name === val);
                              setEditFields(prev => ({ 
                                ...prev, 
                                proyecto: val, 
                                team: matchedProj ? matchedProj.team : prev.team 
                              }));
                            }}
                            options={projectOptions.map(p => ({ value: p.name, label: p.name }))}
                            placeholder="Proyecto..."
                            className="w-full mt-0.5"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Asesor *</label>
                          <SearchableSelect
                            value={editFields.asesor || ""}
                            onChange={(val) => setEditFields(prev => ({ ...prev, asesor: val }))}
                            options={advisorOptions.map(a => ({ value: a, label: a }))}
                            placeholder="Asesor..."
                            className="w-full mt-0.5"
                            allowCustom={true}
                          />
                        </div>
                      </div>

                      <div className="col-span-2 grid grid-cols-3 gap-2">
                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Dpto. *</label>
                          <input
                            type="text"
                            value={editFields.dpto || ""}
                            onChange={(e) => setEditFields(prev => ({ ...prev, dpto: e.target.value }))}
                            className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Estac.</label>
                          <input
                            type="text"
                            value={editFields.estac || ""}
                            onChange={(e) => setEditFields(prev => ({ ...prev, estac: e.target.value }))}
                            className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Dep.</label>
                          <input
                            type="text"
                            value={editFields.dep || ""}
                            onChange={(e) => setEditFields(prev => ({ ...prev, dep: e.target.value }))}
                            className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Tipo de Operación</label>
                        <SearchableSelect
                          value={editFields.tipo || ""}
                          onChange={(val) => setEditFields(prev => ({ ...prev, tipo: val }))}
                          options={[
                            { value: "", label: "-- Sin Tipo --" },
                            ...tiposOperacion.map(t => ({ value: t, label: t }))
                          ]}
                          placeholder="Buscar tipo..."
                          className="w-full mt-0.5"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Sello Solicitud</label>
                        <input
                          type="text"
                          value={editFields.solicitud || ""}
                          onChange={(e) => setEditFields(prev => ({ ...prev, solicitud: e.target.value }))}
                          className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Sello Emisión</label>
                        <input
                          type="text"
                          value={editFields.emision || ""}
                          onChange={(e) => setEditFields(prev => ({ ...prev, emision: e.target.value }))}
                          className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Estado (Status)</label>
                        <SearchableSelect
                          value={editFields.status || ""}
                          onChange={(val) => setEditFields(prev => ({ ...prev, status: val }))}
                          options={[
                            { value: "", label: "-- Sin Estado --" },
                            ...statusesList.map(s => ({ value: s, label: s }))
                          ]}
                          placeholder="Buscar estado..."
                          className="w-full mt-0.5"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Comentario</label>
                        <textarea
                          value={editFields.comentario || ""}
                          onChange={(e) => setEditFields(prev => ({ ...prev, comentario: e.target.value }))}
                          className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-primary"
                          rows={2}
                        />
                      </div>

                      <div className="col-span-2 flex gap-2 pt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg cursor-pointer"
                        >
                          Guardar Cambios
                        </button>
                        <button
                          onClick={() => setEditingRecordId(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    isEditable && (
                      <div className="mt-3 text-right">
                        <button
                          onClick={() => startEditingRecord(r)}
                          className="bg-blue-50 hover:bg-blue-100 text-brand-primary font-bold px-3 py-1.5 rounded-lg text-[11px] transition-colors cursor-pointer"
                        >
                          Editar Registro
                        </button>
                      </div>
                    )
                  )}
                </div>
              );
            })}
            {records.length === 0 && (
              <p className="text-center text-slate-400 italic text-xs">No hay expedientes en el sistema.</p>
            )}
          </div>
        </div>
      )}

      {/* SUB-PANEL 4: ADVANCED ACTION HISTORY & RE-ASSIGNMENT */}
      {jefeSubTab === "actions_history" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Advanced Filters Card */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-brand-primary" />
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Filtros de Búsqueda</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
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
                    setAssignedAssistant(r.derivadoA || "");
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
                      {r.derivadoA ? (
                        <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-md mt-1 truncate max-w-[120px]">
                          A cargo: {r.derivadoA}
                        </span>
                      ) : (
                        <span className="text-[9px] italic text-rose-500 font-bold mt-1">
                          Sin Asistente a cargo
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredAllRecords.length === 0 && (
              <div className="text-center p-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-xs italic text-slate-400">
                Ningún expediente coincide con los filtros especificados o registrados.
              </div>
            )}
          </div>

          {/* Action Log and History Detail Form */}
          {selectedHistoryRecordId && (() => {
            const selectedRec = records.find(r => r.id === selectedHistoryRecordId);
            if (!selectedRec) return null;
            const summary = getActionSummary(selectedRec);
            const assistantsList = settings.users?.filter(u => u.role === "Asistente Legal") || [];

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

                {/* Log new Action and optional Re-assignment form */}
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5 text-brand-primary" />
                    Registrar Acción y Derivar/Reasignar
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
                        <option value="Re-Asignación de Asistente">Derivación / Asignación</option>
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

                    {/* Re-assignment selector specifically for Jefe Legal */}
                    <div>
                      <label className="text-[9px] font-bold text-rose-500 block uppercase mb-1 flex items-center gap-1">
                        <span>Re-Asignar Asistente Legal a Cargo (Opcional)</span>
                      </label>
                      <select
                        value={assignedAssistant}
                        onChange={(e) => setAssignedAssistant(e.target.value)}
                        className="w-full h-9 bg-slate-50 border border-rose-200 rounded-xl px-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-rose-400"
                      >
                        <option value="">-- Dejar asignación actual ({selectedRec.derivadoA || "Ninguno"}) --</option>
                        {assistantsList.map(u => (
                          <option key={u.id} value={u.username}>Asistente: {u.username}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Detalle o Comentario de la Acción *</label>
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
                      Grabar Acción y Reasignar
                    </button>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
