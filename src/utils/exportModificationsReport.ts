import * as XLSX from "xlsx";
import { AppSettings, OperationRecord, StatusHistoryEntry } from "../types";
import { 
  safeParseDate, 
  formatDateTimeFull, 
  formatProjectAndUnits, 
  resolveJefeVentasForAdvisor,
  normalizeText,
  getRecordIngresoDate
} from "./dateUtils";

function normalizeTipoKey(tipo?: string): string {
  const t = (tipo || "").toUpperCase().trim();
  if (t.includes("MODIFIC")) return "MODIFICACION";
  if (t.includes("ADENDA")) return "ADENDA";
  if (t.includes("EMISION") || t.includes("EMISIÓN")) return "EMISION";
  return t;
}

export interface ModificationEventItem {
  index: number;
  date: string;
  comment: string;
  status: string;
  user: string;
  assistant: string;
}

export interface OperationModificationItem {
  id: string;
  proyecto: string;
  unidad: string;
  asesor: string;
  team: string;
  jefeVentas: string;
  tipo: string;
  status: string;
  fechaIngreso: string;
  fechaEmisionInicial: string;
  modificationsCount: number;
  modificationEvents: ModificationEventItem[];
  ultimaModificacionFecha: string;
  asistenteLegal: string;
  record: OperationRecord;
}

export interface AdvisorModificationRanking {
  advisorName: string;
  team: string;
  jefeVentas: string;
  modificationsCount: number;
  affectedOperationsCount: number;
  totalOperationsCount: number;
  modificationRate: number; // percentage
  operations: OperationModificationItem[];
}

export interface ProjectModificationSummary {
  project: string;
  modificationsCount: number;
  affectedOperationsCount: number;
  totalOperationsCount: number;
  rate: number;
}

export interface TeamModificationSummary {
  team: string;
  jefeVentas: string;
  modificationsCount: number;
  affectedOperationsCount: number;
  totalOperationsCount: number;
  rate: number;
}

/**
 * Checks if a status history entry represents a modification request event.
 */
export function isModificationHistoryEntry(h: StatusHistoryEntry): boolean {
  if (!h) return false;
  const s = (h.status || "").toLowerCase();
  const c = (h.comentario || "").toLowerCase();

  // Explicit modification statuses or tags
  if (s.includes("modificad") || s.includes("modificacion") || s.includes("adenda")) {
    return true;
  }
  if (c.includes("[modificación]") || c.includes("[modificacion]") || c.includes("modificación") || c.includes("modificacion")) {
    return true;
  }
  if (c.includes("reapertura") && (c.includes("cambio") || c.includes("modific") || c.includes("adenda") || c.includes("titular"))) {
    return true;
  }
  if (c.includes("solicitud de modificación") || c.includes("solicitud de cambio") || c.includes("solicita adenda")) {
    return true;
  }
  return false;
}

/**
 * Extracts and consolidates all operations that requested modifications.
 */
export function extractAllModificationsReport(
  records: OperationRecord[],
  settings?: AppSettings,
  startDateStr?: string,
  endDateStr?: string
): {
  operations: OperationModificationItem[];
  advisorRankings: AdvisorModificationRanking[];
  projectSummaries: ProjectModificationSummary[];
  teamSummaries: TeamModificationSummary[];
  totalEmissionsCount: number;
  totalModificationsCount: number;
  operationsWithModificationsCount: number;
  overallModificationRate: number;
} {
  const startLimit = startDateStr ? safeParseDate(startDateStr) : null;
  const endLimit = endDateStr ? safeParseDate(endDateStr) : null;
  if (endLimit) {
    endLimit.setHours(23, 59, 59, 999);
  }

  // Count advisor total operations for rate calculation
  const advisorTotalOpsMap: Record<string, number> = {};
  const projectTotalOpsMap: Record<string, number> = {};
  const teamTotalOpsMap: Record<string, number> = {};
  let totalEmissionsCount = 0;

  records.forEach(r => {
    // Check if within date filter (by entry or emission date)
    const d = getRecordIngresoDate(r);
    if (startLimit && d && d.getTime() < startLimit.getTime()) return;
    if (endLimit && d && d.getTime() > endLimit.getTime()) return;

    let asesor = (r.asesor || "Sin Asesor").trim();
    if (asesor === "ASE000010") asesor = "DERVIS PIÑA";
    if (asesor === "ASE000028") asesor = "PAULA CASAS";
    advisorTotalOpsMap[asesor] = (advisorTotalOpsMap[asesor] || 0) + 1;

    const proj = (r.proyecto || "Sin Proyecto").trim();
    projectTotalOpsMap[proj] = (projectTotalOpsMap[proj] || 0) + 1;

    const team = (r.team || "Sin Equipo").trim();
    teamTotalOpsMap[team] = (teamTotalOpsMap[team] || 0) + 1;

    if (r.emision || r.emittedAt) {
      totalEmissionsCount++;
    }
  });

  const modifiedOperations: OperationModificationItem[] = [];

  records.forEach(r => {
    // Date filter check
    const ingDate = getRecordIngresoDate(r);
    if (startLimit && ingDate && ingDate.getTime() < startLimit.getTime()) return;
    if (endLimit && ingDate && ingDate.getTime() > endLimit.getTime()) return;

    let asesor = (r.asesor || "Sin Asesor").trim();
    if (asesor === "ASE000010") asesor = "DERVIS PIÑA";
    if (asesor === "ASE000028") asesor = "PAULA CASAS";

    const proj = (r.proyecto || "Sin Proyecto").trim();
    const team = (r.team || "Sin Equipo").trim();
    const jefeVentas = resolveJefeVentasForAdvisor(asesor, proj, team, r, settings);

    const events: ModificationEventItem[] = [];

    // Scan history for modification entries
    if (Array.isArray(r.history) && r.history.length > 0) {
      r.history.forEach((h, idx) => {
        if (isModificationHistoryEntry(h)) {
          events.push({
            index: events.length + 1,
            date: h.timestamp || "-",
            comment: h.comentario || "Solicitud de modificación de minuta",
            status: h.status || "Modificado",
            user: h.user || asesor,
            assistant: h.derivadoA || r.derivadoA || "-"
          });
        }
      });
    }

    // Also check if the record itself has tipo = MODIFICACION or ADENDA
    const normTipo = normalizeTipoKey(r.tipo);
    const isTipoModif = normTipo === "MODIFICACION" || normTipo === "ADENDA";
    const statusUpper = (r.status || "").toUpperCase();
    const isStatusModif = statusUpper.includes("MODIFICAD");
    const wasReopened = Boolean(r.isReopened || r.reopenedAt || r.reingresadoAt);

    // If it is a modification request or has modification events
    if (events.length === 0 && (isTipoModif || isStatusModif || wasReopened)) {
      events.push({
        index: 1,
        date: r.reingresadoAt || r.reopenedAt || r.solicitud || r.createdAt || "-",
        comment: r.comentario || (isTipoModif ? `Solicitud ingresada como ${r.tipo}` : "Reapertura / Modificación de operación"),
        status: r.status || "Modificado",
        user: r.updatedByUser || asesor,
        assistant: r.derivadoA || "-"
      });
    }

    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      modifiedOperations.push({
        id: r.id,
        proyecto: proj,
        unidad: formatProjectAndUnits(r),
        asesor,
        team,
        jefeVentas,
        tipo: r.tipo || "Emisión",
        status: r.status || "-",
        fechaIngreso: r.solicitud || r.solicitudAt || r.createdAt || "-",
        fechaEmisionInicial: r.emision || r.emittedAt || "-",
        modificationsCount: events.length,
        modificationEvents: events,
        ultimaModificacionFecha: lastEvent.date,
        asistenteLegal: r.derivadoA || lastEvent.assistant || "-",
        record: r
      });
    }
  });

  // Calculate Advisor Rankings
  const advisorMap: Record<string, AdvisorModificationRanking> = {};

  modifiedOperations.forEach(op => {
    const aName = op.asesor;
    if (!advisorMap[aName]) {
      const totalOps = advisorTotalOpsMap[aName] || 1;
      advisorMap[aName] = {
        advisorName: aName,
        team: op.team,
        jefeVentas: op.jefeVentas,
        modificationsCount: 0,
        affectedOperationsCount: 0,
        totalOperationsCount: totalOps,
        modificationRate: 0,
        operations: []
      };
    }
    advisorMap[aName].modificationsCount += op.modificationsCount;
    advisorMap[aName].affectedOperationsCount += 1;
    advisorMap[aName].operations.push(op);
  });

  const advisorRankings = Object.values(advisorMap).map(adv => {
    const rate = adv.totalOperationsCount > 0 
      ? Number(((adv.modificationsCount / adv.totalOperationsCount) * 100).toFixed(1)) 
      : 0;
    return {
      ...adv,
      modificationRate: rate
    };
  }).sort((a, b) => b.modificationsCount - a.modificationsCount);

  // Project Summaries
  const projectMap: Record<string, { modCount: number; affectedOps: number }> = {};
  modifiedOperations.forEach(op => {
    if (!projectMap[op.proyecto]) {
      projectMap[op.proyecto] = { modCount: 0, affectedOps: 0 };
    }
    projectMap[op.proyecto].modCount += op.modificationsCount;
    projectMap[op.proyecto].affectedOps += 1;
  });

  const projectSummaries: ProjectModificationSummary[] = Object.keys(projectMap).map(proj => {
    const totalOps = projectTotalOpsMap[proj] || 1;
    const modCount = projectMap[proj].modCount;
    return {
      project: proj,
      modificationsCount: modCount,
      affectedOperationsCount: projectMap[proj].affectedOps,
      totalOperationsCount: totalOps,
      rate: Number(((modCount / totalOps) * 100).toFixed(1))
    };
  }).sort((a, b) => b.modificationsCount - a.modificationsCount);

  // Team Summaries
  const teamMap: Record<string, { modCount: number; affectedOps: number; jefe: string }> = {};
  modifiedOperations.forEach(op => {
    if (!teamMap[op.team]) {
      teamMap[op.team] = { modCount: 0, affectedOps: 0, jefe: op.jefeVentas };
    }
    teamMap[op.team].modCount += op.modificationsCount;
    teamMap[op.team].affectedOps += 1;
  });

  const teamSummaries: TeamModificationSummary[] = Object.keys(teamMap).map(team => {
    const totalOps = teamTotalOpsMap[team] || 1;
    const modCount = teamMap[team].modCount;
    return {
      team,
      jefeVentas: teamMap[team].jefe,
      modificationsCount: modCount,
      affectedOperationsCount: teamMap[team].affectedOps,
      totalOperationsCount: totalOps,
      rate: Number(((modCount / totalOps) * 100).toFixed(1))
    };
  }).sort((a, b) => b.modificationsCount - a.modificationsCount);

  const totalModificationsCount = modifiedOperations.reduce((sum, op) => sum + op.modificationsCount, 0);
  const operationsWithModificationsCount = modifiedOperations.length;
  const overallModificationRate = totalEmissionsCount > 0 
    ? Number(((operationsWithModificationsCount / totalEmissionsCount) * 100).toFixed(1)) 
    : 0;

  return {
    operations: modifiedOperations,
    advisorRankings,
    projectSummaries,
    teamSummaries,
    totalEmissionsCount,
    totalModificationsCount,
    operationsWithModificationsCount,
    overallModificationRate
  };
}

/**
 * Generates and downloads a multi-sheet Excel file specialized in Modifications.
 */
export function downloadModificationsExcel(
  records: OperationRecord[],
  settings?: AppSettings,
  startDateStr?: string,
  endDateStr?: string
) {
  const data = extractAllModificationsReport(records, settings, startDateStr, endDateStr);

  const wb = XLSX.utils.book_new();

  // 1. Resumen General KPIs
  const kpiRows = [
    ["REPORTE EJECUTIVO DE MODIFICACIONES DE MINUTAS & KPIS DE ASESORES"],
    [`Generado el: ${formatDateTimeFull(new Date())}`],
    [`Rango de Fechas: ${startDateStr || "Inicio"} al ${endDateStr || "Actualidad"}`],
    [],
    ["INDICADOR", "VALOR", "DESCRIPCIÓN"],
    ["Total Emisiones del Sistema", data.totalEmissionsCount, "Total de minutas emitidas"],
    ["Operaciones con Modificaciones", data.operationsWithModificationsCount, "Cantidad de emisiones que solicitaron al menos una modificación"],
    ["Total Solicitudes de Modificación", data.totalModificationsCount, "Suma total de modificaciones solicitadas (incluye reincidencias)"],
    ["Tasa Global de Modificación", `${data.overallModificationRate}%`, "% de operaciones que requirieron cambios"],
    ["Asesor con Más Modificaciones", data.advisorRankings[0]?.advisorName || "N/A", `${data.advisorRankings[0]?.modificationsCount || 0} modificaciones pedidas`]
  ];
  const wsKpis = XLSX.utils.aoa_to_sheet(kpiRows);
  XLSX.utils.book_append_sheet(wb, wsKpis, "Resumen General");

  // 2. Ranking de Asesores
  const advisorRows = [
    ["RANKING DE ASESORES QUE PIDIERON MÁS MODIFICACIONES"],
    ["Posición", "Nombre Asesor", "Equipo", "Jefe de Ventas", "Modificaciones Solicitadas", "Operaciones Afectadas", "Total Operaciones Asesor", "% Tasa Modificación"],
    ...data.advisorRankings.map((adv, idx) => [
      idx + 1,
      adv.advisorName,
      adv.team,
      adv.jefeVentas,
      adv.modificationsCount,
      adv.affectedOperationsCount,
      adv.totalOperationsCount,
      `${adv.modificationRate}%`
    ])
  ];
  const wsAdvisors = XLSX.utils.aoa_to_sheet(advisorRows);
  XLSX.utils.book_append_sheet(wb, wsAdvisors, "Ranking Asesores");

  // 3. Detalle por Operación
  const opRows = [
    ["DETALLE DE EMISIONES QUE SOLICITARON MODIFICACIONES (POR OPERACIÓN)"],
    ["ID Operación", "Proyecto", "Unidades", "Asesor Inmobiliario", "Equipo", "Jefe de Ventas", "Tipo Original", "Estado Actual", "Fecha Ingreso", "Fecha Emisión Inicial", "Nº Modificaciones Solicitadas", "Última Modificación", "Asistente Legal", "Detalle de Cambios / Motivos"],
    ...data.operations.map(op => [
      op.id,
      op.proyecto,
      op.unidad,
      op.asesor,
      op.team,
      op.jefeVentas,
      op.tipo,
      op.status,
      op.fechaIngreso,
      op.fechaEmisionInicial,
      op.modificationsCount,
      op.ultimaModificacionFecha,
      op.asistenteLegal,
      op.modificationEvents.map(e => `[${e.date}] ${e.comment}`).join(" | ")
    ])
  ];
  const wsOps = XLSX.utils.aoa_to_sheet(opRows);
  XLSX.utils.book_append_sheet(wb, wsOps, "Detalle Operaciones");

  // 4. Por Proyecto y Equipo
  const summaryRows = [
    ["INCIDENCIA DE MODIFICACIONES POR PROYECTO INMOBILIARIO"],
    ["Proyecto", "Modificaciones Solicitadas", "Operaciones Afectadas", "Total Operaciones", "% Tasa"],
    ...data.projectSummaries.map(p => [p.project, p.modificationsCount, p.affectedOperationsCount, p.totalOperationsCount, `${p.rate}%`]),
    [],
    ["INCIDENCIA DE MODIFICACIONES POR EQUIPO COMERCIAL"],
    ["Equipo", "Jefe de Ventas", "Modificaciones Solicitadas", "Operaciones Afectadas", "Total Operaciones", "% Tasa"],
    ...data.teamSummaries.map(t => [t.team, t.jefeVentas, t.modificationsCount, t.affectedOperationsCount, t.totalOperationsCount, `${t.rate}%`])
  ];
  const wsSummaries = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummaries, "Por Proyecto y Equipo");

  // Filename
  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `Reporte_Modificaciones_Asesores_${dateStr}.xlsx`);
}
