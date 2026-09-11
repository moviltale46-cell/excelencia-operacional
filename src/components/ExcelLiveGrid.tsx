import React, { useState } from "react";
import { OperationRecord } from "../types";
import { Search, Download, FileSpreadsheet, ArrowUpDown, History } from "lucide-react";
import StatusHistoryModal from "./StatusHistoryModal";

interface ExcelLiveGridProps {
  records: OperationRecord[];
  onExport: () => void;
  sharedLink: string;
  isAdmin?: boolean;
  onUpdateRecord?: (id: string, updatedFields: Partial<OperationRecord>) => void;
}

export default function ExcelLiveGrid({ 
  records, 
  onExport, 
  sharedLink,
  isAdmin = false,
  onUpdateRecord
}: ExcelLiveGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof OperationRecord>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [historyModalRecord, setHistoryModalRecord] = useState<OperationRecord | null>(null);

  const handleSort = (field: keyof OperationRecord) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const filteredRecords = records.filter(r => {
    const term = searchTerm.toLowerCase();
    return (
      (r.team || "").toLowerCase().includes(term) ||
      (r.proyecto || "").toLowerCase().includes(term) ||
      (r.asesor || "").toLowerCase().includes(term) ||
      (r.tipo || "").toLowerCase().includes(term) ||
      (r.status || "").toLowerCase().includes(term) ||
      (r.comentario || "").toLowerCase().includes(term) ||
      (r.dpto || "").toLowerCase().includes(term) ||
      (r.estac || "").toLowerCase().includes(term) ||
      (r.dep || "").toLowerCase().includes(term)
    );
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let valA = a[sortField] || "";
    let valB = b[sortField] || "";
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const columns = [
    { letter: "A", label: "TEAM", field: "team" as keyof OperationRecord },
    { letter: "B", label: "PROYECTO", field: "proyecto" as keyof OperationRecord },
    { letter: "C", label: "DPTO.", field: "dpto" as keyof OperationRecord },
    { letter: "D", label: "ESTAC.", field: "estac" as keyof OperationRecord },
    { letter: "E", label: "DEP.", field: "dep" as keyof OperationRecord },
    { letter: "F", label: "ASESOR", field: "asesor" as keyof OperationRecord },
    { letter: "G", label: "TIPO", field: "tipo" as keyof OperationRecord },
    { letter: "H", label: "SOLICITUD (Fecha Y Hora)", field: "solicitud" as keyof OperationRecord },
    { letter: "I", label: "EMISION (Fecha y Hora)", field: "emision" as keyof OperationRecord },
    { letter: "J", label: "STATUS", field: "status" as keyof OperationRecord },
    { letter: "K", label: "COMENTARIO", field: "comentario" as keyof OperationRecord },
    { letter: "L", label: "HISTORIAL", field: "id" as keyof OperationRecord },
  ];

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-vibrant overflow-hidden" id="excel-grid-container">
      {/* Spreadsheet Header Utility */}
      <div className="p-4 border-b border-blue-100 bg-blue-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <h3 className="font-bold text-blue-900 text-sm md:text-base flex items-center gap-2">
            Vista del Excel Compartido
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 animate-pulse">
              ● Sincronizado En Tiempo Real
            </span>
          </h3>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar en el Excel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-blue-100 rounded-xl focus:ring-1 focus:ring-brand-primary focus:border-brand-primary outline-none w-48 transition-all shadow-xs"
            />
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Export button */}
          <button
            onClick={onExport}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md shadow-emerald-100 transition-all active:scale-95 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar .XLSX
          </button>

          {/* Direct Link button */}
          {sharedLink && (
            <a
              href={sharedLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 text-xs px-3 py-1.5 rounded-lg font-semibold shadow-xs transition-all cursor-pointer"
            >
              Abrir Google Sheet ↗
            </a>
          )}
        </div>
      </div>

      {/* Spreadsheet Formula / Info Bar */}
      <div className="px-4 py-2 bg-slate-50 border-b border-blue-100 flex items-center gap-3 text-xs font-mono text-slate-500">
        <span className="font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-100">
          fx
        </span>
        <span className="truncate">
          =FILTRAR(BD_OPERACIONES, PROYECTO &lt;&gt; "") • {records.length} REGISTROS TOTALES
        </span>
      </div>

      {/* Main Grid View */}
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-left border-collapse select-text">
          {/* Alphabetical Column Indicators */}
          <thead>
            <tr className="bg-slate-100 border-b border-blue-100 text-[10px] font-mono text-slate-400">
              <th className="w-10 p-1 text-center bg-slate-200 border-r border-blue-100">#</th>
              {columns.map((c) => (
                <th key={c.letter} className="p-1 text-center border-r border-blue-100 font-bold">
                  {c.letter}
                </th>
              ))}
            </tr>
            {/* Real Headers */}
            <tr className="bg-blue-50/80 border-b border-blue-100 text-xs font-bold text-blue-950 uppercase tracking-wider">
              <th className="w-10 p-2 text-center bg-slate-150 border-r border-blue-100 text-slate-500"></th>
              {columns.map((col) => (
                <th
                  key={col.label}
                  onClick={() => col.field !== "id" && handleSort(col.field)}
                  className={`p-2.5 border-r border-blue-100 whitespace-nowrap select-none transition-colors ${
                    col.field !== "id" ? "cursor-pointer hover:bg-blue-100/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>{col.label}</span>
                    {col.field !== "id" && <ArrowUpDown className="h-3 w-3 text-slate-400" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-blue-50">
            {sortedRecords.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-8 text-center text-slate-400 text-xs italic">
                  No se encontraron registros que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              sortedRecords.map((record, index) => {
                const isEven = index % 2 === 0;
                return (
                  <tr
                    key={record.id || index}
                    className={`hover:bg-blue-50/60 transition-colors font-sans ${
                      isEven ? "bg-white" : "bg-slate-50/30"
                    }`}
                  >
                    {/* Row Index */}
                    <td className="p-2 text-center font-mono text-xs text-slate-400 bg-slate-100/50 border-r border-blue-100 font-bold">
                      {index + 1}
                    </td>

                    {/* TEAM */}
                    <td className="p-2 border-r border-blue-50 text-xs font-bold text-slate-700">
                      {record.team || "-"}
                    </td>

                    {/* PROYECTO */}
                    <td className="p-2 border-r border-blue-50 text-xs font-extrabold text-blue-950">
                      {record.proyecto || "-"}
                    </td>

                    {/* DPTO */}
                    <td className="p-2 border-r border-blue-50 text-xs font-mono text-slate-600">
                      {record.dpto || "-"}
                    </td>

                    {/* ESTAC */}
                    <td className="p-2 border-r border-blue-50 text-xs font-mono text-slate-600">
                      {record.estac || "-"}
                    </td>

                    {/* DEP */}
                    <td className="p-2 border-r border-blue-50 text-xs font-mono text-slate-600">
                      {record.dep || "-"}
                    </td>

                    {/* ASESOR */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-700">
                      {record.asesor || "-"}
                    </td>

                    {/* TIPO */}
                    <td className="p-2 border-r border-blue-50 text-xs font-bold text-slate-800">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        record.tipo === "EMISION" 
                          ? "bg-blue-100 text-blue-800"
                          : record.tipo === "MODIFICACION"
                          ? "bg-purple-100 text-purple-800"
                          : "bg-orange-100 text-orange-800"
                      }`}>
                        {record.tipo || "EMISION"}
                      </span>
                    </td>

                    {/* SOLICITUD */}
                    <td className="p-2 border-r border-blue-50 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {record.solicitud || "-"}
                    </td>

                    {/* EMISION */}
                    <td className="p-2 border-r border-blue-50 text-xs font-mono text-slate-600 whitespace-nowrap">
                      {record.emision || "-"}
                    </td>

                    {/* STATUS */}
                    <td className="p-2 border-r border-blue-50 text-xs text-center">
                      {record.status ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          record.status === "Aprobado para Emisión" 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : record.status === "Pendiente de Firma"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : record.status === "En Revisión Técnica"
                            ? "bg-blue-100 text-blue-800 border border-blue-200"
                            : "bg-rose-100 text-rose-800 border border-rose-200"
                        }`}>
                          {record.status}
                        </span>
                      ) : "-"}
                    </td>

                    {/* COMENTARIO */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-600 truncate max-w-xs" title={record.comentario}>
                      {record.comentario || "-"}
                    </td>

                    {/* HISTORIAL ACTION */}
                    <td className="p-2 border-r border-blue-50 text-xs text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setHistoryModalRecord(record)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded-lg text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-xs border border-blue-200 hover:border-transparent"
                        title={isAdmin ? "Ver y editar historial operativo (sin dejar registro)" : "Ver cronología de estados y observaciones"}
                      >
                        <History className="h-3 w-3" />
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

      {/* Excel Stats footer */}
      <div className="p-4 bg-blue-50/20 border-t border-blue-100 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-2">
        <div>
          Mostrando <span className="font-semibold text-slate-700">{filteredRecords.length}</span> de <span className="font-semibold text-slate-700">{records.length}</span> filas del Excel.
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block"></span>
            Emisiones: {records.filter(r => r.tipo === "EMISION").length}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-500 inline-block"></span>
            Modificaciones: {records.filter(r => r.tipo === "MODIFICACION").length}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-orange-500 inline-block"></span>
            Adendas: {records.filter(r => r.tipo === "ADENDA").length}
          </span>
        </div>
      </div>

      {/* Status History Modal */}
      {historyModalRecord && (
        <StatusHistoryModal
          record={records.find(r => r.id === historyModalRecord.id) || historyModalRecord}
          isAdmin={isAdmin}
          onUpdateRecord={onUpdateRecord}
          onClose={() => setHistoryModalRecord(null)}
        />
      )}
    </div>
  );
}
