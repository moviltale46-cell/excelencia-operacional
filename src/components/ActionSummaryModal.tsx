import React from "react";
import { 
  Building, User, Home, AlertOctagon, MessageSquare, 
  CheckCircle2, XCircle, FileText, ArrowRight 
} from "lucide-react";

export interface ActionSummaryData {
  projectName: string;
  unit: string;
  advisor: string;
  emissionStatus: string;
  observationReasons?: string[];
  comment?: string;
  actionTitle?: string;
}

interface ActionSummaryModalProps {
  isOpen: boolean;
  data: ActionSummaryData | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLoading?: boolean;
}

export default function ActionSummaryModal({
  isOpen,
  data,
  onCancel,
  onConfirm,
  confirmLoading = false
}: ActionSummaryModalProps) {
  if (!isOpen || !data) return null;

  const isClosedStatus = 
    data.emissionStatus === "Cierre Completo" || 
    data.emissionStatus === "Desistido" || 
    data.emissionStatus === "Desistió";

  const isObserved = 
    data.emissionStatus.toLowerCase().includes("observad") || 
    data.emissionStatus.toLowerCase().includes("rechazad") ||
    (data.observationReasons && data.observationReasons.length > 0);

  const getStatusBadgeStyle = () => {
    if (data.emissionStatus === "Cierre Completo") {
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }
    if (data.emissionStatus === "Desistido" || data.emissionStatus === "Desistió") {
      return "bg-rose-100 text-rose-800 border-rose-300";
    }
    if (data.emissionStatus.toLowerCase().includes("aprobado")) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    }
    if (isObserved) {
      return "bg-amber-100 text-amber-900 border-amber-300";
    }
    return "bg-slate-100 text-slate-800 border-slate-300";
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      id="action-summary-modal-overlay"
    >
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-scaleUp"
        id="action-summary-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isClosedStatus ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
              {isClosedStatus ? <AlertOctagon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-wide">
                {data.actionTitle || "Resumen de Registro de Acción"}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Verifica los datos antes de registrar en el sistema
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title="Cerrar ventana"
            id="btn-close-action-modal"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Body Summary Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Main Attributes Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Nombre de Proyecto */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Building className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">Nombre de Proyecto</span>
              </div>
              <p className="text-xs font-bold text-slate-800 truncate" title={data.projectName}>
                {data.projectName || "Sin especificar"}
              </p>
            </div>

            {/* Unidad */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <Home className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">Unidad</span>
              </div>
              <p className="text-xs font-bold text-slate-800 truncate" title={data.unit}>
                {data.unit || "Sin unidad"}
              </p>
            </div>

            {/* Asesor */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">Asesor</span>
              </div>
              <p className="text-xs font-bold text-slate-800 truncate" title={data.advisor}>
                {data.advisor || "Sin asignar"}
              </p>
            </div>

            {/* Estatus de emisión */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">Estatus de Emisión</span>
              </div>
              <div className="inline-block">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${getStatusBadgeStyle()}`}>
                  {data.emissionStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Motivo de observación */}
          <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-150">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5 text-amber-600" />
                Motivo de Observación
              </span>
              {data.observationReasons && data.observationReasons.length > 0 && (
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.2 rounded-full">
                  {data.observationReasons.length} {data.observationReasons.length === 1 ? "motivo" : "motivos"}
                </span>
              )}
            </div>

            {data.observationReasons && data.observationReasons.length > 0 ? (
              <ul className="space-y-1 mt-1">
                {data.observationReasons.map((motivo, idx) => (
                  <li key={idx} className="text-xs font-semibold text-amber-900 flex items-start gap-1.5">
                    <span className="text-amber-500 font-bold shrink-0">•</span>
                    <span>{motivo}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 font-medium italic">
                Ningún motivo de observación marcado
              </p>
            )}
          </div>

          {/* Comentario */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-150">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
              Comentario
            </span>
            <p className="text-xs text-slate-700 font-medium whitespace-pre-wrap leading-relaxed">
              {data.comment?.trim() ? data.comment : <span className="text-slate-400 italic">Sin comentario adicional</span>}
            </p>
          </div>
        </div>

        {/* Modal Actions Footer: CANCELAR or REGISTRAR */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirmLoading}
            className="px-4 py-2 text-xs font-extrabold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
            id="btn-summary-cancelar"
          >
            CANCELAR
          </button>
          
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmLoading}
            className={`px-5 py-2 text-xs font-black text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
              isClosedStatus 
                ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            }`}
            id="btn-summary-registrar"
          >
            {confirmLoading ? (
              <span>Procesando...</span>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>REGISTRAR</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
