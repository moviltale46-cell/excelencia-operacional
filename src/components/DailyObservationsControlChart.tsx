import React, { useState, useMemo } from "react";
import { OperationRecord, AppSettings, STANDARD_OBSERVATIONS } from "../types";
import { 
  BarChart3, Calendar, Layers, Users, User, ShieldAlert, Clock, 
  TrendingUp, ArrowUpDown, CheckSquare, Square, Download, ChevronLeft, 
  ChevronRight, Info, Eye, Filter, RefreshCw, FileText, CheckCircle2, AlertTriangle, Edit3
} from "lucide-react";
import { safeParseDate, safeGetTime, formatDateTimeFull, formatDateOnly } from "../utils/dateUtils";
import { calculateBusinessTime } from "../utils/workingHours";

interface OperationalAnalyticsChartProps {
  records: OperationRecord[];
  settings?: AppSettings;
  isAdminView?: boolean;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// Normalize operation type
function normalizeTipo(tipo?: string): "EMISION" | "MODIFICACION" | "ADENDA" | "OTROS" {
  if (!tipo) return "EMISION";
  const t = tipo.toUpperCase();
  if (t.includes("EMISION") || t.includes("EMISIÓN")) return "EMISION";
  if (t.includes("MODIFICACION") || t.includes("MODIFICACIÓN")) return "MODIFICACION";
  if (t.includes("ADENDA")) return "ADENDA";
  return "OTROS";
}

export default function DailyObservationsControlChart({
  records,
  settings,
  isAdminView = false
}: OperationalAnalyticsChartProps) {
  // 1. Month and Year Selection (defaults to current date or most recent record date)
  const defaultDate = useMemo(() => {
    // Check if there are records, find most recent valid date
    for (const r of records) {
      const d = safeParseDate(r.solicitudAt || r.solicitud || r.createdAt);
      if (d) return d;
    }
    return new Date();
  }, [records]);

  const [selectedYear, setSelectedYear] = useState<number>(defaultDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultDate.getMonth()); // 0-indexed (0 = Jan, 8 = Sep)
  
  // 2. View Mode: "days" (Día 1, Día 2...) vs "weeks" (Semana 1, Semana 2...)
  const [viewGranularity, setViewGranularity] = useState<"days" | "weeks">("days");

  // 3. Date Basis: "solicitud" (Date requested) vs "emision" (Date emitted/reviewed)
  const [dateBasis, setDateBasis] = useState<"solicitud" | "emision">("solicitud");

  // 4. Active Analysis Dimension
  const [analysisDimension, setAnalysisDimension] = useState<"tipos" | "asistentes" | "asesores" | "recursos_errores">("tipos");

  // 5. Line toggles for "tipos" dimension
  const [showLineEmision, setShowLineEmision] = useState(true);
  const [showLineModificacion, setShowLineModificacion] = useState(true);
  const [showLineAdenda, setShowLineAdenda] = useState(true);
  const [showLineTotal, setShowLineTotal] = useState(false);

  // 6. Selected Assistant for "asistentes" dimension
  const [selectedAssistantFilter, setSelectedAssistantFilter] = useState<string>("ALL");

  // 7. Selected Advisor for "asesores" dimension
  const [selectedAdvisorFilter, setSelectedAdvisorFilter] = useState<string>("ALL");

  // 8. Admin-specific toggles
  const [showMonthComparison, setShowMonthComparison] = useState(false);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("ALL");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("ALL");

  // 9. Day detail drilldown modal or bottom panel
  const [selectedPeriodDetail, setSelectedPeriodDetail] = useState<{
    label: string;
    dateFormatted: string;
    records: OperationRecord[];
  } | null>(null);

  // Hover state for SVG tooltip
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Available unique projects, teams, assistants, advisors
  const uniqueProjects = useMemo(() => {
    return Array.from(new Set(records.map(r => r.proyecto?.trim()).filter(Boolean) as string[])).sort();
  }, [records]);

  const uniqueTeams = useMemo(() => {
    return Array.from(new Set(records.map(r => r.team?.trim()).filter(Boolean) as string[])).sort();
  }, [records]);

  const uniqueAssistants = useMemo(() => {
    const fromUsers = (settings?.users || [])
      .filter(u => u.role === "Asistente Legal" && u.active)
      .map(u => u.username);
    const fromRecs = records.map(r => r.derivadoA?.trim()).filter(Boolean) as string[];
    return Array.from(new Set([...fromUsers, ...fromRecs])).sort();
  }, [records, settings]);

  const uniqueAdvisors = useMemo(() => {
    return Array.from(new Set(records.map(r => r.asesor?.trim()).filter(Boolean) as string[])).sort();
  }, [records]);

  // Days count in selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Helper to change month
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
  };

  const handleResetToCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
  };

  // Filter records matching current month, year, and global dropdowns
  const currentMonthRecords = useMemo(() => {
    return records.filter(r => {
      // Global project filter (Admin)
      if (selectedProjectFilter !== "ALL" && r.proyecto !== selectedProjectFilter) return false;
      // Global team filter (Admin)
      if (selectedTeamFilter !== "ALL" && r.team !== selectedTeamFilter) return false;

      const dateStr = dateBasis === "emision" ? (r.emittedAt || r.emision) : (r.solicitudAt || r.solicitud || r.createdAt);
      if (!dateStr) return false;

      const d = safeParseDate(dateStr);
      if (!d) return false;

      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [records, selectedYear, selectedMonth, dateBasis, selectedProjectFilter, selectedTeamFilter]);

  // Records for previous month (for comparison in Admin view)
  const prevMonthRecords = useMemo(() => {
    if (!isAdminView || !showMonthComparison) return [];
    const prevM = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const prevY = selectedMonth === 0 ? selectedYear - 1 : selectedYear;

    return records.filter(r => {
      if (selectedProjectFilter !== "ALL" && r.proyecto !== selectedProjectFilter) return false;
      if (selectedTeamFilter !== "ALL" && r.team !== selectedTeamFilter) return false;

      const dateStr = dateBasis === "emision" ? (r.emittedAt || r.emision) : (r.solicitudAt || r.solicitud || r.createdAt);
      if (!dateStr) return false;

      const d = safeParseDate(dateStr);
      if (!d) return false;

      return d.getFullYear() === prevY && d.getMonth() === prevM;
    });
  }, [records, selectedYear, selectedMonth, dateBasis, selectedProjectFilter, selectedTeamFilter, isAdminView, showMonthComparison]);

  // Build daily data series (Día 1, Día 2, ... Día N)
  const dailySeries = useMemo(() => {
    const daysArr: Array<{
      dayNum: number;
      label: string; // "Día 1", "Día 2", ...
      dateFormatted: string; // DD/MM/AAAA
      emisiones: number;
      modificaciones: number;
      adendas: number;
      otros: number;
      total: number;
      records: OperationRecord[];
      // Filter-specific breakdowns
      byAssistant: Record<string, { emision: number; modificacion: number; adenda: number; total: number }>;
      byAdvisor: Record<string, number>;
    }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dd = String(day).padStart(2, "0");
      const mm = String(selectedMonth + 1).padStart(2, "0");
      const dateFormatted = `${dd}/${mm}/${selectedYear}`;

      const recsOnDay = currentMonthRecords.filter(r => {
        const dateStr = dateBasis === "emision" ? (r.emittedAt || r.emision) : (r.solicitudAt || r.solicitud || r.createdAt);
        const d = safeParseDate(dateStr);
        return d && d.getDate() === day;
      });

      let emision = 0;
      let modificacion = 0;
      let adenda = 0;
      let otros = 0;
      const byAssistant: Record<string, { emision: number; modificacion: number; adenda: number; total: number }> = {};
      const byAdvisor: Record<string, number> = {};

      for (const r of recsOnDay) {
        const tipo = normalizeTipo(r.tipo);
        if (tipo === "EMISION") emision++;
        else if (tipo === "MODIFICACION") modificacion++;
        else if (tipo === "ADENDA") adenda++;
        else otros++;

        // Assistant tracking
        const asst = r.derivadoA?.trim() || "Sin Asignar";
        if (!byAssistant[asst]) {
          byAssistant[asst] = { emision: 0, modificacion: 0, adenda: 0, total: 0 };
        }
        byAssistant[asst].total++;
        if (tipo === "EMISION") byAssistant[asst].emision++;
        else if (tipo === "MODIFICACION") byAssistant[asst].modificacion++;
        else if (tipo === "ADENDA") byAssistant[asst].adenda++;

        // Advisor tracking
        const adv = r.asesor?.trim() || "Sin Asesor";
        byAdvisor[adv] = (byAdvisor[adv] || 0) + 1;
      }

      daysArr.push({
        dayNum: day,
        label: `Día ${day}`,
        dateFormatted,
        emisiones: emision,
        modificaciones: modificacion,
        adendas: adenda,
        otros,
        total: recsOnDay.length,
        records: recsOnDay,
        byAssistant,
        byAdvisor
      });
    }

    return daysArr;
  }, [currentMonthRecords, daysInMonth, selectedMonth, selectedYear, dateBasis]);

  // Build weekly aggregated data series (Semana 1..5)
  const weeklySeries = useMemo(() => {
    const weeks: Array<{
      weekNum: number;
      label: string; // "Semana 1", "Semana 2", ...
      rangeStr: string;
      emisiones: number;
      modificaciones: number;
      adendas: number;
      otros: number;
      total: number;
      records: OperationRecord[];
      byAssistant: Record<string, { emision: number; modificacion: number; adenda: number; total: number }>;
      byAdvisor: Record<string, number>;
    }> = [];

    const totalWeeks = Math.ceil(daysInMonth / 7);
    for (let w = 1; w <= totalWeeks; w++) {
      const startDay = (w - 1) * 7 + 1;
      const endDay = Math.min(w * 7, daysInMonth);
      const mm = String(selectedMonth + 1).padStart(2, "0");
      const rangeStr = `${String(startDay).padStart(2, "0")}/${mm} al ${String(endDay).padStart(2, "0")}/${mm}`;

      const recsInWeek = currentMonthRecords.filter(r => {
        const dateStr = dateBasis === "emision" ? (r.emittedAt || r.emision) : (r.solicitudAt || r.solicitud || r.createdAt);
        const d = safeParseDate(dateStr);
        if (!d) return false;
        const day = d.getDate();
        return day >= startDay && day <= endDay;
      });

      let emision = 0;
      let modificacion = 0;
      let adenda = 0;
      let otros = 0;
      const byAssistant: Record<string, { emision: number; modificacion: number; adenda: number; total: number }> = {};
      const byAdvisor: Record<string, number> = {};

      for (const r of recsInWeek) {
        const tipo = normalizeTipo(r.tipo);
        if (tipo === "EMISION") emision++;
        else if (tipo === "MODIFICACION") modificacion++;
        else if (tipo === "ADENDA") adenda++;
        else otros++;

        const asst = r.derivadoA?.trim() || "Sin Asignar";
        if (!byAssistant[asst]) {
          byAssistant[asst] = { emision: 0, modificacion: 0, adenda: 0, total: 0 };
        }
        byAssistant[asst].total++;
        if (tipo === "EMISION") byAssistant[asst].emision++;
        else if (tipo === "MODIFICACION") byAssistant[asst].modificacion++;
        else if (tipo === "ADENDA") byAssistant[asst].adenda++;

        const adv = r.asesor?.trim() || "Sin Asesor";
        byAdvisor[adv] = (byAdvisor[adv] || 0) + 1;
      }

      weeks.push({
        weekNum: w,
        label: `Semana ${w}`,
        rangeStr,
        emisiones: emision,
        modificaciones: modificacion,
        adendas: adenda,
        otros,
        total: recsInWeek.length,
        records: recsInWeek,
        byAssistant,
        byAdvisor
      });
    }

    return weeks;
  }, [currentMonthRecords, daysInMonth, selectedMonth, dateBasis]);

  // Active dataset according to granularity
  const activeSeries = viewGranularity === "days" ? dailySeries : weeklySeries;

  // Compute Peak Days for insights
  const peakEmision = useMemo(() => {
    let max = 0;
    let peakItem: any = null;
    dailySeries.forEach(d => {
      if (d.emisiones > max) {
        max = d.emisiones;
        peakItem = d;
      }
    });
    return { count: max, item: peakItem };
  }, [dailySeries]);

  const peakModificacion = useMemo(() => {
    let max = 0;
    let peakItem: any = null;
    dailySeries.forEach(d => {
      if (d.modificaciones > max) {
        max = d.modificaciones;
        peakItem = d;
      }
    });
    return { count: max, item: peakItem };
  }, [dailySeries]);

  const peakAdenda = useMemo(() => {
    let max = 0;
    let peakItem: any = null;
    dailySeries.forEach(d => {
      if (d.adendas > max) {
        max = d.adendas;
        peakItem = d;
      }
    });
    return { count: max, item: peakItem };
  }, [dailySeries]);

  // Advisor ranking for the month ("Igual que asesor solicito mas")
  const advisorRanking = useMemo(() => {
    const map: Record<string, {
      name: string;
      team: string;
      emision: number;
      modificacion: number;
      adenda: number;
      total: number;
      observedCount: number;
    }> = {};

    currentMonthRecords.forEach(r => {
      const adv = r.asesor?.trim() || "Sin Asesor Asignado";
      if (!map[adv]) {
        map[adv] = {
          name: adv,
          team: r.team || "A",
          emision: 0,
          modificacion: 0,
          adenda: 0,
          total: 0,
          observedCount: 0
        };
      }
      map[adv].total++;
      const tipo = normalizeTipo(r.tipo);
      if (tipo === "EMISION") map[adv].emision++;
      else if (tipo === "MODIFICACION") map[adv].modificacion++;
      else if (tipo === "ADENDA") map[adv].adenda++;

      const isObs = r.status === "Observado / Rechazado" || r.status?.toLowerCase().includes("observad") || r.status?.toLowerCase().includes("rechazad");
      if (isObs) map[adv].observedCount++;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [currentMonthRecords]);

  // Assistant performance for the month
  const assistantPerformance = useMemo(() => {
    const map: Record<string, {
      name: string;
      emision: number;
      modificacion: number;
      adenda: number;
      total: number;
    }> = {};

    currentMonthRecords.forEach(r => {
      const asst = r.derivadoA?.trim() || "Sin Asistente Asignado";
      if (!map[asst]) {
        map[asst] = {
          name: asst,
          emision: 0,
          modificacion: 0,
          adenda: 0,
          total: 0
        };
      }
      map[asst].total++;
      const tipo = normalizeTipo(r.tipo);
      if (tipo === "EMISION") map[asst].emision++;
      else if (tipo === "MODIFICACION") map[asst].modificacion++;
      else if (tipo === "ADENDA") map[asst].adenda++;
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [currentMonthRecords]);

  // Staff Resource Demand by Observation Reason ("errores que demandaron mas recursos del personal")
  const errorResourceMetrics = useMemo(() => {
    const matchesReason = (r: OperationRecord, reason: string): boolean => {
      const comments: string[] = [];
      if (r.comentario) comments.push(r.comentario);
      if (r.history) {
        r.history.forEach(h => {
          if (h.comentario) comments.push(h.comentario);
        });
      }
      const full = comments.join(" | ").toLowerCase();
      const clean = reason.replace(".", "").toLowerCase();
      if (full.includes(clean)) return true;
      if (reason.startsWith("Falta Documento") && (full.includes("documento de identidad") || full.includes("falta dni") || full.includes("documento ident"))) return true;
      if (reason.startsWith("Falta contrato") && (full.includes("contrato de separación") || full.includes("contrato firmado") || full.includes("separacion"))) return true;
      if (reason.startsWith("No completó la DJ") && (full.includes("dj con estado civil") || full.includes("declaración jurada") || full.includes("dj incompleta"))) return true;
      if (reason.startsWith("Falta voucher") && full.includes("voucher")) return true;
      if (reason.startsWith("Error en el cronograma") && full.includes("cronograma")) return true;
      if (reason.startsWith("Faltan documentos adicionales") && full.includes("documentos adicionales")) return true;
      if (reason.startsWith("Falta Precalificación") && (full.includes("precalificación") || full.includes("precalificacion") || full.includes("carta de aprobación"))) return true;
      if (reason.startsWith("No indicó el banco") && (full.includes("banco que otorgará") || full.includes("crédito hipotecario") || full.includes("no indico banco"))) return true;
      if (reason.startsWith("Dirección Incompleta") && full.includes("dirección")) return true;
      return false;
    };

    return STANDARD_OBSERVATIONS.map(reason => {
      const matchingRecs = currentMonthRecords.filter(r => matchesReason(r, reason));
      const count = matchingRecs.length;

      // Calculate actual or estimated working hours demanded by these errors
      let totalStaffHours = 0;
      matchingRecs.forEach(r => {
        const start = r.solicitudAt || r.solicitud || r.createdAt;
        const end = r.emittedAt || r.emision || new Date().toISOString();
        if (start && end) {
          const bTime = calculateBusinessTime(start, end, settings?.workingSchedule);
          // If resolved, takes the business time spent, or standard rework multiplier of 2.0 hrs
          totalStaffHours += Math.max(bTime.totalHours, 1.5);
        } else {
          totalStaffHours += 2.0; // Benchmark 2.0 staff hours per observation roundtrip
        }
      });

      const impactLevel = count >= 4 || totalStaffHours >= 10 ? "Crítico" : count >= 2 ? "Moderado" : "Bajo";

      return {
        reason,
        count,
        staffHours: Math.round(totalStaffHours * 10) / 10,
        impactLevel,
        matchingRecs
      };
    }).sort((a, b) => b.staffHours - a.staffHours || b.count - a.count);
  }, [currentMonthRecords, settings]);

  // Total staff hours consumed by errors in month
  const totalErrorStaffHours = useMemo(() => {
    return errorResourceMetrics.reduce((acc, m) => acc + m.staffHours, 0);
  }, [errorResourceMetrics]);

  // -------------------------------------------------------------
  // CHART RENDERING (INTEGER Y-AXIS & RESPONSIVE SVG)
  // -------------------------------------------------------------
  // Determine lines to draw based on active analysis dimension
  const linesToDraw = useMemo(() => {
    if (analysisDimension === "tipos") {
      const lines: Array<{
        key: string;
        label: string;
        color: string;
        visible: boolean;
        getValue: (item: any) => number;
      }> = [];

      if (showLineEmision) {
        lines.push({
          key: "emisiones",
          label: "1. Emisiones",
          color: "#2563eb", // Blue-600
          visible: true,
          getValue: (item) => item.emisiones
        });
      }

      if (showLineModificacion) {
        lines.push({
          key: "modificaciones",
          label: "2. Modificaciones",
          color: "#f59e0b", // Amber-500
          visible: true,
          getValue: (item) => item.modificaciones
        });
      }

      if (showLineAdenda) {
        lines.push({
          key: "adendas",
          label: "3. Adendas",
          color: "#9333ea", // Purple-600
          visible: true,
          getValue: (item) => item.adendas
        });
      }

      if (showLineTotal) {
        lines.push({
          key: "total",
          label: "Total Solicitudes",
          color: "#059669", // Emerald-600
          visible: true,
          getValue: (item) => item.total
        });
      }

      return lines;
    }

    if (analysisDimension === "asistentes") {
      if (selectedAssistantFilter === "ALL") {
        // Show top 3 assistants lines
        const topAssistants = assistantPerformance.slice(0, 3);
        const palette = ["#2563eb", "#059669", "#d97706", "#7c3aed"];
        return topAssistants.map((asst, idx) => ({
          key: asst.name,
          label: `@${asst.name}`,
          color: palette[idx % palette.length],
          visible: true,
          getValue: (item: any) => item.byAssistant[asst.name]?.total || 0
        }));
      } else {
        // Show selected assistant breakdown by type
        return [
          {
            key: "asst_emision",
            label: `${selectedAssistantFilter} - Emisión`,
            color: "#2563eb",
            visible: true,
            getValue: (item: any) => item.byAssistant[selectedAssistantFilter]?.emision || 0
          },
          {
            key: "asst_modificacion",
            label: `${selectedAssistantFilter} - Modificación`,
            color: "#f59e0b",
            visible: true,
            getValue: (item: any) => item.byAssistant[selectedAssistantFilter]?.modificacion || 0
          },
          {
            key: "asst_adenda",
            label: `${selectedAssistantFilter} - Adenda`,
            color: "#9333ea",
            visible: true,
            getValue: (item: any) => item.byAssistant[selectedAssistantFilter]?.adenda || 0
          }
        ];
      }
    }

    if (analysisDimension === "asesores") {
      if (selectedAdvisorFilter === "ALL") {
        // Show top 3 advisors lines
        const topAdvisors = advisorRanking.slice(0, 3);
        const palette = ["#e11d48", "#2563eb", "#059669", "#9333ea"];
        return topAdvisors.map((adv, idx) => ({
          key: adv.name,
          label: adv.name,
          color: palette[idx % palette.length],
          visible: true,
          getValue: (item: any) => item.byAdvisor[adv.name] || 0
        }));
      } else {
        return [
          {
            key: "adv_selected",
            label: `${selectedAdvisorFilter}`,
            color: "#e11d48",
            visible: true,
            getValue: (item: any) => item.byAdvisor[selectedAdvisorFilter] || 0
          }
        ];
      }
    }

    // Default
    return [];
  }, [analysisDimension, showLineEmision, showLineModificacion, showLineAdenda, showLineTotal, selectedAssistantFilter, assistantPerformance, selectedAdvisorFilter, advisorRanking]);

  // Calculate Maximum Integer Value for Y-Axis
  const maxYValue = useMemo(() => {
    let max = 0;
    activeSeries.forEach(item => {
      linesToDraw.forEach(line => {
        const val = line.getValue(item);
        if (val > max) max = val;
      });
    });

    // Ensure nice integer scale (minimum 5, step calculated dynamically)
    if (max <= 4) return 5;
    if (max <= 9) return 10;
    if (max <= 14) return 15;
    if (max <= 19) return 20;
    return Math.ceil((max + 2) / 5) * 5;
  }, [activeSeries, linesToDraw]);

  // Integer Y-Ticks (ALWAYS exact integers: 0, 1, 2, 3...)
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const count = 5; // 5 intervals
    const step = maxYValue / count;
    for (let i = 0; i <= count; i++) {
      ticks.push(Math.round(i * step));
    }
    return ticks;
  }, [maxYValue]);

  // Chart Dimensions
  const svgWidth = 960;
  const svgHeight = 280;
  const margin = { top: 25, right: 30, bottom: 40, left: 45 };
  const innerWidth = svgWidth - margin.left - margin.right;
  const innerHeight = svgHeight - margin.top - margin.bottom;

  // X coordinate calculation
  const getX = (index: number) => {
    const count = activeSeries.length;
    if (count <= 1) return margin.left + innerWidth / 2;
    return margin.left + (index / (count - 1)) * innerWidth;
  };

  // Y coordinate calculation
  const getY = (val: number) => {
    const clamped = Math.max(0, Math.min(val, maxYValue));
    return margin.top + innerHeight - (clamped / maxYValue) * innerHeight;
  };

  // Generate SVG Path for a line
  const generatePath = (getValue: (item: any) => number) => {
    if (activeSeries.length === 0) return "";
    return activeSeries.map((item, idx) => {
      const x = getX(idx);
      const y = getY(getValue(item));
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  };

  // Export to CSV Function
  const handleExportCSV = () => {
    const headers = ["Periodo", "Fecha", "Emisiones", "Modificaciones", "Adendas", "Otros", "Total"];
    const rows = activeSeries.map(item => [
      item.label,
      "dateFormatted" in item ? item.dateFormatted : (item as any).rangeStr,
      item.emisiones,
      item.modificaciones,
      item.adendas,
      item.otros,
      item.total
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + 
      [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `operaciones_${MONTH_NAMES[selectedMonth]}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 md:p-6 space-y-6" id="operational-kpi-chart-section">
      
      {/* 1. TOP HEADER & MONTH/YEAR SELECTION BAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-150">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-xs">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base md:text-lg text-slate-900 tracking-tight">
                  Evolución y Cantidad de Operaciones por Día / Semana
                </h3>
                {isAdminView && (
                  <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-purple-200">
                    Modo Admin Extendido
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Valores enteros de solicitudes de <strong>Emisión</strong>, <strong>Modificación</strong> y <strong>Adenda</strong> a lo largo del mes
              </p>
            </div>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Navigation arrow buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-2xs">
            <button
              onClick={handlePrevMonth}
              title="Mes anterior"
              className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-xl transition-all cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            {/* Month dropdown */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="bg-transparent font-black text-xs text-slate-800 px-2 py-1 outline-none cursor-pointer uppercase tracking-wider"
            >
              {MONTH_NAMES.map((mName, idx) => (
                <option key={mName} value={idx}>
                  {mName}
                </option>
              ))}
            </select>

            {/* Year selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="bg-transparent font-black text-xs text-slate-800 px-2 py-1 outline-none cursor-pointer border-l border-slate-200"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button
              onClick={handleNextMonth}
              title="Mes siguiente"
              className="p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 rounded-xl transition-all cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleResetToCurrentMonth}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors cursor-pointer"
          >
            Mes Actual
          </button>

          {/* Granularity Toggle: Días vs Semanas */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewGranularity("days")}
              className={`px-3 py-1 font-extrabold rounded-xl transition-all cursor-pointer ${
                viewGranularity === "days"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Por Días (1..{daysInMonth})
            </button>
            <button
              onClick={() => setViewGranularity("weeks")}
              className={`px-3 py-1 font-extrabold rounded-xl transition-all cursor-pointer ${
                viewGranularity === "weeks"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Por Semanas
            </button>
          </div>
        </div>
      </div>

      {/* 2. SUB-NAVIGATION TABS (4 ANALYSIS MODES) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-200/80">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setAnalysisDimension("tipos")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              analysisDimension === "tipos"
                ? "bg-white text-blue-700 shadow-sm border border-blue-100"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>1. Por Tipo (Emisión vs Modif. vs Adenda)</span>
          </button>

          <button
            onClick={() => setAnalysisDimension("asistentes")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              analysisDimension === "asistentes"
                ? "bg-white text-emerald-700 shadow-sm border border-emerald-100"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>2. Por Asistente Legal</span>
          </button>

          <button
            onClick={() => setAnalysisDimension("asesores")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              analysisDimension === "asesores"
                ? "bg-white text-rose-700 shadow-sm border border-rose-100"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>3. Asesores (¿Quién solicitó más?)</span>
          </button>

          <button
            onClick={() => setAnalysisDimension("recursos_errores")}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              analysisDimension === "recursos_errores"
                ? "bg-white text-amber-800 shadow-sm border border-amber-100"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>4. Errores que demandaron más tiempo</span>
          </button>
        </div>

        {/* Date basis toggle */}
        <div className="flex items-center gap-1.5 text-[11px] font-bold px-2">
          <span className="text-slate-400">Fecha base:</span>
          <button
            onClick={() => setDateBasis(dateBasis === "solicitud" ? "emision" : "solicitud")}
            className="text-brand-primary underline hover:text-brand-secondary cursor-pointer"
          >
            {dateBasis === "solicitud" ? "Fecha de Solicitud (Ingreso)" : "Fecha de Emisión (Revisión)"}
          </button>
        </div>
      </div>

      {/* 3. DIMENSION CONTROLS & CHECKBOX FILTERS */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50/70 rounded-2xl border border-slate-200/60">
        
        {/* If dimension is "tipos": Checkboxes to toggle lines */}
        {analysisDimension === "tipos" && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              Líneas a mostrar:
            </span>
            
            {/* Emisión Checkbox */}
            <label className="flex items-center gap-1.5 font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLineEmision}
                onChange={(e) => setShowLineEmision(e.target.checked)}
                className="rounded accent-blue-600"
              />
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600 inline-block"></span>
              Emisión
            </label>

            {/* Modificación Checkbox */}
            <label className="flex items-center gap-1.5 font-black text-amber-800 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLineModificacion}
                onChange={(e) => setShowLineModificacion(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block"></span>
              Modificación
            </label>

            {/* Adenda Checkbox */}
            <label className="flex items-center gap-1.5 font-black text-purple-800 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLineAdenda}
                onChange={(e) => setShowLineAdenda(e.target.checked)}
                className="rounded accent-purple-600"
              />
              <span className="h-2.5 w-2.5 rounded-full bg-purple-600 inline-block"></span>
              Adenda
            </label>

            {/* Total Line Checkbox */}
            <label className="flex items-center gap-1.5 font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLineTotal}
                onChange={(e) => setShowLineTotal(e.target.checked)}
                className="rounded accent-emerald-600"
              />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 inline-block"></span>
              Total Solicitudes
            </label>
          </div>
        )}

        {/* If dimension is "asistentes": Dropdown to filter by specific assistant */}
        {analysisDimension === "asistentes" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              Filtrar por Asistente Legal:
            </span>
            <select
              value={selectedAssistantFilter}
              onChange={(e) => setSelectedAssistantFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1 font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="ALL">-- Ver Top Asistentes Comparados --</option>
              {uniqueAssistants.map(a => (
                <option key={a} value={a}>@{a}</option>
              ))}
            </select>
          </div>
        )}

        {/* If dimension is "asesores": Dropdown to filter by specific advisor */}
        {analysisDimension === "asesores" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              Filtrar por Asesor:
            </span>
            <select
              value={selectedAdvisorFilter}
              onChange={(e) => setSelectedAdvisorFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1 font-bold text-slate-800 outline-none cursor-pointer max-w-xs truncate"
            >
              <option value="ALL">-- Ver Top 3 Asesores con Más Solicitudes --</option>
              {uniqueAdvisors.map(adv => (
                <option key={adv} value={adv}>{adv}</option>
              ))}
            </select>
          </div>
        )}

        {/* Admin Global Cross-Filters & Export CSV */}
        <div className="flex items-center gap-2 ml-auto">
          {isAdminView && (
            <>
              {/* Project Filter */}
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="ALL">Todos los Proyectos</option>
                {uniqueProjects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {/* Team Filter */}
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="ALL">Todos los Equipos</option>
                {uniqueTeams.map(t => (
                  <option key={t} value={t}>Team {t}</option>
                ))}
              </select>
            </>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl border border-slate-200 text-xs font-bold transition-all cursor-pointer"
            title="Exportar datos del gráfico a CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 4. MAIN INTERACTIVE SVG CHART (INTEGER Y-AXIS & "Día 1, Día 2..." X-AXIS) */}
      {analysisDimension !== "recursos_errores" && (
        <div className="space-y-3">
          <div className="w-full overflow-x-auto bg-slate-50/50 rounded-2xl border border-slate-200/80 p-2 relative">
            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
              className="w-full h-auto min-w-[700px] select-none"
            >
              {/* Grid Lines & Integer Y-Axis Labels */}
              {yTicks.map((tickVal) => {
                const y = getY(tickVal);
                return (
                  <g key={`y-tick-${tickVal}`}>
                    <line
                      x1={margin.left}
                      y1={y}
                      x2={svgWidth - margin.right}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={tickVal === 0 ? "none" : "3 3"}
                      strokeWidth={tickVal === 0 ? "1.5" : "1"}
                    />
                    {/* Integer Label */}
                    <text
                      x={margin.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      className="text-[10px] font-mono font-bold fill-slate-500"
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Horizontal Base Line */}
              <line
                x1={margin.left}
                y1={getY(0)}
                x2={svgWidth - margin.right}
                y2={getY(0)}
                stroke="#94a3b8"
                strokeWidth="1.5"
              />

              {/* X-Axis Labels: "Día 1", "Día 2", ... or "Semana 1", "Semana 2"... */}
              {activeSeries.map((item, idx) => {
                const x = getX(idx);
                const isHovered = hoveredIdx === idx;
                // Show label on every tick or alternating if more than 20 days
                const showLabel = viewGranularity === "weeks" || daysInMonth <= 16 || idx % 2 === 0 || idx === activeSeries.length - 1;

                return (
                  <g key={`x-tick-${idx}`}>
                    {/* Vertical tick notch */}
                    <line
                      x1={x}
                      y1={getY(0)}
                      x2={x}
                      y2={getY(0) + 5}
                      stroke="#94a3b8"
                      strokeWidth="1"
                    />
                    
                    {showLabel && (
                      <text
                        x={x}
                        y={getY(0) + 18}
                        textAnchor="middle"
                        className={`text-[9px] font-bold ${
                          isHovered ? "fill-blue-700 font-extrabold" : "fill-slate-500"
                        }`}
                      >
                        {item.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Render Selected Color-Coded Lines */}
              {linesToDraw.map((line) => {
                const pathStr = generatePath(line.getValue);
                return (
                  <g key={`line-${line.key}`}>
                    {/* Glowing shadow outline */}
                    <path
                      d={pathStr}
                      fill="none"
                      stroke={line.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300"
                    />

                    {/* Circle data points */}
                    {activeSeries.map((item, idx) => {
                      const val = line.getValue(item);
                      if (val === 0 && activeSeries.length > 20) return null; // Avoid visual clutter for empty days
                      const cx = getX(idx);
                      const cy = getY(val);
                      const isHovered = hoveredIdx === idx;

                      return (
                        <circle
                          key={`pt-${line.key}-${idx}`}
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 5.5 : val > 0 ? 3.5 : 2}
                          fill="#ffffff"
                          stroke={line.color}
                          strokeWidth={isHovered ? "3" : "2"}
                          className="cursor-pointer transition-all"
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Transparent Hit-Areas for easy mouse hovering and clicking on days */}
              {activeSeries.map((item, idx) => {
                const x = getX(idx);
                const colWidth = innerWidth / activeSeries.length;

                return (
                  <rect
                    key={`hit-${idx}`}
                    x={x - colWidth / 2}
                    y={margin.top}
                    width={colWidth}
                    height={innerHeight}
                    fill="transparent"
                    className="cursor-pointer hover:fill-blue-500/10 transition-colors"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => {
                      setSelectedPeriodDetail({
                        label: item.label,
                        dateFormatted: "dateFormatted" in item ? item.dateFormatted : (item as any).rangeStr,
                        records: item.records
                      });
                    }}
                  />
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredIdx !== null && activeSeries[hoveredIdx] && (
              <div 
                className="absolute top-3 right-4 bg-slate-900/95 text-white p-3 rounded-2xl shadow-xl text-xs space-y-1 z-20 pointer-events-none border border-slate-700 backdrop-blur-xs min-w-[200px]"
              >
                <div className="flex justify-between items-center border-b border-slate-700 pb-1.5">
                  <span className="font-extrabold text-blue-300">
                    {activeSeries[hoveredIdx].label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {"dateFormatted" in activeSeries[hoveredIdx] 
                      ? (activeSeries[hoveredIdx] as any).dateFormatted 
                      : (activeSeries[hoveredIdx] as any).rangeStr}
                  </span>
                </div>

                <div className="space-y-1 pt-1 font-mono">
                  {linesToDraw.map(line => (
                    <div key={line.key} className="flex justify-between items-center gap-3">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }}></span>
                        {line.label}:
                      </span>
                      <strong className="text-white font-black">
                        {line.getValue(activeSeries[hoveredIdx])}
                      </strong>
                    </div>
                  ))}
                  <div className="pt-1.5 border-t border-slate-800 flex justify-between text-[11px] text-slate-300 font-bold">
                    <span>Total expedientes:</span>
                    <span className="text-emerald-400 font-black">{activeSeries[hoveredIdx].total}</span>
                  </div>
                </div>

                <p className="text-[9px] text-slate-400 italic pt-1 text-center">
                  Clic para ver listado detallado
                </p>
              </div>
            )}
          </div>

          {/* Quick Insights Banner for Peak Days */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Peak Emissions */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wide">
                  Día Pico de Emisiones
                </span>
                <p className="text-xs font-black text-slate-900">
                  {peakEmision.item ? `${peakEmision.item.label} (${peakEmision.count} emisiones)` : "Sin registros"}
                </p>
              </div>
            </div>

            {/* Peak Modifications */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                <Edit3 className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide">
                  Día Pico de Modificaciones
                </span>
                <p className="text-xs font-black text-slate-900">
                  {peakModificacion.item ? `${peakModificacion.item.label} (${peakModificacion.count} cambios)` : "Sin registros"}
                </p>
              </div>
            </div>

            {/* Peak Adendas */}
            <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3 flex items-center gap-3">
              <div className="p-2 bg-purple-100 text-purple-800 rounded-xl shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wide">
                  Día Pico de Adendas
                </span>
                <p className="text-xs font-black text-slate-900">
                  {peakAdenda.item ? `${peakAdenda.item.label} (${peakAdenda.count} adendas)` : "Sin registros"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB 4: ERRORES QUE DEMANDARON MÁS RECURSOS DEL PERSONAL */}
      {analysisDimension === "recursos_errores" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
            <div>
              <h4 className="text-sm font-extrabold text-amber-950 uppercase tracking-wide flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-700" />
                Impacto de Errores en Recursos del Personal ({MONTH_NAMES[selectedMonth]} {selectedYear})
              </h4>
              <p className="text-xs text-amber-800/80 font-medium mt-0.5">
                Mide qué observaciones generaron más retrabajo y demandaron mayor tiempo del equipo legal y administrativo.
              </p>
            </div>
            
            <div className="text-right bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Tiempo Total Invertido</span>
              <span className="text-lg font-black text-amber-900 font-mono">
                {totalErrorStaffHours} <span className="text-xs font-bold text-amber-600">horas hábiles</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-wider">
                  <th className="p-3">#</th>
                  <th className="p-3">TIPO DE OBSERVACIÓN / ERROR</th>
                  <th className="p-3 text-center">OCURRENCIAS</th>
                  <th className="p-3 text-center">HORAS PERSONAL INVERTIDAS</th>
                  <th className="p-3 text-center">NIVEL DE IMPACTO</th>
                  <th className="p-3 text-center">ACCIÓN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {errorResourceMetrics.map((item, idx) => (
                  <tr key={item.reason} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="p-3 font-bold text-slate-800">
                      {item.reason}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-slate-700">
                      {item.count}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-amber-900">
                      {item.staffHours} hrs
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                        item.impactLevel === "Crítico"
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : item.impactLevel === "Moderado"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>
                        {item.impactLevel}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedPeriodDetail({
                            label: `Error: ${item.reason}`,
                            dateFormatted: `${MONTH_NAMES[selectedMonth]} ${selectedYear}`,
                            records: item.matchingRecs
                          });
                        }}
                        disabled={item.count === 0}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-lg text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Ver {item.count} Ops
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB 3 COMPONENT: ASESORES RANKING (¿QUIÉN SOLICITÓ MÁS?) */}
      {analysisDimension === "asesores" && (
        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
              Ranking de Asesores con Más Solicitudes en {MONTH_NAMES[selectedMonth]} {selectedYear}
            </h4>
            <span className="text-[10px] text-slate-400 font-bold">
              {advisorRanking.length} Asesores con actividad
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {advisorRanking.slice(0, 6).map((adv, idx) => (
              <div 
                key={adv.name}
                onClick={() => setSelectedAdvisorFilter(adv.name)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  selectedAdvisorFilter === adv.name
                    ? "bg-rose-50/80 border-rose-400 ring-2 ring-rose-400/30 shadow-xs"
                    : "bg-slate-50/70 border-slate-200 hover:bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-black text-slate-400">#{idx + 1}</span>
                    <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-tight">
                      {adv.name}
                    </h5>
                    <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold uppercase">
                      Team {adv.team}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-slate-900 font-mono">{adv.total}</span>
                    <span className="text-[9px] text-slate-400 block font-medium">solicitudes</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 mt-2.5 pt-2 border-t border-slate-200/60 text-center font-mono">
                  <div className="bg-blue-50/80 p-1 rounded-lg">
                    <span className="text-[8px] text-blue-700 block font-bold">Emis.</span>
                    <span className="text-[11px] font-black text-blue-900">{adv.emision}</span>
                  </div>
                  <div className="bg-amber-50/80 p-1 rounded-lg">
                    <span className="text-[8px] text-amber-700 block font-bold">Modif.</span>
                    <span className="text-[11px] font-black text-amber-900">{adv.modificacion}</span>
                  </div>
                  <div className="bg-purple-50/80 p-1 rounded-lg">
                    <span className="text-[8px] text-purple-700 block font-bold">Aden.</span>
                    <span className="text-[11px] font-black text-purple-900">{adv.adenda}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7. DRILLDOWN EXPEDIENT DETAIL PANEL (WHEN CLICKING A DAY/ITEM) */}
      {selectedPeriodDetail && (
        <div className="p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                Expedientes del {selectedPeriodDetail.label} ({selectedPeriodDetail.dateFormatted})
              </h4>
              <p className="text-xs text-slate-500 font-medium">
                {selectedPeriodDetail.records.length} expedientes asociados
              </p>
            </div>
            <button
              onClick={() => setSelectedPeriodDetail(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-xl cursor-pointer"
            >
              Cerrar Detalle ✕
            </button>
          </div>

          <div className="overflow-x-auto max-h-[320px] rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 font-black text-[10px] uppercase sticky top-0">
                <tr>
                  <th className="p-2.5">ID / Proyecto</th>
                  <th className="p-2.5">Asesor / Team</th>
                  <th className="p-2.5">Tipo</th>
                  <th className="p-2.5">Asistente</th>
                  <th className="p-2.5">Fecha Registro</th>
                  <th className="p-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedPeriodDetail.records.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      No hay expedientes en este día o período.
                    </td>
                  </tr>
                ) : (
                  selectedPeriodDetail.records.map(r => (
                    <tr key={r.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-2.5">
                        <div className="font-mono text-[9px] text-slate-400">ID: {r.id}</div>
                        <span className="font-extrabold text-slate-800">{r.proyecto} (DPTO {r.dpto || "-"})</span>
                      </td>
                      <td className="p-2.5">
                        <span className="font-bold text-slate-700 uppercase block">{r.asesor || "Sin Asesor"}</span>
                        <span className="text-[9px] text-slate-400 font-semibold">Team {r.team || "A"}</span>
                      </td>
                      <td className="p-2.5">
                        <span className="bg-blue-50 text-blue-700 font-black text-[10px] px-2 py-0.5 rounded border border-blue-100">
                          {r.tipo || "EMISION"}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600 font-semibold capitalize">
                        {r.derivadoA || "Sin Asistente"}
                      </td>
                      <td className="p-2.5 font-mono text-xs text-slate-600 font-semibold">
                        {formatDateTimeFull(r.solicitudAt || r.solicitud || r.createdAt)}
                      </td>
                      <td className="p-2.5">
                        <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {r.status || "Pendiente"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
