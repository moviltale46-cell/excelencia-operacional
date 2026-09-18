import React from "react";
import { 
  Building, User, Home, AlertOctagon, MessageSquare, 
  CheckCircle2, XCircle, FileText, ArrowRight, ShieldCheck, Clock
} from "lucide-react";
import { STANDARD_OBSERVATIONS, STANDARD_OTHER_AREAS_OBSERVATIONS } from "../types";

export interface ActionSummaryData {
  projectName: string;
  unit: string;
  advisor: string;
  emissionStatus: string;
  observationReasons?: string[];
  comment?: string;
  actionTitle?: string;
  affectsAdvisor?: boolean;
  isReopening?: boolean;
  previousStatus?: string;
  actionType?: string;
  assignedAssistant?: string;
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

  // Check if this action explicitly involves Legal / Asesor observations (which affect advisor)
  const hasLegalObservation = Boolean(
    data.affectsAdvisor === true ||
    (data.observationReasons && data.observationReasons.some(r => 
      STANDARD_OBSERVATIONS.includes(r as any) ||
      (!r.toLowerCase().includes("otras áreas") && !r.toLowerCase().includes("otras areas"))
    ))
  );

  // An action is "Otras Áreas" ONLY if it does NOT affect advisor AND is from other areas
  const isOtherAreas = !hasLegalObservation && (
    data.affectsAdvisor === false ||
    data.emissionStatus.toLowerCase().includes("otras áreas") || 
    data.emissionStatus.toLowerCase().includes("otras areas") ||
    (data.observationReasons && data.observationReasons.some(r => 
      STANDARD_OTHER_AREAS_OBSERVATIONS.includes(r as any) ||
      r.toLowerCase().includes("otras áreas") || 
      r.toLowerCase().includes("otras areas")
    ))
  );

  const isObserved = 
    data.emissionStatus.toLowerCase().includes("observad") || 
    data.emissionStatus.toLowerCase().includes("rechazad") ||
    (data.observationReasons && data.observationReasons.length > 0);

  // Normalize displayed status: if it's a legal observation, ensure status isn't "Otras Áreas"
  const displayStatus = (hasLegalObservation && (data.emissionStatus.toLowerCase().includes("otras áreas") || data.emissionStatus.toLowerCase().includes("otras areas")))
    ? "Observado / Rechazado"
    : data.emissionStatus;

  const getStatusBadgeStyle = () => {
    if (isOtherAreas) {
      return "bg-blue-100 text-blue-900 border-blue-300 font-bold";
    }
    if (displayStatus === "Cierre Completo") {
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }
    if (displayStatus === "Desistido" || displayStatus === "Desistió") {
      return "bg-rose-100 text-rose-800 border-rose-300";
    }
    if (displayStatus.toLowerCase().includes("aprobado")) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    }
    if (isObserved) {
      return "bg-rose-100 text-rose-900 border-rose-300 font-bold";
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
        <div className={`text-white px-6 py-5 flex items-center justify-between ${
          data.isReopening 
            ? "bg-gradient-to-r from-amber-600 to-orange-600 shadow-md" 
            : "bg-slate-900"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              data.isReopening 
                ? "bg-white/20 text-white" 
                : isClosedStatus 
                  ? "bg-amber-500/20 text-amber-300" 
                  : "bg-blue-500/20 text-blue-300"
            }`}>
              {data.isReopening || isClosedStatus ? <AlertOctagon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-wide">
                {data.actionTitle || (data.isReopening ? "Confirmación de Reapertura de Operación" : "Resumen de Registro de Acción")}
              </h3>
              <p className={`text-[11px] font-medium mt-0.5 ${data.isReopening ? "text-amber-100" : "text-slate-400"}`}>
                {data.isReopening ? "Pantalla de advertencia: verifica los datos para reconfirmar" : "Verifica los datos antes de registrar en el sistema"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-black/10 transition-colors"
            title="Cerrar ventana"
            id="btn-close-action-modal"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Body Summary Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {data.isReopening && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs space-y-1">
              <span className="font-black uppercase tracking-wider flex items-center gap-1.5 text-amber-800 text-[11px]">
                <AlertOctagon className="h-4 w-4 text-amber-600" />
                Advertencia de Reactivación
              </span>
              <p className="text-[11px] leading-relaxed">
                El expediente cambiará su estado finalizado ({data.previousStatus || "Cierre Completo"}) y se registrará formalmente la reapertura en el historial con el siguiente resumen de acción:
              </p>
            </div>
          )}

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

            {/* Estatus / Nuevo Estado */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-150">
              <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider">
                  {data.isReopening ? "Nuevo Estado Legal" : "Estatus de Emisión"}
                </span>
              </div>
              <div className="inline-block">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                  data.isReopening ? "bg-amber-100 text-amber-900 border-amber-300" : getStatusBadgeStyle()
                }`}>
                  {displayStatus}
                </span>
              </div>
            </div>

            {/* Reopening specific fields: Asistente asignado & Tipo de Acción */}
            {data.isReopening && (
              <>
                <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200">
                  <div className="flex items-center gap-1.5 text-amber-800 mb-1">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Asistente Legal Asignado</span>
                  </div>
                  <p className="text-xs font-bold text-amber-950 truncate">
                    {data.assignedAssistant || "Sin asignar"}
                  </p>
                </div>

                <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200">
                  <div className="flex items-center gap-1.5 text-amber-800 mb-1">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Tipo de Acción</span>
                  </div>
                  <p className="text-xs font-bold text-amber-950 truncate">
                    {data.actionType || "Reapertura de Trámite"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Impacto en KPI y Temporizador del Asesor */}
          {isObserved && (
            <div className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
              isOtherAreas 
                ? "bg-blue-50 border-blue-200 text-blue-900" 
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}>
              <div className="text-xs">
                <span className="font-extrabold block">
                  {isOtherAreas ? "🛡️ No Afecta al Asesor (Tiempo Detenido)" : "⚠️ Afecta al Asesor en su KPI"}
                </span>
                <span className={`text-[10px] ${isOtherAreas ? "text-blue-700" : "text-rose-700"}`}>
                  {isOtherAreas 
                    ? "El tiempo de respuesta del asesor está detenido y no se penaliza en su ratio de observaciones."
                    : "El temporizador de espera del asesor empezará a correr y se computará en su ratio."}
                </span>
              </div>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase border shrink-0 ${
                isOtherAreas 
                  ? "bg-blue-100 text-blue-800 border-blue-300" 
                  : "bg-rose-100 text-rose-800 border-rose-300"
              }`}>
                {isOtherAreas ? "Tiempo Detenido" : "Corre Tiempo Asesor"}
              </span>
            </div>
          )}

          {/* Motivo de observación */}
          <div className={`p-3.5 rounded-2xl border ${
            isOtherAreas 
              ? "bg-blue-50/60 border-blue-200" 
              : "bg-rose-50/40 border-rose-150"
          }`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                isOtherAreas ? "text-blue-900" : "text-rose-900"
              }`}>
                <AlertOctagon className={`h-3.5 w-3.5 ${isOtherAreas ? "text-blue-600" : "text-rose-600"}`} />
                {isOtherAreas ? "Observaciones de Otras Áreas (No Afecta Asesor)" : "Motivo de Observación Legal (Afecta Asesor)"}
              </span>
              {data.observationReasons && data.observationReasons.length > 0 && (
                <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                  isOtherAreas ? "bg-blue-200 text-blue-900" : "bg-rose-100 text-rose-800 border border-rose-200"
                }`}>
                  {data.observationReasons.length} {data.observationReasons.length === 1 ? "motivo" : "motivos"}
                </span>
              )}
            </div>

            {data.observationReasons && data.observationReasons.length > 0 ? (
              <ul className="space-y-1 mt-1">
                {data.observationReasons.map((motivo, idx) => (
                  <li key={idx} className={`text-xs font-semibold flex items-start gap-1.5 ${
                    isOtherAreas ? "text-blue-900" : "text-rose-950"
                  }`}>
                    <span className={`font-bold shrink-0 ${isOtherAreas ? "text-blue-500" : "text-rose-500"}`}>•</span>
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
            className={`px-5 py-2.5 text-xs font-black text-white rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
              data.isReopening || isClosedStatus 
                ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 ring-2 ring-amber-500/30"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
            }`}
            id="btn-summary-registrar"
          >
            {confirmLoading ? (
              <span>Procesando...</span>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>{data.isReopening ? "CONFIRMAR REAPERTURA Y CAMBIAR ESTADO" : "REGISTRAR"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
