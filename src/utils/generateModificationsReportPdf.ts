import { jsPDF } from "jspdf";
import { AppSettings, OperationRecord } from "../types";
import { extractAllModificationsReport, OperationModificationItem, AdvisorModificationRanking } from "./exportModificationsReport";
import { formatDateTimeFull } from "./dateUtils";

export interface ModificationsPdfOptions {
  startDate?: string;
  endDate?: string;
  generatedBy?: string;
  advisorSortDir?: "asc" | "desc";
  customData?: ReturnType<typeof extractAllModificationsReport>;
}

export function generateModificationsReportPdf(
  records: OperationRecord[],
  settings?: AppSettings,
  options: ModificationsPdfOptions = {}
): jsPDF {
  const {
    startDate,
    endDate,
    generatedBy = "Administración / Jefatura Legal",
    advisorSortDir = "desc",
    customData
  } = options;

  const data = customData || extractAllModificationsReport(records, settings, startDate, endDate);

  // Sort advisors by direction
  const sortedAdvisors = [...data.advisorRankings].sort((a, b) => {
    return advisorSortDir === "asc"
      ? a.modificationsCount - b.modificationsCount
      : b.modificationsCount - a.modificationsCount;
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let yPos = margin;

  const addHeader = (titleText: string) => {
    // Header gradient / bar
    doc.setFillColor(30, 58, 138); // Brand blue
    doc.rect(margin, yPos, contentWidth, 18, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(titleText, margin + 4, yPos + 7);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const dateSubtitle = `Período: ${startDate || "Histórico"} al ${endDate || "Actualidad"}  |  Generado: ${formatDateTimeFull(new Date())}`;
    doc.text(dateSubtitle, margin + 4, yPos + 13);

    yPos += 22;
  };

  const checkPageBreak = (neededHeight: number) => {
    if (yPos + neededHeight > pageHeight - 15) {
      doc.addPage();
      yPos = margin;
      addHeader("REPORTE DE MODIFICACIONES DE MINUTAS (Continuación)");
    }
  };

  // 1. PAGE 1: Header & Executive KPIs
  addHeader("INFORME EJECUTIVO: MODIFICACIONES DE MINUTAS & ASESORES");

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Reporte oficial enfocado exclusivamente en la cantidad de emisiones que solicitaron modificaciones por operación y el ranking de asesores inmobiliarios con mayor volumen de cambios solicitados.`,
    margin,
    yPos,
    { maxWidth: contentWidth }
  );
  yPos += 8;

  // 4 KPI Summary Boxes
  const boxWidth = (contentWidth - 6) / 4;
  const boxHeight = 16;

  const kpis = [
    { label: "TOTAL EMISIONES", val: String(data.totalEmissionsCount), sub: "Minutas en período", bg: [239, 246, 255], border: [191, 219, 254], txt: [30, 64, 175] },
    { label: "CON MODIFICACIONES", val: String(data.operationsWithModificationsCount), sub: "Operaciones modificadas", bg: [254, 242, 242], border: [254, 202, 202], txt: [185, 28, 28] },
    { label: "TOTAL SOLICITUDES", val: String(data.totalModificationsCount), sub: "Modificaciones pedidas", bg: [245, 243, 255], border: [221, 214, 254], txt: [109, 40, 217] },
    { label: "TASA DE MODIFICACIÓN", val: `${data.overallModificationRate}%`, sub: "Tasa global de cambio", bg: [236, 253, 245], border: [167, 243, 208], txt: [4, 120, 87] },
  ];

  kpis.forEach((k, idx) => {
    const x = margin + idx * (boxWidth + 2);
    doc.setFillColor(k.bg[0], k.bg[1], k.bg[2]);
    doc.setDrawColor(k.border[0], k.border[1], k.border[2]);
    doc.rect(x, yPos, boxWidth, boxHeight, "FD");

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(k.txt[0], k.txt[1], k.txt[2]);
    doc.text(k.label, x + 2.5, yPos + 4.5);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(k.val, x + 2.5, yPos + 10.5);

    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(k.sub, x + 2.5, yPos + 14);
  });

  yPos += boxHeight + 8;

  // 2. Section: Ranking de Asesores que pidieron más modificaciones
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`1. RANKING DE ASESORES CON MÁS MODIFICACIONES SOLICITADAS (${advisorSortDir === "asc" ? "Menor a Mayor" : "Mayor a Menor"})`, margin, yPos);
  yPos += 5;

  // Table header for Advisors
  const advCols = [
    { title: "#", width: 8, align: "center" },
    { title: "ASESOR INMOBILIARIO", width: 50, align: "left" },
    { title: "EQUIPO", width: 32, align: "left" },
    { title: "JEFE VENTAS", width: 34, align: "left" },
    { title: "MODIFICACIONES", width: 24, align: "center" },
    { title: "OPS. AFECTADAS", width: 20, align: "center" },
    { title: "% TASA", width: 14, align: "center" },
  ];

  const drawTableHeader = (cols: typeof advCols) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, yPos, contentWidth, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);

    let curX = margin;
    cols.forEach(col => {
      const textX = col.align === "center" ? curX + col.width / 2 : curX + 2;
      doc.text(col.title, textX, yPos + 4.2, { align: col.align as any });
      curX += col.width;
    });
    yPos += 6.5;
  };

  drawTableHeader(advCols);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  sortedAdvisors.forEach((adv, idx) => {
    checkPageBreak(7);

    // Zebra row
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yPos - 0.5, contentWidth, 5.5, "F");
    }

    let curX = margin;

    // # Pos
    doc.setFont("helvetica", "bold");
    doc.setTextColor(idx < 3 ? 185 : 71, idx < 3 ? 28 : 85, idx < 3 ? 28 : 105);
    doc.text(String(idx + 1), curX + advCols[0].width / 2, yPos + 3.5, { align: "center" });
    curX += advCols[0].width;

    // Asesor
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const shortName = adv.advisorName.length > 25 ? adv.advisorName.substring(0, 23) + "..." : adv.advisorName;
    doc.text(shortName, curX + 2, yPos + 3.5);
    curX += advCols[1].width;

    // Team
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(adv.team.length > 18 ? adv.team.substring(0, 16) + "..." : adv.team, curX + 2, yPos + 3.5);
    curX += advCols[2].width;

    // Jefe
    doc.text(adv.jefeVentas.length > 18 ? adv.jefeVentas.substring(0, 16) + "..." : adv.jefeVentas, curX + 2, yPos + 3.5);
    curX += advCols[3].width;

    // Modificaciones
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28);
    doc.text(String(adv.modificationsCount), curX + advCols[4].width / 2, yPos + 3.5, { align: "center" });
    curX += advCols[4].width;

    // Ops Afectadas
    doc.setTextColor(15, 23, 42);
    doc.text(String(adv.affectedOperationsCount), curX + advCols[5].width / 2, yPos + 3.5, { align: "center" });
    curX += advCols[5].width;

    // Tasa
    doc.text(`${adv.modificationRate}%`, curX + advCols[6].width / 2, yPos + 3.5, { align: "center" });

    yPos += 5.5;
  });

  yPos += 6;

  // 3. Section: Detalle por Operación (Cantidad de modificaciones solicitadas por operación)
  checkPageBreak(25);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(`2. DETALLE DE OPERACIONES QUE SOLICITARON MODIFICACIONES (${data.operations.length} OPERACIONES)`, margin, yPos);
  yPos += 5;

  const opCols = [
    { title: "ID", width: 18, align: "left" },
    { title: "PROYECTO & UNIDADES", width: 44, align: "left" },
    { title: "ASESOR", width: 34, align: "left" },
    { title: "MODIF.", width: 14, align: "center" },
    { title: "ESTADO", width: 22, align: "center" },
    { title: "ÚLTIMA MODIF.", width: 24, align: "center" },
    { title: "DETALLE / MOTIVO", width: 26, align: "left" },
  ];

  drawTableHeader(opCols);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);

  data.operations.forEach((op, idx) => {
    checkPageBreak(6.5);

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yPos - 0.5, contentWidth, 5.5, "F");
    }

    let curX = margin;

    // ID
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 138);
    doc.text(op.id.length > 9 ? op.id.substring(0, 9) : op.id, curX + 1.5, yPos + 3.5);
    curX += opCols[0].width;

    // Proyecto & Unidades
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const projUnitStr = `${op.proyecto} - ${op.unidad}`;
    doc.text(projUnitStr.length > 25 ? projUnitStr.substring(0, 23) + "..." : projUnitStr, curX + 1.5, yPos + 3.5);
    curX += opCols[1].width;

    // Asesor
    doc.text(op.asesor.length > 18 ? op.asesor.substring(0, 16) + "..." : op.asesor, curX + 1.5, yPos + 3.5);
    curX += opCols[2].width;

    // Modif count
    doc.setFont("helvetica", "bold");
    doc.setTextColor(op.modificationsCount > 1 ? 185 : 71, op.modificationsCount > 1 ? 28 : 85, op.modificationsCount > 1 ? 28 : 105);
    doc.text(`${op.modificationsCount}x`, curX + opCols[3].width / 2, yPos + 3.5, { align: "center" });
    curX += opCols[3].width;

    // Estado
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(op.status.length > 12 ? op.status.substring(0, 10) + "..." : op.status, curX + opCols[4].width / 2, yPos + 3.5, { align: "center" });
    curX += opCols[4].width;

    // Fecha
    const shortDate = op.ultimaModificacionFecha.split(" ")[0] || "-";
    doc.text(shortDate, curX + opCols[5].width / 2, yPos + 3.5, { align: "center" });
    curX += opCols[5].width;

    // Detalle
    const firstComment = op.modificationEvents[0]?.comment || "Modificación solicitada";
    doc.text(firstComment.length > 18 ? firstComment.substring(0, 16) + "..." : firstComment, curX + 1.5, yPos + 3.5);

    yPos += 5.5;
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);

    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Sistema de Gestión Legal Inmobiliaria  |  Reporte Especializado de Modificaciones`, margin, pageHeight - 6);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  return doc;
}
