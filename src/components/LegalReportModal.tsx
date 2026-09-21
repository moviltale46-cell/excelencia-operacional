import React, { useState, useMemo } from "react";
import { FileText, Download, Calendar, Filter, X, CheckCircle2, AlertTriangle, Briefcase, FileSpreadsheet, Sparkles } from "lucide-react";
import { OperationRecord, ProjectConfig } from "../types";
import { generateLegalReportPdf } from "../utils/generateLegalReportPdf";

interface LegalReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: OperationRecord[];
  projects: ProjectConfig[];
  currentUserName?: string;
}

export const LegalReportModal: React.FC<LegalReportModalProps> = ({
  isOpen,
  onClose,
  records,
  projects,
  currentUserName = "Marilyn Saona",
}) => {
  // Date range defaults: 2026-09-01 to 2026-09-11 (matching Informe_01-09_al_11-09.pdf prompt reference) or current month
  const [startDate, setStartDate] = useState("2026-09-01");
  const [endDate, setEndDate] = useState("2026-09-11");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Quick range presets
  const handlePresetRange = (preset: "01-11" | "thisMonth" | "last7" | "all") => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, "0");

    if (preset === "01-11") {
      setStartDate("2026-09-01");
      setEndDate("2026-09-11");
    } else if (preset === "thisMonth") {
      setStartDate(`${curYear}-${curMonth}-01`);
      const lastDay = new Date(curYear, now.getMonth() + 1, 0).getDate();
      setEndDate(`${curYear}-${curMonth}-${String(lastDay).padStart(2, "0")}`);
    } else if (preset === "last7") {
      const d7 = new Date();
      d7.setDate(now.getDate() - 7);
      setStartDate(d7.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (preset === "all") {
      setStartDate("");
      setEndDate("");
    }
  };

  // Filter preview data
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const dateStr = r.fecha || r.createdAt || r.emision || "";
      let recordDate = "";
      if (dateStr.includes("/")) {
        const parts = dateStr.split(" ")[0].split("/");
        if (parts.length === 3) {
          recordDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      } else if (dateStr.includes("-")) {
        recordDate = dateStr.split(" ")[0];
      }

      if (startDate && recordDate && recordDate < startDate) return false;
      if (endDate && recordDate && recordDate > endDate) return false;
      if (selectedProject && r.proyecto?.toLowerCase() !== selectedProject.toLowerCase()) return false;
      return true;
    });
  }, [records, startDate, endDate, selectedProject]);

  // Calculated preview metrics
  const metrics = useMemo(() => {
    const total = filteredRecords.length;
    const emision = filteredRecords.filter(r => (r.tipo || "").toUpperCase().includes("EMISI")).length;
    const modificacion = filteredRecords.filter(r => (r.tipo || "").toUpperCase().includes("MODIFIC")).length;
    const adenda = filteredRecords.filter(r => (r.tipo || "").toUpperCase().includes("ADENDA")).length;
    const otros = total - (emision + modificacion + adenda);

    const observados = filteredRecords.filter(r => {
      const s = (r.status || "").toUpperCase();
      return s.includes("OBSERVAD") || (r.observaciones && r.observaciones.length > 0);
    }).length;

    const cierres = filteredRecords.filter(r => {
      const s = (r.status || "").toUpperCase();
      return s.includes("CIERRE") || s.includes("COMPLETO");
    }).length;

    return { total, emision, modificacion, adenda, otros, observados, cierres };
  }, [filteredRecords]);

  // Handler: Generate and download PDF
  const handleDownloadPdf = () => {
    try {
      setIsGenerating(true);
      const doc = generateLegalReportPdf(records, {
        startDate,
        endDate,
        projectName: selectedProject || undefined,
        generatedBy: `${currentUserName} (Jefe Legal)`
      });

      const filenameDate = startDate && endDate 
        ? `${startDate.replace(/-/g, "")}_al_${endDate.replace(/-/g, "")}` 
        : "reporte";
      doc.save(`Informe_Legal_${filenameDate}.pdf`);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Hubo un problema al generar el informe PDF. Por favor verifique los datos.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" id="legal-report-modal">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-blue-100 flex flex-col overflow-hidden animate-scaleUp">
        
        {/* Header with PDF Logo */}
        <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-600 text-white rounded-2xl shadow-md flex items-center justify-center">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-rose-500/30 text-rose-300 px-2 py-0.5 rounded-md border border-rose-400/30">
                  PDF EXPORT
                </span>
                <span className="text-[10px] font-medium text-slate-300">
                  Jefatura Legal
                </span>
              </div>
              <h3 className="text-base font-black tracking-tight text-white mt-0.5">
                Generar Informe de Control Operativo
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh] text-xs text-slate-700">
          
          {/* Quick presets */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
              Rango Rápido Preestablecido
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePresetRange("01-11")}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold rounded-xl border border-rose-200 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="h-3.5 w-3.5 text-rose-600" />
                <span>Informe 01/09 al 11/09 (Plantilla Oficial)</span>
              </button>
              <button
                type="button"
                onClick={() => handlePresetRange("thisMonth")}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
              >
                Mes Actual
              </button>
              <button
                type="button"
                onClick={() => handlePresetRange("last7")}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                onClick={() => handlePresetRange("all")}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all cursor-pointer"
              >
                Todo el Historial
              </button>
            </div>
          </div>

          {/* Date Range Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                Fecha Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-slate-400" />
                Fecha Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-9 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                <Briefcase className="h-3 w-3 text-slate-400" />
                Proyecto (Opcional)
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full h-9 px-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer"
              >
                <option value="">-- Todos los Proyectos --</option>
                {projects.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Indicator Preview Strip */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
              Indicadores que se incluirán en el informe ({filteredRecords.length} Operaciones)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                <span className="text-[9px] font-bold text-blue-700 uppercase block">Total Operaciones</span>
                <span className="text-xl font-black text-blue-900">{metrics.total}</span>
              </div>
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                <span className="text-[9px] font-bold text-emerald-700 uppercase block">Emisiones</span>
                <span className="text-xl font-black text-emerald-900">{metrics.emision}</span>
              </div>
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
                <span className="text-[9px] font-bold text-rose-700 uppercase block">Observados</span>
                <span className="text-xl font-black text-rose-900">{metrics.observados}</span>
              </div>
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
                <span className="text-[9px] font-bold text-amber-700 uppercase block">Cierres Completos</span>
                <span className="text-xl font-black text-amber-900">{metrics.cierres}</span>
              </div>
            </div>
          </div>

          {/* Report Sections Information */}
          <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-2 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
              <span>Estructura del Informe Generado (formato oficial):</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500 pl-1">
              <li>Resumen Ejecutivo con indicadores clave y tarjetas de control.</li>
              <li>Desglose por tipo de operación (Emisiones, Modificaciones, Adendas y tipos personalizados).</li>
              <li>Rendimiento y distribución de carga por Asistente Legal.</li>
              <li>Listado cronológico de expedientes evaluados con detalle de unidad, asesor y estatus legal.</li>
              <li>Firma institucional de validación de Jefatura Legal.</li>
            </ul>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-xl border border-slate-200 transition-all cursor-pointer text-xs"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGenerating}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 text-xs"
          >
            <Download className="h-4 w-4" />
            <span>{isGenerating ? "Generando PDF..." : "Descargar Informe PDF"}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
