import { jsPDF } from "jspdf";
import { OperationRecord } from "../types";

export interface LegalReportOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  projectName?: string;
  generatedBy?: string;
}

export function generateLegalReportPdf(
  records: OperationRecord[],
  options: LegalReportOptions
): jsPDF {
  const { startDate, endDate, projectName, generatedBy = "Marilyn Saona (Jefe Legal)" } = options;

  // Filter records within date range
  const filtered = records.filter(r => {
    // Check registration date or timestamp
    const dateStr = r.solicitud || r.createdAt || r.emision || "";
    // Normalize date string (can be YYYY-MM-DD or DD/MM/YYYY)
    let recordDate = "";
    if (dateStr.includes("/")) {
      const parts = dateStr.split(" ")[0].split("/");
      if (parts.length === 3) {
        // DD/MM/YYYY -> YYYY-MM-DD
        recordDate = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      }
    } else if (dateStr.includes("-")) {
      recordDate = dateStr.split(" ")[0];
    }

    if (startDate && recordDate && recordDate < startDate) return false;
    if (endDate && recordDate && recordDate > endDate) return false;
    if (projectName && r.proyecto?.toLowerCase() !== projectName.toLowerCase()) return false;
    return true;
  });

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 16;

  // Primary palette: Navy brand (#1e3a8a), Slate (#475569), Amber (#d97706), Rose (#e11d48)
  const drawHeader = () => {
    // Top banner
    doc.setFillColor(30, 58, 138); // Brand Primary Navy
    doc.rect(0, 0, pageWidth, 12, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("CONSORCIO INMOBILIARIO - GERENCIA LEGAL", margin, 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const nowStr = new Date().toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    doc.text(`Generado: ${nowStr}`, pageWidth - margin, 8, { align: "right" });
  };

  drawHeader();
  y = 22;

  // Title Block
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("INFORME DE GESTIÓN Y CONTROL OPERATIVO", margin, y);
  y += 6;

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFont("helvetica", "bold");
  const periodText = `Periodo Evaluado: Del ${startDate || "Inicio"} al ${endDate || "Actualidad"}`;
  doc.text(periodText, margin, y);

  if (projectName) {
    doc.setFont("helvetica", "normal");
    doc.text(` | Proyecto: ${projectName}`, margin + doc.getTextWidth(periodText), y);
  }
  y += 8;

  // Divider line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Metrics summary
  const total = filtered.length;
  const emisionCount = filtered.filter(r => (r.tipo || "").toUpperCase().includes("EMISI")).length;
  const modifCount = filtered.filter(r => (r.tipo || "").toUpperCase().includes("MODIFIC")).length;
  const adendaCount = filtered.filter(r => (r.tipo || "").toUpperCase().includes("ADENDA")).length;
  const otherTypesCount = total - (emisionCount + modifCount + adendaCount);

  const observedCount = filtered.filter(r => {
    const s = (r.status || "").toUpperCase();
    return s.includes("OBSERVAD") || (r.observationReasons && r.observationReasons.length > 0) || !!r.observacion;
  }).length;

  const closedCount = filtered.filter(r => {
    const s = (r.status || "").toUpperCase();
    return s.includes("CIERRE") || s.includes("COMPLETO");
  }).length;

  const inReviewCount = filtered.filter(r => {
    const s = (r.status || "").toUpperCase();
    return s.includes("REVISION") || s.includes("REVISIÓN");
  }).length;

  // KPI Summary Cards
  const cardW = (pageWidth - margin * 2 - 9) / 4;
  const cardH = 18;

  const kpis = [
    { label: "OPERACIONES TOTALES", val: total.toString(), color: [30, 58, 138] },
    { label: "EMISIONES", val: emisionCount.toString(), color: [16, 185, 129] },
    { label: "OBSERVADOS", val: observedCount.toString(), color: [225, 29, 72] },
    { label: "CIERRES COMPLETOS", val: closedCount.toString(), color: [217, 119, 6] },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = margin + idx * (cardW + 3);
    // Card background
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, "FD");

    // Indicator top stripe
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(cx, y, cardW, 2, "F");

    // Value
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(kpi.val, cx + cardW / 2, y + 9.5, { align: "center" });

    // Label
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(kpi.label, cx + cardW / 2, y + 14.5, { align: "center" });
  });

  y += cardH + 7;

  // SECTION 1: Resumen por Tipo de Operación
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - margin * 2, 6, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("1. DESGLOSE POR TIPO DE OPERACIÓN", margin + 3, y + 4.2);
  y += 9;

  const tipoBreakdown = [
    { name: "Emisión de Minutas", count: emisionCount, pct: total > 0 ? ((emisionCount / total) * 100).toFixed(1) : "0" },
    { name: "Modificaciones", count: modifCount, pct: total > 0 ? ((modifCount / total) * 100).toFixed(1) : "0" },
    { name: "Adendas", count: adendaCount, pct: total > 0 ? ((adendaCount / total) * 100).toFixed(1) : "0" },
  ];
  if (otherTypesCount > 0) {
    tipoBreakdown.push({
      name: "Otros Tipos (Contratos, Cartas, etc.)",
      count: otherTypesCount,
      pct: total > 0 ? ((otherTypesCount / total) * 100).toFixed(1) : "0"
    });
  }

  // Draw mini table for operation types
  tipoBreakdown.forEach((t) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`• ${t.name}`, margin + 5, y);
    doc.setFont("helvetica", "bold");
    doc.text(`${t.count} ops (${t.pct}%)`, margin + 85, y);
    y += 5;
  });

  y += 3;

  // SECTION 2: Desempeño por Asistente Legal
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - margin * 2, 6, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("2. ASIGNACIÓN Y CARGA POR ASISTENTE LEGAL", margin + 3, y + 4.2);
  y += 9;

  // Aggregate by assistant (filter out invalid 'Asistente Legal')
  const assistantMap: { [name: string]: { total: number; closed: number; observed: number } } = {};
  filtered.forEach(r => {
    let asst = (r.derivadoA || "").trim();
    if (!asst || asst.toLowerCase() === "asistente legal" || asst.toLowerCase() === "asistente") {
      asst = "Sin Asignar";
    }
    if (!assistantMap[asst]) {
      assistantMap[asst] = { total: 0, closed: 0, observed: 0 };
    }
    assistantMap[asst].total += 1;
    const s = (r.status || "").toUpperCase();
    if (s.includes("CIERRE") || s.includes("COMPLETO") || s.includes("EMITID")) {
      assistantMap[asst].closed += 1;
    }
    if (s.includes("OBSERVAD")) {
      assistantMap[asst].observed += 1;
    }
  });

  Object.entries(assistantMap).forEach(([asstName, st]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text(`👤 ${asstName}:`, margin + 5, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Carga Asignada: ${st.total} ops  |  Atendidas/Cerradas: ${st.closed}  |  Observadas: ${st.observed}`, margin + 50, y);
    y += 5;
  });

  y += 4;

  // SECTION 3: Tabla Detallada de Expedientes en el Periodo
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - margin * 2, 6, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`3. DETALLE DE OPERACIONES REGISTRADAS (${filtered.length} REGISTROS)`, margin + 3, y + 4.2);
  y += 8;

  // Table header
  const tableHeaders = [
    { title: "FECHA", w: 22 },
    { title: "EXP / ID", w: 22 },
    { title: "PROYECTO", w: 34 },
    { title: "UNIDAD", w: 22 },
    { title: "TIPO", w: 24 },
    { title: "ASESOR", w: 28 },
    { title: "ESTADO", w: 30 },
  ];

  const drawTableHeader = (curY: number) => {
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(margin, curY, pageWidth - margin * 2, 5.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);

    let colX = margin + 2;
    tableHeaders.forEach(th => {
      doc.text(th.title, colX, curY + 3.8);
      colX += th.w;
    });
  };

  drawTableHeader(y);
  y += 6.5;

  // Rows
  filtered.forEach((r, idx) => {
    // Check if new page needed
    if (y > pageHeight - 25) {
      doc.addPage();
      drawHeader();
      y = 18;
      drawTableHeader(y);
      y += 6.5;
    }

    // Zebra striping
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 1, pageWidth - margin * 2, 5, "F");
    }

    doc.setFontSize(6.5);
    doc.setTextColor(30, 41, 59);

    let colX = margin + 2;

    // Date
    const fecha = (r.solicitud || r.createdAt || "").split(" ")[0];
    doc.setFont("helvetica", "normal");
    doc.text(fecha.substring(0, 10), colX, y + 2.5);
    colX += tableHeaders[0].w;

    // ID
    doc.setFont("helvetica", "bold");
    doc.text((r.id || "").substring(0, 12), colX, y + 2.5);
    colX += tableHeaders[1].w;

    // Proyecto
    doc.setFont("helvetica", "normal");
    doc.text((r.proyecto || "").substring(0, 20), colX, y + 2.5);
    colX += tableHeaders[2].w;

    // Unidad (Dpto, Estac, Dep)
    const unidad = [
      r.dpto ? `D:${r.dpto}` : "",
      r.estac ? `E:${r.estac}` : "",
      r.dep ? `Dep:${r.dep}` : ""
    ].filter(Boolean).join(" ");
    doc.text(unidad.substring(0, 14), colX, y + 2.5);
    colX += tableHeaders[3].w;

    // Tipo
    doc.text((r.tipo || "EMISION").substring(0, 15), colX, y + 2.5);
    colX += tableHeaders[4].w;

    // Asesor
    doc.text((r.asesor || "-").substring(0, 16), colX, y + 2.5);
    colX += tableHeaders[5].w;

    // Estado
    const statusText = r.status || "Pendiente";
    if (statusText.toUpperCase().includes("OBSERV")) {
      doc.setTextColor(225, 29, 72);
      doc.setFont("helvetica", "bold");
    } else if (statusText.toUpperCase().includes("CIERRE") || statusText.toUpperCase().includes("EMITID")) {
      doc.setTextColor(16, 185, 129);
      doc.setFont("helvetica", "bold");
    } else {
      doc.setTextColor(30, 41, 59);
      doc.setFont("helvetica", "normal");
    }
    doc.text(statusText.substring(0, 20), colX, y + 2.5);

    y += 5.2;
  });

  // Check footer room
  if (y > pageHeight - 30) {
    doc.addPage();
    drawHeader();
    y = 22;
  } else {
    y += 8;
  }

  // Signatures / Validation block
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - 35, y + 12, pageWidth / 2 + 35, y + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(generatedBy, pageWidth / 2, y + 16, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Jefatura Legal & Control Operativo", pageWidth / 2, y + 20, { align: "center" });
  doc.text("Consorcio Inmobiliario", pageWidth / 2, y + 23.5, { align: "center" });

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    doc.text("Informe Confidencial para Uso Interno del Área Legal", margin, pageHeight - 6);
  }

  return doc;
}
