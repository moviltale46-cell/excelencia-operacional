import React, { useState, useEffect } from "react";
import { AlertTriangle, Clock, X, CheckCircle2, ChevronRight, User, Building, Home } from "lucide-react";
import { OperationRecord, UserAccount } from "../types";
import { safeParseDate } from "../utils/dateUtils";

interface PendingAlertModalProps {
  records: OperationRecord[];
  currentUser: UserAccount | null;
}

interface PendingAlertItem {
  record: OperationRecord;
  elapsedHours: number;
  tier: 6 | 12 | 18 | 24;
  storageKey: string;
}

export default function PendingAlertModal({ records, currentUser }: PendingAlertModalProps) {
  const [activeAlerts, setActiveAlerts] = useState<PendingAlertItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDismissedSession, setIsDismissedSession] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role;
    // Alerts apply to the responsible legal assistant and also Jefe Legal (and Admin)
    const isAssistant = role === "Asistente Legal";
    const isJefeLegal = role === "Jefe Legal";
    const isAdmin = role === "Administrador";

    if (!isAssistant && !isJefeLegal && !isAdmin) return;

    const myName = (currentUser.username || "").toLowerCase().trim();
    const now = Date.now();
    const alerts: PendingAlertItem[] = [];

    records.forEach((r) => {
      // Must be pending emission / initial action
      const hasEmission = Boolean(r.emision && r.emision.trim()) || Boolean(r.emittedAt);
      if (hasEmission) return;

      const statusLower = (r.status || "").toLowerCase().trim();
      const isExplicitPending = !statusLower || statusLower.includes("pendiente");
      if (!isExplicitPending) return;

      // Check role assignment: If Asistente Legal, must be assigned to them
      if (isAssistant) {
        const assigned = (r.derivadoA || "").toLowerCase().trim();
        if (!assigned || (assigned !== myName && !myName.includes(assigned) && !assigned.includes(myName))) {
          return;
        }
      }

      // Calculate elapsed time since solicitud or creation
      const startIso = r.solicitudAt || r.solicitud || r.createdAt;
      const startDate = safeParseDate(startIso);
      if (!startDate) return;

      const diffMs = now - startDate.getTime();
      const hours = diffMs / (1000 * 60 * 60);

      // Determine highest crossed threshold: 24, 18, 12, 6
      let tier: 6 | 12 | 18 | 24 | null = null;
      if (hours >= 24) tier = 24;
      else if (hours >= 18) tier = 18;
      else if (hours >= 12) tier = 12;
      else if (hours >= 6) tier = 6;

      if (!tier) return;

      const storageKey = `pending_alert_${r.id}_${tier}h`;
      // Check if already dismissed permanently
      if (localStorage.getItem(storageKey) === "dismissed") {
        return;
      }

      alerts.push({
        record: r,
        elapsedHours: Math.floor(hours),
        tier,
        storageKey
      });
    });

    // Sort by highest tier and elapsed hours
    alerts.sort((a, b) => b.elapsedHours - a.elapsedHours);
    setActiveAlerts(alerts);
  }, [records, currentUser]);

  if (isDismissedSession || activeAlerts.length === 0) {
    return null;
  }

  const currentAlert = activeAlerts[currentIndex] || activeAlerts[0];
  if (!currentAlert) return null;

  const handleDismissCurrent = () => {
    // Store in localStorage so it never shows up again
    try {
      localStorage.setItem(currentAlert.storageKey, "dismissed");
    } catch {
      // Ignore storage errors
    }

    const next = activeAlerts.filter((_, idx) => idx !== currentIndex);
    setActiveAlerts(next);
    if (currentIndex >= next.length) {
      setCurrentIndex(Math.max(0, next.length - 1));
    }
    if (next.length === 0) {
      setIsDismissedSession(true);
    }
  };

  const handleDismissAll = () => {
    activeAlerts.forEach((a) => {
      try {
        localStorage.setItem(a.storageKey, "dismissed");
      } catch {
        // Ignore
      }
    });
    setActiveAlerts([]);
    setIsDismissedSession(true);
  };

  const tierColors = {
    6: {
      bg: "bg-amber-50",
      border: "border-amber-300",
      text: "text-amber-800",
      badge: "bg-amber-100 text-amber-900 border-amber-300",
      icon: "text-amber-600",
      bar: "bg-amber-500"
    },
    12: {
      bg: "bg-orange-50",
      border: "border-orange-300",
      text: "text-orange-900",
      badge: "bg-orange-100 text-orange-900 border-orange-300",
      icon: "text-orange-600",
      bar: "bg-orange-500"
    },
    18: {
      bg: "bg-rose-50",
      border: "border-rose-300",
      text: "text-rose-900",
      badge: "bg-rose-100 text-rose-900 border-rose-300",
      icon: "text-rose-600",
      bar: "bg-rose-500"
    },
    24: {
      bg: "bg-red-50",
      border: "border-red-400",
      text: "text-red-950",
      badge: "bg-red-100 text-red-900 border-red-300",
      icon: "text-red-600",
      bar: "bg-red-600"
    }
  }[currentAlert.tier];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-lg bg-white rounded-3xl shadow-2xl border ${tierColors.border} overflow-hidden flex flex-col`}>
        {/* Top visual urgency indicator bar */}
        <div className={`h-2.5 w-full ${tierColors.bar}`} />

        {/* Header */}
        <div className={`p-5 ${tierColors.bg} border-b ${tierColors.border} flex items-start justify-between gap-3`}>
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-2xl bg-white shadow-xs ${tierColors.icon}`}>
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${tierColors.badge}`}>
                  Alerta: +{currentAlert.tier} Horas Pendiente
                </span>
                {activeAlerts.length > 1 && (
                  <span className="text-[10px] font-extrabold text-slate-500 bg-white/80 px-2 py-0.5 rounded-full border border-slate-200">
                    {currentIndex + 1} de {activeAlerts.length} operaciones
                  </span>
                )}
              </div>
              <h3 className={`text-base font-black ${tierColors.text} mt-1 leading-tight`}>
                Operación requiere atención inmediata
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Esta solicitud lleva <strong>{currentAlert.elapsedHours} horas</strong> en estado pendiente sin acción registrada.
              </p>
            </div>
          </div>

          <button
            onClick={handleDismissCurrent}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
            title="Cerrar advertencia"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content details of the operation */}
        <div className="p-5 space-y-4 text-xs text-slate-700">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Building className="h-3 w-3" /> Proyecto
                </span>
                <p className="font-extrabold text-slate-800 text-sm mt-0.5">
                  {currentAlert.record.proyecto || "Sin proyecto"}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Home className="h-3 w-3" /> Unidad(es)
                </span>
                <p className="font-bold text-slate-800 mt-0.5 font-mono">
                  {currentAlert.record.dpto || currentAlert.record.estac || currentAlert.record.dep || "N/A"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <User className="h-3 w-3" /> Asesor / Solicitante
                </span>
                <p className="font-semibold text-slate-700 mt-0.5">
                  {currentAlert.record.asesor || "-"}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Fecha Solicitud
                </span>
                <p className="font-semibold text-slate-700 mt-0.5">
                  {currentAlert.record.solicitud || currentAlert.record.createdAt || "-"}
                </p>
              </div>
            </div>

            {currentAlert.record.derivadoA && (
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Asistente Responsable:
                </span>
                <span className="font-extrabold text-brand-primary bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 text-[11px]">
                  {currentAlert.record.derivadoA}
                </span>
              </div>
            )}
          </div>

          <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl flex items-start gap-2.5 text-amber-900">
            <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Este es un <strong>mensaje de advertencia</strong> para agilizar los tiempos de respuesta. Al hacer clic en cerrar, no volverá a salir para este nivel de horas.
            </p>
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          {activeAlerts.length > 1 ? (
            <button
              onClick={handleDismissAll}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              Cerrar todas ({activeAlerts.length})
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium">Excelencia Operacional</span>
          )}

          <div className="flex items-center gap-2">
            {activeAlerts.length > 1 && (
              <button
                onClick={() => setCurrentIndex((prev) => (prev + 1) % activeAlerts.length)}
                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              onClick={handleDismissCurrent}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Entendido / Cerrar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
