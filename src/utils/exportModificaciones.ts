import { OperationRecord } from "../types";
import { formatProjectAndUnits, safeParseDate, isOperationActuallyReopened } from "./dateUtils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";

export interface OperationModificationItem {
  nro: number;
  opId: string;
  proyecto: string;
  unidad: string;
  dpto: string;
  estac: string;
  dep: string;
  asesor: string;
  equipo: string;
  jefeVentas: string;
  tipoInicial: string;
  fechaSolicitud: string;
  fechaEmision: string;
  statusActual: string;
  modificacionesCount: number;
  motivosDetalle: string;
  events: Array<{
    date: string;
    user: string;
    comentario: string;
    status: string;
  }>;
  record: OperationRecord;
}

export interface AdvisorModificationStat {
  rank: number;
  asesor: string;
  equipo: string;
  modificacionesSolicitadas: number;
  operacionesConModificacion: number;
  totalOperaciones: number;
  tasaModificacion: number; // percentage e.g. 15.4
  tasaModificacionTexto: string; // e.g. "15.4%"
  proyectos: string;
}

export interface ModificationsReportData {
  operations: OperationModificationItem[];
  advisorRanking: AdvisorModificationStat[];
  stats: {
    totalOperacionesConModificacion: number;
    totalModificacionesSolicitadas: number;
    totalOperacionesSistema: number;
    tasaGlobalModificacion: string;
    asesorTopNombre: string;
    asesorTopCount: number;
  };
}

/**
 * Extracts and analyzes all modifications requested across records.
 */
export function extractAllModifications(records: OperationRecord[]): ModificationsReportData {
  const operations: OperationModificationItem[] = [];

  // Map to count total operations per advisor
  const advisorTotalOpsMap = new Map<string, number>();
  // Map to accumulate modification stats per advisor
  const advisorModMap = new Map<string, {
    asesor: string;
    equipo: string;
    modificacionesSolicitadas: number;
    operacionesConModificacion: number;
    proyectosSet: Set<string>;
  }>();

  // First pass: register total operations per advisor
  records.forEach(r => {
    const adv = (r.asesor || "Sin Asesor").trim().toUpperCase();
    advisorTotalOpsMap.set(adv, (advisorTotalOpsMap.get(adv) || 0) + 1);
  });

  // Second pass: analyze modifications per operation
  records.forEach(r => {
    const adv = (r.asesor || "Sin Asesor").trim().toUpperCase();
    const team = (r.team || "-").trim();
    const proj = (r.proyecto || "-").trim();

    const events: Array<{
      date: string;
      user: string;
      comentario: string;
      status: string;
    }> = [];

    // Analyze history entries for modification / reopening events
    if (Array.isArray(r.history) && r.history.length > 0) {
      r.history.forEach((h, idx) => {
        const st = (h.status || "").toLowerCase().trim();
        const comm = (h.comentario || "").toLowerCase().trim();
        const isModStatus = st === "modificado" || st.includes("modificaci");
        const isReopenComment = comm.includes("[reapertura]") || comm.includes("reabiert") || comm.includes("solicitud de modificación") || comm.includes("cambio de minuta") || comm.includes("cambio de datos");
        const isActuallyReopened = isOperationActuallyReopened(h);

        // Exclude initial creation if someone put "registro inicial"
        const isInitial = idx === 0 && (st.includes("pendiente") || st.includes("registro"));

        if (!isInitial && (isModStatus || isReopenComment || isActuallyReopened)) {
          events.push({
            date: h.timestamp || "-",
            user: h.user || adv,
            comentario: h.comentario || "Modificación solicitada",
            status: h.status || "Modificado"
          });
        }
      });
    }

    // Also check if operation type itself is MODIFICACION
    const tipoNorm = (r.tipo || "").toLowerCase();
    const isTipoMod = tipoNorm.includes("modificaci");
    const isStatusMod = (r.status || "").toLowerCase() === "modificado";
    const hasReentered = Boolean(r.reingresadoAt);

    if (events.length === 0 && (isTipoMod || isStatusMod || hasReentered)) {
      events.push({
        date: r.reingresadoAt || r.solicitud || r.createdAt || "-",
        user: adv,
        comentario: r.comentario || "Modificación de minuta solicitada",
        status: r.status || "Modificado"
      });
    }

    // If modifications were requested on this operation:
    if (events.length > 0) {
      const modCount = events.length;
      const motivosDetalle = events
        .map((ev, i) => `[Modif #${i + 1} (${ev.date})] ${ev.comentario}`)
        .join(" | ");

      operations.push({
        nro: operations.length + 1,
        opId: r.id,
        proyecto: proj,
        unidad: formatProjectAndUnits(r),
        dpto: r.dpto || "-",
        estac: r.estac || "-",
        dep: r.dep || "-",
        asesor: r.asesor || "Sin Asesor",
        equipo: team,
        jefeVentas: r.jefeVentas || "-",
        tipoInicial: r.tipo || "Emisión",
        fechaSolicitud: r.solicitudAt || r.solicitud || r.createdAt || "-",
        fechaEmision: r.emittedAt || r.emision || "-",
        statusActual: r.status || "Pendiente",
        modificacionesCount: modCount,
        motivosDetalle: motivosDetalle || r.comentario || "Modificación solicitada",
        events,
        record: r
      });

      // Accumulate to advisor map
      if (!advisorModMap.has(adv)) {
        advisorModMap.set(adv, {
          asesor: r.asesor || "Sin Asesor",
          equipo: team,
          modificacionesSolicitadas: 0,
          operacionesConModificacion: 0,
          proyectosSet: new Set<string>()
        });
      }
      const stat = advisorModMap.get(adv)!;
      stat.modificacionesSolicitadas += modCount;
      stat.operacionesConModificacion += 1;
      if (proj && proj !== "-") stat.proyectosSet.add(proj);
    }
  });

  // Build ranking of advisors by total modifications requested
  const advisorRanking: AdvisorModificationStat[] = Array.from(advisorModMap.values())
    .sort((a, b) => {
      // Sort descending by modifications requested
      if (b.modificacionesSolicitadas !== a.modificacionesSolicitadas) {
        return b.modificacionesSolicitadas - a.modificacionesSolicitadas;
      }
      return b.operacionesConModificacion - a.operacionesConModificacion;
    })
    .map((stat, idx) => {
      const advKey = (stat.asesor || "").trim().toUpperCase();
      const totalOps = advisorTotalOpsMap.get(advKey) || stat.operacionesConModificacion;
      const tasa = totalOps > 0 ? (stat.operacionesConModificacion / totalOps) * 100 : 0;
      return {
        rank: idx + 1,
        asesor: stat.asesor,
        equipo: stat.equipo,
        modificacionesSolicitadas: stat.modificacionesSolicitadas,
        operacionesConModificacion: stat.operacionesConModificacion,
        totalOperaciones: totalOps,
        tasaModificacion: Number(tasa.toFixed(1)),
        tasaModificacionTexto: `${tasa.toFixed(1)}%`,
        proyectos: Array.from(stat.proyectosSet).join(", ") || "-"
      };
    });

  const totalModificacionesSolicitadas = operations.reduce((sum, op) => sum + op.modificacionesCount, 0);
  const totalOperacionesConModificacion = operations.length;
  const totalOperacionesSistema = records.length;
  const tasaGlobal = totalOperacionesSistema > 0 
    ? ((totalOperacionesConModificacion / totalOperacionesSistema) * 100).toFixed(1) + "%" 
    : "0%";

  const asesorTop = advisorRanking.length > 0 ? advisorRanking[0] : null;

  return {
    operations,
    advisorRanking,
    stats: {
      totalOperacionesConModificacion,
      totalModificacionesSolicitadas,
      totalOperacionesSistema,
      tasaGlobalModificacion: tasaGlobal,
      asesorTopNombre: asesorTop?.asesor || "Ninguno",
      asesorTopCount: asesorTop?.modificacionesSolicitadas || 0
    }
  };
}

/**
 * Downloads a specialized 2-sheet Excel report focused on Modificaciones.
 */
export function downloadModificacionesExcel(records: OperationRecord[], customData?: ModificationsReportData) {
  const data = customData || extractAllModifications(records);

  // Sheet 1: Ranking of Advisors requesting modifications
  const rankingRows = data.advisorRanking.map(a => ({
    "PUESTO": a.rank,
    "ASESOR INMOBILIARIO": a.asesor,
    "EQUIPO / TEAM": a.equipo,
    "TOTAL MODIFICACIONES SOLICITADAS": a.modificacionesSolicitadas,
    "OPERACIONES CON MODIFICACIÓN": a.operacionesConModificacion,
    "TOTAL OPERACIONES DEL ASESOR": a.totalOperaciones,
    "% TASA DE MODIFICACIÓN": a.tasaModificacionTexto,
    "PROYECTOS AFECTADOS": a.proyectos
  }));

  // Sheet 2: Operation Details
  const operationRows = data.operations.map((op, idx) => ({
    "NRO.": idx + 1,
    "ID OPERACIÓN": op.opId,
    "PROYECTO": op.proyecto,
    "UNIDAD(ES)": op.unidad,
    "DPTO": op.dpto,
    "ESTACIONAMIENTO": op.estac,
    "DEPÓSITO": op.dep,
    "ASESOR INMOBILIARIO": op.asesor,
    "EQUIPO / TEAM": op.equipo,
    "JEFE DE VENTAS": op.jefeVentas,
    "CANTIDAD DE MODIFICACIONES": op.modificacionesCount,
    "FECHA SOLICITUD": op.fechaSolicitud,
    "FECHA EMISIÓN": op.fechaEmision,
    "ESTADO ACTUAL": op.statusActual,
    "MOTIVOS Y DETALLE DE MODIFICACIONES": op.motivosDetalle
  }));

  const wb = XLSX.utils.book_new();

  const enableAutoFilter = (ws: XLSX.WorkSheet) => {
    if (ws && ws["!ref"]) {
      ws["!autofilter"] = { ref: ws["!ref"] };
    }
  };

  const wsRanking = XLSX.utils.json_to_sheet(rankingRows);
  enableAutoFilter(wsRanking);
  XLSX.utils.book_append_sheet(wb, wsRanking, "RANKING ASESORES MODIFICACIONES");

  const wsOps = XLSX.utils.json_to_sheet(operationRows);
  enableAutoFilter(wsOps);
  XLSX.utils.book_append_sheet(wb, wsOps, "DETALLE POR OPERACIÓN");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `Reporte_Modificaciones_Asesores_${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Downloads a dedicated professional PDF report focused on Modificaciones.
 */
export function downloadModificacionesPdf(records: OperationRecord[], customData?: ModificationsReportData) {
  const data = customData || extractAllModifications(records);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = new Date().toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });

  // Header Banner
  doc.setFillColor(239, 68, 68); // Red / rose theme for modifications
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("REPORTE OFICIAL DE MODIFICACIONES & REAPERTURAS", 14, 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Análisis enfocado a emisiones con modificaciones solicitadas y ranking de asesores • Generado: ${dateStr}`, 14, 20);

  // KPI Summary Cards
  const startY = 34;
  const cardW = (pageWidth - 28 - 9) / 4;
  const cardH = 20;

  const kpis = [
    { label: "TOTAL MODIFICACIONES", val: `${data.stats.totalModificacionesSolicitadas}`, sub: "Solicitudes de cambio", bg: [254, 242, 242], border: [252, 165, 165], text: [153, 27, 27] },
    { label: "OPERACIONES AFECTADAS", val: `${data.stats.totalOperacionesConModificacion}`, sub: `De ${data.stats.totalOperacionesSistema} totales`, bg: [255, 247, 237], border: [253, 186, 116], text: [154, 52, 18] },
    { label: "ASESOR + MODIFICACIONES", val: `${data.stats.asesorTopNombre.split(" ")[0]}`, sub: `${data.stats.asesorTopCount} modificaciones`, bg: [245, 243, 255], border: [216, 180, 254], text: [107, 33, 168] },
    { label: "TASA DE MODIFICACIÓN", val: `${data.stats.tasaGlobalModificacion}`, sub: "% sobre total ventas", bg: [239, 246, 255], border: [191, 219, 254], text: [30, 64, 175] }
  ];

  kpis.forEach((kpi, i) => {
    const x = 14 + i * (cardW + 3);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(kpi.border[0], kpi.border[1], kpi.border[2]);
    doc.roundedRect(x, startY, cardW, cardH, 2, 2, "FD");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
    doc.text(kpi.label, x + 3, startY + 5);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(kpi.val, x + 3, startY + 13);

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(kpi.sub, x + 3, startY + 18);
  });

  // Table 1: Ranking of Advisors requesting modifications
  let currentY = startY + cardH + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("1. Ranking de Asesores que Más Modificaciones Solicitaron", 14, currentY);
  currentY += 4;

  const tableHeaders = ["#", "Asesor Inmobiliario", "Equipo / Team", "Modif. Pedidas", "Ops. Modif.", "% Tasa", "Proyectos"];
  const colWidths = [10, 50, 30, 24, 20, 16, 32];

  // Header row
  doc.setFillColor(241, 245, 249);
  doc.rect(14, currentY, 182, 6, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);

  let curX = 14;
  tableHeaders.forEach((th, idx) => {
    doc.text(th, curX + 1.5, currentY + 4.2);
    curX += colWidths[idx];
  });
  currentY += 6;

  // Advisor rows (top 15)
  const topAdvisors = data.advisorRanking.slice(0, 15);
  topAdvisors.forEach((adv, rIdx) => {
    if (currentY > pageHeight - 20) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFillColor(rIdx % 2 === 0 ? 255 : 248, rIdx % 2 === 0 ? 255 : 250, rIdx % 2 === 0 ? 255 : 252);
    doc.rect(14, currentY, 182, 5.5, "F");

    doc.setFont("helvetica", rIdx < 3 ? "bold" : "normal");
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);

    curX = 14;
    // Rank
    doc.text(String(adv.rank), curX + 1.5, currentY + 3.8);
    curX += colWidths[0];
    // Asesor
    doc.text(doc.splitTextToSize(adv.asesor, colWidths[1] - 2)[0] || adv.asesor, curX + 1.5, currentY + 3.8);
    curX += colWidths[1];
    // Equipo
    doc.text(doc.splitTextToSize(adv.equipo, colWidths[2] - 2)[0] || adv.equipo, curX + 1.5, currentY + 3.8);
    curX += colWidths[2];
    // Modif. Pedidas (bold rose)
    doc.setTextColor(190, 24, 93);
    doc.text(`${adv.modificacionesSolicitadas} modif.`, curX + 1.5, currentY + 3.8);
    doc.setTextColor(30, 41, 59);
    curX += colWidths[3];
    // Ops. Modif
    doc.text(String(adv.operacionesConModificacion), curX + 1.5, currentY + 3.8);
    curX += colWidths[4];
    // % Tasa
    doc.text(adv.tasaModificacionTexto, curX + 1.5, currentY + 3.8);
    curX += colWidths[5];
    // Proyectos
    doc.text(doc.splitTextToSize(adv.proyectos, colWidths[6] - 2)[0] || adv.proyectos, curX + 1.5, currentY + 3.8);

    currentY += 5.5;
  });

  // Table 2: Operations Detail
  currentY += 6;
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 15;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("2. Detalle de Emisiones que Solicitaron Modificaciones (Por Operación)", 14, currentY);
  currentY += 4;

  const opHeaders = ["ID", "Proyecto & Unidad", "Asesor Inmobiliario", "Modif.", "F. Emisión", "Estado Actual", "Detalle de Modificaciones"];
  const opColWidths = [22, 40, 36, 14, 18, 22, 30];

  doc.setFillColor(241, 245, 249);
  doc.rect(14, currentY, 182, 6, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);

  curX = 14;
  opHeaders.forEach((th, idx) => {
    doc.text(th, curX + 1.5, currentY + 4.2);
    curX += opColWidths[idx];
  });
  currentY += 6;

  data.operations.slice(0, 30).forEach((op, rIdx) => {
    if (currentY > pageHeight - 15) {
      doc.addPage();
      currentY = 15;
    }

    doc.setFillColor(rIdx % 2 === 0 ? 255 : 248, rIdx % 2 === 0 ? 255 : 250, rIdx % 2 === 0 ? 255 : 252);
    doc.rect(14, currentY, 182, 5.5, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(30, 41, 59);

    curX = 14;
    doc.text(op.opId, curX + 1.5, currentY + 3.8);
    curX += opColWidths[0];

    const projStr = `${op.proyecto} ${op.dpto ? "Dpto " + op.dpto : ""}`;
    doc.text(doc.splitTextToSize(projStr, opColWidths[1] - 2)[0] || projStr, curX + 1.5, currentY + 3.8);
    curX += opColWidths[1];

    doc.text(doc.splitTextToSize(op.asesor, opColWidths[2] - 2)[0] || op.asesor, curX + 1.5, currentY + 3.8);
    curX += opColWidths[2];

    doc.setFont("helvetica", "bold");
    doc.setTextColor(225, 29, 72);
    doc.text(`${op.modificacionesCount}x`, curX + 1.5, currentY + 3.8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    curX += opColWidths[3];

    doc.text((op.fechaEmision || "-").substring(0, 10), curX + 1.5, currentY + 3.8);
    curX += opColWidths[4];

    doc.text(doc.splitTextToSize(op.statusActual, opColWidths[5] - 2)[0] || op.statusActual, curX + 1.5, currentY + 3.8);
    curX += opColWidths[5];

    doc.text(doc.splitTextToSize(op.motivosDetalle, opColWidths[6] - 2)[0] || op.motivosDetalle, curX + 1.5, currentY + 3.8);

    currentY += 5.5;
  });

  const dateTag = new Date().toISOString().slice(0, 10);
  doc.save(`Reporte_Modificaciones_${dateTag}.pdf`);
}
