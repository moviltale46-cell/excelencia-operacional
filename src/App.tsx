import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  UserCheck, 
  Gavel, 
  User, 
  BarChart3, 
  FileSpreadsheet, 
  Layers, 
  Settings as SettingsIcon, 
  Info,
  HelpCircle,
  RefreshCw,
  Sparkles,
  LogOut,
  Lock,
  Unlock
} from "lucide-react";

import ExcelLiveGrid from "./components/ExcelLiveGrid";
import KpiDashboard from "./components/KpiDashboard";
import AdminPanel from "./components/AdminPanel";
import JefeVentasPanel from "./components/JefeVentasPanel";
import JefeLegalPanel from "./components/JefeLegalPanel";
import AsistenteLegalPanel from "./components/AsistenteLegalPanel";
import SearchableSelect from "./components/SearchableSelect";
import { OperationRecord, AppSettings, UserRole, UserAccount } from "./types";
import * as api from "./services/api";

export default function App() {
  // Database States
  const [records, setRecords] = useState<OperationRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    platformName: "Excelencia Operacional",
    jefeLegalEnabled: true,
    sharedExcelLink: "",
    sheetsWebhookUrl: "",
    users: [],
    tiposOperacion: [],
    statuses: [],
    proyectos: [],
    kpiVisibility: {
      "Administrador": true,
      "Jefe de Ventas": false,
      "Jefe Legal": true,
      "Asistente Legal": false
    }
  });
  
  // Auth & Session States
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // First-time Password Change States
  const [forcePasswordChangeUser, setForcePasswordChangeUser] = useState<UserAccount | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [confirmPasswordVal, setConfirmPasswordVal] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // Layout States
  const [activeTab, setActiveTab] = useState<"flow" | "spreadsheet" | "kpis">("flow");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch Database (Records + Settings) from Server
  const fetchDb = async () => {
    try {
      setRefreshing(true);
      const recordsData = await api.getRecords();
      const settingsData = await api.getSettings();
      
      // Filter out duplicate IDs from the server to guarantee React keys are unique
      const uniqueRecords: OperationRecord[] = [];
      const seenIds = new Set<string>();
      for (const r of recordsData) {
        if (r.id) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            uniqueRecords.push(r);
          }
        } else {
          uniqueRecords.push(r);
        }
      }
      
      setRecords(uniqueRecords);
      setSettings(settingsData);
      setErrorMsg(null);

      // Re-hydrate currentUser if settings changed (to get latest assignedProjects, etc.)
      const savedUser = localStorage.getItem("operaciones_session");
      if (savedUser) {
        const parsed = JSON.parse(savedUser) as UserAccount;
        // Find latest record of this user in database settings
        const freshUser = settingsData.users?.find((u: UserAccount) => u.username === parsed.username);
        if (freshUser && freshUser.active !== false) {
          setCurrentUser(freshUser);
          localStorage.setItem("operaciones_session", JSON.stringify(freshUser));
        } else if (!freshUser) {
          // If deleted, clear session
          setCurrentUser(null);
          localStorage.removeItem("operaciones_session");
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("No se pudo conectar al servidor de datos. Reintentando...");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDb();
  }, []);

  // Sync session on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("operaciones_session");
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser) as UserAccount;
        setCurrentUser(parsed);
      } catch (e) {
        localStorage.removeItem("operaciones_session");
      }
    }
  }, []);

  // Guard restricted active tab for Jefe de Ventas and Asistente Legal
  useEffect(() => {
    if (currentUser && (currentUser.role === "Jefe de Ventas" || currentUser.role === "Asistente Legal") && activeTab === "spreadsheet") {
      setActiveTab("flow");
    }
  }, [currentUser, activeTab]);

  // Handle Log In
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const userList = settings.users || [];
    const foundUser = userList.find(
      (u) => u.username.toLowerCase() === loginUsername.trim().toLowerCase()
    );

    if (!foundUser) {
      setAuthError("El nombre de usuario ingresado no existe.");
      return;
    }

    if (foundUser.active === false) {
      setAuthError("Esta cuenta de usuario ha sido desactivada por el Administrador.");
      return;
    }

    // Password verification (some assistants might be passwordless: password === "")
    if (foundUser.password !== "" && foundUser.password !== loginPassword) {
      setAuthError("La contraseña ingresada es incorrecta.");
      return;
    }

    // Check if it's a first time login with default password '0000' (applies to Jefe de Ventas, Jefe Legal, etc.)
    if (foundUser.password === "0000") {
      setForcePasswordChangeUser(foundUser);
      setNewPasswordVal("");
      setConfirmPasswordVal("");
      setPasswordChangeError(null);
      return;
    }

    // Logged in successfully!
    setCurrentUser(foundUser);
    localStorage.setItem("operaciones_session", JSON.stringify(foundUser));
    setLoginPassword("");
    setLoginUsername("");
    setActiveTab("flow"); // reset tab
  };

  // Handle Log Out
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("operaciones_session");
  };

  // Handle Confirm Password Change (First Time Login for Jefe de Ventas)
  const handleConfirmPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeError(null);

    if (!forcePasswordChangeUser) return;

    if (newPasswordVal === "0000") {
      setPasswordChangeError("La contraseña no puede seguir siendo '0000'. Por favor, elija otra.");
      return;
    }

    if (newPasswordVal.trim().length < 4) {
      setPasswordChangeError("La contraseña debe tener al menos 4 caracteres.");
      return;
    }

    if (newPasswordVal !== confirmPasswordVal) {
      setPasswordChangeError("Las contraseñas ingresadas no coinciden.");
      return;
    }

    try {
      // Update this user's password in settings.users
      const updatedUsers = (settings.users || []).map(u => 
        u.id === forcePasswordChangeUser.id ? { ...u, password: newPasswordVal.trim() } : u
      );

      // Save to server
      await handleUpdateSettings({ users: updatedUsers });

      // Retrieve the updated user object
      const updatedUser = updatedUsers.find(u => u.id === forcePasswordChangeUser.id);
      if (updatedUser) {
        setCurrentUser(updatedUser);
        localStorage.setItem("operaciones_session", JSON.stringify(updatedUser));
      }

      setForcePasswordChangeUser(null);
      setLoginPassword("");
      setLoginUsername("");
      setActiveTab("flow");
    } catch (err: any) {
      setPasswordChangeError("Error al guardar la nueva contraseña: " + err.message);
    }
  };

  // API Call: Add Record (Jefe de Ventas)
  const handleAddRecord = async (recordData: Partial<OperationRecord>) => {
    try {
      const finalData = { ...recordData };
      if (currentUser) {
        finalData.updatedByUser = currentUser.username;
      }
      if (!finalData.derivadoA && finalData.proyecto) {
        const assistants = settings.users?.filter(
          u => u.role === "Asistente Legal" && u.active && u.assignedProjects?.includes(finalData.proyecto!)
        ) || [];
        if (assistants.length > 0) {
          finalData.derivadoA = assistants[0].username;
        }
      }
      const added = await api.createRecord(finalData);
      setRecords(prev => [added, ...prev]);

      // Automatically add new custom advisor to settings list if not present
      const currentAsesores = settings.asesores || [];
      if (finalData.asesor && !currentAsesores.includes(finalData.asesor)) {
        const newList = [...currentAsesores, finalData.asesor];
        handleUpdateSettings({ asesores: newList });
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // API Call: Update Record (Jefe Legal / Asistente Legal / Admin)
  const handleUpdateRecord = async (id: string, updatedFields: Partial<OperationRecord>) => {
    try {
      const finalFields = { ...updatedFields };
      if (!finalFields.updatedByUser && currentUser) {
        finalFields.updatedByUser = currentUser.username;
      }
      // If project changes and it does not have derivadoA, try auto-assigning assistant
      if (finalFields.proyecto && !finalFields.derivadoA) {
        const assistants = settings.users?.filter(
          u => u.role === "Asistente Legal" && u.active && u.assignedProjects?.includes(finalFields.proyecto!)
        ) || [];
        if (assistants.length > 0) {
          finalFields.derivadoA = assistants[0].username;
        }
      }
      const updated = await api.updateRecord(id, finalFields);
      setRecords(prev => prev.map(r => r.id === id ? updated : r));

      // Automatically add new custom advisor to settings list if not present
      const currentAsesores = settings.asesores || [];
      if (finalFields.asesor && !currentAsesores.includes(finalFields.asesor)) {
        const newList = [...currentAsesores, finalFields.asesor];
        handleUpdateSettings({ asesores: newList });
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // API Call: Delete Record (Admin)
  const handleDeleteRecord = async (id: string) => {
    try {
      // Validate that the operation exists in Google Sheets before executing the deletion
      const latestRecords = await api.getRecords();
      const exists = latestRecords.some(r => r.id === id);
      
      if (!exists) {
        alert(`La operación con ID ${id} no existe en la hoja de cálculo de Google Sheets. El listado se actualizará automáticamente.`);
        setRecords(latestRecords);
        return;
      }

      await api.deleteRecord(id, currentUser?.username || "Administrador");
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert("Error al eliminar el registro: " + err.message);
    }
  };

  // API Call: Update Settings (Admin)
  const handleUpdateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updated = await api.updateSettings(newSettings, settings);
      setSettings(updated);
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  // API Call: Import Excel from Base64
  const handleImportExcel = async (fileBase64: string) => {
    try {
      const data = await api.importExcel(fileBase64);
      await fetchDb(); // Reload records
      return { success: true, count: data.count };
    } catch (err: any) {
      console.error(err);
      return { success: false, count: 0 };
    }
  };

  // Trigger Excel File Download
  const handleExportExcel = () => {
    api.exportExcel(records);
  };

  // Determine if current user can view KPIs based on settings or role override
  const canViewKpis = () => {
    if (!currentUser) return false;
    if (currentUser.role === "Administrador" || currentUser.role === "Jefe Legal") {
      return true; // Always allow Admin and Jefe Legal
    }
    return settings.kpiVisibility?.[currentUser.role] === true;
  };

  // Dynamic Login helper to see if password field is required
  const selectedUserConfig = settings.users?.find(
    (u) => u.username.toLowerCase() === loginUsername.trim().toLowerCase()
  );
  const isPasswordless = selectedUserConfig && selectedUserConfig.password === "";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-mono text-slate-500">Conectando al servidor inmobiliario...</p>
        </div>
      </div>
    );
  }

  // FORCE PASSWORD CHANGE FOR FIRST-TIME USERS (JEFE DE VENTAS, JEFE LEGAL, ETC.)
  if (forcePasswordChangeUser) {
    return (
      <div className="min-h-screen bg-blue-50/50 flex flex-col justify-center items-center p-4 antialiased">
        {/* Brand Header */}
        <div className="mb-6 text-center space-y-2">
          {settings.platformLogo ? (
            <div className="w-16 h-16 bg-white border border-blue-100 rounded-2xl shadow-xl p-1 inline-flex items-center justify-center overflow-hidden">
              <img src={settings.platformLogo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="bg-brand-primary text-white p-3 rounded-2xl shadow-xl shadow-blue-200 inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] font-bold block">grid_view</span>
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-xl text-brand-primary tracking-tight uppercase">
              {settings.platformName || "Excelencia Operacional"}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Actualización Obligatoria de Contraseña
            </p>
          </div>
        </div>

        {/* Change Password Form card */}
        <div className="w-full max-w-sm bg-white border border-blue-100 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="text-center space-y-1.5">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
              Primer Ingreso del Usuario
            </h2>
            <p className="text-[11px] text-slate-500 leading-normal pt-1">
              Hola <strong className="text-slate-700">{forcePasswordChangeUser.username}</strong> ({forcePasswordChangeUser.role}). Por motivos de seguridad, debes actualizar la contraseña predeterminada (<span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700 text-[10px]">0000</span>) antes de acceder al sistema.
            </p>
          </div>

          {passwordChangeError && (
            <div className="bg-rose-50 border border-rose-100 text-rose-800 text-[11px] rounded-xl p-3 font-semibold text-center animate-fadeIn">
              {passwordChangeError}
            </div>
          )}

          <form onSubmit={handleConfirmPasswordChange} className="space-y-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block uppercase tracking-wide text-[9px]">
                Nueva Contraseña
              </label>
              <input
                type="password"
                required
                value={newPasswordVal}
                onChange={(e) => setNewPasswordVal(e.target.value)}
                placeholder="Mínimo 4 caracteres..."
                className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary text-slate-700 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-600 block uppercase tracking-wide text-[9px]">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                required
                value={confirmPasswordVal}
                onChange={(e) => setConfirmPasswordVal(e.target.value)}
                placeholder="Repita la nueva contraseña..."
                className="w-full p-2.5 bg-slate-50 border border-blue-100 rounded-xl outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary text-slate-700 font-mono"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-all uppercase tracking-wider text-[11px] cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Unlock className="h-3.5 w-3.5" />
                Guardar y Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setForcePasswordChangeUser(null);
                  setLoginPassword("");
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-4 rounded-xl text-[11px] transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">
          Desarrollado por G. I.
        </div>
      </div>
    );
  }

  // LOGIN SCREEN
  if (!currentUser) {
    const userOptions = (settings.users || [])
      .filter(u => u.active !== false)
      .map(u => ({
        value: u.username,
        label: `${u.username} (${u.role})`
      }));

    return (
      <div className="min-h-screen bg-blue-50/50 flex flex-col justify-center items-center p-4 antialiased">
        
        {/* Brand Header */}
        <div className="mb-6 text-center space-y-2">
          {settings.platformLogo ? (
            <div className="w-16 h-16 bg-white border border-blue-100 rounded-2xl shadow-xl p-1 inline-flex items-center justify-center overflow-hidden">
              <img src={settings.platformLogo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="bg-brand-primary text-white p-3 rounded-2xl shadow-xl shadow-blue-200 inline-flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px] font-bold block">grid_view</span>
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-xl text-brand-primary tracking-tight uppercase">
              {settings.platformName || "Excelencia Operacional"}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Gestión Integral Legal y Ventas Inmobiliarias
            </p>
          </div>
        </div>

        {/* Login Form card */}
        <div className="w-full max-w-sm bg-white border border-blue-100 rounded-2xl p-6 shadow-xl space-y-5">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider text-center border-b border-slate-100 pb-2">
            Ingreso Seguro al Sistema
          </h2>

          {authError && (
            <div className="bg-rose-50 border border-rose-100 text-rose-800 text-[11px] rounded-xl p-3 font-semibold text-center animate-fadeIn">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            
            {/* Username */}
            <div className="space-y-1">
              <label className="font-bold text-slate-600 block uppercase tracking-wide text-[9px]">
                Seleccionar Usuario / Perfil
              </label>
              <SearchableSelect
                value={loginUsername}
                onChange={(val) => {
                  setLoginUsername(val);
                  setAuthError(null);
                }}
                options={userOptions}
                placeholder="Seleccione su usuario..."
                className="w-full"
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="font-bold text-slate-600 block uppercase tracking-wide text-[9px]">
                  Contraseña
                </label>
                {isPasswordless && (
                  <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded flex items-center gap-1">
                    <Unlock className="h-3 w-3" />
                    Acceso Libre (Sin clave)
                  </span>
                )}
              </div>
              <input
                type="password"
                required={!isPasswordless}
                disabled={!!isPasswordless}
                value={isPasswordless ? "" : loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  setAuthError(null);
                }}
                placeholder={isPasswordless ? "No requiere contraseña" : "••••••••"}
                className={`w-full p-2.5 border rounded-xl outline-none text-slate-700 font-mono ${
                  isPasswordless 
                    ? "bg-emerald-50/50 border-emerald-100 placeholder:text-emerald-700/50 text-emerald-800" 
                    : "bg-slate-50 border-blue-100 focus:bg-white focus:ring-1 focus:ring-brand-primary"
                }`}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-brand-primary hover:bg-brand-secondary text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-[0.98] uppercase tracking-wider text-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <Lock className="h-3.5 w-3.5" />
              Ingresar a la Plataforma
            </button>
          </form>
        </div>
        
        {/* Footer Login */}
        <div className="mt-8 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">
          Desarrollado por G. I.
        </div>
      </div>
    );
  }

  // FULL WORKSPACE FOR LOGGED IN USERS
  return (
    <div className="min-h-screen bg-blue-50/50 font-sans antialiased text-slate-800 flex flex-col">
      
      {/* Top Navbar */}
      <header className="bg-white border-b border-blue-100 sticky top-0 z-40 shadow-xs px-4 md:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Brand Details */}
        <div className="flex items-center gap-2.5">
          {settings.platformLogo ? (
            <div className="w-10 h-10 bg-white border border-blue-100 rounded-xl shadow-xs p-0.5 flex items-center justify-center overflow-hidden shrink-0">
              <img src={settings.platformLogo} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="bg-brand-primary text-white p-2 rounded-xl shadow-md shadow-blue-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px] font-bold block">grid_view</span>
            </div>
          )}
          <div>
            <h1 className="font-black text-xs md:text-sm text-brand-primary tracking-tight leading-tight uppercase">
              {settings.platformName || "Excelencia Operacional"}
            </h1>
            <p className="text-[9px] md:text-[10px] text-slate-400 font-medium leading-none mt-0.5">
              Gestión Integral Legal y Ventas Inmobiliarias
            </p>
          </div>
        </div>

        {/* Logged in User Profile Info & Action buttons */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          
          {/* User badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-blue-50">
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold uppercase">
              {currentUser.username.substr(0, 2)}
            </div>
            <div className="text-[10px] text-left leading-tight">
              <div className="font-bold text-slate-700">{currentUser.username}</div>
              <div className="text-slate-400 font-semibold uppercase text-[8px]">{currentUser.role}</div>
            </div>
          </div>

          {/* Web spreadsheet view link */}
          {settings.sharedExcelLink && currentUser.role !== "Jefe de Ventas" && currentUser.role !== "Asistente Legal" && (
            <a
              href={settings.sharedExcelLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl px-2.5 py-1.5 transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ver Excel</span>
            </a>
          )}
          
          {/* Refresh database */}
          <button
            onClick={fetchDb}
            title="Refrescar base de datos"
            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-slate-200 rounded-xl text-[11px] font-bold cursor-pointer transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-xs font-medium flex items-center gap-2 shadow-xs">
            <span className="material-symbols-outlined text-rose-600">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Active Views & Forms */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Unified tab system depending on permissions */}
            <div className="bg-white p-1 rounded-xl border border-blue-100 flex items-center gap-1 shadow-sm max-w-md">
              <button
                onClick={() => setActiveTab("flow")}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "flow"
                    ? "bg-brand-primary text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Mi Consola</span>
              </button>
              
              {currentUser.role !== "Jefe de Ventas" && currentUser.role !== "Asistente Legal" && (
                <button
                  onClick={() => setActiveTab("spreadsheet")}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "spreadsheet"
                      ? "bg-brand-primary text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Excel</span>
                </button>
              )}

              {/* KPI visibility filter: only rendered if user role can view kpis */}
              {canViewKpis() && (
                <button
                  onClick={() => setActiveTab("kpis")}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "kpis"
                      ? "bg-brand-primary text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Estadísticas KPIs</span>
                </button>
              )}
            </div>

            {/* Active view layout content */}
            <div className="transition-all">
              {activeTab === "flow" && (
                <div className="space-y-6">
                  {currentUser.role === "Administrador" && (
                    <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm space-y-5">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <ShieldCheck className="h-5 w-5 text-brand-primary" />
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider">
                            Consola del Administrador
                          </h3>
                          <p className="text-[10px] text-slate-400">Control total sobre usuarios, catálogos de proyectos, tipos, estados y control de filas</p>
                        </div>
                      </div>

                      <AdminPanel
                        settings={settings}
                        records={records}
                        onUpdateSettings={handleUpdateSettings}
                        onUpdateRecord={handleUpdateRecord}
                        onDeleteRecord={handleDeleteRecord}
                        onImportExcel={handleImportExcel}
                      />
                    </div>
                  )}

                  {currentUser.role === "Jefe de Ventas" && (
                    <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm">
                      <JefeVentasPanel
                        records={records}
                        settings={settings}
                        currentUser={currentUser}
                        onAddRecord={handleAddRecord}
                        onUpdateRecord={handleUpdateRecord}
                      />
                    </div>
                  )}

                  {currentUser.role === "Jefe Legal" && (
                    <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm">
                      <JefeLegalPanel
                        records={records}
                        settings={settings}
                        currentUser={currentUser}
                        onUpdateRecord={handleUpdateRecord}
                        onAddRecord={handleAddRecord}
                      />
                    </div>
                  )}

                  {currentUser.role === "Asistente Legal" && (
                    <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm">
                      <AsistenteLegalPanel
                        records={records}
                        settings={settings}
                        currentUser={currentUser}
                        onUpdateRecord={handleUpdateRecord}
                      />
                    </div>
                  )}
                </div>
              )}

              {activeTab === "spreadsheet" && (
                <ExcelLiveGrid
                  records={records}
                  onExport={handleExportExcel}
                  sharedLink={settings.sharedExcelLink}
                />
              )}

              {activeTab === "kpis" && canViewKpis() && (
                <KpiDashboard
                  records={records}
                />
              )}
            </div>

          </div>

          {/* Right Column: Mini Spreadsheet Live Summary Widget & Guide instructions */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live active database grid feed */}
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                    Últimas Acciones Registradas
                  </h3>
                  {currentUser && currentUser.role !== "Jefe de Ventas" && currentUser.role !== "Asistente Legal" && (
                    <button
                      onClick={() => setActiveTab("spreadsheet")}
                      className="text-[11px] font-bold text-brand-primary hover:text-brand-secondary cursor-pointer"
                    >
                      Ver Todo
                    </button>
                  )}
                </div>
                
                <div className="overflow-x-auto border border-blue-50 rounded-xl">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-blue-50/20 border-b border-blue-100 text-slate-500 font-bold">
                        <th className="p-2">PROYECTO</th>
                        <th className="p-2">TIPO</th>
                        <th className="p-2">SOLICITUD</th>
                        <th className="p-2">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-50">
                      {records.slice(0, 6).map(r => (
                        <tr key={r.id} className="hover:bg-blue-50/10">
                          <td className="p-2 font-bold text-slate-700">{r.proyecto} (DPTO {r.dpto})</td>
                          <td className="p-2 font-bold text-brand-secondary">{r.tipo || "-"}</td>
                          <td className="p-2 font-mono text-slate-400">{r.solicitud ? r.solicitud.split(" ")[0] : "-"}</td>
                          <td className="p-2">
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-100">
                              {r.status || "Pendiente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {records.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400 italic">No hay filas en la base de datos.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 font-semibold text-slate-600">
                  <Sparkles className="h-3 w-3 text-brand-secondary animate-pulse" />
                  Total Operaciones: {records.length}
                </span>
                {settings.sharedExcelLink && currentUser.role !== "Jefe de Ventas" && currentUser.role !== "Asistente Legal" && (
                  <a
                    href={settings.sharedExcelLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 font-bold hover:underline flex items-center gap-0.5"
                  >
                    Enlace de Excel Original
                    <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                  </a>
                )}
              </div>
            </div>

            {/* Steps Workflow visual guide card */}
            <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm">
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-brand-primary" />
                Canales de Gestión de Expedientes
              </h4>
              
              <div className="space-y-3 text-xs leading-normal">
                <div className="flex gap-2.5 items-start">
                  <div className="bg-blue-50 text-brand-primary h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</div>
                  <p className="text-slate-500">
                    <strong className="text-slate-800">Ventas:</strong> Ingresa el expediente desde campo. El sistema asocia automáticamente el <strong className="text-slate-700">TEAM</strong> basándose en el proyecto seleccionado de su catálogo.
                  </p>
                </div>

                <div className="flex gap-2.5 items-start">
                  <div className="bg-blue-50 text-brand-primary h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</div>
                  <p className="text-slate-500">
                    <strong className="text-slate-800">Legal:</strong> Sella de manera inmediata el tipo de proceso (<strong className="text-slate-700">SOLICITUD</strong>). El Jefe Legal cuenta con 6 horas para re-ajustar cualquier dato.
                  </p>
                </div>

                <div className="flex gap-2.5 items-start">
                  <div className="bg-blue-50 text-brand-primary h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</div>
                  <p className="text-slate-500">
                    <strong className="text-slate-800">Asistente:</strong> Sella el estatus definitivo y firma comentarios (<strong className="text-slate-700">EMISION</strong>). Dispone de un período de gracia de 30 minutos para correcciones.
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-blue-100 py-6 px-4 text-center mt-12 text-xs text-slate-400 font-medium">
        <p>© 2026 {settings.platformName || "Excelencia Operacional"}. Optimización Digital de Procesos de Emisiones Legales.</p>
        <p className="mt-1.5 text-xs text-slate-600 font-bold uppercase tracking-wider">Desarrollado por G. I.</p>
      </footer>

    </div>
  );
}
