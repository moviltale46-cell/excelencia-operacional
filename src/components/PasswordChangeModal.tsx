import React, { useState } from "react";
import { Lock, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { UserAccount } from "../types";

interface PasswordChangeModalProps {
  currentUser: UserAccount;
  onSave: (newPassword: string) => Promise<void>;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  isMandatory?: boolean;
}

export default function PasswordChangeModal({ 
  currentUser, 
  onSave, 
  onClose,
  title = "Actualizar Contraseña",
  subtitle,
  isMandatory = false
}: PasswordChangeModalProps) {
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
      setErrorMsg("No puedes usar la contraseña por defecto '0000'. Elige otra distinta.");
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
      if (onClose) {
        setTimeout(() => {
          onClose();
        }, 1500);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error al actualizar la contraseña.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" id="password-change-modal">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-blue-100 p-6 space-y-5 animate-fadeIn relative">
        
        {/* Close button if not mandatory */}
        {!isMandatory && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Warning / Security Icon & Header */}
        <div className="text-center space-y-2">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto border ${
            isMandatory ? "bg-amber-50 text-amber-600 border-amber-100 animate-bounce" : "bg-blue-50 text-brand-primary border-blue-100"
          }`}>
            {isMandatory ? <AlertTriangle className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
          </div>
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
            {isMandatory ? "Cambio de Contraseña Obligatorio" : title}
          </h3>
          <p className="text-[11px] text-slate-500 leading-normal">
            {subtitle || (isMandatory 
              ? "Se ha detectado que estás ingresando con la contraseña temporal por defecto (0000). Por seguridad, debes actualizarla antes de continuar." 
              : `Ingresa una nueva contraseña segura para tu cuenta (${currentUser.username}).`)}
          </p>
        </div>

        {errorMsg && (
          <p className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-xl text-center leading-tight">
            {errorMsg}
          </p>
        )}

        {success ? (
          <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-2xl p-4 text-center space-y-2">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
            <p className="text-xs font-black">¡Contraseña Actualizada con Éxito!</p>
            <p className="text-[10px] text-slate-500">Se ha guardado tu nueva clave de acceso.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {/* New Password */}
            <div className="space-y-1">
              <label className="font-black text-slate-600 block uppercase tracking-wide text-[9px]">
                Nueva Contraseña
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ingresa tu nueva clave segura"
                className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-mono text-slate-700 text-xs"
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <label className="font-black text-slate-600 block uppercase tracking-wide text-[9px]">
                Confirmar Nueva Contraseña
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite tu nueva clave"
                className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-mono text-slate-700 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              {!isMandatory && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-3 rounded-xl text-xs transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex-1 h-11 bg-brand-primary hover:bg-brand-secondary disabled:bg-slate-300 text-white font-black rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-xs cursor-pointer uppercase tracking-wider shadow-sm"
              >
                <Lock className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar Clave"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
