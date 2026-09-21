import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  Clock, 
  User, 
  CheckCircle2, 
  Building, 
  Layers, 
  ShieldCheck, 
  Pencil, 
  Trash2, 
  Plus, 
  Check, 
  AlertCircle, 
  Save, 
  RotateCcw,
  Calendar
} from "lucide-react";
import { OperationRecord, StatusHistoryEntry } from "../types";
import { safeToLocaleString, safeGetTime, formatDateTimeFull, getFormattedSystemDateTime } from "../utils/dateUtils";

interface StatusHistoryModalProps {
  record: OperationRecord | null;
  statusColors?: Record<string, string>;
  availableStatuses?: string[];
  availableUsers?: string[];
  availableAssistants?: string[];
  onClose: () => void;
  isAdmin?: boolean;
  onUpdateRecord?: (id: string, updatedFields: Partial<OperationRecord>) => Promise<void> | void;
}

interface EventItem {
  status: string;
  comentario: string;
  timestamp: string;
  user: string;
  derivadoA?: string;
  isInitial?: boolean;
}

export default function StatusHistoryModal({
  record,
  statusColors,
  availableStatuses = [],
  availableUsers = [],
  availableAssistants = [],
  onClose,
  isAdmin = false,
  onUpdateRecord
}: StatusHistoryModalProps) {
  if (!record) return null;

  // Helper to parse actions
  const parseAction = (comment: string, fallbackStatus: string) => {
    const isObserved = (fallbackStatus && (fallbackStatus.toLowerCase().includes("observado") || fallbackStatus.toLowerCase().includes("rechazado"))) ||
                       (comment && comment.toLowerCase().includes("[observación]"));
    const isModified = (fallbackStatus && fallbackStatus.toLowerCase().includes("modificado")) ||
                       (comment && (comment.toLowerCase().includes("[modificación]") || comment.toLowerCase().includes("se actualizaron")));

    const tagMatch = comment.match(/^\[(.*?)\]\s*(.*)$/);
    if (tagMatch) {
      return {
        type: tagMatch[1],
        detail: tagMatch[2],
        category: isObserved ? "OBSERVADO" : isModified ? "MODIFICADO" : "ACCION"
      };
    }
    if (comment.includes("Asignado tipo") || comment.includes("tipo por Jefe Legal")) {
      return {
        type: "Asignación Tipo de Trámite",
        detail: comment,
        category: "ACCION"
      };
    }
    if (comment.includes("Reasignado") || comment.includes("Derivado")) {
      return {
        type: "Re-asignación de Asistente",
        detail: comment,
        category: "MODIFICADO"
      };
    }
    if (comment === "Registro inicial." || comment.includes("inicial") || comment.toLowerCase().includes("solicitud registrada")) {
      return {
        type: "Registro Inicial",
        detail: comment,
        category: "REGISTRO"
      };
    }
    return {
      type: fallbackStatus || "Cambio de Estado",
      detail: comment,
      category: isObserved ? "OBSERVADO" : isModified ? "MODIFICADO" : "ACCION"
    };
  };

  // Helper to detect if two entries describe the same history event
  const isSameEvent = (
    a: { status?: string; comentario?: string; timestamp?: string; user?: string },
    b: { status?: string; comentario?: string; timestamp?: string; user?: string }
  ) => {
    if (!a || !b) return false;
    const cA = (a.comentario || "").trim().toLowerCase();
    const cB = (b.comentario || "").trim().toLowerCase();
    const cleanA = cA.replace(/^\[[^\]]+\]\s*/, "");
    const cleanB = cB.replace(/^\[[^\]]+\]\s*/, "");
    const sameComment = cA === cB || (cleanA && cleanA === cleanB);

    const sA = (a.status || "").trim().toLowerCase();
    const sB = (b.status || "").trim().toLowerCase();
    const sameStatus = !sA || !sB || sA === sB;

    const uA = (a.user || "").trim().toLowerCase();
    const uB = (b.user || "").trim().toLowerCase();
    const sameUser = !uA || !uB || uA === uB;

    const tA = safeGetTime(a.timestamp);
    const tB = safeGetTime(b.timestamp);
    const closeTime = Boolean(tA && tB && Math.abs(tA - tB) <= 180000);

    const normTimeA = (a.timestamp || "").replace(/[\s/:-]/g, "");
    const normTimeB = (b.timestamp || "").replace(/[\s/:-]/g, "");
    const sameNormTime = Boolean(normTimeA && normTimeB && normTimeA === normTimeB);

    if (sameComment && (sameStatus || sameUser) && (closeTime || sameNormTime || (!tA && !tB))) {
      return true;
    }

    const isInitialA = cA.includes("solicitud registrada") || cA.includes("registro inicial") || cA.includes("ingreso inicial");
    const isInitialB = cB.includes("solicitud registrada") || cB.includes("registro inicial") || cB.includes("ingreso inicial");
    if (isInitialA && isInitialB && (closeTime || sameNormTime || (!tA && !tB))) {
      return true;
    }

    return false;
  };

  const getInitialEvents = (): EventItem[] => {
    const history = record.history || [];
    const allEvents: EventItem[] = [];

    if (history.length > 0) {
      history.forEach(h => {
        allEvents.push({
          status: h.status || "",
          comentario: h.comentario || "",
          timestamp: h.timestamp || "",
          user: h.user || record.updatedByUser || "Responsable",
          derivadoA: (h as any).derivadoA
        });
      });
    }

    // If history is empty, populate the single initial request entry
    if (allEvents.length === 0) {
      const initialTimeStr = formatDateTimeFull(record.solicitud) || record.solicitud || safeToLocaleString(record.createdAt, "es-PE") || "";
      allEvents.push({
        status: record.status || "Pendiente",
        comentario: record.comentario || "Registro inicial del expediente en el sistema.",
        timestamp: initialTimeStr,
        user: record.updatedByUser || "Ventas / Sistema",
        isInitial: true
      });
    }

    // Deduplicate strictly
    const deduplicatedEvents: EventItem[] = [];
    allEvents.forEach(evt => {
      const existingIndex = deduplicatedEvents.findIndex(existing => isSameEvent(existing, evt));
      if (existingIndex >= 0) {
        const existing = deduplicatedEvents[existingIndex];
        if ((evt.comentario || "").length > (existing.comentario || "").length) {
          deduplicatedEvents[existingIndex].comentario = evt.comentario;
        }
        if (evt.timestamp.includes(" / ") && !existing.timestamp.includes(" / ")) {
          deduplicatedEvents[existingIndex].timestamp = evt.timestamp;
        }
        if (evt.status && !existing.status) {
          deduplicatedEvents[existingIndex].status = evt.status;
        }
      } else {
        deduplicatedEvents.push({ ...evt });
      }
    });

    // Sort strictly by date descending: newest on top
    deduplicatedEvents.sort((a, b) => {
      const tA = safeGetTime(a.timestamp) || 0;
      const tB = safeGetTime(b.timestamp) || 0;
      return tB - tA;
    });

    return deduplicatedEvents;
  };

  const [eventsList, setEventsList] = useState<EventItem[]>(getInitialEvents);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Edit fields
  const [editTimestamp, setEditTimestamp] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editComentario, setEditComentario] = useState("");
  const [editUser, setEditUser] = useState("");
  const [editDerivadoA, setEditDerivadoA] = useState("");

  // Add new event state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTimestamp, setNewTimestamp] = useState("");
  const [newStatus, setNewStatus] = useState("MODIFICADO");
  const [newComentario, setNewComentario] = useState("");
  const [newUser, setNewUser] = useState(record.updatedByUser || "admin");
  const [newDerivadoA, setNewDerivadoA] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Computed dynamic options for strict dropdowns
  const statusOptions = useMemo(() => {
    const list = availableStatuses && availableStatuses.length > 0 
      ? availableStatuses 
      : ["Pendiente", "En Proceso", "Observado", "Firmado", "Cierre Completo", "Rechazado", "Desistido", "Modificado"];
    const set = new Set<string>(list);
    if (editStatus) set.add(editStatus);
    if (newStatus) set.add(newStatus);
    return Array.from(set);
  }, [availableStatuses, editStatus, newStatus]);

  const userOptions = useMemo(() => {
    const set = new Set<string>(availableUsers || []);
    (record.history || []).forEach(h => {
      if (h.user) set.add(h.user);
    });
    if (record.updatedByUser) set.add(record.updatedByUser);
    if (editUser) set.add(editUser);
    if (newUser) set.add(newUser);
    ["admin", "Franco Odar", "Marilyn Saona", "Daniel Hurtado"].forEach(u => set.add(u));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [availableUsers, record.history, record.updatedByUser, editUser, newUser]);

  const assistantOptions = useMemo(() => {
    const set = new Set<string>(availableAssistants || []);
    if (record.derivadoA) set.add(record.derivadoA);
    if (editDerivadoA) set.add(editDerivadoA);
    if (newDerivadoA) set.add(newDerivadoA);
    ["Franco Odar", "Marilyn Saona", "Daniel Hurtado"].forEach(u => set.add(u));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [availableAssistants, record.derivadoA, editDerivadoA, newDerivadoA]);

  useEffect(() => {
    setEventsList(getInitialEvents());
    setEditingIndex(null);
    setIsAddingNew(false);
  }, [record.id, record.history, record.status, record.comentario, record.emision, record.solicitud, record.derivadoA]);

  const startEdit = (index: number) => {
    const item = eventsList[index];
    setEditingIndex(index);
    setEditTimestamp(item.timestamp || "");
    setEditStatus(item.status || "");
    setEditComentario(item.comentario || "");
    setEditUser(item.user || "");
    setEditDerivadoA(item.derivadoA || "");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
  };

  const saveEdit = async () => {
    if (editingIndex === null) return;
    setIsSaving(true);
    try {
      const updatedEvents = [...eventsList];
      updatedEvents[editingIndex] = {
        ...updatedEvents[editingIndex],
        timestamp: editTimestamp,
        status: editStatus,
        comentario: editComentario,
        user: editUser,
        derivadoA: editDerivadoA || undefined
      };

      // Convert to StatusHistoryEntry
      const newHistory: StatusHistoryEntry[] = updatedEvents.map(e => ({
        status: e.status,
        comentario: e.comentario,
        timestamp: e.timestamp,
        user: e.user,
        derivadoA: e.derivadoA
      }));

      const payload: Partial<OperationRecord> = {
        history: newHistory,
        skipHistory: true // Without leaving an audit trail
      };

      // If the modified event was index 0 (the latest event), sync top-level record fields
      if (editingIndex === 0) {
        if (editStatus) payload.status = editStatus;
        payload.comentario = editComentario;
        if (editTimestamp) payload.emision = editTimestamp;
        if (editDerivadoA !== undefined) payload.derivadoA = editDerivadoA;
        if (editUser) payload.updatedByUser = editUser;
      }

      if (onUpdateRecord) {
        await onUpdateRecord(record.id, payload);
      }

      setEventsList(updatedEvents);
      setEditingIndex(null);
      setNoticeMsg("Bloque de historial modificado exitosamente sin dejar registro.");
      setTimeout(() => setNoticeMsg(null), 4000);
    } catch (err) {
      console.error("Error saving history edit:", err);
      alert("Error al guardar cambios en el historial.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEvent = async (index: number) => {
    if (!confirm("¿Estás seguro de eliminar este bloque de historial? Se eliminará permanentemente sin dejar registro.")) {
      return;
    }
    setIsSaving(true);
    try {
      const updatedEvents = eventsList.filter((_, i) => i !== index);

      const newHistory: StatusHistoryEntry[] = updatedEvents.map(e => ({
        status: e.status,
        comentario: e.comentario,
        timestamp: e.timestamp,
        user: e.user,
        derivadoA: e.derivadoA
      }));

      // The latest event in the remaining chronology is index 0 (since events are sorted descending)
      const latestRemaining = updatedEvents.length > 0 ? updatedEvents[0] : null;

      const payload: Partial<OperationRecord> = {
        history: newHistory,
        skipHistory: true,
        status: latestRemaining ? latestRemaining.status : "Pendiente",
        comentario: latestRemaining ? latestRemaining.comentario : "",
        emision: latestRemaining ? latestRemaining.timestamp : "",
        derivadoA: latestRemaining ? (latestRemaining.derivadoA || "") : "",
        updatedByUser: latestRemaining ? latestRemaining.user : "Sistema"
      };

      if (onUpdateRecord) {
        await onUpdateRecord(record.id, payload);
      }

      setEventsList(updatedEvents);
      if (editingIndex === index) {
        setEditingIndex(null);
      }
      setNoticeMsg("Bloque de historial eliminado permanentemente sin dejar registro.");
      setTimeout(() => setNoticeMsg(null), 4000);
    } catch (err) {
      console.error("Error deleting history event:", err);
      alert("Error al eliminar el bloque del historial.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewEvent = async () => {
    if (!newComentario.trim() && !newStatus.trim()) {
      alert("Por favor ingresa un comentario o estado para el nuevo evento.");
      return;
    }
    setIsSaving(true);
    try {
      const newEntry: EventItem = {
        status: newStatus || "MODIFICADO",
        comentario: newComentario.trim(),
        timestamp: newTimestamp || getFormattedSystemDateTime(),
        user: newUser || "admin",
        derivadoA: newDerivadoA || undefined
      };

      const updatedEvents = [newEntry, ...eventsList];
      // Sort chronologically descending
      updatedEvents.sort((a, b) => (safeGetTime(b.timestamp) || 0) - (safeGetTime(a.timestamp) || 0));

      const newHistory: StatusHistoryEntry[] = updatedEvents.map(e => ({
        status: e.status,
        comentario: e.comentario,
        timestamp: e.timestamp,
        user: e.user,
        derivadoA: e.derivadoA
      }));

      const payload: Partial<OperationRecord> = {
        history: newHistory,
        skipHistory: true
      };

      // If new entry is top
      if (updatedEvents[0] === newEntry) {
        if (newEntry.status) payload.status = newEntry.status;
        payload.comentario = newEntry.comentario;
        if (newEntry.timestamp) payload.emision = newEntry.timestamp;
        if (newEntry.derivadoA !== undefined) payload.derivadoA = newEntry.derivadoA;
        if (newEntry.user) payload.updatedByUser = newEntry.user;
      }

      if (onUpdateRecord) {
        await onUpdateRecord(record.id, payload);
      }

      setEventsList(updatedEvents);
      setIsAddingNew(false);
      setNewComentario("");
      setNewStatus("MODIFICADO");
      setNewTimestamp("");
      setNewUser(record.updatedByUser || "admin");
      setNewDerivadoA("");
      setNoticeMsg("Nuevo bloque agregado al historial sin dejar registro.");
      setTimeout(() => setNoticeMsg(null), 4000);
    } catch (err) {
      console.error("Error adding history event:", err);
      alert("Error al agregar nuevo evento al historial.");
    } finally {
      setIsSaving(false);
    }
  };

  const totalEventsCount = eventsList.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn" id="status-history-modal">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-[10px] font-black text-white px-3 py-1 rounded-full uppercase tracking-wider">
              {record.id ? `ID: ${record.id.toUpperCase()}` : "EXPEDIENTE"}
            </span>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-slate-100">
                Historial Operativo Histórico
              </h3>
              {isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400">
                  <ShieldCheck className="w-3 h-3" />
                  Perfil Administrador • Edición Total Sin Rastro
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="hover:bg-white/10 p-1.5 rounded-full transition-colors outline-none cursor-pointer"
            title="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Operation Metadata Card block */}
        <div className="bg-slate-50 border-b border-slate-150 p-5 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PROYECTO</span>
            <span className="font-extrabold text-slate-800 text-sm uppercase flex items-center gap-1 truncate" title={record.proyecto}>
              <Building className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              {record.proyecto}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">COMERCIAL TEAM</span>
            <span className="font-extrabold text-slate-700 text-xs uppercase">
              TEAM {record.team || "A"}
            </span>
          </div>

          <div className="space-y-0.5 col-span-1 md:col-span-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">UNIDADES</span>
            <span className="font-medium text-slate-600 text-xs font-mono">
              dpto {record.dpto || "-"} | estac {record.estac || "-"} | dep {record.dep || "-"}
            </span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ESTADO LEGAL ACTUAL</span>
            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
              statusColors?.[record.status] || "bg-amber-100 text-amber-800 border-amber-200"
            }`}>
              {record.status || "Sin Estado"}
            </span>
          </div>
        </div>

        {/* Notice Message Banner */}
        {noticeMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-emerald-800 animate-fadeIn">
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-emerald-600" />
              {noticeMsg}
            </span>
            <button onClick={() => setNoticeMsg(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Chronology heading + Admin Actions */}
        <div className="px-6 pt-4 shrink-0 flex items-center justify-between gap-3">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-600" />
            CRONOLOGÍA DE EVENTOS ({totalEventsCount} REGISTROS)
          </h4>

          {isAdmin && !isAddingNew && (
            <button
              onClick={() => {
                setIsAddingNew(true);
                setNewTimestamp(getFormattedSystemDateTime());
                setNewStatus("MODIFICADO");
                setNewComentario("");
                setNewUser(record.updatedByUser || "admin");
              }}
              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] rounded-lg border border-blue-200 flex items-center gap-1 transition-all cursor-pointer shadow-xs"
              title="Agregar un bloque nuevo al historial"
            >
              <Plus className="h-3 w-3" />
              Agregar Bloque
            </button>
          )}
        </div>

        {/* Timeline Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/20">

          {/* Form to Add New Block */}
          {isAddingNew && (
            <div className="bg-blue-50/50 border-2 border-dashed border-blue-300 p-4 rounded-2xl space-y-3 mb-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-900 uppercase flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5 text-blue-600" />
                  Nuevo Bloque de Historial (Sin Rastro)
                </span>
                <button 
                  onClick={() => setIsAddingNew(false)} 
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Estado *</label>
                  <select
                    value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Seleccionar Estado...</option>
                    {statusOptions.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Fecha del Registro</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newTimestamp}
                      onChange={e => setNewTimestamp(e.target.value)}
                      placeholder="DD/MM/YYYY / HH:MM:SS"
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setNewTimestamp(getFormattedSystemDateTime())}
                      className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded-lg cursor-pointer whitespace-nowrap"
                      title="Usar Fecha/Hora actual"
                    >
                      Ahora
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Comentario / Detalle</label>
                <textarea
                  value={newComentario}
                  onChange={e => setNewComentario(e.target.value)}
                  placeholder="Detalle completo de la modificación o acción..."
                  rows={2}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Responsable *</label>
                  <select
                    value={newUser}
                    onChange={e => setNewUser(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">Seleccionar Responsable...</option>
                    {userOptions.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Derivado a (Opcional)</label>
                  <select
                    value={newDerivadoA}
                    onChange={e => setNewDerivadoA(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">- Sin Asignar / Ninguno -</option>
                    {assistantOptions.map(ast => (
                      <option key={ast} value={ast}>{ast}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsAddingNew(false)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleAddNewEvent}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  {isSaving ? "Guardando..." : "Guardar Bloque"}
                </button>
              </div>
            </div>
          )}

          <div className="border-l-2 border-dashed border-blue-200 ml-4 pl-6 space-y-6 relative">
            
            {eventsList.map((event, index) => {
              const isLatest = index === 0;
              const isInitial = event.isInitial || index === eventsList.length - 1;
              const parsed = parseAction(event.comentario || "", event.status);
              const isEditing = editingIndex === index;

              if (isEditing) {
                return (
                  <div key={index} className="relative">
                    <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-4 ring-white shadow-xs">
                      <Pencil className="h-2.5 w-2.5 text-white" />
                    </span>
                    
                    <div className="p-4 rounded-2xl border-2 border-blue-400 bg-white shadow-md space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-black text-blue-900 uppercase flex items-center gap-1">
                          <Pencil className="h-3.5 w-3.5 text-blue-600" />
                          Editando Bloque {index + 1} de {eventsList.length}
                        </span>
                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Edición Sin Rastro
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Estado *</label>
                          <select
                            value={editStatus}
                            onChange={e => setEditStatus(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            <option value="">Seleccionar Estado...</option>
                            {statusOptions.map(st => (
                              <option key={st} value={st}>{st}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Fecha del Registro</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={editTimestamp}
                              onChange={e => setEditTimestamp(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => setEditTimestamp(getFormattedSystemDateTime())}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded-lg cursor-pointer whitespace-nowrap"
                              title="Poner fecha y hora actual"
                            >
                              Ahora
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Comentario / Detalle Completo</label>
                        <textarea
                          value={editComentario}
                          onChange={e => setEditComentario(e.target.value)}
                          rows={3}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Responsable *</label>
                          <select
                            value={editUser}
                            onChange={e => setEditUser(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            <option value="">Seleccionar Responsable...</option>
                            {userOptions.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Derivado a</label>
                          <select
                            value={editDerivadoA}
                            onChange={e => setEditDerivadoA(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            <option value="">- Sin Asignar / Ninguno -</option>
                            {assistantOptions.map(ast => (
                              <option key={ast} value={ast}>{ast}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={cancelEdit}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={saveEdit}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {isSaving ? "Guardando..." : "Guardar Cambios"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (isInitial && eventsList.length > 1 && !event.status && event.comentario.includes("inicial") && !isAdmin) {
                return (
                  <div key={index} className="relative">
                    <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                    </span>
                    <div className="p-2 pl-3 text-slate-400 text-[10px] leading-relaxed">
                      <span>Ingreso inicial del expediente en el sistema.</span>
                      {event.timestamp && (
                        <span className="block font-mono text-[9px] mt-0.5">
                          {formatDateTimeFull(event.timestamp) || event.timestamp}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={index} className="relative group">
                  <span className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white shadow-xs ${
                    isLatest ? "bg-blue-600" : "bg-blue-200"
                  }`}>
                    {isLatest ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                    )}
                  </span>

                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Fecha del Registro: <span className="font-bold text-slate-600">{formatDateTimeFull(event.timestamp) || event.timestamp || "-"}</span>
                    </div>

                    {/* Admin Action Buttons on the block */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startEdit(index)}
                          className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-bold flex items-center gap-1 border border-blue-200 transition-all cursor-pointer"
                          title="Editar fecha, estado o comentario de este bloque"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEvent(index)}
                          className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-bold flex items-center gap-1 border border-rose-200 transition-all cursor-pointer"
                          title="Eliminar este bloque permanentemente sin dejar registro"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`p-4 rounded-2xl border shadow-xs space-y-2 transition-all ${
                    isLatest ? "bg-white border-blue-200 ring-1 ring-blue-50" : "bg-white border-slate-200 opacity-95 hover:opacity-100"
                  }`}>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        {parsed.type}
                      </span>
                      {isLatest ? (
                        <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase border border-blue-100">
                          ÚLTIMA ACCIÓN
                        </span>
                      ) : (
                        <span className="text-[9px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase border border-slate-150">
                          {event.status || "Cambio"}
                        </span>
                      )}
                    </div>

                    <p className={`text-xs text-slate-600 leading-relaxed font-medium ${
                      isLatest ? "bg-slate-50 p-2.5 rounded-xl border border-slate-100" : "italic pl-3 border-l-2 border-slate-200"
                    }`}>
                      "{parsed.detail || event.comentario || "Sin comentario registrado."}"
                    </p>

                    <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                      <span className="flex items-center gap-1 font-medium">
                        <User className="h-3 w-3" />
                        Responsable: <strong className="text-slate-700">{event.user || "Responsable"}</strong>
                      </span>
                      {event.derivadoA && (
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold">
                          Derivado a: {event.derivadoA}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 text-center shrink-0">
          <span className="text-[11px] text-slate-400 font-medium">
            {isAdmin ? "Modificaciones directas en base de datos sin generar registros de auditoría." : "Línea de tiempo de estados y observaciones."}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md uppercase tracking-wider"
          >
            Cerrar Detalle
          </button>
        </div>

      </div>
    </div>
  );
}
