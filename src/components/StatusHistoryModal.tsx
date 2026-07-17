import React from "react";
import { X, Clock, User, CheckCircle2, Building, Layers, ShieldCheck, FileCheck } from "lucide-react";
import { OperationRecord } from "../types";

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
    const tagMatch = comment.match(/^\[(.*?)\]\s*(.*)$/);
    if (tagMatch) {
      return {
        type: tagMatch[1],
        detail: tagMatch[2]
      };
    }
    if (comment.includes("Asignado tipo") || comment.includes("tipo por Jefe Legal")) {
      return {
        type: "Asignación Tipo de Trámite",
        detail: comment
      };
    }
    if (comment.includes("Reasignado") || comment.includes("Derivado")) {
      return {
        type: "Re-asignación de Asistente",
        detail: comment
      };
    }
    if (comment === "Registro inicial." || comment.includes("inicial")) {
      return {
        type: "Registro Inicial",
        detail: comment
      };
    }
    return {
      type: fallbackStatus || "Cambio de Estado",
      detail: comment
    };
  };

  const currentParsed = parseAction(record.comentario || "", record.status);

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
            CRONOLOGÍA DE EVENTOS ({history.length + 1} Registros)
          </h4>
        </div>

        {/* Timeline Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/20">
          <div className="border-l-2 border-dashed border-blue-200 ml-4 pl-6 space-y-6 relative">
            
            {/* Timeline item: Current / Latest state */}
            <div className="relative">
              <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 ring-4 ring-white shadow-xs">
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              </span>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mb-1">
                <Clock className="h-3 w-3" />
                Fecha del Registro: <span className="font-bold text-slate-500">{record.emision || record.solicitud || "Actual"}</span>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    {currentParsed.type}
                  </span>
                  <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold uppercase border border-blue-100">
                    ÚLTIMA ACCIÓN
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  "{currentParsed.detail || "Sin comentario registrado."}"
                </p>
                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1 font-medium">
                    <User className="h-3 w-3" />
                    Responsable: <strong className="text-slate-700">{record.updatedByUser || "Responsable"}</strong>
                  </span>
                  {record.derivadoA && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold">
                      Derivado a: {record.derivadoA}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Timeline items: Previous states */}
            {history.map((h, index) => {
              const parsed = parseAction(h.comentario || "", h.status);
              return (
                <div key={index} className="relative">
                  <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-200 ring-4 ring-white shadow-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                  </span>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" />
                    Fecha del Registro: <span className="font-bold text-slate-500">{h.timestamp}</span>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2 opacity-95 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        {parsed.type}
                      </span>
                      <span className="text-[9px] bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase border border-slate-150">
                        {h.status || "Cambio"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium italic pl-3 border-l-2 border-slate-200">
                      "{parsed.detail || "Sin observaciones registradas."}"
                    </p>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Responsable: <strong className="text-slate-700">{h.user}</strong>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Initial record creation */}
            <div className="relative">
              <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 ring-4 ring-white">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
              </span>
              <div className="p-2 pl-3 text-slate-400 text-[10px] leading-relaxed">
                <span>Ingreso inicial del expediente en el sistema.</span>
                {record.createdAt && (
                  <span className="block font-mono text-[9px] mt-0.5">
                    {new Date(record.createdAt).toLocaleString("es-PE")}
                  </span>
                )}
              </div>
            </div>

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
