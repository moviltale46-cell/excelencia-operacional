import { jsPDF } from "jspdf";
import { AppSettings, OperationRecord } from "../types";
import { extractAllObservations, ObservationExportItem } from "./exportObservations";
import { resolveJefeVentasForAdvisor } from "./dateUtils";

export interface ObservationsPdfSections {
  kpis?: boolean; // Resumen Ejecutivo y Métricas Globales
  charts?: boolean; // Gráficas Ejecutivas y Comparativas
  advisors?: boolean; // Ranking de Asesores de Ventas
  teams?: boolean; // Resumen por Team y Jefes de Ventas
  projects?: boolean; // Resumen por Proyectos Inmobiliarios
  errorCatalog?: boolean; // Catálogo y Lista de Errores
  details?: boolean; // Detalle de Observaciones y Tiempos SLA
}

export interface ObservationsPdfOptions {
  areaFilter?: "all" | "advisor_only" | "other_areas_only";
  generatedBy?: string;
  title?: string;
  tabScope?: "all" | "graficas" | "asesores" | "teams" | "proyectos" | "detalle" | "catalogo_errores";
  dateRangeLabel?: string;
  startDate?: string;
  endDate?: string;
  jefeName?: string;
  jefeFilterMode?: "team" | "project";
  customObservations?: ObservationExportItem[];
  customRecords?: OperationRecord[];
  advisorSortField?: "totalObs" | "errorRate" | "totalOps" | "avgHours" | "advisorObsCount";
  advisorSortDir?: "asc" | "desc";
  includedSections?: ObservationsPdfSections;
}

export function generateObservationsReportPdf(
  records: OperationRecord[],
  settings?: AppSettings,
  options: ObservationsPdfOptions = {}
): jsPDF {
  const { 
    areaFilter = "all", 
    generatedBy = "Marilyn Saona",
    title,
    tabScope = "all",
    dateRangeLabel,
    customObservations,
    advisorSortField = "advisorObsCount",
    advisorSortDir = "desc"
  } = options;

  const cleanGeneratedBy = (generatedBy || "Marilyn Saona")
    .replace(/\s*\([^)]*jefe[^)]*\)/gi, "")
    .replace(/\s*\([^)]*legal[^)]*\)/gi, "")
    .replace(/Jefatura\s+Legal/gi, "Marilyn Saona")
    .replace(/Jefe\s+Legal/gi, "Marilyn Saona")
    .replace(/Administración\s+General/gi, "Marilyn Saona")
    .trim() || "Marilyn Saona";

  // 1. Extract or use custom observations
  const rawObservations = customObservations || extractAllObservations(records, settings);
  
  // Filter according to area filter
  const observations = rawObservations.filter(obs => {
    if (areaFilter === "advisor_only" && !obs.afectaAsesor) return false;
    if (areaFilter === "other_areas_only" && obs.afectaAsesor) return false;
    return true;
  });

  // 2. Global KPIs with Advisor Response Time & Legal Time
  const totalObs = observations.length;
  const advisorObs = observations.filter(o => o.afectaAsesor);
  const otherAreasObs = observations.filter(o => !o.afectaAsesor);
  const resolvedObs = observations.filter(o => o.estadoObservacion === "Subsanada / Levantada");
  const pendingObs = observations.filter(o => o.estadoObservacion === "Pendiente / Abierta");

  const totalAdvisorHours = advisorObs.reduce((acc, curr) => acc + (curr.horasRespuestaAsesor || curr.horasAsesor || 0), 0);
  const totalOtherAreasHours = otherAreasObs.reduce((acc, curr) => acc + curr.horasOtrasAreas, 0);
  const totalLegalHours = observations.reduce((acc, curr) => acc + (curr.horasLegal || 0), 0);
  const totalHours = observations.reduce((acc, curr) => acc + curr.horasHabiles, 0);

  const avgResolutionHours = resolvedObs.length > 0 
    ? Number((resolvedObs.reduce((acc, curr) => acc + curr.horasHabiles, 0) / resolvedObs.length).toFixed(1))
    : (totalObs > 0 ? Number((totalHours / totalObs).toFixed(1)) : 0);

  const resolvedAdvisorObs = advisorObs.filter(o => o.estadoObservacion === "Subsanada / Levantada");
  const avgAdvisorResponseHours = resolvedAdvisorObs.length > 0 
    ? Number((resolvedAdvisorObs.reduce((acc, curr) => acc + (curr.horasRespuestaAsesor || curr.horasAsesor || 0), 0) / resolvedAdvisorObs.length).toFixed(1))
    : (advisorObs.length > 0 ? Number((totalAdvisorHours / advisorObs.length).toFixed(1)) : 0);

  const avgLegalHours = totalObs > 0 
    ? Number((totalLegalHours / totalObs).toFixed(1)) 
    : 0;

  // 3. Aggregate by Sales Advisor (Concentrated sales advisors info)
  const advisorMap: { [name: string]: {
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
    totalAdvisorResponseHours: number;
    avgAdvisorHours: number;
    totalLegalHours: number;
    avgLegalHours: number;
    errorRate: number;
  } } = {};

  records.forEach(r => {
    let advName = (r.asesor || "").trim() || "Sin Asesor Asignado";
    if (advName === "ASE000010") advName = "DERVIS PIÑA";
    if (advName === "ASE000028") advName = "PAULA CASAS";
    const teamName = (r.team || "").trim() || "Sin Equipo";
    const jv = resolveJefeVentasForAdvisor(advName, r.proyecto, teamName, r, settings);

    if (!advisorMap[advName]) {
      advisorMap[advName] = {
        name: advName,
        team: teamName,
        jefeVentas: jv,
        totalOps: 0,
        advisorObsCount: 0,
        otherAreasObsCount: 0,
        totalObs: 0,
        resolvedCount: 0,
        pendingCount: 0,
        totalHours: 0,
        avgHours: 0,
        totalAdvisorResponseHours: 0,
        avgAdvisorHours: 0,
        totalLegalHours: 0,
        avgLegalHours: 0,
        errorRate: 0
      };
    }
    advisorMap[advName].totalOps += 1;
    if (advisorMap[advName].team === "Sin Equipo" && teamName !== "Sin Equipo") {
      advisorMap[advName].team = teamName;
    }
    if ((!advisorMap[advName].jefeVentas || advisorMap[advName].jefeVentas === "Sin Asignar") && jv && jv !== "Sin Asignar") {
      advisorMap[advName].jefeVentas = jv;
    }
  });

  observations.forEach(obs => {
    let advName = (obs.asesor || "").trim() || "Sin Asesor Asignado";
    if (advName === "ASE000010") advName = "DERVIS PIÑA";
    if (advName === "ASE000028") advName = "PAULA CASAS";
    const teamName = obs.equipo || "Sin Equipo";
    const jv = obs.jefeVentas || resolveJefeVentasForAdvisor(advName, obs.proyecto, teamName, undefined, settings);

    if (!advisorMap[advName]) {
      advisorMap[advName] = {
        name: advName,
        team: teamName,
        jefeVentas: jv,
        totalOps: 0,
        advisorObsCount: 0,
        otherAreasObsCount: 0,
        totalObs: 0,
        resolvedCount: 0,
        pendingCount: 0,
        totalHours: 0,
        avgHours: 0,
        totalAdvisorResponseHours: 0,
        avgAdvisorHours: 0,
        totalLegalHours: 0,
        avgLegalHours: 0,
        errorRate: 0
      };
    }

    advisorMap[advName].totalObs += 1;
    if (obs.afectaAsesor) {
      advisorMap[advName].advisorObsCount += 1;
    } else {
      advisorMap[advName].otherAreasObsCount += 1;
    }

    if (obs.estadoObservacion === "Subsanada / Levantada") {
      advisorMap[advName].resolvedCount += 1;
    } else {
      advisorMap[advName].pendingCount += 1;
    }

    advisorMap[advName].totalHours += obs.horasHabiles;
    advisorMap[advName].totalAdvisorResponseHours += (obs.horasRespuestaAsesor || obs.horasAsesor || 0);
    advisorMap[advName].totalLegalHours += (obs.horasLegal || 0);
  });

  // Sort advisors - default by "que más se equivocan" (advisorObsCount desc, errorRate desc, totalObs desc)
  const advisorList = Object.values(advisorMap).map(adv => {
    adv.avgHours = adv.totalObs > 0 ? Number((adv.totalHours / adv.totalObs).toFixed(1)) : 0;
    adv.avgAdvisorHours = adv.resolvedCount > 0 
      ? Number((adv.totalAdvisorResponseHours / adv.resolvedCount).toFixed(1)) 
      : (adv.advisorObsCount > 0 ? Number((adv.totalAdvisorResponseHours / adv.advisorObsCount).toFixed(1)) : 0);
    adv.avgLegalHours = adv.totalObs > 0 ? Number((adv.totalLegalHours / adv.totalObs).toFixed(1)) : 0;
    adv.errorRate = adv.totalOps > 0 ? Math.min(100, Math.round((adv.advisorObsCount / adv.totalOps) * 100)) : 0;
    return adv;
  }).sort((a, b) => {
    if (advisorSortField === "advisorObsCount") {
      const diff = (b.advisorObsCount - a.advisorObsCount) || (b.errorRate - a.errorRate) || (b.totalObs - a.totalObs);
      return advisorSortDir === "asc" ? -diff : diff;
    } else if (advisorSortField === "errorRate") {
      const diff = (b.errorRate - a.errorRate) || (b.advisorObsCount - a.advisorObsCount);
      return advisorSortDir === "asc" ? -diff : diff;
    } else if (advisorSortField === "totalObs") {
      const diff = (b.totalObs - a.totalObs) || (b.advisorObsCount - a.advisorObsCount);
      return advisorSortDir === "asc" ? -diff : diff;
    } else if (advisorSortField === "totalOps") {
      const diff = b.totalOps - a.totalOps;
      return advisorSortDir === "asc" ? -diff : diff;
    } else if (advisorSortField === "avgHours") {
      const diff = b.avgHours - a.avgHours;
      return advisorSortDir === "asc" ? -diff : diff;
    }
    return b.advisorObsCount - a.advisorObsCount;
  });

  // Ranking specifically ordered by "quienes más se equivocan" for top charts & indicators
  const advisorsRankedByMistakes = [...advisorList].sort((a, b) => {
    if (b.advisorObsCount !== a.advisorObsCount) return b.advisorObsCount - a.advisorObsCount;
    if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
    return b.totalObs - a.totalObs;
  });

  // 4. Error Catalog (Motivos de Error, Frecuencia y Tiempos de Respuesta)
  const errorMap: { [reason: string]: {
    reason: string;
    count: number;
    advisors: Set<string>;
    jefes: Set<string>;
    totalAdvisorHours: number;
    totalLegalHours: number;
    resolvedCount: number;
    pendingCount: number;
  } } = {};

  observations.forEach(obs => {
    const rawMotivos = obs.motivos ? obs.motivos.split(";").map(s => s.trim()).filter(Boolean) : ["Observación General"];
    rawMotivos.forEach(m => {
      if (!errorMap[m]) {
        errorMap[m] = {
          reason: m,
          count: 0,
          advisors: new Set(),
          jefes: new Set(),
          totalAdvisorHours: 0,
          totalLegalHours: 0,
          resolvedCount: 0,
          pendingCount: 0
        };
      }
      errorMap[m].count += 1;
      if (obs.asesor) errorMap[m].advisors.add(obs.asesor);
      if (obs.jefeVentas) errorMap[m].jefes.add(obs.jefeVentas);
      errorMap[m].totalAdvisorHours += (obs.horasRespuestaAsesor || obs.horasAsesor || 0);
      errorMap[m].totalLegalHours += (obs.horasLegal || 0);
      if (obs.estadoObservacion === "Subsanada / Levantada") {
        errorMap[m].resolvedCount += 1;
      } else {
        errorMap[m].pendingCount += 1;
      }
    });
  });

  const totalErrorsCount = Object.values(errorMap).reduce((acc, curr) => acc + curr.count, 0) || 1;
  const errorCatalogList = Object.values(errorMap).map(e => ({
    ...e,
    percentage: Number(((e.count / totalErrorsCount) * 100).toFixed(1)),
    avgAdvisorHours: e.count > 0 ? Number((e.totalAdvisorHours / e.count).toFixed(1)) : 0,
    avgLegalHours: e.count > 0 ? Number((e.totalLegalHours / e.count).toFixed(1)) : 0
  })).sort((a, b) => b.count - a.count);

  // 4. Aggregate by Team (Concentrated team info)
  const teamMap: { [team: string]: {
    team: string;
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
  } } = {};

  records.forEach(r => {
    const t = (r.team || "").trim() || "Sin Equipo";
    if (!teamMap[t]) {
      teamMap[t] = {
        team: t,
        advisors: new Set(),
        totalOps: 0,
        advisorObsCount: 0,
        otherAreasObsCount: 0,
        totalObs: 0,
        resolvedCount: 0,
        pendingCount: 0,
        totalHours: 0,
        avgHours: 0,
        errorRate: 0
      };
    }
    teamMap[t].totalOps += 1;
    if (r.asesor) teamMap[t].advisors.add(r.asesor.trim());
  });

  observations.forEach(obs => {
    const t = (obs.equipo || "").trim() || "Sin Equipo";
    if (!teamMap[t]) {
      teamMap[t] = {
        team: t,
        advisors: new Set(),
        totalOps: 0,
        advisorObsCount: 0,
        otherAreasObsCount: 0,
        totalObs: 0,
        resolvedCount: 0,
        pendingCount: 0,
        totalHours: 0,
        avgHours: 0,
        errorRate: 0
      };
    }
    teamMap[t].totalObs += 1;
    if (obs.afectaAsesor) {
      teamMap[t].advisorObsCount += 1;
    } else {
      teamMap[t].otherAreasObsCount += 1;
    }
    if (obs.estadoObservacion === "Subsanada / Levantada") {
      teamMap[t].resolvedCount += 1;
    } else {
      teamMap[t].pendingCount += 1;
    }
    teamMap[t].totalHours += obs.horasHabiles;
  });

  const teamList = Object.values(teamMap).map(t => {
    t.avgHours = t.totalObs > 0 ? Number((t.totalHours / t.totalObs).toFixed(1)) : 0;
    t.errorRate = t.totalOps > 0 ? Math.min(100, Math.round((t.advisorObsCount / t.totalOps) * 100)) : 0;
    return t;
  }).sort((a, b) => b.totalObs - a.totalObs);

  // 5. Aggregate by Project (Concentrated project summary)
  const projectMap: { [proj: string]: {
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
  } } = {};

  records.forEach(r => {
    const p = (r.proyecto || "").trim() || "Sin Proyecto";
    if (!projectMap[p]) {
      projectMap[p] = {
        name: p,
        totalOps: 0,
        advisorObsCount: 0,
        otherAreasObsCount: 0,
        totalObs: 0,
        resolvedCount: 0,
        pendingCount: 0,
        totalHours: 0,
        avgHours: 0,
        errorRate: 0
      };
    }
    projectMap[p].totalOps += 1;
  });

  observations.forEach(obs => {
    const p = (obs.proyecto || "").trim() || "Sin Proyecto";
    if (!projectMap[p]) {
      projectMap[p] = {
        name: p,
        totalOps: 0,
        advisorObsCount: 0,
        otherAreasObsCount: 0,
        totalObs: 0,
        resolvedCount: 0,
        pendingCount: 0,
        totalHours: 0,
        avgHours: 0,
        errorRate: 0
      };
    }
    projectMap[p].totalObs += 1;
    if (obs.afectaAsesor) {
      projectMap[p].advisorObsCount += 1;
    } else {
      projectMap[p].otherAreasObsCount += 1;
    }
    if (obs.estadoObservacion === "Subsanada / Levantada") {
      projectMap[p].resolvedCount += 1;
    } else {
      projectMap[p].pendingCount += 1;
    }
    projectMap[p].totalHours += obs.horasHabiles;
  });

  const projectList = Object.values(projectMap).map(p => {
    p.avgHours = p.totalObs > 0 ? Number((p.totalHours / p.totalObs).toFixed(1)) : 0;
    p.errorRate = p.totalOps > 0 ? Math.min(100, Math.round((p.advisorObsCount / p.totalOps) * 100)) : 0;
    return p;
  }).sort((a, b) => b.totalObs - a.totalObs);

  // 6. Initialize jsPDF document (Portrait A4)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186 mm
  let y = 14;

  const drawPageHeader = (pageNum: number, customTitle?: string) => {
    // Top primary banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 11, "F");

    doc.setFillColor(37, 99, 235); // blue-600 accent stripe
    doc.rect(0, 11, pageWidth, 1.2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);

    const logo = settings?.platformLogo;
    let textX = margin;
    if (logo && typeof logo === "string" && (logo.startsWith("data:image") || logo.startsWith("http"))) {
      try {
        const format = logo.includes("png") ? "PNG" : "JPEG";
        doc.addImage(logo, format, margin, 1.8, 7.4, 7.4);
        textX = margin + 9.5;
      } catch {
        textX = margin;
      }
    }

    const platformTitle = (settings?.platformName || "EMISIONES DE MINUTAS - EQUIPO LEGAL").toUpperCase();
    doc.text(platformTitle, textX, 7.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225); // slate-300
    const nowStr = new Date().toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    doc.text(`Emisión: ${nowStr}`, pageWidth - margin, 7.5, { align: "right" });
  };

  const drawPageFooter = (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 8;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.4);
    doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500
    const periodNote = dateRangeLabel ? `  •  Filtro: ${dateRangeLabel}` : "";
    doc.text(`Informe Oficial de Desempeño y Control SLA  •  Uso Confidencial${periodNote}`, margin, footerY + 2);
    doc.text(`Página ${pageNum} de ${totalPages}`, pageWidth - margin, footerY + 2, { align: "right" });
  };

  // Helper to draw 4 Top KPI Cards
  const drawTopKpiCards = (startY: number): number => {
    let cy = startY;
    const cardW = (contentWidth - 9) / 4;
    const cardH = 17;

    const advisorPct = totalObs > 0 ? Math.round((advisorObs.length / totalObs) * 100) : 0;
    const otherPct = totalObs > 0 ? Math.round((otherAreasObs.length / totalObs) * 100) : 0;

    const kpis = [
      { label: "TOTAL OBSERVACIONES", val: totalObs.toString(), sub: `${totalHours.toFixed(0)} hrs hábiles`, color: [15, 23, 42] },
      { label: "AFECTAN ASESOR", val: advisorObs.length.toString(), sub: `${totalAdvisorHours.toFixed(0)} hrs (${advisorPct}%)`, color: [225, 29, 72] },
      { label: "OTRAS ÁREAS", val: otherAreasObs.length.toString(), sub: `${totalOtherAreasHours.toFixed(0)} hrs (${otherPct}%)`, color: [37, 99, 235] },
      { label: "TIEMPO PROM. SLA", val: `${avgResolutionHours}h`, sub: `${resolvedObs.length} subs. / ${pendingObs.length} pend.`, color: [16, 185, 129] },
    ];

    kpis.forEach((kpi, idx) => {
      const cx = margin + idx * (cardW + 3);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(cx, cy, cardW, cardH, 2, 2, "FD");

      // Top color strip
      doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.rect(cx, cy, cardW, 1.8, "F");

      // Value
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(kpi.val, cx + cardW / 2, cy + 8.5, { align: "center" });

      // Label
      doc.setTextColor(71, 85, 105);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(kpi.label, cx + cardW / 2, cy + 12.5, { align: "center" });

      // Subtext
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.text(kpi.sub, cx + cardW / 2, cy + 15.5, { align: "center" });
    });

    return cy + cardH + 7;
  };

  // ---------------- PAGE 1: RESUMEN EJECUTIVO Y GRÁFICAS ----------------
  const renderPage1Graficas = (isStandalone = false) => {
    drawPageHeader(doc.getNumberOfPages());
    y = 20;

    // Title
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13.5);
    const mainTitle = title || (isStandalone 
      ? "INFORME EJECUTIVO: GRÁFICAS Y ESTADÍSTICAS DE KPIS" 
      : "INFORME EJECUTIVO DE OBSERVACIONES, ASESORES POR TEAM Y PROYECTOS");
    doc.text(mainTitle, margin, y);
    y += 5.5;

    // Subtitle & period
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const periodText = dateRangeLabel ? `  •  Rango de Fecha: ${dateRangeLabel}` : "  •  Período: Histórico General";
    doc.text(`Análisis concentrado en Asesores de Ventas, Teams y Proyectos con SLA hábil.${periodText}`, margin, y);
    y += 4;
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Emitido por: ${cleanGeneratedBy}  |  Expedientes analizados: ${records.length}  |  Eventos de observación: ${totalObs}`, margin, y);
    y += 6;

    // Draw KPI Cards
    y = drawTopKpiCards(y);

    // ---------------- GRÁFICA 1: OBSERVACIONES POR TEAM DE VENTAS ----------------
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1.5, 1.5, "F");
    
    // Left blue marker
    doc.setFillColor(37, 99, 235);
    doc.rect(margin + 2, y + 1.2, 2.5, 3.1, "F");

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("COMPARATIVA: OBSERVACIONES POR TEAM DE VENTAS (ASESOR VS OTRAS ÁREAS)", margin + 6.5, y + 3.9);

    // Legend on right (carefully spaced to never overlap)
    doc.setFontSize(6.2);
    doc.setFillColor(225, 29, 72);
    doc.rect(pageWidth - margin - 46, y + 1.6, 2.5, 2.2, "F");
    doc.setTextColor(71, 85, 105);
    doc.text("Afecta Asesor", pageWidth - margin - 42, y + 3.4);

    doc.setFillColor(37, 99, 235);
    doc.rect(pageWidth - margin - 22, y + 1.6, 2.5, 2.2, "F");
    doc.text("Otras Áreas", pageWidth - margin - 18, y + 3.4);
    y += 8;

    const topTeamsForChart = teamList.slice(0, 5);
    const maxTeamObs = Math.max(...topTeamsForChart.map(t => t.totalObs), 1);
    const maxTeamBarLength = 62; // mm

    topTeamsForChart.forEach((t) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);
      doc.text(t.team.substring(0, 18), margin + 2, y + 3.2);

      const barStartX = margin + 42;
      const advisorBarW = maxTeamObs > 0 ? (t.advisorObsCount / maxTeamObs) * maxTeamBarLength : 0;
      const otherBarW = maxTeamObs > 0 ? (t.otherAreasObsCount / maxTeamObs) * maxTeamBarLength : 0;

      // Background track
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(barStartX, y, maxTeamBarLength, 4.2, 1, 1, "F");

      // Advisor bar (Rose)
      if (advisorBarW > 0) {
        doc.setFillColor(225, 29, 72);
        doc.roundedRect(barStartX, y, advisorBarW, 4.2, 1, 1, "F");
      }

      // Other areas bar (Blue)
      if (otherBarW > 0) {
        doc.setFillColor(37, 99, 235);
        doc.roundedRect(barStartX + advisorBarW, y, otherBarW, 4.2, 1, 1, "F");
      }

      // Metric texts - carefully separated so they never collide!
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(`${t.totalObs} obs (${t.advisorObsCount} as. / ${t.otherAreasObsCount} otr.)`, barStartX + maxTeamBarLength + 4, y + 3.2);

      doc.setFont("helvetica", "normal");
      doc.text(`[SLA: ${t.avgHours}h  |  Incid: ${t.errorRate}%]`, pageWidth - margin - 2, y + 3.2, { align: "right" });

      y += 6.5;
    });

    y += 3.5;

    // ---------------- GRÁFICA 2: RANKING DE ASESORES QUE MÁS SE EQUIVOCAN ----------------
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1.5, 1.5, "F");
    
    // Left rose marker
    doc.setFillColor(225, 29, 72);
    doc.rect(margin + 2, y + 1.2, 2.5, 3.1, "F");

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("RANKING DE ASESORES CON MAYOR INCIDENCIA DE ERRORES (TOP QUE MÁS SE EQUIVOCAN)", margin + 6.5, y + 3.9);

    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text("Ordenado por observaciones que afectan al asesor", pageWidth - margin - 2, y + 3.4, { align: "right" });
    y += 8;

    const topAdvisorsForChart = advisorsRankedByMistakes.slice(0, 6);
    const maxAdvMistakes = Math.max(...topAdvisorsForChart.map(a => a.advisorObsCount), 1);
    const maxAdvBarLength = 62; // mm

    topAdvisorsForChart.forEach((adv, idx) => {
      // Rank Badge
      const rankNum = idx + 1;
      if (rankNum === 1) {
        doc.setFillColor(225, 29, 72); // Rose critical #1
        doc.roundedRect(margin + 2, y + 0.3, 7.5, 3.8, 1, 1, "F");
        doc.setTextColor(255, 255, 255);
      } else if (rankNum === 2) {
        doc.setFillColor(234, 88, 12); // Orange #2
        doc.roundedRect(margin + 2, y + 0.3, 7.5, 3.8, 1, 1, "F");
        doc.setTextColor(255, 255, 255);
      } else if (rankNum === 3) {
        doc.setFillColor(217, 119, 6); // Amber #3
        doc.roundedRect(margin + 2, y + 0.3, 7.5, 3.8, 1, 1, "F");
        doc.setTextColor(255, 255, 255);
      } else {
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin + 2, y + 0.3, 7.5, 3.8, 1, 1, "F");
        doc.setTextColor(71, 85, 105);
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.text(`#${rankNum}`, margin + 5.7, y + 3.1, { align: "center" });

      // Advisor Name & Team
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(15, 23, 42);
      const advLabel = `${adv.name} (${adv.team})`.substring(0, 22);
      doc.text(advLabel, margin + 11.5, y + 3.2);

      const barStartX = margin + 50;
      const barW = maxAdvMistakes > 0 ? (adv.advisorObsCount / maxAdvMistakes) * maxAdvBarLength : 0;

      // Background track
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(barStartX, y, maxAdvBarLength, 4.2, 1, 1, "F");

      // Fill error bar
      if (adv.advisorObsCount >= 2) {
        doc.setFillColor(225, 29, 72); // Rose
      } else if (adv.advisorObsCount === 1) {
        doc.setFillColor(217, 119, 6); // Amber
      } else {
        doc.setFillColor(16, 185, 129); // Green
      }

      if (barW > 0) {
        doc.roundedRect(barStartX, y, barW, 4.2, 1, 1, "F");
      }

      // Metric texts without overlapping
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.6);
      doc.setTextColor(adv.advisorObsCount > 0 ? 225 : 71, adv.advisorObsCount > 0 ? 29 : 85, adv.advisorObsCount > 0 ? 72 : 105);
      doc.text(`${adv.advisorObsCount} err. asesor (${adv.errorRate}% error)`, barStartX + maxAdvBarLength + 4, y + 3.2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`Tot: ${adv.totalObs} obs  |  SLA: ${adv.avgHours}h`, pageWidth - margin - 2, y + 3.2, { align: "right" });

      y += 6.5;
    });

    y += 3.5;

    // Mini Resumen por Proyecto
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1.5, 1.5, "F");
    
    doc.setFillColor(16, 185, 129);
    doc.rect(margin + 2, y + 1.2, 2.5, 3.1, "F");

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("RESUMEN DE PROYECTOS INMOBILIARIOS (MÉTRICAS CONSOLIDADAS)", margin + 6.5, y + 3.9);
    y += 7.5;

    const projCols = [
      { title: "PROYECTO", w: 42 },
      { title: "OPERACIONES", w: 24 },
      { title: "OBS. TOTALES", w: 22 },
      { title: "AFECTA ASESOR", w: 24 },
      { title: "OTRAS ÁREAS", w: 22 },
      { title: "TIEMPO PROM.", w: 22 },
      { title: "ESTADO (SUBS / PEND)", w: 30 }
    ]; // Sum = 186 mm

    doc.setFillColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, 4.8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(30, 41, 59);

    let curX = margin + 2;
    projCols.forEach(col => {
      doc.text(col.title, curX, y + 3.3);
      curX += col.w;
    });
    y += 5.2;

    projectList.slice(0, 5).forEach((proj, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, contentWidth, 4.8, "F");
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);

      let px = margin + 2;
      doc.text(proj.name.substring(0, 22), px, y + 3);
      px += projCols[0].w;

      doc.setFont("helvetica", "normal");
      doc.text(`${proj.totalOps} ops`, px, y + 3);
      px += projCols[1].w;

      doc.setFont("helvetica", "bold");
      doc.text(`${proj.totalObs}`, px, y + 3);
      px += projCols[2].w;

      doc.setTextColor(225, 29, 72);
      doc.text(`${proj.advisorObsCount}`, px, y + 3);
      px += projCols[3].w;

      doc.setTextColor(37, 99, 235);
      doc.text(`${proj.otherAreasObsCount}`, px, y + 3);
      px += projCols[4].w;

      doc.setTextColor(16, 185, 129);
      doc.text(`${proj.avgHours}h`, px, y + 3);
      px += projCols[5].w;

      doc.setTextColor(71, 85, 105);
      doc.text(`${proj.resolvedCount} subs. / ${proj.pendingCount} pend.`, px, y + 3);

      y += 4.8;
    });
  };

  // ---------------- PAGE 2: TABLA CONCENTRADA DE ASESORES DE VENTAS ----------------
  const renderPageAdvisors = () => {
    drawPageHeader(doc.getNumberOfPages());
    y = 20;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("INFORME DE DESEMPEÑO: RANKING DE ASESORES DE VENTAS", margin, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const periodText = dateRangeLabel ? `  •  Rango de Fecha: ${dateRangeLabel}` : "";
    doc.text(`Ranking ordenado por errores que afectan al asesor y tasa de incidencia sobre expedientes.${periodText}`, margin, y);
    y += 6;

    // Small KPI strip
    y = drawTopKpiCards(y);

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1.5, 1.5, "F");
    doc.setFillColor(225, 29, 72);
    doc.rect(margin + 2, y + 1.2, 2.5, 3.1, "F");
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TABLA OFICIAL DE DESEMPEÑO DE ASESORES (RANKING POR ERRORES Y SLA)", margin + 6.5, y + 3.9);
    y += 7.5;

    // Columns - total 186 mm
    const advTableCols = [
      { title: "#", w: 8 },
      { title: "ASESOR DE VENTAS", w: 33 },
      { title: "TEAM", w: 18 },
      { title: "JEFE DE VENTAS", w: 24 },
      { title: "OPS", w: 11 },
      { title: "OBS. ASESOR", w: 17 },
      { title: "% ERROR", w: 15 },
      { title: "OTRAS ÁREAS", w: 16 },
      { title: "TOTAL OBS", w: 15 },
      { title: "SLA", w: 14 },
      { title: "ESTADO", w: 15 }
    ];

    const drawAdvTableHeader = () => {
      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 41, 59);

      let ax = margin + 1.5;
      advTableCols.forEach(col => {
        doc.text(col.title, ax, y + 3.4);
        ax += col.w;
      });
      y += 5.5;
    };

    drawAdvTableHeader();

    advisorList.forEach((adv, idx) => {
      // Check page break
      if (y > pageHeight - 16) {
        doc.addPage();
        drawPageHeader(doc.getNumberOfPages());
        y = 20;
        drawAdvTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, contentWidth, 5, "F");
      }

      let px = margin + 1.5;
      
      // Rank number
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      if (idx < 3) {
        doc.setTextColor(225, 29, 72);
      } else {
        doc.setTextColor(71, 85, 105);
      }
      doc.text(`#${idx + 1}`, px, y + 3.2);
      px += advTableCols[0].w;

      // Name
      doc.setTextColor(15, 23, 42);
      doc.text(adv.name.substring(0, 18), px, y + 3.2);
      px += advTableCols[1].w;

      // Team
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(adv.team.substring(0, 12), px, y + 3.2);
      px += advTableCols[2].w;

      // Jefe de Ventas
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 138);
      doc.text((adv.jefeVentas || "Sin Asignar").substring(0, 14), px, y + 3.2);
      px += advTableCols[3].w;

      // Ops
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`${adv.totalOps}`, px, y + 3.2);
      px += advTableCols[4].w;

      // Advisor Obs (Mistakes)
      doc.setFont("helvetica", "bold");
      doc.setTextColor(adv.advisorObsCount > 0 ? 225 : 100, adv.advisorObsCount > 0 ? 29 : 116, adv.advisorObsCount > 0 ? 72 : 139);
      doc.text(`${adv.advisorObsCount}`, px, y + 3.2);
      px += advTableCols[5].w;

      // % Error
      doc.setTextColor(adv.errorRate > 25 ? 225 : (adv.errorRate > 0 ? 217 : 71), adv.errorRate > 25 ? 29 : (adv.errorRate > 0 ? 119 : 85), adv.errorRate > 25 ? 72 : (adv.errorRate > 0 ? 6 : 105));
      doc.text(`${adv.errorRate}%`, px, y + 3.2);
      px += advTableCols[6].w;

      // Other Areas
      doc.setFont("helvetica", "normal");
      doc.setTextColor(37, 99, 235);
      doc.text(`${adv.otherAreasObsCount}`, px, y + 3.2);
      px += advTableCols[7].w;

      // Total Obs
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${adv.totalObs}`, px, y + 3.2);
      px += advTableCols[8].w;

      // SLA
      doc.setTextColor(16, 185, 129);
      doc.text(`${adv.avgHours}h`, px, y + 3.2);
      px += advTableCols[9].w;

      // Resolution
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`${adv.resolvedCount} / ${adv.pendingCount} p.`, px, y + 3.2);

      y += 5;
    });
  };

  // ---------------- PAGE: RESUMEN POR TEAM DE VENTAS ----------------
  const renderPageTeams = () => {
    drawPageHeader(doc.getNumberOfPages());
    y = 20;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("INFORME CONSOLIDADO: OBSERVACIONES POR TEAM DE VENTAS", margin, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const periodText = dateRangeLabel ? `  •  Rango de Fecha: ${dateRangeLabel}` : "";
    doc.text(`Métricas acumuladas por equipo, asesores activos, incidencia de error y tiempo SLA.${periodText}`, margin, y);
    y += 6;

    y = drawTopKpiCards(y);

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1.5, 1.5, "F");
    doc.setFillColor(37, 99, 235);
    doc.rect(margin + 2, y + 1.2, 2.5, 3.1, "F");
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("RESUMEN OPERATIVO POR TEAM DE VENTAS", margin + 6.5, y + 3.9);
    y += 7.5;

    // Columns - total 186 mm
    const teamCols = [
      { title: "TEAM DE VENTAS", w: 36 },
      { title: "ASESORES", w: 20 },
      { title: "OPERACIONES", w: 20 },
      { title: "OBS. ASESOR", w: 22 },
      { title: "% INCIDENCIA", w: 20 },
      { title: "OTRAS ÁREAS", w: 22 },
      { title: "TOTAL OBS", w: 22 },
      { title: "TIEMPO PROM. SLA", w: 24 }
    ];

    const drawTeamTableHeader = () => {
      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 41, 59);

      let tx = margin + 1.5;
      teamCols.forEach(col => {
        doc.text(col.title, tx, y + 3.4);
        tx += col.w;
      });
      y += 5.5;
    };

    drawTeamTableHeader();

    teamList.forEach((t, idx) => {
      if (y > pageHeight - 16) {
        doc.addPage();
        drawPageHeader(doc.getNumberOfPages());
        y = 20;
        drawTeamTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, contentWidth, 5, "F");
      }

      let px = margin + 1.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(15, 23, 42);
      doc.text(t.team.substring(0, 18), px, y + 3.2);
      px += teamCols[0].w;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`${t.advisors.size} asesores`, px, y + 3.2);
      px += teamCols[1].w;

      doc.text(`${t.totalOps} ops`, px, y + 3.2);
      px += teamCols[2].w;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(225, 29, 72);
      doc.text(`${t.advisorObsCount}`, px, y + 3.2);
      px += teamCols[3].w;

      doc.setTextColor(t.errorRate > 25 ? 225 : (t.errorRate > 0 ? 217 : 71), t.errorRate > 25 ? 29 : (t.errorRate > 0 ? 119 : 85), t.errorRate > 25 ? 72 : (t.errorRate > 0 ? 6 : 105));
      doc.text(`${t.errorRate}%`, px, y + 3.2);
      px += teamCols[4].w;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(37, 99, 235);
      doc.text(`${t.otherAreasObsCount}`, px, y + 3.2);
      px += teamCols[5].w;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${t.totalObs}`, px, y + 3.2);
      px += teamCols[6].w;

      doc.setTextColor(16, 185, 129);
      doc.text(`${t.avgHours}h hábiles`, px, y + 3.2);

      y += 5.2;
    });
  };

  // ---------------- PAGE: RESUMEN POR PROYECTO INMOBILIARIO ----------------
  const renderPageProjects = () => {
    drawPageHeader(doc.getNumberOfPages());
    y = 20;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("INFORME CONSOLIDADO: OBSERVACIONES POR PROYECTO INMOBILIARIO", margin, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const periodText = dateRangeLabel ? `  •  Rango de Fecha: ${dateRangeLabel}` : "";
    doc.text(`Análisis operacional por proyecto, discriminando observaciones del asesor vs otras áreas.${periodText}`, margin, y);
    y += 6;

    y = drawTopKpiCards(y);

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 5.5, 1.5, 1.5, "F");
    doc.setFillColor(16, 185, 129);
    doc.rect(margin + 2, y + 1.2, 2.5, 3.1, "F");
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("DETALLE POR PROYECTO INMOBILIARIO", margin + 6.5, y + 3.9);
    y += 7.5;

    // Columns - total 186 mm
    const projCols = [
      { title: "PROYECTO", w: 38 },
      { title: "OPERACIONES", w: 18 },
      { title: "OBS. ASESOR", w: 20 },
      { title: "% ERROR", w: 18 },
      { title: "OTRAS ÁREAS", w: 20 },
      { title: "TOTAL OBS", w: 20 },
      { title: "TIEMPO PROM. SLA", w: 24 },
      { title: "ESTADO (SUBS / PEND)", w: 28 }
    ];

    const drawProjTableHeader = () => {
      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(30, 41, 59);

      let px = margin + 1.5;
      projCols.forEach(col => {
        doc.text(col.title, px, y + 3.4);
        px += col.w;
      });
      y += 5.5;
    };

    drawProjTableHeader();

    projectList.forEach((p, idx) => {
      if (y > pageHeight - 16) {
        doc.addPage();
        drawPageHeader(doc.getNumberOfPages());
        y = 20;
        drawProjTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, contentWidth, 5, "F");
      }

      let px = margin + 1.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(15, 23, 42);
      doc.text(p.name.substring(0, 20), px, y + 3.2);
      px += projCols[0].w;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`${p.totalOps} ops`, px, y + 3.2);
      px += projCols[1].w;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(225, 29, 72);
      doc.text(`${p.advisorObsCount}`, px, y + 3.2);
      px += projCols[2].w;

      doc.setTextColor(p.errorRate > 25 ? 225 : (p.errorRate > 0 ? 217 : 71), p.errorRate > 25 ? 29 : (p.errorRate > 0 ? 119 : 85), p.errorRate > 25 ? 72 : (p.errorRate > 0 ? 6 : 105));
      doc.text(`${p.errorRate}%`, px, y + 3.2);
      px += projCols[3].w;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(37, 99, 235);
      doc.text(`${p.otherAreasObsCount}`, px, y + 3.2);
      px += projCols[4].w;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${p.totalObs}`, px, y + 3.2);
      px += projCols[5].w;

      doc.setTextColor(16, 185, 129);
      doc.text(`${p.avgHours}h`, px, y + 3.2);
      px += projCols[6].w;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`${p.resolvedCount} subs. / ${p.pendingCount} pend.`, px, y + 3.2);

      y += 5.2;
    });
  };

  // ---------------- PAGE: ANEXO DETALLADO DE OBSERVACIONES ----------------
  const renderPageDetails = () => {
    drawPageHeader(doc.getNumberOfPages());
    y = 20;

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, contentWidth, 6.5, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const countLabel = `(${observations.length} EVENTOS)`;
    doc.text(`ANEXO DETALLADO: TODAS LAS OBSERVACIONES Y TIEMPOS DE RESPUESTA ${countLabel}`, margin + 3, y + 4.5);
    y += 9;

    const obsTableCols = [
      { title: "ID OP", w: 16 },
      { title: "FECHA OBS", w: 18 },
      { title: "FECHA SUBS", w: 18 },
      { title: "SLA HÁBIL", w: 22 },
      { title: "ORIGEN", w: 18 },
      { title: "ASESOR & TEAM", w: 28 },
      { title: "PROYECTO & DPTO", w: 26 },
      { title: "MOTIVOS / COMENTARIO", w: 40 }
    ]; // Sum = 186 mm

    const drawObsTableHeader = () => {
      doc.setFillColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 5.2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.setTextColor(30, 41, 59);

      let ox = margin + 1.5;
      obsTableCols.forEach(col => {
        doc.text(col.title, ox, y + 3.6);
        ox += col.w;
      });
      y += 6;
    };

    drawObsTableHeader();

    observations.forEach((obs, idx) => {
      if (y > pageHeight - 16) {
        doc.addPage();
        drawPageHeader(doc.getNumberOfPages());
        y = 18;
        drawObsTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 0.5, contentWidth, 5.2, "F");
      }

      let ox = margin + 1.5;

      // Col 1: ID
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.setTextColor(30, 58, 138);
      doc.text((obs.idOperacion || "-").substring(0, 10), ox, y + 3.2);
      ox += obsTableCols[0].w;

      // Col 2: Fecha Obs
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.setTextColor(71, 85, 105);
      const fechaObsShort = obs.fechaObservacion ? obs.fechaObservacion.split(" ")[0] : "-";
      doc.text(fechaObsShort, ox, y + 3.2);
      ox += obsTableCols[1].w;

      // Col 3: Fecha Subsanación
      const fechaSubShort = obs.fechaSubsanacion ? obs.fechaSubsanacion.split(" ")[0] : (obs.estadoObservacion === "Pendiente / Abierta" ? "Pendiente" : "-");
      doc.setTextColor(obs.estadoObservacion === "Pendiente / Abierta" ? 225 : 71, obs.estadoObservacion === "Pendiente / Abierta" ? 29 : 85, obs.estadoObservacion === "Pendiente / Abierta" ? 72 : 105);
      doc.text(fechaSubShort, ox, y + 3.2);
      ox += obsTableCols[2].w;

      // Col 4: Tiempo Respuesta (SLA)
      doc.setFont("helvetica", "bold");
      doc.setTextColor(16, 185, 129);
      const tiempoTxt = `${obs.horasHabiles}h (${obs.tiempoDetallado || "0h"})`;
      doc.text(tiempoTxt.substring(0, 16), ox, y + 3.2);
      ox += obsTableCols[3].w;

      // Col 5: Origen / Afecta Asesor
      if (obs.afectaAsesor) {
        doc.setTextColor(225, 29, 72);
        doc.text("Asesor (SÍ)", ox, y + 3.2);
      } else {
        doc.setTextColor(37, 99, 235);
        doc.text("Otras Áreas", ox, y + 3.2);
      }
      ox += obsTableCols[4].w;

      // Col 6: Asesor & Team
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      const advTeamTxt = `${obs.asesor || "Sin Asesor"} (${obs.equipo || "-"})`;
      doc.text(advTeamTxt.substring(0, 18), ox, y + 3.2);
      ox += obsTableCols[5].w;

      // Col 7: Proyecto & Unidad
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const projUnitTxt = `${obs.proyecto || ""} • ${obs.unidad || obs.dpto || ""}`;
      doc.text(projUnitTxt.substring(0, 16), ox, y + 3.2);
      ox += obsTableCols[6].w;

      // Col 8: Motivos / Comentario
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const desc = obs.motivos || obs.comentario || "Observación registrada";
      doc.text(desc.substring(0, 28), ox, y + 3.2);

      y += 5.2;
    });
  };

  // Dispatch based on includedSections or tabScope
  if (options.includedSections) {
    const sec = options.includedSections;
    let pagesRendered = 0;

    const maybeAddPage = () => {
      if (pagesRendered > 0) {
        doc.addPage();
      }
      pagesRendered++;
    };

    if (sec.kpis || sec.charts) {
      maybeAddPage();
      renderPage1Graficas(!sec.charts);
    }
    if (sec.advisors) {
      maybeAddPage();
      renderPageAdvisors();
    }
    if (sec.teams) {
      maybeAddPage();
      renderPageTeams();
    }
    if (sec.projects) {
      maybeAddPage();
      renderPageProjects();
    }
    if (sec.details) {
      maybeAddPage();
      renderPageDetails();
    }

    if (pagesRendered === 0) {
      // Fallback if none checked
      renderPage1Graficas(false);
    }
  } else if (tabScope === "graficas") {
    renderPage1Graficas(true);
  } else if (tabScope === "asesores") {
    renderPageAdvisors();
  } else if (tabScope === "teams") {
    renderPageTeams();
  } else if (tabScope === "proyectos") {
    renderPageProjects();
  } else if (tabScope === "detalle") {
    renderPageDetails();
  } else {
    // "all" - Full Consolidated Report
    renderPage1Graficas(false);

    doc.addPage();
    renderPageAdvisors();

    doc.addPage();
    renderPageTeams();

    doc.addPage();
    renderPageProjects();

    doc.addPage();
    renderPageDetails();
  }

  // Stamp footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawPageFooter(p, totalPages);
  }

  return doc;
}
