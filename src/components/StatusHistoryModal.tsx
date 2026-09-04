import React from "react";
import { X, Clock, User, CheckCircle2, Building, Layers, ShieldCheck, FileCheck } from "lucide-react";
import { OperationRecord } from "../types";
import { safeToLocaleString, safeGetTime } from "../utils/dateUtils";

interface StatusHistoryModalProps {
  record: OperationRecord | null;
  statusColors?: Record<string, string>;
  onClose: () => void;
}

export default function StatusHistoryModal({ record, statusColors, onClose }: StatusHistoryModalProps) {
  if (!record) return null;

  const history = record.history || [];

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
    if (comment === "Registro inicial." || comment.includes("inicial")) {
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

  // Collect all events and sort them strictly in descending chronological order
  const allEvents: {
    status: string;
    comentario: string;
    timestamp: string;
    user: string;
    derivadoA?: string;
    isInitial?: boolean;
  }[] = [];

  if (history.length > 0) {
    history.forEach(h => {
      allEvents.push({
        status: h.status || "",
        comentario: h.comentario || "",
        timestamp: h.timestamp || "",
        user: h.user || record.updatedByUser || "Responsable"
      });
    });
  }

  // Ensure the latest active state is included if not already present
  const latestTimeStr = record.emision || record.solicitud || safeToLocaleString(record.createdAt, "es-PE") || "";
  const hasLatestInHistory = allEvents.some(e => 
    (e.timestamp && e.timestamp === latestTimeStr) ||
    (e.comentario && e.comentario === record.comentario && e.status === record.status)
  );

  if (!hasLatestInHistory && (record.comentario || record.status)) {
    allEvents.push({
      status: record.status || "",
      comentario: record.comentario || "",
      timestamp: latestTimeStr,
      user: record.updatedByUser || "Responsable",
      derivadoA: record.derivadoA
    });
  }

  // Ensure initial creation is included if not in history
  const initialTimeStr = record.solicitud || safeToLocaleString(record.createdAt, "es-PE") || "";
  const hasInitialInHistory = allEvents.some(e => 
    e.comentario?.includes("Registro inicial") || 
    e.comentario?.includes("inicial") ||
    (initialTimeStr && e.timestamp === initialTimeStr)
  );

  if (!hasInitialInHistory && initialTimeStr) {
    allEvents.push({
      status: "Pendiente",
      comentario: "Ingreso inicial del expediente en el sistema.",
      timestamp: initialTimeStr,
      user: "Ventas / Sistema",
      isInitial: true
    });
  }

  // Sort strictly by date descending: newest on top
  allEvents.sort((a, b) => {
    const tA = safeGetTime(a.timestamp) || 0;
    const tB = safeGetTime(b.timestamp) || 0;
    return tB - tA;
  });

  const totalEventsCount = allEvents.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn" id="status-history-modal">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 p-5 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-3">
            <span className="bg-blue-600 text-[10px] font-black text-white px-3 py-1 rounded-full uppercase tracking-wider">
              {record.id ? `ID: ${record.id.toUpperCase()}` : "EXPEDIENTE"}
            </span>
            <h3 className="font-extrabold text-base tracking-tight text-slate-100">
              Historial Operativo Histórico
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="hover:bg-white/10 p-1.5 rounded-full transition-colors outline-none cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Operation Metadata Card block */}
        <div className="bg-slate-50 border-b border-slate-150 p-5 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PROYECTO</span>
            <span className="font-extrabold text-slate-800 text-sm uppercase flex items-center gap-1">
              <Building className="h-3.5 w-3.5 text-slate-500" />
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

        {/* Chronology heading */}
        <div className="px-6 pt-4 shrink-0">
          <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-600" />
            CRONOLOGÍA DE EVENTOS ({totalEventsCount} REGISTROS)
          </h4>
        </div>

        {/* Timeline Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/20">
          <div className="border-l-2 border-dashed border-blue-200 ml-4 pl-6 space-y-6 relative">
            
            {allEvents.map((event, index) => {
              const isLatest = index === 0;
              const isInitial = event.isInitial || index === allEvents.length - 1;
              const parsed = parseAction(event.comentario || "", event.status);

              if (isInitial && allEvents.length > 1 && !event.status && event.comentario.includes("inicial")) {
                return (
                  <div key={index} className="relative">
                    <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                    </span>
                    <div className="p-2 pl-3 text-slate-400 text-[10px] leading-relaxed">
                      <span>Ingreso inicial del expediente en el sistema.</span>
                      {event.timestamp && (
                        <span className="block font-mono text-[9px] mt-0.5">
                          {event.timestamp}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={index} className="relative">
                  <span className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white shadow-xs ${
                    isLatest ? "bg-blue-600" : "bg-blue-200"
                  }`}>
                    {isLatest ? (
                      <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                    )}
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" />
                    Fecha del Registro: <span className="font-bold text-slate-500">{event.timestamp || "Actual"}</span>
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
        <div className="p-4 border-t border-slate-100 bg-slate-50 text-center shrink-0">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md uppercase tracking-wider"
          >
            Cerrar Detalle
          </button>
        </div>

      </div>
    </div>
  );
}
