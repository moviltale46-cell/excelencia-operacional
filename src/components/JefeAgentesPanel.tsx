import React, { useState, useEffect } from "react";
import { OperationRecord, AppSettings, UserAccount } from "../types";
import { Plus, X, Search, Building2, Users, History, ShieldCheck, CheckCircle, AlertTriangle, Clock, Filter, Eye } from "lucide-react";
import StatusHistoryModal from "./StatusHistoryModal";
import SearchableSelect from "./SearchableSelect";
import { safeGetTime, checkDuplicateUnitOperation, formatProjectAndUnits } from "../utils/dateUtils";

interface JefeAgentesPanelProps {
  records: OperationRecord[];
  settings: AppSettings;
  currentUser: UserAccount;
  onAddRecord: (recordData: Partial<OperationRecord>) => void;
  onUpdateRecord: (id: string, updatedFields: Partial<OperationRecord>) => void;
}

export default function JefeAgentesPanel({
  records,
  settings,
  currentUser,
  onAddRecord,
  onUpdateRecord
}: JefeAgentesPanelProps) {
  const [filterTab, setFilterTab] = useState<"All" | "Pending" | "Approved" | "Observed">("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<OperationRecord | null>(null);
  const [viewScope, setViewScope] = useState<"mi_team" | "todos_los_proyectos">("mi_team");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields for new operation
  const [selectedProyecto, setSelectedProyecto] = useState("");
  const [dpto, setDpto] = useState("");
  const [estac, setEstac] = useState("");
  const [dep, setDep] = useState("");
  const [selectedAsesor, setSelectedAsesor] = useState("");
  const [tipoOperacion, setTipoOperacion] = useState("Emisión");
  const [observacionInicial, setObservacionInicial] = useState("");

  const teamName = currentUser.teamName || "AGENTES";

  // All projects available in the system
  const allProjects = (settings.proyectos || []).map(p => p.name).filter(Boolean);

  // Advisors: prioritize advisors assigned to this Jefe de Agentes, otherwise fallback to all advisors
  const myAssignedAdvisors = currentUser.assignedAdvisors && currentUser.assignedAdvisors.length > 0
    ? currentUser.assignedAdvisors
    : (settings.asesores && settings.asesores.length > 0 ? settings.asesores : []);

  const allAdvisorsList = settings.asesores && settings.asesores.length > 0 ? settings.asesores : myAssignedAdvisors;

  // Initialize form defaults
  useEffect(() => {
    if (allProjects.length > 0 && !selectedProyecto) {
      setSelectedProyecto(allProjects[0]);
    }
    if (myAssignedAdvisors.length > 0 && !selectedAsesor) {
      setSelectedAsesor(myAssignedAdvisors[0]);
    }
  }, [allProjects, myAssignedAdvisors, selectedProyecto, selectedAsesor]);

  // Helper to check if record belongs to Jefe de Agentes' team or assigned advisors
  const isMyTeamRecord = (r: OperationRecord) => {
    const t = (r.team || "").toUpperCase().trim();
    if (t.includes("AGENTE")) return true;
    if (currentUser.teamName && t === currentUser.teamName.toUpperCase().trim()) return true;
    if (myAssignedAdvisors.length > 0 && r.asesor) {
      const match = myAssignedAdvisors.some(a => a.toLowerCase().trim() === r.asesor.toLowerCase().trim());
      if (match) return true;
    }
    return false;
  };

  // Team records vs All records
  const myTeamRecords = records.filter(isMyTeamRecord);

  // Filter records based on selected viewScope and search
  const filteredRecords = records.filter(r => {
    if (viewScope === "mi_team") {
      if (!isMyTeamRecord(r)) return false;
    }

    const matchesSearch =
      r.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.asesor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.dpto && r.dpto.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (r.status && r.status.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    const s = (r.status || "").toLowerCase();
    if (filterTab === "Pending") {
      return !s.includes("aprobado") && !s.includes("cierre");
    }
    if (filterTab === "Approved") {
      return s.includes("aprobado") || s.includes("cierre");
    }
    if (filterTab === "Observed") {
      return s.includes("observ") || s.includes("rechaz");
    }
    return true;
  });

  // Calculate Metrics specifically for Team Agentes (Completely isolated)
  const teamTotalOps = myTeamRecords.length;
  const teamApproved = myTeamRecords.filter(r => (r.status || "").toLowerCase().includes("aprobado") || (r.status || "").toLowerCase().includes("cierre")).length;
  const teamObserved = myTeamRecords.filter(r => (r.status || "").toLowerCase().includes("observ") || (r.status || "").toLowerCase().includes("rechaz")).length;
  const teamPending = teamTotalOps - teamApproved;
  const qualityRate = teamTotalOps > 0 ? Math.round(((teamTotalOps - teamObserved) / teamTotalOps) * 100) : 100;

  const handleOpenModal = () => {
    setSelectedProyecto(allProjects[0] || "");
    setSelectedAsesor(myAssignedAdvisors[0] || (allAdvisorsList[0] || ""));
    setDpto("");
    setEstac("");
    setDep("");
    setTipoOperacion("Emisión");
    setObservacionInicial("");
    setIsModalOpen(true);
  };

  const handleCreateRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProyecto) {
      alert("Por favor seleccione un proyecto.");
      return;
    }
    if (!selectedAsesor) {
      alert("Por favor seleccione un asesor.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Validate: Prevent duplicate units in same project
      const duplicateCheck = checkDuplicateUnitOperation(records, {
        proyecto: selectedProyecto,
        dpto,
        estac,
        dep
      });

      if (duplicateCheck.isDuplicate) {
        setIsSubmitting(false);
        alert(duplicateCheck.errorMessage);
        return;
      }

      const nowStr = new Date().toLocaleString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }).replace(",", " /");

      onAddRecord({
        proyecto: selectedProyecto,
        team: teamName,
        asesor: selectedAsesor,
        dpto: dpto.trim(),
        estac: estac.trim(),
        dep: dep.trim(),
        tipo: tipoOperacion,
        status: "Pendiente de Firma",
        solicitud: nowStr,
        solicitudAt: nowStr,
        comentario: observacionInicial.trim() || `Ingreso de solicitud por Jefe de Agentes (${currentUser.username}).`
      });

      setIsModalOpen(false);
    } catch (err) {
      console.error("Error creating record:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="jefe-agentes-panel">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-teal-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="bg-teal-500/20 text-teal-300 border border-teal-400/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Perfil: Jefe de Agentes
            </span>
            <span className="bg-white/10 text-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Team: {teamName}
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/20">
              Acceso a Todos los Proyectos
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            Gestión de Operaciones y Equipo de Agentes
          </h2>
          <p className="text-xs text-teal-100/80 max-w-2xl">
            Supervisa las operaciones de sus asesores a cargo en todos los proyectos inmobiliarios. Los indicadores de su equipo están totalmente aislados de los Jefes de Ventas.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-teal-950 font-extrabold px-4 py-2.5 rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer text-xs"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            Nueva Solicitud (Cualquier Proyecto)
          </button>
        </div>
      </div>

      {/* KPI & Summary Cards (Isolated to Team Agentes) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-teal-100 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-teal-50 text-teal-700 rounded-xl">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Proyectos Disponibles</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-800">{allProjects.length}</span>
              <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-1.5 py-0.2 rounded">100% Cobertura</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-teal-100 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-teal-50 text-teal-700 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Asesores a Cargo</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-800">{myAssignedAdvisors.length}</span>
              <span className="text-[10px] font-medium text-slate-500">en {teamName}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-teal-100 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-indigo-50 text-indigo-700 rounded-xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Operaciones Mi Team</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-slate-800">{teamTotalOps}</span>
              <span className="text-[10px] font-semibold text-amber-600">({teamPending} pend.)</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-teal-100 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tasa Calidad Mi Team</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-emerald-600">{qualityRate}%</span>
              <span className="text-[10px] font-medium text-slate-500">({teamObserved} obs.)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scope & Filtering Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Scope Selector Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setViewScope("mi_team")}
            className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              viewScope === "mi_team"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Operaciones de Mi Team ({myTeamRecords.length})
          </button>
          <button
            onClick={() => setViewScope("todos_los_proyectos")}
            className={`flex-1 md:flex-initial px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              viewScope === "todos_los_proyectos"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Todos los Proyectos ({records.length})
          </button>
        </div>

        {/* Status Tab Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: "All", label: "Todas" },
            { id: "Pending", label: "Pendientes" },
            { id: "Approved", label: "Aprobadas" },
            { id: "Observed", label: "Observadas" }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por asesor, dpto, proyecto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
        </div>
      </div>

      {/* Main Records Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-extrabold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Expediente / ID</th>
                <th className="py-3 px-4">Proyecto</th>
                <th className="py-3 px-4">Inmueble / Dpto</th>
                <th className="py-3 px-4">Asesor & Team</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Estado Legal</th>
                <th className="py-3 px-4">Fecha Solicitud</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                    No se encontraron operaciones registradas para el criterio seleccionado.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const isTeamAgente = isMyTeamRecord(r);
                  const isApproved = (r.status || "").toLowerCase().includes("aprobado") || (r.status || "").toLowerCase().includes("cierre");
                  const isObserved = (r.status || "").toLowerCase().includes("observ") || (r.status || "").toLowerCase().includes("rechaz");

                  return (
                    <tr key={r.id || idx} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {r.id || `OPE-${String(idx + 1).padStart(4, "0")}`}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          {r.proyecto}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div className="font-semibold text-slate-800">Dpto: {r.dpto || "—"}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.estac ? `Estac: ${r.estac}` : ""} {r.dep ? `Dep: ${r.dep}` : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{r.asesor}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase ${
                            isTeamAgente 
                              ? "bg-teal-100 text-teal-800 border border-teal-200" 
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            Team: {r.team}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                          {r.tipo || "Emisión"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : isObserved
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}>
                          {isApproved && <CheckCircle className="w-3 h-3 text-emerald-600" />}
                          {isObserved && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                          {!isApproved && !isObserved && <Clock className="w-3 h-3 text-amber-600" />}
                          {r.status || "Pendiente"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {r.solicitud || r.solicitudAt || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedHistoryRecord(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer"
                          title="Ver trazabilidad e historial de la solicitud"
                        >
                          <History className="w-3.5 h-3.5" />
                          Historial
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Nueva Solicitud (Jefe de Agentes) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-gradient-to-r from-teal-800 to-slate-900 p-5 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-300 bg-teal-900/60 border border-teal-400/20 px-2 py-0.5 rounded-full">
                  Team Agentes
                </span>
                <h3 className="text-base font-black text-white mt-1">
                  Ingresar Nueva Solicitud — Todos los Proyectos
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/70 hover:text-white p-1 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRecord} className="p-6 space-y-4">
              
              {/* Project Selection (Any project) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Proyecto Inmobiliario (Acceso a Todos los Proyectos) *
                </label>
                <select
                  value={selectedProyecto}
                  onChange={(e) => setSelectedProyecto(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  required
                >
                  {allProjects.map(proj => (
                    <option key={proj} value={proj}>{proj}</option>
                  ))}
                </select>
                <p className="text-[10px] text-teal-600 font-medium mt-1">
                  Como Jefe de Agentes, puede ingresar solicitudes para cualquiera de los proyectos activos.
                </p>
              </div>

              {/* Team and Advisor Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Team Asignado
                  </label>
                  <input
                    type="text"
                    value={teamName}
                    readOnly
                    className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl font-extrabold text-teal-800 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Asesor a Cargo *
                  </label>
                  <select
                    value={selectedAsesor}
                    onChange={(e) => setSelectedAsesor(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    required
                  >
                    {myAssignedAdvisors.length > 0 ? (
                      myAssignedAdvisors.map(adv => (
                        <option key={adv} value={adv}>{adv}</option>
                      ))
                    ) : (
                      allAdvisorsList.map(adv => (
                        <option key={adv} value={adv}>{adv}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Units details */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Dpto / Lote *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. 501"
                    value={dpto}
                    onChange={(e) => setDpto(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Estac.
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. E-12"
                    value={estac}
                    onChange={(e) => setEstac(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Depósito
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. D-04"
                    value={dep}
                    onChange={(e) => setDep(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Duplicate check warning */}
              {(() => {
                const dupCheck = selectedProyecto && (dpto.trim() || estac.trim() || dep.trim())
                  ? checkDuplicateUnitOperation(records, {
                      proyecto: selectedProyecto,
                      dpto,
                      estac,
                      dep
                    })
                  : null;

                if (dupCheck?.isDuplicate) {
                  return (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-amber-900">Alerta de Unidad Duplicada:</span>
                        <span>{dupCheck.errorMessage}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Tipo de Operacion */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tipo de Operación
                </label>
                <select
                  value={tipoOperacion}
                  onChange={(e) => setTipoOperacion(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                >
                  <option value="Emisión">Emisión</option>
                  <option value="Modificación">Modificación</option>
                  <option value="Adenda">Adenda</option>
                </select>
              </div>

              {/* Observation or initial note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Comentario Inicial / Detalle (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacionInicial}
                  onChange={(e) => setObservacionInicial(e.target.value)}
                  placeholder="Detalles sobre la separación, cronograma o documentos..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-black text-teal-950 bg-teal-400 hover:bg-teal-300 disabled:opacity-50 rounded-xl shadow-md cursor-pointer transition-all"
                >
                  {isSubmitting ? "Registrando..." : "Registrar Solicitud"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {selectedHistoryRecord && (
        <StatusHistoryModal
          record={selectedHistoryRecord}
          onClose={() => setSelectedHistoryRecord(null)}
        />
      )}

    </div>
  );
}
