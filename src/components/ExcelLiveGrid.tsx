import React, { useState } from "react";
import { OperationRecord } from "../types";
import { Search, Download, FileSpreadsheet, ArrowUpDown } from "lucide-react";

interface ExcelLiveGridProps {
  records: OperationRecord[];
  onExport: () => void;
  sharedLink: string;
}

export default function ExcelLiveGrid({ records, onExport, sharedLink }: ExcelLiveGridProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof OperationRecord>("createdAt");
  const [sortAsc, setSortAsc] = useState(false);

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
      r.team.toLowerCase().includes(term) ||
      r.proyecto.toLowerCase().includes(term) ||
      r.asesor.toLowerCase().includes(term) ||
      r.tipo.toLowerCase().includes(term) ||
      r.status.toLowerCase().includes(term) ||
      r.comentario.toLowerCase().includes(term)
    );
  });

  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let valA = a[sortField] || "";
    let valB = b[sortField] || "";
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  // Excel Columns matching the design layout (A to K)
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
              className="flex items-center gap-1 bg-white hover:bg-blue-50/50 text-blue-700 text-xs px-3 py-1.5 rounded-lg font-semibold border border-blue-100 transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-[14px]">link</span>
              Abrir Enlace Excel
            </a>
          )}
        </div>
      </div>

      {/* Grid view */}
      <div className="overflow-x-auto max-h-[480px]">
        <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
          {/* Spreadsheet Column Letter Row */}
          <thead>
            <tr className="bg-blue-50 border-b border-blue-100">
              <th className="w-12 bg-blue-100 text-center text-[11px] font-bold text-blue-800 border-r border-blue-200 py-1 sticky left-0 z-10">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.letter}
                  className="bg-blue-50/50 text-center text-[11px] font-bold text-blue-600 border-r border-blue-100 py-1"
                >
                  {col.letter}
                </th>
              ))}
            </tr>
            {/* Headers Row */}
            <tr className="bg-white border-b border-blue-100">
              <th className="w-12 bg-blue-50/60 border-r border-blue-100 text-center text-[11px] font-bold text-blue-500 sticky left-0 z-10">
                1
              </th>
              {columns.map((col) => (
                <th
                  key={col.label}
                  onClick={() => handleSort(col.field)}
                  className="p-2 border-r border-blue-100 text-left text-xs font-bold text-blue-900 cursor-pointer hover:bg-blue-50 transition-colors select-none group"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate">{col.label}</span>
                    <ArrowUpDown className="h-3 w-3 text-blue-400 group-hover:text-blue-600 transition-all opacity-40 group-hover:opacity-100" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRecords.length === 0 ? (
              <tr className="border-b border-blue-50">
                <td className="bg-blue-50/20 border-r border-blue-100 text-center text-xs font-bold text-blue-400 sticky left-0 py-4">
                  2
                </td>
                <td colSpan={11} className="p-8 text-center text-slate-400 text-xs italic">
                  No hay registros disponibles. ¡Agregue registros desde el panel correspondiente!
                </td>
              </tr>
            ) : (
              sortedRecords.map((record, index) => {
                const rowNum = index + 2; // Row 1 is the headers
                return (
                  <tr key={record.id} className="hover:bg-blue-50/20 transition-colors border-b border-blue-50">
                    {/* Row Number */}
                    <td className="bg-blue-50/40 border-r border-blue-100 text-center text-xs font-bold text-blue-500 sticky left-0 z-10 py-2">
                      {rowNum}
                    </td>

                    {/* TEAM */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-800 font-medium truncate">
                      {record.team || "-"}
                    </td>

                    {/* PROYECTO */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-800 font-bold truncate">
                      {record.proyecto || "-"}
                    </td>

                    {/* DPTO */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-600 font-mono text-center">
                      {record.dpto || "-"}
                    </td>

                    {/* ESTAC */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-600 font-mono text-center">
                      {record.estac || "-"}
                    </td>

                    {/* DEP */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-600 font-mono text-center">
                      {record.dep || "-"}
                    </td>

                    {/* ASESOR */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-700 truncate">
                      {record.asesor || "-"}
                    </td>

                    {/* TIPO */}
                    <td className="p-2 border-r border-blue-50 text-xs text-center font-bold">
                      {record.tipo ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          record.tipo === "EMISION" 
                            ? "bg-blue-100 text-blue-800"
                            : record.tipo === "MODIFICACION"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-orange-100 text-orange-800"
                        }`}>
                          {record.tipo}
                        </span>
                      ) : "-"}
                    </td>

                    {/* SOLICITUD */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-600 font-mono text-center">
                      {record.solicitud || "-"}
                    </td>

                    {/* EMISION */}
                    <td className="p-2 border-r border-blue-50 text-xs text-slate-600 font-mono text-center">
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
    </div>
  );
}
