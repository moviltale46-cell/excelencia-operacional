import React, { useState, useEffect } from "react";
import { OperationRecord, AppSettings, UserAccount } from "../types";
import { Plus, X, Search, Home, History } from "lucide-react";
import StatusHistoryModal from "./StatusHistoryModal";
import SearchableSelect from "./SearchableSelect";

interface JefeVentasPanelProps {
  records: OperationRecord[];
  settings: AppSettings;
  currentUser: UserAccount;
  onAddRecord: (recordData: Partial<OperationRecord>) => void;
  onUpdateRecord: (id: string, updatedFields: Partial<OperationRecord>) => void;
}

export default function JefeVentasPanel({ 
  records, 
  settings, 
  currentUser, 
  onAddRecord,
  onUpdateRecord
}: JefeVentasPanelProps) {
  const [filterTab, setFilterTab] = useState<"All" | "Pending" | "Approved">("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<OperationRecord | null>(null);
  const [viewScope, setViewScope] = useState<"mis_proyectos" | "todos_los_ingresos">("mis_proyectos");

  // Form Fields
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedProyecto, setSelectedProyecto] = useState("");
  const [dpto, setDpto] = useState("");
  const [estac, setEstac] = useState("");
  const [dep, setDep] = useState("");
  const [selectedAsesor, setSelectedAsesor] = useState("ANABEL ALBINO");

  // Get only projects assigned to this logged-in Jefe de Ventas
  const assignedProjects = settings.proyectos
    ? settings.proyectos.filter(p => p.jefeVentas === currentUser.username)
    : [];

  const projectOptions = assignedProjects.map(p => p.name);

  const advisorOptions = settings.asesores && settings.asesores.length > 0
    ? settings.asesores
    : [
        "ANABEL ALBINO", "SILVANA GODENZZI", "ROSMERY CENTURION", "DERVIS PIÑA", 
        "CARLOS TORRES", "MARIA FERNANDA CHACON", "IVAN SOTO", "CHRISTIAN BARRIENTOS", 
        "PAULA CASAS", "VICTOR SALAS", "MARITZA BRAVO", "EDUARDO BECERRA", 
        "LUIS MANUEL DE LOS RIOS", "ROY OTERO", "FARIHD JASAUI", "ALEJANDRA PEREZ CAMPOS"
      ];

  // Auto-set first project option as default on open or settings load
  useEffect(() => {
    if (projectOptions.length > 0 && !selectedProyecto) {
      setSelectedProyecto(projectOptions[0]);
    }
  }, [projectOptions, selectedProyecto]);

  // AUTO-SELECT TEAM WHEN PROJECT IS SELECTED
  useEffect(() => {
    if (selectedProyecto && settings.proyectos) {
      const matched = settings.proyectos.find(p => p.name.toLowerCase() === selectedProyecto.toLowerCase());
      if (matched) {
        setSelectedTeam(matched.team);
      }
    }
  }, [selectedProyecto, settings.proyectos]);

  const handleOpenModal = () => {
    if (projectOptions.length === 0) {
      alert("No tiene proyectos asignados por el Administrador. Solicite que le asignen proyectos para registrar operaciones.");
      return;
    }
    // Pick defaults
    const defaultProj = projectOptions[0];
    setSelectedProyecto(defaultProj);
    if (settings.proyectos) {
      const matched = settings.proyectos.find(p => p.name.toLowerCase() === defaultProj.toLowerCase());
      if (matched) {
        setSelectedTeam(matched.team);
      }
    }
    setIsModalOpen(true);
  };
  
  const handleCloseModal = () => setIsModalOpen(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProyecto || !selectedAsesor) {
      alert("Por favor rellene los campos obligatorios.");
      return;
    }

    // Double check team selection is updated
    let finalTeam = selectedTeam;
    if (settings.proyectos) {
      const matched = settings.proyectos.find(p => p.name.toLowerCase() === selectedProyecto.toLowerCase());
      if (matched) {
        finalTeam = matched.team;
      }
    }

    onAddRecord({
      team: finalTeam || "FRANCISCO",
      proyecto: selectedProyecto,
      dpto: dpto,
      estac: estac,
      dep: dep,
      asesor: selectedAsesor,
      tipo: "", // Initial empty until Jefe Legal registers the operation
      solicitud: "", // Empty initially
      emision: "", // Empty initially
      status: settings.statuses && settings.statuses.length > 0 ? settings.statuses[0] : "Pendiente de Firma", // default status
      comentario: "Creado por Jefe de Ventas.",
      updatedByUser: currentUser.username
    });

    // Reset Form
    setDpto("");
    setEstac("");
    setDep("");
    setIsModalOpen(false);
  };

  // Filter records based on view scope
  const filteredRecords = records.filter(r => {
    if (viewScope === "mis_proyectos") {
      const isAssigned = projectOptions.includes(r.proyecto);
      if (!isAssigned) return false;
    }

    const matchesSearch = 
      r.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.team.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.asesor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.status && r.status.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterTab === "Pending") {
      return r.status !== "Aprobado para Emisión";
    }
    if (filterTab === "Approved") {
      return r.status === "Aprobado para Emisión";
    }
    return true; // All
  });

  return (
    <div className="space-y-6" id="jefe-ventas-container">
      {/* Quick Stats Bento Cards */}
      <section className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-vibrant flex flex-col gap-1">
          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">PROYECTOS ACTIVOS ASIGNADOS</span>
          <span className="text-brand-primary font-black text-3xl">
            {projectOptions.length}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-vibrant flex flex-col gap-1">
          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">REGISTROS VISIBLES</span>
          <span className="text-brand-primary font-black text-3xl">{filteredRecords.length}</span>
        </div>
      </section>

      {/* Scope Selector */}
      <div className="flex items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-blue-100 shadow-vibrant">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-1">Ámbito de Visualización:</span>
        <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setViewScope("mis_proyectos")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewScope === "mis_proyectos" ? "bg-white text-brand-primary shadow-xs" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Mis Proyectos Asignados
          </button>
          <button
            onClick={() => setViewScope("todos_los_ingresos")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewScope === "todos_los_ingresos" ? "bg-white text-brand-primary shadow-xs" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Todos los Ingresos (Jefe Legal)
          </button>
        </div>
      </div>

      {/* Warning banner if no projects assigned */}
      {projectOptions.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-semibold flex flex-col gap-1">
          <span>⚠️ Sin proyectos asignados</span>
          <p className="text-[11px] font-normal text-slate-500">
            El Administrador aún no te ha asignado ningún proyecto. Solicita la asignación en el panel de proyectos para poder registrar operaciones y ver estados.
          </p>
        </div>
      )}

      {/* Header and Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg text-slate-800 uppercase tracking-wide">Mis Proyectos Inmobiliarios</h2>
          <p className="text-xs text-slate-500">Gestión de expedientes de ventas ingresados al sistema para tus proyectos asignados</p>
        </div>
        <button
          onClick={handleOpenModal}
          disabled={projectOptions.length === 0}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer ${
            projectOptions.length === 0
              ? "bg-slate-200 text-slate-400 border-slate-300 shadow-none cursor-not-allowed"
              : "bg-brand-primary hover:bg-brand-secondary text-white shadow-blue-100"
          }`}
        >
          <Plus className="h-4 w-4" />
          Ingresar Registro
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="bg-blue-50/50 p-1 rounded-xl border border-blue-100 flex items-center gap-1.5 max-w-sm shadow-xs">
        <button
          onClick={() => setFilterTab("All")}
          className={`flex-1 whitespace-nowrap text-center py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterTab === "All"
              ? "bg-white text-brand-primary shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Todos ({records.filter(r => projectOptions.includes(r.proyecto)).length})
        </button>
        <button
          onClick={() => setFilterTab("Pending")}
          className={`flex-1 whitespace-nowrap text-center py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterTab === "Pending"
              ? "bg-white text-brand-primary shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Pendientes ({records.filter(r => projectOptions.includes(r.proyecto) && r.status !== "Aprobado para Emisión").length})
        </button>
        <button
          onClick={() => setFilterTab("Approved")}
          className={`flex-1 whitespace-nowrap text-center py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            filterTab === "Approved"
              ? "bg-white text-brand-primary shadow-xs"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Aprobados ({records.filter(r => projectOptions.includes(r.proyecto) && r.status === "Aprobado para Emisión").length})
        </button>
      </div>

      {/* Live Search */}
      <div className="relative max-w-md">
        <input
          type="text"
          placeholder="Buscar por lote, asesor o estado..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-blue-100 rounded-xl text-xs focus:ring-1 focus:ring-brand-primary focus:border-brand-primary outline-none shadow-xs transition-all"
        />
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
      </div>

      {/* Records list */}
      <div className="bg-white border border-blue-100 rounded-2xl overflow-hidden shadow-vibrant divide-y divide-blue-50">
        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            No se encontraron expedientes con los filtros seleccionados.
          </div>
        ) : (
          filteredRecords.map((r) => {
            const isApproved = r.status === "Aprobado para Emisión";
            const isObserved = r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observado") || r.status?.toLowerCase().includes("rechazado");
            const refNum = `Ref: #REC-${r.id.substr(4, 3).toUpperCase()}`;

            // Resolve custom status background from settings
            const customBadgeClass = settings.statusColors?.[r.status] || (
              isApproved 
                ? "bg-emerald-100 text-emerald-800 border-emerald-200" 
                : isObserved 
                ? "bg-rose-100 text-rose-800 border-rose-200"
                : "bg-amber-100 text-amber-800 border-amber-200"
            );

            return (
              <div key={r.id} className="p-4 hover:bg-blue-50/10 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-brand-primary font-bold text-sm">
                      {r.proyecto}
                    </span>
                    <span className="text-slate-500 text-xs mt-0.5">
                      Equipo: <strong className="text-slate-700">{r.team}</strong> • Lote: DPTO {r.dpto || "-"} Est: {r.estac || "-"} Dep: {r.dep || "-"}
                    </span>
                  </div>
                  
                  {/* Status Badges */}
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${customBadgeClass}`}>
                      {r.status || "Pendiente"}
                    </span>
                    <button
                      onClick={() => setSelectedHistoryRecord(r)}
                      title="Ver Historial de Cambios"
                      className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 p-1 rounded-lg transition-all"
                    >
                      <History className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-brand-primary font-bold text-[10px] uppercase border border-blue-100">
                      {r.asesor.substr(0, 2)}
                    </div>
                    <span className="text-slate-600 font-medium">{r.asesor}</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {r.tipo && (
                      <span className="bg-blue-50 text-brand-primary border border-blue-100 font-bold px-2 py-0.5 rounded text-[10px]">
                        {r.tipo}
                      </span>
                    )}
                    <span className="text-slate-400 font-mono text-[11px]">
                      {refNum}
                    </span>
                  </div>
                </div>

                {/* Reassignment Row */}
                <div className="mt-3 pt-2.5 border-t border-blue-50/60 flex flex-wrap justify-between items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-bold text-[10px] uppercase">Responsable Legal:</span>
                    {r.derivadoA ? (
                      <span className="bg-blue-50 text-brand-primary border border-blue-100 px-2 py-0.5 rounded font-bold">
                        {r.derivadoA}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">Asignación automática</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Reasignar:</span>
                    <SearchableSelect
                      value={r.derivadoA || ""}
                      onChange={(val) => onUpdateRecord(r.id, { 
                        derivadoA: val || undefined, 
                        updatedByUser: currentUser.username 
                      })}
                      options={[
                        { value: "", label: "-- Auto-asignar --" },
                        ...(settings.users
                          ?.filter(u => u.role === "Asistente Legal" && u.active)
                          .map(u => ({ value: u.username, label: u.username })) || [])
                      ]}
                      placeholder="Seleccionar..."
                      className="w-36"
                    />
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* New Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-blue-100">
            
            {/* Modal Header */}
            <div className="bg-brand-primary p-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                <Home className="h-4 w-4" />
                Ingresar Nuevo Expediente
              </h3>
              <button 
                onClick={handleCloseModal}
                className="hover:bg-white/10 p-1 rounded-full transition-colors outline-none cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
              
              {/* PROYECTO Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                  PROYECTO INMOBILIARIO *
                </label>
                <SearchableSelect
                  value={selectedProyecto}
                  onChange={(val) => setSelectedProyecto(val)}
                  options={projectOptions.map(opt => ({ value: opt, label: opt }))}
                  placeholder="Seleccionar proyecto..."
                  className="w-full"
                />
              </div>

              {/* TEAM Selector - Readonly or automatic */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                  EQUIPO ASOCIADO (AUTOMÁTICO)
                </label>
                <input
                  type="text"
                  disabled
                  value={selectedTeam}
                  className="w-full h-10 bg-slate-100 border border-blue-50 rounded-xl px-3 outline-none text-xs text-slate-600 font-bold"
                />
              </div>

              {/* Units inputs DPTO, ESTAC, DEP */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                    DPTO. *
                  </label>
                  <input
                    type="text"
                    value={dpto}
                    onChange={(e) => setDpto(e.target.value)}
                    placeholder="Ej: 305"
                    required
                    className="w-full h-10 bg-slate-50 border border-blue-100 rounded-xl px-3 focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none text-xs text-center font-mono text-slate-700"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                    ESTAC.
                  </label>
                  <input
                    type="text"
                    value={estac}
                    onChange={(e) => setEstac(e.target.value)}
                    placeholder="Ej: E-12"
                    className="w-full h-10 bg-slate-50 border border-blue-100 rounded-xl px-3 focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none text-xs text-center font-mono text-slate-700"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                    DEP.
                  </label>
                  <input
                    type="text"
                    value={dep}
                    onChange={(e) => setDep(e.target.value)}
                    placeholder="Ej: D-05"
                    className="w-full h-10 bg-slate-50 border border-blue-100 rounded-xl px-3 focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none text-xs text-center font-mono text-slate-700"
                  />
                </div>
              </div>

              {/* ASESOR Selector */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                  ASESOR ASIGNADO
                </label>
                <SearchableSelect
                  value={selectedAsesor}
                  onChange={(val) => setSelectedAsesor(val)}
                  options={advisorOptions.map(opt => ({ value: opt, label: opt }))}
                  placeholder="Seleccionar asesor..."
                  className="w-full"
                  allowCustom={true}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 h-10 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 bg-brand-primary hover:bg-brand-secondary text-white rounded-xl text-xs font-bold transition-all hover:shadow cursor-pointer"
                >
                  Guardar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit History Timeline Modal */}
      {selectedHistoryRecord && (
        <StatusHistoryModal
          record={selectedHistoryRecord}
          statusColors={settings.statusColors}
          onClose={() => setSelectedHistoryRecord(null)}
        />
      )}
    </div>
  );
}
