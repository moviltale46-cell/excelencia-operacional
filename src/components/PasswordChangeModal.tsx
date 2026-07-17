import React, { useState } from "react";
import { Lock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { UserAccount } from "../types";

interface PasswordChangeModalProps {
  currentUser: UserAccount;
  onSave: (newPassword: string) => Promise<void>;
}

export default function PasswordChangeModal({ currentUser, onSave }: PasswordChangeModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (newPassword.trim().length < 4) {
      setErrorMsg("La contraseña debe tener al menos 4 caracteres.");
      return;
    }

    if (newPassword === "0000") {
      setErrorMsg("No puedes seguir usando la contraseña por defecto '0000'. Elige otra distinta.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Las contraseñas ingresadas no coinciden.");
      return;
    }

    try {
      setSaving(true);
      await onSave(newPassword.trim());
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar la contraseña.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" id="password-change-modal">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-blue-100 p-6 space-y-5 animate-fadeIn">
        
        {/* Warning Icon & Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-100 animate-bounce">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Cambio de Contraseña Obligatorio</h3>
          <p className="text-[11px] text-slate-500 leading-normal">
            Se ha detectado que estás ingresando con la contraseña temporal por defecto (<strong>0000</strong>). Por seguridad, debes actualizarla antes de continuar.
          </p>
        </div>

        {errorMsg && (
          <p className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-lg text-center leading-tight">
            {errorMsg}
          </p>
        )}

        {success ? (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-4 text-center space-y-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
            <p className="text-xs font-bold">¡Contraseña Guardada!</p>
            <p className="text-[10px] text-slate-500">Se ha configurado tu nueva clave y se ha activado tu sesión. Cargando consola...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {/* New Password */}
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block uppercase tracking-wide text-[9px]">
                Nueva Contraseña
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ingresa tu nueva clave segura"
                className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-mono text-slate-700"
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block uppercase tracking-wide text-[9px]">
                Confirmar Nueva Contraseña
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu nueva clave"
                className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-mono text-slate-700"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full h-11 bg-brand-primary hover:bg-brand-secondary disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-xs cursor-pointer uppercase tracking-wider shadow-md"
            >
              <Lock className="h-4 w-4" />
              {saving ? "Guardando..." : "Actualizar e Ingresar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
