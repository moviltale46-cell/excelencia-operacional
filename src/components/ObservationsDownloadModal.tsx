import React, { useState, useMemo } from "react";
import { 
  Download, 
  X, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Building, 
  User, 
  Users,
  FileSpreadsheet,
  FileText,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  ChevronDown,
  BarChart3,
  TrendingUp,
  Layers,
  ShieldAlert,
  Percent,
  Sparkles,
  Calendar,
  RotateCcw
} from "lucide-react";
import { AppSettings, OperationRecord } from "../types";
import { 
  extractAllObservations, 
  downloadObservationsExcel, 
  ObservationExportItem 
} from "../utils/exportObservations";
import { 
  extractAllModifications, 
  downloadModificacionesExcel, 
  downloadModificacionesPdf 
} from "../utils/exportModificaciones";
import { generateObservationsReportPdf, ObservationsPdfSections } from "../utils/generateObservationsReportPdf";
import { safeParseDate, resolveJefeVentasForAdvisor } from "../utils/dateUtils";

interface ObservationsDownloadModalProps {
  records: OperationRecord[];
  settings: AppSettings;
  isOpen: boolean;
  onClose: () => void;
  isJefeLegalView?: boolean;
}

export default function ObservationsDownloadModal({
  records,
  settings,
  isOpen,
  onClose,
  isJefeLegalView = false
}: ObservationsDownloadModalProps) {
  const [activeTab, setActiveTab] = useState<"graficas" | "asesores" | "teams" | "proyectos" | "detalle" | "modificaciones">("graficas");
  const [searchQuery, setSearchQuery] = useState("");
  const [modSearchQuery, setModSearchQuery] = useState("");
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<"all" | "advisor_only" | "other_areas_only">("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<"all" | "resolved" | "pending">("all");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("ALL");
  const [selectedJefeFilter, setSelectedJefeFilter] = useState<string>("ALL");
  const [selectedAdvisors, setSelectedAdvisors] = useState<string[]>([]);
  const [showAdvisorSelector, setShowAdvisorSelector] = useState(false);
  const [advisorSearchQuery, setAdvisorSearchQuery] = useState("");
  const [advisorSortField, setAdvisorSortField] = useState<"advisorObsCount" | "errorRate" | "totalObs" | "totalOps" | "avgHours">("advisorObsCount");
  const [advisorSortDir, setAdvisorSortDir] = useState<"asc" | "desc">("desc");

  // Date Filter State
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [datePreset, setDatePreset] = useState<string>("all");

  // Selective PDF Sections State
  const [selectedSections, setSelectedSections] = useState<ObservationsPdfSections>({
    kpis: true,
    charts: true,
    advisors: true,
    teams: true,
    projects: true,
    details: true
  });
  const [showSectionSelector, setShowSectionSelector] = useState(false);

  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingTabPdf, setIsExportingTabPdf] = useState(false);
  const [isExportingSelectedPdf, setIsExportingSelectedPdf] = useState(false);

  // Extract all base observations
  const allObservations = useMemo(() => {
    return extractAllObservations(records, settings);
  }, [records, settings]);

  // Date Presets Handler
  const handleApplyDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const formatYMD = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const t = formatYMD(now);
      setStartDate(t);
      setEndDate(t);
    } else if (preset === "last7") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(formatYMD(d));
      setEndDate(formatYMD(now));
    } else if (preset === "last30") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(formatYMD(d));
      setEndDate(formatYMD(now));
    } else if (preset === "thisMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
    } else if (preset === "lastMonth") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
    } else if (preset === "thisYear") {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      setStartDate(formatYMD(firstDay));
      setEndDate(formatYMD(lastDay));
    }
  };

  const handleCustomDateChange = (type: "start" | "end", val: string) => {
    setDatePreset("custom");
    if (type === "start") setStartDate(val);
    else setEndDate(val);
  };

  const handleResetDateFilter = () => {
    setDatePreset("all");
    setStartDate("");
    setEndDate("");
  };

  // Human-readable date range label
  const dateRangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "Histórico General Completo";
    if (startDate && endDate) {
      if (startDate === endDate) return `Fecha: ${startDate}`;
      return `${startDate} al ${endDate}`;
    }
    if (startDate) return `Desde ${startDate}`;
    return `Hasta ${endDate}`;
  }, [startDate, endDate]);

  // 1. Filter Observations by Date Range
  const dateFilteredObservations = useMemo(() => {
    if (!startDate && !endDate) return allObservations;

    const startTs = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTs = endDate ? new Date(endDate + "T23:59:59.999").getTime() : Infinity;

    return allObservations.filter(obs => {
      const ts = obs.fechaObservacionTimestamp || safeParseDate(obs.fechaObservacion)?.getTime() || 0;
      if (ts === 0) return true;
      return ts >= startTs && ts <= endTs;
    });
  }, [allObservations, startDate, endDate]);

  // 2. Filter Records by Date Range or Presence in Observations
  const dateFilteredRecords = useMemo(() => {
    if (!startDate && !endDate) return records;

    const startTs = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTs = endDate ? new Date(endDate + "T23:59:59.999").getTime() : Infinity;

    const observedRecordIds = new Set(dateFilteredObservations.map(o => o.idOperacion));

    return records.filter(r => {
      if (observedRecordIds.has(r.id)) return true;
      const rDate = safeParseDate(r.solicitudAt || r.createdAt || r.solicitud);
      if (!rDate) return false;
      const rTs = rDate.getTime();
      return rTs >= startTs && rTs <= endTs;
    });
  }, [records, dateFilteredObservations, startDate, endDate]);

  // Available unique advisors for multi-selection
  const availableAdvisors = useMemo(() => {
    const set = new Set<string>();
    dateFilteredRecords.forEach(r => {
      const adv = (r.asesor || "").trim();
      if (adv && adv !== "Sin Asesor Asignado" && adv !== "-") set.add(adv);
    });
    dateFilteredObservations.forEach(o => {
      const adv = (o.asesor || "").trim();
      if (adv && adv !== "Sin Asesor Asignado" && adv !== "-") set.add(adv);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dateFilteredRecords, dateFilteredObservations]);

  // Available unique Jefes de Ventas for filtering
  const uniqueJefes = useMemo(() => {
    const set = new Set<string>();
    dateFilteredRecords.forEach(r => {
      const jv = resolveJefeVentasForAdvisor(r.asesor, r.proyecto, r.team, r, settings);
      if (jv && jv !== "Sin Asignar") set.add(jv);
    });
    if (settings.asesorJefes) {
      Object.values(settings.asesorJefes).forEach(j => {
        if (j && j !== "Sin Asignar") set.add(j);
      });
    }
    return Array.from(set).sort();
  }, [dateFilteredRecords, settings]);

  // 1. First filter by Team and Jefe de Ventas (without filtering out unselected advisors yet)
  const { teamJefeObservations, teamJefeRecords } = useMemo(() => {
    let obs = dateFilteredObservations;
    let recs = dateFilteredRecords;

    // Team Filter
    if (selectedTeamFilter !== "ALL") {
      const teamQuery = selectedTeamFilter.toUpperCase().trim();
      obs = obs.filter(o => (o.equipo || "").toUpperCase().includes(teamQuery));
      recs = recs.filter(r => (r.team || "").toUpperCase().includes(teamQuery));
    }

    // Jefe de Ventas Filter
    if (selectedJefeFilter !== "ALL") {
      const jefeQuery = selectedJefeFilter.toLowerCase().trim();
      obs = obs.filter(o => {
        const jv = (o.jefeVentas || resolveJefeVentasForAdvisor(o.asesor, o.proyecto, o.equipo, undefined, settings)).toLowerCase().trim();
        return jv === jefeQuery;
      });
      recs = recs.filter(r => {
        const jv = resolveJefeVentasForAdvisor(r.asesor, r.proyecto, r.team, r, settings).toLowerCase().trim();
        return jv === jefeQuery;
      });
    }

    return { teamJefeObservations: obs, teamJefeRecords: recs };
  }, [dateFilteredObservations, dateFilteredRecords, selectedTeamFilter, selectedJefeFilter, settings]);

  // 2. Filtered observations and records according to active Team, Jefe, and Selected Advisors (for summary and exports)
  const { effectiveObservations, effectiveRecords } = useMemo(() => {
    let obs = teamJefeObservations;
    let recs = teamJefeRecords;

    // Selected Specific Advisors Filter (Ranking y resumen solo de esos asesores seleccionados)
    if (selectedAdvisors.length > 0) {
      const advSet = new Set(selectedAdvisors.map(a => a.toLowerCase().trim()));
      obs = obs.filter(o => advSet.has((o.asesor || "").toLowerCase().trim()));
      recs = recs.filter(r => advSet.has((r.asesor || "").toLowerCase().trim()));
    }

    return { effectiveObservations: obs, effectiveRecords: recs };
  }, [teamJefeObservations, teamJefeRecords, selectedAdvisors]);

  // Overall Statistics based on Effective (Date + Team + Advisor Filtered) Observations
  const stats = useMemo(() => {
    const total = effectiveObservations.length;
    const advisorObs = effectiveObservations.filter(o => o.afectaAsesor);
    const otherAreasObs = effectiveObservations.filter(o => !o.afectaAsesor);
    const resolved = effectiveObservations.filter(o => o.estadoObservacion === "Subsanada / Levantada");
    const pending = effectiveObservations.filter(o => o.estadoObservacion === "Pendiente / Abierta");

    const totalAdvisorHours = advisorObs.reduce((acc, curr) => acc + curr.horasAsesor, 0);
    const totalOtherAreasHours = otherAreasObs.reduce((acc, curr) => acc + curr.horasOtrasAreas, 0);
    const totalHours = effectiveObservations.reduce((acc, curr) => acc + curr.horasHabiles, 0);
    const avgResolutionHours = resolved.length > 0
      ? Number((resolved.reduce((acc, curr) => acc + curr.horasHabiles, 0) / resolved.length).toFixed(1))
      : (total > 0 ? Number((totalHours / total).toFixed(1)) : 0);

    return {
      total,
      advisorCount: advisorObs.length,
      otherAreasCount: otherAreasObs.length,
      resolvedCount: resolved.length,
      pendingCount: pending.length,
      totalAdvisorHours: Number(totalAdvisorHours.toFixed(1)),
      totalOtherAreasHours: Number(totalOtherAreasHours.toFixed(1)),
      totalHours: Number(totalHours.toFixed(1)),
      avgResolutionHours
    };
  }, [effectiveObservations]);

  // Concentrated Sales Advisors KPIs (Filtered by Date & Team/Jefe so all advisors stay visible and selectable)
  const advisorMetrics = useMemo(() => {
    const map: { [name: string]: {
      name: string;
      team: string;
      jefeVentas: string;
      totalOps: number;
      advisorObsCount: number;
      otherAreasObsCount: number;
      totalObs: number;
      resolvedCount: number;
      pendingCount: number;
      totalHours: number;
      avgHours: number;
      errorRate: number;
      projects: Set<string>;
    } } = {};

    teamJefeRecords.forEach(r => {
      let advName = (r.asesor || "").trim() || "Sin Asesor Asignado";
      if (advName === "ASE000010") advName = "DERVIS PIÑA";
      if (advName === "ASE000028") advName = "PAULA CASAS";
      const team = (r.team || "").trim() || "Sin Equipo";
      const jv = resolveJefeVentasForAdvisor(advName, r.proyecto, team, r, settings);

      if (!map[advName]) {
        map[advName] = {
          name: advName,
          team,
          jefeVentas: jv,
          totalOps: 0,
          advisorObsCount: 0,
          otherAreasObsCount: 0,
          totalObs: 0,
          resolvedCount: 0,
          pendingCount: 0,
          totalHours: 0,
          avgHours: 0,
          errorRate: 0,
          projects: new Set()
        };
      }
      map[advName].totalOps += 1;
      if (r.proyecto) map[advName].projects.add(r.proyecto.trim());
      if (map[advName].team === "Sin Equipo" && team !== "Sin Equipo") {
        map[advName].team = team;
      }
      if ((!map[advName].jefeVentas || map[advName].jefeVentas === "Sin Asignar") && jv && jv !== "Sin Asignar") {
        map[advName].jefeVentas = jv;
      }
    });

    teamJefeObservations.forEach(obs => {
      let advName = (obs.asesor || "").trim() || "Sin Asesor Asignado";
      if (advName === "ASE000010") advName = "DERVIS PIÑA";
      if (advName === "ASE000028") advName = "PAULA CASAS";
      const team = obs.equipo || "Sin Equipo";
      const jv = obs.jefeVentas || resolveJefeVentasForAdvisor(advName, obs.proyecto, team, undefined, settings);

      if (!map[advName]) {
        map[advName] = {
          name: advName,
          team,
          jefeVentas: jv,
          totalOps: 0,
          advisorObsCount: 0,
          otherAreasObsCount: 0,
          totalObs: 0,
          resolvedCount: 0,
          pendingCount: 0,
          totalHours: 0,
          avgHours: 0,
          errorRate: 0,
          projects: new Set()
        };
      }

      map[advName].totalObs += 1;
      if (obs.afectaAsesor) {
        map[advName].advisorObsCount += 1;
      } else {
        map[advName].otherAreasObsCount += 1;
      }

      if (obs.estadoObservacion === "Subsanada / Levantada") {
        map[advName].resolvedCount += 1;
      } else {
        map[advName].pendingCount += 1;
      }

      map[advName].totalHours += obs.horasHabiles;
    });

    return Object.values(map).map(a => {
      a.avgHours = a.totalObs > 0 ? Number((a.totalHours / a.totalObs).toFixed(1)) : 0;
      a.errorRate = a.totalOps > 0 ? Math.min(100, Math.round((a.advisorObsCount / a.totalOps) * 100)) : 0;
      return a;
    });
  }, [teamJefeRecords, teamJefeObservations, settings]);

  // Ranking of advisors who make the most mistakes (Ranked list)
  const rankedAdvisorsByMistakes = useMemo(() => {
    return [...advisorMetrics].sort((a, b) => {
      if (b.advisorObsCount !== a.advisorObsCount) return b.advisorObsCount - a.advisorObsCount;
      if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
      return b.totalObs - a.totalObs;
    });
  }, [advisorMetrics]);

  // Sorted & Filtered Advisor Metrics according to user choices
  const sortedAdvisorMetrics = useMemo(() => {
    let list = [...advisorMetrics];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.team.toLowerCase().includes(q) || (a.jefeVentas || "").toLowerCase().includes(q));
    }

    return list.sort((a, b) => {
      let diff = 0;
      if (advisorSortField === "advisorObsCount") {
        // "Que más se equivocan"
        diff = (b.advisorObsCount - a.advisorObsCount) || (b.errorRate - a.errorRate) || (b.totalObs - a.totalObs);
      } else if (advisorSortField === "errorRate") {
        diff = (b.errorRate - a.errorRate) || (b.advisorObsCount - a.advisorObsCount);
      } else if (advisorSortField === "totalObs") {
        diff = (b.totalObs - a.totalObs) || (b.advisorObsCount - a.advisorObsCount);
      } else if (advisorSortField === "totalOps") {
        diff = b.totalOps - a.totalOps;
      } else if (advisorSortField === "avgHours") {
        diff = b.avgHours - a.avgHours;
      }

      return advisorSortDir === "asc" ? -diff : diff;
    });
  }, [advisorMetrics, searchQuery, advisorSortField, advisorSortDir]);

  // Concentrated Teams KPIs (Filtered by Date & Selection)
  const teamMetrics = useMemo(() => {
    const map: { [team: string]: {
      team: string;
      jefeVentas: string;
      advisors: Set<string>;
      totalOps: number;
      advisorObsCount: number;
      otherAreasObsCount: number;
      totalObs: number;
      resolvedCount: number;
      pendingCount: number;
      totalHours: number;
      avgHours: number;
      errorRate: number;
      projects: Set<string>;
    } } = {};

    effectiveRecords.forEach(r => {
      const t = (r.team || "").trim() || "Sin Equipo";
      if (!map[t]) {
        map[t] = {
          team: t,
          jefeVentas: r.jefeVentas || (t.includes("PAULA") ? "Paula Casas" : (t.includes("FRANCISCO") ? "Francisco" : "")),
          advisors: new Set(),
          totalOps: 0,
          advisorObsCount: 0,
          otherAreasObsCount: 0,
          totalObs: 0,
          resolvedCount: 0,
          pendingCount: 0,
          totalHours: 0,
          avgHours: 0,
          errorRate: 0,
          projects: new Set()
        };
      }
      map[t].totalOps += 1;
      if (r.asesor) map[t].advisors.add(r.asesor.trim());
      if (r.proyecto) map[t].projects.add(r.proyecto.trim());
    });

    effectiveObservations.forEach(obs => {
      const t = (obs.equipo || "").trim() || "Sin Equipo";
      if (!map[t]) {
        map[t] = {
          team: t,
          jefeVentas: obs.jefeVentas || "",
          advisors: new Set(),
          totalOps: 0,
          advisorObsCount: 0,
          otherAreasObsCount: 0,
          totalObs: 0,
          resolvedCount: 0,
          pendingCount: 0,
          totalHours: 0,
          avgHours: 0,
          errorRate: 0,
          projects: new Set()
        };
      }

      map[t].totalObs += 1;
      if (obs.afectaAsesor) {
        map[t].advisorObsCount += 1;
      } else {
        map[t].otherAreasObsCount += 1;
      }
      if (obs.estadoObservacion === "Subsanada / Levantada") {
        map[t].resolvedCount += 1;
      } else {
        map[t].pendingCount += 1;
      }
      map[t].totalHours += obs.horasHabiles;
    });

    return Object.values(map).map(t => {
      t.avgHours = t.totalObs > 0 ? Number((t.totalHours / t.totalObs).toFixed(1)) : 0;
      t.errorRate = t.totalOps > 0 ? Math.min(100, Math.round((t.advisorObsCount / t.totalOps) * 100)) : 0;
      return t;
    }).sort((a, b) => b.totalObs - a.totalObs);
  }, [effectiveRecords, effectiveObservations]);

  // Concentrated Projects Summary (Filtered by Date & Selection)
  const projectMetrics = useMemo(() => {
    const map: { [proj: string]: {
      name: string;
      totalOps: number;
      advisorObsCount: number;
      otherAreasObsCount: number;
      totalObs: number;
      resolvedCount: number;
      pendingCount: number;
      totalHours: number;
      avgHours: number;
      errorRate: number;
      advisors: Set<string>;
    } } = {};

    effectiveRecords.forEach(r => {
      const p = (r.proyecto || "").trim() || "Sin Proyecto";
      if (!map[p]) {
        map[p] = {
          name: p,
          totalOps: 0,
          advisorObsCount: 0,
          otherAreasObsCount: 0,
          totalObs: 0,
          resolvedCount: 0,
          pendingCount: 0,
          totalHours: 0,
          avgHours: 0,
          errorRate: 0,
          advisors: new Set()
        };
      }
      map[p].totalOps += 1;
      if (r.asesor) map[p].advisors.add(r.asesor.trim());
    });

    effectiveObservations.forEach(obs => {
      const p = (obs.proyecto || "").trim() || "Sin Proyecto";
      if (!map[p]) {
        map[p] = {
          name: p,
          totalOps: 0,
          advisorObsCount: 0,
          otherAreasObsCount: 0,
          totalObs: 0,
          resolvedCount: 0,
          pendingCount: 0,
          totalHours: 0,
          avgHours: 0,
          errorRate: 0,
          advisors: new Set()
        };
      }

      map[p].totalObs += 1;
      if (obs.afectaAsesor) {
        map[p].advisorObsCount += 1;
      } else {
        map[p].otherAreasObsCount += 1;
      }
      if (obs.estadoObservacion === "Subsanada / Levantada") {
        map[p].resolvedCount += 1;
      } else {
        map[p].pendingCount += 1;
      }
      map[p].totalHours += obs.horasHabiles;
    });

    return Object.values(map).map(p => {
      p.avgHours = p.totalObs > 0 ? Number((p.totalHours / p.totalObs).toFixed(1)) : 0;
      p.errorRate = p.totalOps > 0 ? Math.min(100, Math.round((p.advisorObsCount / p.totalOps) * 100)) : 0;
      return p;
    }).sort((a, b) => b.totalObs - a.totalObs);
  }, [effectiveRecords, effectiveObservations]);

  // Unique Teams list for filter dropdown (always shows all available teams)
  const uniqueTeams = useMemo(() => {
    const set = new Set<string>();
    dateFilteredRecords.forEach(r => {
      const t = (r.team || "").trim();
      if (t) set.add(t);
    });
    dateFilteredObservations.forEach(o => {
      const t = (o.equipo || "").trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [dateFilteredRecords, dateFilteredObservations]);

  // Filtered observations for table preview (incorporates search, area, status)
  const filteredObservations = useMemo(() => {
    return effectiveObservations.filter(item => {
      // Area filter
      if (selectedAreaFilter === "advisor_only" && !item.afectaAsesor) return false;
      if (selectedAreaFilter === "other_areas_only" && item.afectaAsesor) return false;

      // Status filter
      if (selectedStatusFilter === "resolved" && item.estadoObservacion !== "Subsanada / Levantada") return false;
      if (selectedStatusFilter === "pending" && item.estadoObservacion !== "Pendiente / Abierta") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match = 
          item.idOperacion.toLowerCase().includes(q) ||
          item.proyecto.toLowerCase().includes(q) ||
          item.unidad.toLowerCase().includes(q) ||
          item.asesor.toLowerCase().includes(q) ||
          item.motivos.toLowerCase().includes(q) ||
          item.comentario.toLowerCase().includes(q) ||
          item.asistenteLegal.toLowerCase().includes(q) ||
          item.equipo.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [effectiveObservations, selectedAreaFilter, selectedStatusFilter, searchQuery]);

  // Toggle single advisor selection for custom ranking & summary
  const toggleAdvisor = (advName: string) => {
    setSelectedAdvisors(prev => {
      if (prev.includes(advName)) {
        return prev.filter(a => a !== advName);
      } else {
        return [...prev, advName];
      }
    });
  };

  const handleSelectAllVisibleAdvisors = () => {
    const visibleNames = sortedAdvisorMetrics.map(a => a.name);
    const allVisibleSelected = visibleNames.length > 0 && visibleNames.every(name => selectedAdvisors.includes(name));
    if (allVisibleSelected) {
      setSelectedAdvisors(prev => prev.filter(name => !visibleNames.includes(name)));
    } else {
      setSelectedAdvisors(prev => Array.from(new Set([...prev, ...visibleNames])));
    }
  };

  const handleClearAdvisorSelection = () => {
    setSelectedAdvisors([]);
  };

  // Select all advisors of a team and view their ranking
  const handleSelectTeamAdvisors = (teamName: string) => {
    setSelectedTeamFilter(teamName);
    const teamAdvisors = new Set<string>();
    dateFilteredRecords.forEach(r => {
      if ((r.team || "").toUpperCase().includes(teamName.toUpperCase()) && r.asesor) {
        teamAdvisors.add(r.asesor.trim());
      }
    });
    dateFilteredObservations.forEach(o => {
      if ((o.equipo || "").toUpperCase().includes(teamName.toUpperCase()) && o.asesor) {
        teamAdvisors.add(o.asesor.trim());
      }
    });
    setSelectedAdvisors(Array.from(teamAdvisors));
    setActiveTab("asesores");
  };

  // Download entire information for a specific team in Excel
  const handleDownloadTeamExcel = (teamName: string) => {
    setIsExportingExcel(true);
    try {
      const teamObs = dateFilteredObservations.filter(o => (o.equipo || "").toUpperCase().includes(teamName.toUpperCase()));
      const teamRecs = dateFilteredRecords.filter(r => (r.team || "").toUpperCase().includes(teamName.toUpperCase()));
      downloadObservationsExcel(teamRecs, settings, "all", teamObs);
    } catch (err: any) {
      alert("Error al generar el archivo Excel del Team: " + (err.message || err));
    } finally {
      setTimeout(() => setIsExportingExcel(false), 800);
    }
  };

  const legalBossName = settings?.users?.find(u => u.role === "Jefe Legal" && u.active !== false)?.username || "Marilyn Saona";

  // Download entire information for a specific team in PDF
  const handleDownloadTeamPdf = (teamName: string) => {
    setIsExportingPdf(true);
    try {
      const teamObs = dateFilteredObservations.filter(o => (o.equipo || "").toUpperCase().includes(teamName.toUpperCase()));
      const teamRecs = dateFilteredRecords.filter(r => (r.team || "").toUpperCase().includes(teamName.toUpperCase()));
      const doc = generateObservationsReportPdf(teamRecs, settings, {
        areaFilter: selectedAreaFilter,
        generatedBy: legalBossName,
        tabScope: "all",
        dateRangeLabel,
        startDate,
        endDate,
        customObservations: teamObs,
        title: `INFORME OFICIAL: TEAM ${teamName.toUpperCase()}`
      });
      const dateTag = new Date().toISOString().split("T")[0];
      doc.save(`Reporte_Team_${teamName}_${dateTag}.pdf`);
    } catch (err: any) {
      alert("Error al generar el PDF del Team: " + (err.message || err));
    } finally {
      setTimeout(() => setIsExportingPdf(false), 800);
    }
  };

  if (!isOpen) return null;

  // Excel Download handler using effective filtered data
  const handleDownloadExcel = (areaFilter: "all" | "advisor_only" | "other_areas_only") => {
    setIsExportingExcel(true);
    try {
      downloadObservationsExcel(effectiveRecords, settings, areaFilter, effectiveObservations, advisorSortDir);
    } catch (err: any) {
      alert("Error al generar el archivo Excel: " + (err.message || err));
    } finally {
      setTimeout(() => setIsExportingExcel(false), 800);
    }
  };

  // 1. Download PDF of the CURRENT ACTIVE TAB ONLY
  const handleDownloadActiveTabPdf = () => {
    setIsExportingTabPdf(true);
    try {
      const tabTitles: { [key: string]: string } = {
        graficas: "GRÁFICAS & INDICADORES DE KPIS",
        asesores: "RANKING Y DESEMPEÑO DE ASESORES DE VENTAS",
        teams: "OBSERVACIONES POR TEAM DE VENTAS",
        proyectos: "RESUMEN DE OBSERVACIONES POR PROYECTO INMOBILIARIO",
        detalle: "DETALLE DE OBSERVACIONES Y TIEMPOS DE RESPUESTA"
      };

      const doc = generateObservationsReportPdf(effectiveRecords, settings, {
        areaFilter: selectedAreaFilter,
        generatedBy: legalBossName,
        tabScope: activeTab,
        dateRangeLabel,
        startDate,
        endDate,
        customObservations: activeTab === "detalle" ? filteredObservations : effectiveObservations,
        title: `INFORME EJECUTIVO: ${tabTitles[activeTab] || "OBSERVACIONES"}`,
        advisorSortField,
        advisorSortDir
      });

      const dateTag = new Date().toISOString().split("T")[0];
      doc.save(`Reporte_${activeTab.toUpperCase()}_${dateTag}.pdf`);
    } catch (err: any) {
      alert("Error al generar el PDF de la pestaña: " + (err.message || err));
    } finally {
      setTimeout(() => setIsExportingTabPdf(false), 800);
    }
  };

  // 2. Download COMPLETE PDF Report (All tabs consolidated)
  const handleDownloadFullPdf = () => {
    setIsExportingPdf(true);
    try {
      const doc = generateObservationsReportPdf(effectiveRecords, settings, {
        areaFilter: selectedAreaFilter,
        generatedBy: legalBossName,
        tabScope: "all",
        dateRangeLabel,
        startDate,
        endDate,
        customObservations: effectiveObservations,
        advisorSortField,
        advisorSortDir
      });
      const dateTag = new Date().toISOString().split("T")[0];
      doc.save(`Reporte_Completo_Observaciones_Asesores_${dateTag}.pdf`);
    } catch (err: any) {
      alert("Error al generar el informe PDF completo: " + (err.message || err));
    } finally {
      setTimeout(() => setIsExportingPdf(false), 800);
    }
  };

  // 3. Download Selective PDF Report (User-checked sections)
  const handleDownloadSelectedSectionsPdf = () => {
    setIsExportingSelectedPdf(true);
    try {
      const doc = generateObservationsReportPdf(effectiveRecords, settings, {
        areaFilter: selectedAreaFilter,
        generatedBy: legalBossName,
        tabScope: "all",
        includedSections: selectedSections,
        dateRangeLabel,
        startDate,
        endDate,
        customObservations: effectiveObservations,
        advisorSortField,
        advisorSortDir,
        title: "INFORME EJECUTIVO: OBSERVACIONES Y KPIS (SECCIONES SELECCIONADAS)"
      });
      const dateTag = new Date().toISOString().split("T")[0];
      doc.save(`Reporte_Observaciones_Personalizado_${dateTag}.pdf`);
    } catch (err: any) {
      alert("Error al generar el PDF de apartados seleccionados: " + (err.message || err));
    } finally {
      setTimeout(() => setIsExportingSelectedPdf(false), 800);
    }
  };

  // Max counts for visual charts
  const maxTeamObs = Math.max(...teamMetrics.map(t => t.totalObs), 1);
  const maxAdvMistakes = Math.max(...rankedAdvisorsByMistakes.map(a => a.advisorObsCount), 1);

  // Tab dynamic labels
  const tabNames: { [key: string]: string } = {
    graficas: "Gráficas",
    asesores: "Asesores",
    teams: "Teams",
    proyectos: "Proyectos",
    detalle: "Detalle"
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div 
        className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white flex items-start justify-between gap-4 border-b border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-500/40 rounded-2xl shrink-0 text-blue-300">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black tracking-tight text-white">
                  Reporte de Observaciones & KPIs de Asesores
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  {isJefeLegalView ? "Jefe Legal Autorizado" : "Admin Master"}
                </span>
                <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Descarga por Pestaña o General
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                Estadísticas de KPIs con filtro por fechas: <strong>Ranking de Asesores que más se equivocan</strong>, distribución por <strong>Teams</strong> y <strong>Proyectos</strong>, con exportación individual por pestaña en PDF y reporte general completo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* DATE FILTER BAR - Robust Date Filtering with Presets */}
        <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 text-blue-900 font-extrabold shrink-0">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span>Filtro por Fechas:</span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {[
                { id: "all", label: "Todo" },
                { id: "thisMonth", label: "Este Mes" },
                { id: "lastMonth", label: "Mes Anterior" },
                { id: "last30", label: "Últimos 30 días" },
                { id: "thisYear", label: "Año 2026" }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyDatePreset(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    datePreset === p.id 
                      ? "bg-blue-600 text-white shadow-xs" 
                      : "bg-white text-slate-600 hover:bg-blue-100 border border-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Pickers & Reset */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Desde:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleCustomDateChange("start", e.target.value)}
                className="text-xs font-bold text-slate-700 outline-none bg-transparent cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleCustomDateChange("end", e.target.value)}
                className="text-xs font-bold text-slate-700 outline-none bg-transparent cursor-pointer"
              />
            </div>

            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleResetDateFilter}
                className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs transition-all cursor-pointer flex items-center gap-1"
                title="Quitar filtro de fechas"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold hidden sm:inline">Limpiar</span>
              </button>
            )}
          </div>
        </div>

        {/* TEAM & ADVISOR SELECTION FILTER BAR */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Team Filter */}
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-bold text-slate-500 text-[11px]">Team:</span>
              <select
                value={selectedTeamFilter}
                onChange={(e) => setSelectedTeamFilter(e.target.value)}
                className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:bg-white focus:ring-1 focus:ring-brand-primary"
              >
                <option value="ALL">Todos los Teams ({uniqueTeams.length})</option>
                {uniqueTeams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Jefe de Ventas Filter */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-500 text-[11px]">Jefe de Ventas:</span>
              <select
                value={selectedJefeFilter}
                onChange={(e) => setSelectedJefeFilter(e.target.value)}
                className="h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer focus:bg-white focus:ring-1 focus:ring-brand-primary"
              >
                <option value="ALL">Todos los Jefes ({uniqueJefes.length})</option>
                {uniqueJefes.map(j => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
            </div>

            {/* Asesores Multi-selection Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAdvisorSelector(!showAdvisorSelector)}
                className={`h-8 px-3 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedAdvisors.length > 0 
                    ? "bg-blue-50 text-brand-primary border-brand-primary" 
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                }`}
                title="Seleccionar asesores específicos para ranking y resumen"
              >
                <User className="h-3.5 w-3.5 text-brand-primary" />
                <span>Asesores:</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  selectedAdvisors.length > 0 ? "bg-brand-primary text-white" : "bg-slate-200 text-slate-600"
                }`}>
                  {selectedAdvisors.length > 0 ? `${selectedAdvisors.length} selec.` : `Todos (${availableAdvisors.length})`}
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showAdvisorSelector ? "rotate-180" : ""}`} />
              </button>

              {/* Advisor Selector Dropdown Popover */}
              {showAdvisorSelector && (
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-3 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider">
                      Seleccionar Asesores
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdvisorSelector(false)}
                      className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={advisorSearchQuery}
                    onChange={(e) => setAdvisorSearchQuery(e.target.value)}
                    placeholder="Buscar asesor..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                  />

                  <div className="flex items-center justify-between text-[11px] gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedAdvisors(availableAdvisors)}
                      className="text-brand-primary hover:underline font-bold cursor-pointer"
                    >
                      Seleccionar todos
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAdvisorSelection}
                      className="text-slate-500 hover:underline font-bold cursor-pointer"
                    >
                      Limpiar
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-slate-50 pr-1">
                    {availableAdvisors
                      .filter(a => a.toLowerCase().includes(advisorSearchQuery.toLowerCase()))
                      .map(adv => (
                        <label
                          key={adv}
                          className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-slate-50 cursor-pointer select-none text-[11px]"
                        >
                          <input
                            type="checkbox"
                            checked={selectedAdvisors.includes(adv)}
                            onChange={() => toggleAdvisor(adv)}
                            className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary"
                          />
                          <span className="font-semibold text-slate-700 truncate">{adv}</span>
                        </label>
                      ))}
                  </div>

                  {selectedAdvisors.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-bold">
                        {selectedAdvisors.length} seleccionados
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAdvisorSelector(false)}
                        className="px-2.5 py-1 bg-brand-primary text-white rounded-lg text-[10px] font-bold cursor-pointer"
                      >
                        Aplicar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clear All Filters */}
            {(selectedTeamFilter !== "ALL" || selectedJefeFilter !== "ALL" || selectedAdvisors.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTeamFilter("ALL");
                  setSelectedJefeFilter("ALL");
                  setSelectedAdvisors([]);
                }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Restablecer Filtros</span>
              </button>
            )}
          </div>

          {/* If Team filter is active, quick Team Download buttons */}
          {selectedTeamFilter !== "ALL" && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Descargar Team:</span>
              <button
                type="button"
                onClick={() => handleDownloadTeamExcel(selectedTeamFilter)}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title={`Descargar Excel con todas las operaciones y observaciones de los asesores de ${selectedTeamFilter}`}
              >
                <FileSpreadsheet className="h-3 w-3" />
                <span>Excel Team</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadTeamPdf(selectedTeamFilter)}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title={`Descargar PDF con todas las operaciones y observaciones de los asesores de ${selectedTeamFilter}`}
              >
                <FileText className="h-3 w-3" />
                <span>PDF Team</span>
              </button>
            </div>
          )}
        </div>

        {/* 4 Top KPI Cards */}
        <div className="px-5 pt-3.5 pb-2.5 bg-slate-50/70 border-b border-slate-200/80">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Card 1: Total Observaciones */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                Total Observaciones
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black text-slate-900">{stats.total}</span>
                <span className="text-[11px] font-bold text-slate-500">{stats.totalHours} hrs</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {dateRangeLabel}
              </div>
            </div>

            {/* Card 2: Afectan al Asesor */}
            <div className="bg-white p-3.5 rounded-2xl border border-rose-200 shadow-2xs flex flex-col justify-between bg-gradient-to-br from-white to-rose-50/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">
                  Afectan Asesor (Errores)
                </span>
                <span className="text-[9px] font-black bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded-full">
                  Imputable
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black text-rose-700">{stats.advisorCount}</span>
                <span className="text-[11px] font-bold text-rose-600">{stats.totalAdvisorHours} hrs</span>
              </div>
              <div className="text-[10px] text-rose-600/80 font-medium">
                {stats.total > 0 ? ((stats.advisorCount / stats.total) * 100).toFixed(0) : 0}% de todas las obs.
              </div>
            </div>

            {/* Card 3: Otras Áreas */}
            <div className="bg-white p-3.5 rounded-2xl border border-blue-200 shadow-2xs flex flex-col justify-between bg-gradient-to-br from-white to-blue-50/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider block">
                  Otras Áreas
                </span>
                <span className="text-[9px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded-full">
                  No Asesor
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-2xl font-black text-blue-700">{stats.otherAreasCount}</span>
                <span className="text-[11px] font-bold text-blue-600">{stats.totalOtherAreasHours} hrs</span>
              </div>
              <div className="text-[10px] text-blue-600/80 font-medium">
                Bancos, gerencia, finanzas
              </div>
            </div>

            {/* Card 4: Subsanadas vs Pendientes */}
            <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col justify-between bg-gradient-to-br from-white to-emerald-50/40">
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">
                Resolución & SLA
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <div>
                  <span className="text-2xl font-black text-emerald-700">{stats.resolvedCount}</span>
                  <span className="text-xs text-slate-400 font-bold ml-1">/ {stats.pendingCount} pend.</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-600">{stats.avgResolutionHours}h prom</span>
              </div>
              <div className="text-[10px] text-emerald-600/80 font-medium">
                Tiempo promedio de atención
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation & Fast Actions */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-col lg:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto p-1 bg-slate-100/90 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("graficas")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === "graficas" 
                  ? "bg-white text-brand-primary shadow-xs font-black" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Gráficas & Indicadores</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("asesores")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === "asesores" 
                  ? "bg-white text-brand-primary shadow-xs font-black" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>Ranking Asesores ({advisorMetrics.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("teams")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === "teams" 
                  ? "bg-white text-brand-primary shadow-xs font-black" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Por Team ({teamMetrics.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("proyectos")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === "proyectos" 
                  ? "bg-white text-brand-primary shadow-xs font-black" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building className="h-4 w-4" />
              <span>Resumen Proyectos ({projectMetrics.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("detalle")}
              className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === "detalle" 
                  ? "bg-white text-brand-primary shadow-xs font-black" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>Detalle ({filteredObservations.length})</span>
            </button>
          </div>

          {/* Download Buttons: Active Tab PDF vs Full Report PDF vs Excel vs Selective PDF */}
          <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 justify-end flex-wrap">
            {/* Toggle Selective PDF Checkboxes */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSectionSelector(!showSectionSelector)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer border ${
                  showSectionSelector 
                    ? "bg-blue-50 text-brand-primary border-brand-primary" 
                    : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
                title="Seleccionar apartados específicos para incluir en el reporte PDF"
              >
                <Layers className="h-3.5 w-3.5 text-brand-primary" />
                <span>Apartados PDF</span>
                <span className="bg-brand-primary text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                  {Object.values(selectedSections).filter(Boolean).length}/6
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${showSectionSelector ? "rotate-180" : ""}`} />
              </button>

              {/* Dropdown Menu for Checkboxes */}
              {showSectionSelector && (
                <div 
                  className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-3.5 z-50 animate-fadeIn space-y-2.5 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-black text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
                      Apartados para el PDF
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSectionSelector(false)}
                      className="text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Quick Select Buttons */}
                  <div className="flex items-center gap-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedSections({
                        kpis: true, charts: true, advisors: true, teams: true, projects: true, details: true
                      })}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] rounded-md transition-all cursor-pointer"
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSections({
                        kpis: true, charts: false, advisors: true, teams: true, projects: false, details: false
                      })}
                      className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] rounded-md transition-all cursor-pointer"
                    >
                      Solo Ranking
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSections({
                        kpis: false, charts: false, advisors: false, teams: false, projects: false, details: true
                      })}
                      className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[10px] rounded-md transition-all cursor-pointer"
                    >
                      Solo Detalle
                    </button>
                  </div>

                  {/* Section Checkboxes */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {[
                      { key: "kpis", label: "Resumen Ejecutivo (Tarjetas KPI)" },
                      { key: "charts", label: "Gráficas Comparativas (Teams / Origen)" },
                      { key: "advisors", label: "Ranking de Asesores & Jefes de Ventas" },
                      { key: "teams", label: "Resumen por Team de Ventas" },
                      { key: "projects", label: "Resumen por Proyectos Inmobiliarios" },
                      { key: "details", label: "Detalle de Observaciones y Tiempos SLA" },
                    ].map(sec => (
                      <label 
                        key={sec.key}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer select-none text-[11px]"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(selectedSections[sec.key as keyof ObservationsPdfSections])}
                          onChange={(e) => {
                            setSelectedSections(prev => ({
                              ...prev,
                              [sec.key]: e.target.checked
                            }));
                          }}
                          className="h-3.5 w-3.5 text-brand-primary rounded border-slate-300 focus:ring-brand-primary"
                        />
                        <span className="font-semibold text-slate-700">{sec.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Download Selective Button */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isExportingSelectedPdf || !Object.values(selectedSections).some(Boolean)}
                      onClick={() => {
                        setShowSectionSelector(false);
                        handleDownloadSelectedSectionsPdf();
                      }}
                      className="w-full py-2 bg-brand-primary hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{isExportingSelectedPdf ? "Generando..." : "Descargar PDF con Checks"}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 1. Download Current Tab PDF */}
            <button
              type="button"
              disabled={isExportingTabPdf || dateFilteredObservations.length === 0}
              onClick={handleDownloadActiveTabPdf}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              title={`Descargar solo la información de la pestaña actual (${tabNames[activeTab]}) en PDF`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>{isExportingTabPdf ? "Generando..." : `PDF Pestaña (${tabNames[activeTab]})`}</span>
            </button>

            {/* 2. Download Full PDF Report */}
            <button
              type="button"
              disabled={isExportingPdf || dateFilteredObservations.length === 0}
              onClick={handleDownloadFullPdf}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 active:bg-black disabled:opacity-50 text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Descargar informe general completo en PDF (Todas las pestañas consolidadas)"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExportingPdf ? "Generando..." : "PDF General"}</span>
            </button>

            {/* 3. Download Excel */}
            <button
              type="button"
              disabled={isExportingExcel || dateFilteredObservations.length === 0}
              onClick={() => handleDownloadExcel("all")}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Descargar archivo Excel (.xlsx) con todas las columnas y filtros habilitados para tablas dinámicas"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{isExportingExcel ? "Excel..." : "Descargar Excel para Filtrar"}</span>
            </button>
          </div>
        </div>

        {/* SECTION CHECKLIST BAR: Marcar con un check los apartados a descargar en PDF */}
        <div className="px-5 py-2.5 bg-blue-50/50 border-b border-blue-150/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0">
              <Layers className="h-4 w-4 text-brand-primary" />
              <span>Apartados PDF:</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: "kpis", label: "Resumen / KPIs" },
                { key: "charts", label: "Gráficas" },
                { key: "advisors", label: "Ranking Asesores & Jefes" },
                { key: "teams", label: "Teams" },
                { key: "projects", label: "Proyectos" },
                { key: "details", label: "Detalle SLA" },
              ].map(sec => (
                <label 
                  key={sec.key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all select-none ${
                    selectedSections[sec.key as keyof ObservationsPdfSections]
                      ? "bg-white text-brand-primary border-blue-300 shadow-2xs"
                      : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selectedSections[sec.key as keyof ObservationsPdfSections])}
                    onChange={(e) => {
                      setSelectedSections(prev => ({
                        ...prev,
                        [sec.key]: e.target.checked
                      }));
                    }}
                    className="h-3.5 w-3.5 text-brand-primary rounded border-slate-300 focus:ring-brand-primary cursor-pointer"
                  />
                  <span>{sec.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExportingSelectedPdf || !Object.values(selectedSections).some(Boolean)}
              onClick={handleDownloadSelectedSectionsPdf}
              className="px-3.5 py-1.5 bg-brand-primary hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl font-black text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Descargar reporte PDF conteniendo únicamente los apartados marcados con check"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isExportingSelectedPdf ? "Generando..." : "Descargar PDF con Checks"}</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 bg-slate-50/50 flex-1">
          
          {/* TAB 1: GRÁFICAS Y ESTADÍSTICAS KPIS */}
          {activeTab === "graficas" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Row 1: Observaciones por Team & Top Asesores */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                
                {/* Gráfica 1: Por Team (Afecta Asesor vs Otras Áreas) */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                          Observaciones por Team de Ventas
                        </h4>
                        <p className="text-[11px] text-slate-500">Afectación asesor vs otras áreas</p>
                      </div>
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-3 text-[10px] font-bold">
                      <span className="flex items-center gap-1 text-rose-600">
                        <span className="h-2 w-2 rounded-full bg-rose-500 inline-block"></span>
                        Asesor
                      </span>
                      <span className="flex items-center gap-1 text-blue-600">
                        <span className="h-2 w-2 rounded-full bg-blue-500 inline-block"></span>
                        Otras Áreas
                      </span>
                    </div>
                  </div>

                  {/* Bars list */}
                  <div className="space-y-3 pt-1">
                    {teamMetrics.map(t => {
                      const barWidth = maxTeamObs > 0 ? (t.totalObs / maxTeamObs) * 100 : 0;

                      return (
                        <div key={t.team} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-extrabold text-slate-800 truncate max-w-[200px]">
                              {t.team}
                              <span className="text-[10px] font-normal text-slate-400 ml-1.5">
                                ({t.advisors.size} as. • {t.totalOps} ops)
                              </span>
                            </span>
                            <span className="font-black text-slate-700 font-mono text-[11px]">
                              {t.totalObs} obs
                              <span className="text-slate-400 font-normal ml-1">
                                [SLA: {t.avgHours}h]
                              </span>
                            </span>
                          </div>

                          {/* Stacked Progress Bar */}
                          <div className="w-full h-4 bg-slate-100 rounded-lg overflow-hidden flex shadow-inner">
                            {t.advisorObsCount > 0 && (
                              <div 
                                style={{ width: `${(t.advisorObsCount / maxTeamObs) * 100}%` }}
                                className="bg-rose-500 h-full flex items-center justify-center text-[9px] font-black text-white px-1 truncate"
                                title={`Asesor: ${t.advisorObsCount} obs`}
                              >
                                {t.advisorObsCount}
                              </div>
                            )}
                            {t.otherAreasObsCount > 0 && (
                              <div 
                                style={{ width: `${(t.otherAreasObsCount / maxTeamObs) * 100}%` }}
                                className="bg-blue-500 h-full flex items-center justify-center text-[9px] font-black text-white px-1 truncate"
                                title={`Otras Áreas: ${t.otherAreasObsCount} obs`}
                              >
                                {t.otherAreasObsCount}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gráfica 2: Ranking Asesores que más se equivocan */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-rose-50 text-rose-700 rounded-xl">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                          Ranking de Asesores que más se Equivocan
                        </h4>
                        <p className="text-[11px] text-slate-500">Ordenado por observaciones que afectan al asesor</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                      Top Críticos
                    </span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {rankedAdvisorsByMistakes.slice(0, 6).map((adv, idx) => {
                      const barW = maxAdvMistakes > 0 ? (adv.advisorObsCount / maxAdvMistakes) * 100 : 0;
                      const isCritical = adv.advisorObsCount >= 2;
                      const isAttention = adv.advisorObsCount === 1;

                      return (
                        <div key={adv.name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-md ${
                                idx === 0 
                                  ? "bg-rose-600 text-white" 
                                  : (idx === 1 ? "bg-orange-500 text-white" : (idx === 2 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-700"))
                              }`}>
                                #{idx + 1}
                              </span>
                              <span className="font-extrabold text-slate-800 truncate max-w-[160px]">{adv.name}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500">
                                {adv.team}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
                                isCritical 
                                  ? "bg-rose-100 text-rose-800" 
                                  : (isAttention ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")
                              }`}>
                                {adv.errorRate}% error
                              </span>
                              <span className="font-black text-rose-700 font-mono text-[11px]">
                                {adv.advisorObsCount} err.
                              </span>
                            </div>
                          </div>

                          {/* Progress track */}
                          <div className="w-full h-3.5 bg-slate-100 rounded-lg overflow-hidden flex">
                            <div 
                              style={{ width: `${barW}%` }}
                              className={`h-full rounded-lg transition-all ${
                                isCritical ? "bg-rose-600" : (isAttention ? "bg-amber-500" : "bg-blue-600")
                              }`}
                            />
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                            <span>{adv.totalOps} expedientes • {adv.otherAreasObsCount} otras áreas ({adv.totalObs} tot)</span>
                            <span>SLA Promedio: <strong className="text-emerald-700">{adv.avgHours}h</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Row 2: Distribución por Proyecto */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                      <Building className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
                        Resumen de Observaciones por Proyecto Inmobiliario
                      </h4>
                      <p className="text-[11px] text-slate-500">Volumen operacional, desglose asesor vs otras áreas y SLA</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("proyectos")}
                    className="text-xs font-bold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ver todos los proyectos</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {projectMetrics.slice(0, 6).map(proj => (
                    <div key={proj.name} className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-extrabold text-xs text-slate-900 truncate">
                          {proj.name}
                        </span>
                        <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-md shrink-0">
                          {proj.totalObs} obs
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Operaciones: <strong>{proj.totalOps}</strong></span>
                        <span>SLA: <strong className="text-emerald-700">{proj.avgHours}h</strong></span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded font-bold">
                          {proj.advisorObsCount} Asesor
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold">
                          {proj.otherAreasObsCount} Otras áreas
                        </span>
                        <span className="text-slate-400 ml-auto">
                          {proj.resolvedCount} subs.
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: CONCENTRADO ASESORES DE VENTAS & RANKING */}
          {activeTab === "asesores" && (
            <div className="space-y-4 animate-fadeIn">
              {/* Filter bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200">
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar asesor de ventas..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-brand-primary/20"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
                  {/* Sort selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Ordenar por:</span>
                    <select
                      value={advisorSortField}
                      onChange={(e) => setAdvisorSortField(e.target.value as any)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="advisorObsCount">Ranking: Que más se equivocan</option>
                      <option value="errorRate">Mayor % de Error</option>
                      <option value="totalObs">Total Observaciones</option>
                      <option value="totalOps">Total Operaciones</option>
                      <option value="avgHours">Tiempo de Respuesta SLA</option>
                    </select>
                  </div>

                  {/* Sort direction selector (Ascendente / Descendente) - Imagen 4 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Dirección:</span>
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setAdvisorSortDir("desc")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                          advisorSortDir === "desc"
                            ? "bg-brand-primary text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Generar reporte en orden Descendente (de mayor a menor)"
                      >
                        <ArrowDown className="h-3 w-3" />
                        <span>Descendente</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvisorSortDir("asc")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition-all cursor-pointer ${
                          advisorSortDir === "asc"
                            ? "bg-brand-primary text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                        title="Generar reporte en orden Ascendente (de menor a mayor)"
                      >
                        <ArrowUp className="h-3 w-3" />
                        <span>Ascendente</span>
                      </button>
                    </div>
                  </div>

                  {/* Team Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Team:</span>
                    <select
                      value={selectedTeamFilter}
                      onChange={(e) => setSelectedTeamFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer"
                    >
                      <option value="ALL">Todos los Teams ({uniqueTeams.length})</option>
                      {uniqueTeams.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Selected Advisors Action Bar */}
              {selectedAdvisors.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-2xs animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-brand-primary shrink-0" />
                    <div>
                      <span className="font-extrabold text-blue-950">
                        {selectedAdvisors.length} asesor(es) seleccionado(s)
                      </span>
                      <span className="text-[11px] text-blue-700 ml-1.5 hidden md:inline">
                        (Métricas, KPIs y rankings calculados exclusivamente para este grupo)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleDownloadExcel("all")}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      title="Descargar Excel solo de los asesores seleccionados"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      <span>Excel Seleccionados</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadActiveTabPdf}
                      className="px-3 py-1.5 bg-brand-primary hover:bg-blue-800 text-white rounded-xl font-bold text-[11px] flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                      title="Descargar PDF solo de los asesores seleccionados"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>PDF Seleccionados</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAdvisorSelection}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl font-bold text-[11px] cursor-pointer transition-colors"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}

              {/* Table of Advisors */}
              <div className="overflow-x-auto border border-slate-200/90 rounded-2xl bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={sortedAdvisorMetrics.length > 0 && sortedAdvisorMetrics.every(a => selectedAdvisors.includes(a.name))}
                          onChange={handleSelectAllVisibleAdvisors}
                          className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary cursor-pointer h-4 w-4"
                          title="Seleccionar / deseleccionar todos los asesores visibles"
                        />
                      </th>
                      <th className="p-3 text-center w-12">#</th>
                      <th className="p-3">ASESOR DE VENTAS</th>
                      <th className="p-3">TEAM</th>
                      <th className="p-3">JEFE DE VENTAS</th>
                      <th className="p-3 text-center">OPERACIONES</th>
                      <th className="p-3 text-center bg-rose-50/60 text-rose-800">ERRORES ASESOR</th>
                      <th className="p-3 text-center">% ERROR</th>
                      <th className="p-3 text-center">OTRAS ÁREAS</th>
                      <th className="p-3 text-center">TOTAL OBS</th>
                      <th className="p-3 text-center">TIEMPO RESPUESTA (SLA)</th>
                      <th className="p-3 text-center">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedAdvisorMetrics.map((adv, idx) => {
                      const isCritical = adv.advisorObsCount >= 2;
                      const isAttention = adv.advisorObsCount === 1;
                      const isSelected = selectedAdvisors.includes(adv.name);

                      return (
                        <tr 
                          key={adv.name} 
                          onClick={() => toggleAdvisor(adv.name)}
                          className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${
                            isSelected ? "bg-blue-50/80 font-semibold" : ""
                          }`}
                        >
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleAdvisor(adv.name)}
                              className="rounded border-slate-300 text-brand-primary focus:ring-brand-primary cursor-pointer h-4 w-4"
                              title={`Seleccionar ${adv.name}`}
                            />
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block font-black text-[10px] px-2 py-0.5 rounded-md ${
                              idx === 0 
                                ? "bg-rose-600 text-white" 
                                : (idx === 1 ? "bg-orange-500 text-white" : (idx === 2 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"))
                            }`}>
                              #{idx + 1}
                            </span>
                          </td>
                          <td className="p-3 font-extrabold text-slate-900 whitespace-nowrap">
                            {adv.name}
                          </td>
                          <td className="p-3 font-bold text-slate-600 whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg text-[10px]">
                              {adv.team}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-blue-900 whitespace-nowrap">
                            <span className="bg-blue-50 text-blue-800 border border-blue-100 px-2 py-0.5 rounded-lg text-[10px] font-mono">
                              {adv.jefeVentas || "Sin Asignar"}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-700">
                            {adv.totalOps}
                          </td>
                          <td className="p-3 text-center bg-rose-50/40">
                            <span className={`font-black px-2 py-0.5 rounded-md text-[11px] ${
                              adv.advisorObsCount > 0 ? "bg-rose-100 text-rose-800" : "text-slate-400"
                            }`}>
                              {adv.advisorObsCount}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`font-black text-[10px] px-2 py-0.5 rounded-full ${
                              isCritical 
                                ? "bg-rose-100 text-rose-800" 
                                : (isAttention ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800")
                            }`}>
                              {adv.errorRate}%
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-blue-700">
                            {adv.otherAreasObsCount}
                          </td>
                          <td className="p-3 text-center font-black text-slate-900 font-mono">
                            {adv.totalObs}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">
                            {adv.avgHours} hrs
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span className="text-[10px] font-bold text-slate-600">
                              {adv.resolvedCount} subs. / {adv.pendingCount} pend.
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: POR TEAM DE VENTAS */}
          {activeTab === "teams" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
              {teamMetrics.map((t) => (
                <div key={t.team} className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-black text-sm text-slate-900">{t.team}</h4>
                      <p className="text-xs text-slate-500">Jefatura: {t.jefeVentas || "No asignado"}</p>
                    </div>
                    <span className="font-mono text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl">
                      {t.totalObs} observaciones
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-50 rounded-xl">
                      <span className="text-[10px] font-bold text-slate-400 block uppercase">Asesores</span>
                      <span className="text-base font-black text-slate-800">{t.advisors.size}</span>
                    </div>
                    <div className="p-2 bg-rose-50/60 rounded-xl">
                      <span className="text-[10px] font-bold text-rose-500 block uppercase">Obs Asesor</span>
                      <span className="text-base font-black text-rose-700">{t.advisorObsCount}</span>
                    </div>
                    <div className="p-2 bg-blue-50/60 rounded-xl">
                      <span className="text-[10px] font-bold text-blue-500 block uppercase">Otras Áreas</span>
                      <span className="text-base font-black text-blue-700">{t.otherAreasObsCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                    <span>Operaciones: <strong>{t.totalOps}</strong></span>
                    <span>Incidencia: <strong className="text-rose-600">{t.errorRate}%</strong></span>
                    <span>Tiempo SLA: <strong className="text-emerald-700">{t.avgHours}h hábiles</strong></span>
                  </div>

                  <div className="text-[10px] text-slate-400 truncate">
                    Proyectos: {Array.from(t.projects).join(", ") || "-"}
                  </div>

                  {/* Team Actions: Download team info & Select Advisors */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSelectTeamAdvisors(t.team)}
                      className="text-[11px] font-bold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <User className="h-3.5 w-3.5" />
                      <span>Ver {t.advisors.size} Asesores</span>
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadTeamExcel(t.team)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title={`Descargar Excel con todas las operaciones y observaciones de los asesores del ${t.team}`}
                      >
                        <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                        <span>Excel Team</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadTeamPdf(t.team)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title={`Descargar PDF con todas las operaciones y observaciones de los asesores del ${t.team}`}
                      >
                        <FileText className="h-3 w-3 text-slate-600" />
                        <span>PDF Team</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: RESUMEN DE PROYECTOS */}
          {activeTab === "proyectos" && (
            <div className="space-y-4 animate-fadeIn">
              <div className="overflow-x-auto border border-slate-200/90 rounded-2xl bg-white shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-3">PROYECTO</th>
                      <th className="p-3 text-center">OPERACIONES</th>
                      <th className="p-3 text-center">OBS. TOTALES</th>
                      <th className="p-3 text-center text-rose-700">AFECTAN ASESOR</th>
                      <th className="p-3 text-center text-blue-700">OTRAS ÁREAS</th>
                      <th className="p-3 text-center">TIEMPO RESPUESTA PROM.</th>
                      <th className="p-3 text-center">SUBSANADAS</th>
                      <th className="p-3 text-center">PENDIENTES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectMetrics.map((p) => (
                      <tr key={p.name} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-extrabold text-slate-900 whitespace-nowrap">
                          {p.name}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700">
                          {p.totalOps}
                        </td>
                        <td className="p-3 text-center font-black text-slate-900 font-mono">
                          {p.totalObs}
                        </td>
                        <td className="p-3 text-center font-bold text-rose-600">
                          {p.advisorObsCount}
                        </td>
                        <td className="p-3 text-center font-bold text-blue-600">
                          {p.otherAreasObsCount}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700">
                          {p.avgHours} hrs
                        </td>
                        <td className="p-3 text-center font-bold text-emerald-600">
                          {p.resolvedCount}
                        </td>
                        <td className="p-3 text-center font-bold text-amber-600">
                          {p.pendingCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: LISTADO DETALLADO DE OBSERVACIONES */}
          {activeTab === "detalle" && (
            <div className="space-y-4 animate-fadeIn">
              {/* Filters */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por proyecto, unidad, asesor, motivo..."
                      className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-brand-primary/20"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Area Tabs */}
                  <div className="flex bg-slate-100 p-1 rounded-xl gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedAreaFilter("all")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        selectedAreaFilter === "all" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500"
                      }`}
                    >
                      Todas ({dateFilteredObservations.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAreaFilter("advisor_only")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        selectedAreaFilter === "advisor_only" ? "bg-rose-500 text-white shadow-2xs" : "text-slate-500"
                      }`}
                    >
                      Asesor ({stats.advisorCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAreaFilter("other_areas_only")}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        selectedAreaFilter === "other_areas_only" ? "bg-blue-600 text-white shadow-2xs" : "text-slate-500"
                      }`}
                    >
                      Otras Áreas ({stats.otherAreasCount})
                    </button>
                  </div>
                </div>

                {/* Table Preview */}
                <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white max-h-[380px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                        <th className="p-3">FECHA OBS.</th>
                        <th className="p-3">PROYECTO & UNIDAD</th>
                        <th className="p-3">ASESOR & TEAM</th>
                        <th className="p-3">ÁREA / AFECTA</th>
                        <th className="p-3">MOTIVOS</th>
                        <th className="p-3">ESTADO</th>
                        <th className="p-3 text-right">TIEMPO HÁBIL (SLA)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredObservations.slice(0, 50).map((item, idx) => (
                        <tr key={`${item.idOperacion}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {item.fechaObservacion.split(" ")[0]}
                            <span className="text-slate-400 block text-[9px]">{item.fechaObservacion.split(" ")[1]}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 block">{item.proyecto}</span>
                            <span className="text-[10px] text-brand-primary font-mono">{item.unidad}</span>
                          </td>
                          <td className="p-3 font-medium text-slate-700 whitespace-nowrap">
                            {item.asesor}
                            <span className="text-[10px] text-slate-400 block">{item.equipo || "-"}</span>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              item.afectaAsesor
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}>
                              {item.areaOrigen} ({item.afectaAsesor ? "SÍ" : "NO"})
                            </span>
                          </td>
                          <td className="p-3 max-w-xs">
                            <p className="text-[11px] text-slate-700 font-semibold truncate" title={item.motivos}>
                              {item.motivos}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate" title={item.comentario}>
                              {item.comentario}
                            </p>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              item.estadoObservacion === "Subsanada / Levantada"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-800 border border-amber-200"
                            }`}>
                              {item.estadoObservacion === "Subsanada / Levantada" ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Clock className="h-3 w-3 text-amber-600" />
                              )}
                              <span>{item.estadoObservacion === "Subsanada / Levantada" ? "Subsanada" : "Pendiente"}</span>
                            </span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <span className="font-mono font-bold text-slate-800 block text-[11px]">
                              {item.horasHabiles} hrs
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {item.tiempoDetallado}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {filteredObservations.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                            No se encontraron observaciones con los filtros seleccionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-sm">verified</span>
            <span>SLA hábil ({settings.workingSchedule?.startHour || 9}:00 - {settings.workingSchedule?.endHour || 18}:00) con feriados del calendario oficial.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
            >
              Cerrar
            </button>

            {/* Quick Button for Current Tab */}
            <button
              type="button"
              disabled={isExportingTabPdf || dateFilteredObservations.length === 0}
              onClick={handleDownloadActiveTabPdf}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileText className="h-4 w-4" />
              <span>{isExportingTabPdf ? "Generando..." : `Descargar PDF (${tabNames[activeTab]})`}</span>
            </button>

            {/* Complete Report */}
            <button
              type="button"
              disabled={isExportingPdf || dateFilteredObservations.length === 0}
              onClick={handleDownloadFullPdf}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              <span>{isExportingPdf ? "Generando..." : "PDF Completo"}</span>
            </button>

            {/* Excel */}
            <button
              type="button"
              disabled={isExportingExcel || dateFilteredObservations.length === 0}
              onClick={() => handleDownloadExcel("all")}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>{isExportingExcel ? "Excel..." : "Excel (5 Hojas)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
