import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { AppSettings, FileReviewRecord, DEFAULT_FILE_REVIEW_EMAIL_TEMPLATE } from "../types";
import { formatDateTimeFull } from "./dateUtils";

/**
 * Normalizes a full name into a corporate @taleinmobiliaria.com email address.
 * E.g. "Gustavo Jesús Ipenza Quispe" -> "gustavo.ipenza@taleinmobiliaria.com"
 * E.g. "Anabel Albino" -> "anabel.albino@taleinmobiliaria.com"
 */
export function formatCorporateEmail(name: string): string {
  if (!name || !name.trim()) return "contacto@taleinmobiliaria.com";

  // If already an email, ensure it has @taleinmobiliaria.com if needed
  if (name.includes("@")) {
    return name.trim().toLowerCase();
  }

  // Clean accents and symbols
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "contacto@taleinmobiliaria.com";
  if (parts.length === 1) return `${parts[0]}@taleinmobiliaria.com`;

  // First name and first surname
  const first = parts[0];
  const last = parts.length >= 3 ? parts[parts.length - 2] : parts[1];
  return `${first}.${last}@taleinmobiliaria.com`;
}

/**
 * Resolves the corporate email for an advisor or user from settings, or generates the default.
 */
export function resolveCorporateEmail(name: string, settings?: AppSettings): string {
  if (!name) return "";
  const key = name.trim();
  if (settings?.corporateEmails && settings.corporateEmails[key]) {
    return settings.corporateEmails[key].trim().toLowerCase();
  }
  // Try case-insensitive match
  if (settings?.corporateEmails) {
    const lowerKey = key.toLowerCase();
    for (const [k, v] of Object.entries(settings.corporateEmails)) {
      if (k.toLowerCase() === lowerKey && v) {
        return v.trim().toLowerCase();
      }
    }
  }
  return formatCorporateEmail(name);
}

/**
 * Builds email subject and body based on the configured template and record data.
 */
export function buildFileReviewEmailContent(
  review: {
    proyecto: string;
    unidades: string;
    asesor: string;
    tipoSolicitud: string;
    isConforme: boolean;
    observaciones: string[];
    comentarios?: string;
  },
  settings?: AppSettings
): { subject: string; body: string } {
  const tpl = settings?.fileReviewEmailTemplate || DEFAULT_FILE_REVIEW_EMAIL_TEMPLATE;

  // Build subject: CIERRE/ {PROYECTO}/ {UNIDAD}/ {ASESOR}/ {TIPO}
  const subject = (tpl.subjectTemplate || "CIERRE/ {PROYECTO}/ {UNIDAD}/ {ASESOR}/ {TIPO}")
    .replace(/{PROYECTO}/gi, review.proyecto.toUpperCase())
    .replace(/{UNIDAD}/gi, (review.unidades || "S/U").toUpperCase())
    .replace(/{ASESOR}/gi, review.asesor.toUpperCase())
    .replace(/{TIPO}/gi, (review.tipoSolicitud || "EMISION").toUpperCase());

  let body = "";
  if (review.isConforme) {
    // Conforme template matching Image 4
    body = (tpl.conformeBody || "Estimado @{ASESOR}\n\nConforme.\n\nGracias.")
      .replace(/{ASESOR}/gi, review.asesor);
    if (review.comentarios && review.comentarios.trim()) {
      body += `\n\nNota: ${review.comentarios.trim()}`;
    }
  } else {
    // Observado template
    const header = (tpl.observadoHeader || "Estimado @{ASESOR}\n\nSe remiten las siguientes observaciones en la revisión del FILE:")
      .replace(/{ASESOR}/gi, review.asesor);

    const obsBullets = review.observaciones.length > 0
      ? review.observaciones.map(o => `• ${o}`).join("\n")
      : "• Observaciones generales en documentación del file.";

    const commentPart = review.comentarios && review.comentarios.trim()
      ? `\n\nComentarios adicionales:\n${review.comentarios.trim()}`
      : "";

    const footer = tpl.observadoFooter || "\n\nFavor de subsanar a la brevedad.\n\nGracias.";

    body = `${header}\n\n${obsBullets}${commentPart}${footer}`;
  }

  return { subject, body };
}

/**
 * Exports File Reviews Report to Excel.
 */
export function downloadFileReviewsExcel(
  reviews: FileReviewRecord[],
  dateRangeStr?: string
) {
  const wb = XLSX.utils.book_new();

  // 1. Resumen de Revisiones de FILE
  const rows = [
    ["REPORTE DE REVISIONES DE FILE LEGAL"],
    [`Generado el: ${formatDateTimeFull(new Date())}`],
    [`Período: ${dateRangeStr || "Histórico Completo"}`],
    [],
    [
      "ID",
      "Fecha Revisión",
      "Proyecto",
      "Unidades",
      "Asesor Inmobiliario",
      "Correo Asesor",
      "Jefe de Ventas",
      "Correo Jefe",
      "Tipo Solicitud",
      "Resultado",
      "Observaciones",
      "Comentarios",
      "Revisado Por",
      "Rol Revisor",
      "Asunto Correo",
      "En Copia (CC)"
    ],
    ...reviews.map(r => [
      r.id,
      r.dateFormatted || r.createdAt,
      r.proyecto,
      r.unidades,
      r.asesor,
      r.asesorEmail,
      r.jefeVentas,
      r.jefeVentasEmail,
      r.tipoSolicitud,
      r.isConforme ? "TODO CONFORME" : "OBSERVADO",
      r.observaciones && r.observaciones.length > 0 ? r.observaciones.join(" | ") : "Ninguna",
      r.comentarios || "-",
      r.reviewedBy,
      r.reviewerRole,
      r.emailSubject,
      r.emailCc
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Revisiones de File");

  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `Reporte_Revision_FILE_${dateStr}.xlsx`);
}

/**
 * Exports File Reviews Report to PDF.
 */
export function generateFileReviewsPdf(
  reviews: FileReviewRecord[],
  dateRangeStr?: string,
  reviewedByFilter?: string
): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  let yPos = margin;

  const totalReviews = reviews.length;
  const totalConformes = reviews.filter(r => r.isConforme).length;
  const totalObservados = reviews.filter(r => !r.isConforme).length;
  const rate = totalReviews > 0 ? ((totalConformes / totalReviews) * 100).toFixed(1) : "0";

  const addHeader = (isContinuation = false) => {
    doc.setFillColor(234, 88, 12); // Orange brand
    doc.rect(margin, yPos, contentWidth, 14, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(
      isContinuation 
        ? "REPORTE DE REVISIONES DE FILE (Continuación)" 
        : "INFORME OFICIAL: REVISIONES DE FILE & CORREOS A ASESORES", 
      margin + 4, 
      yPos + 6
    );

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    const sub = `Período: ${dateRangeStr || "Histórico"}  |  Generado: ${formatDateTimeFull(new Date())}  |  ${reviewedByFilter ? `Revisor: ${reviewedByFilter}` : "Todos los revisores"}`;
    doc.text(sub, margin + 4, yPos + 11);

    yPos += 18;
  };

  const checkPageBreak = (needed: number) => {
    if (yPos + needed > pageHeight - 12) {
      doc.addPage();
      yPos = margin;
      addHeader(true);
    }
  };

  addHeader(false);

  // 4 KPI Summary boxes
  const boxW = (contentWidth - 6) / 4;
  const boxH = 13;
  const kpis = [
    { label: "TOTAL FILES REVISADOS", val: String(totalReviews), bg: [248, 250, 252], txt: [30, 41, 59] },
    { label: "FILES CONFORMES", val: String(totalConformes), bg: [236, 253, 245], txt: [4, 120, 87] },
    { label: "FILES OBSERVADOS", val: String(totalObservados), bg: [254, 242, 242], txt: [185, 28, 28] },
    { label: "TASA CONFORMIDAD", val: `${rate}%`, bg: [239, 246, 255], txt: [30, 64, 175] }
  ];

  kpis.forEach((k, idx) => {
    const x = margin + idx * (boxW + 2);
    doc.setFillColor(k.bg[0], k.bg[1], k.bg[2]);
    doc.rect(x, yPos, boxW, boxH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(k.txt[0], k.txt[1], k.txt[2]);
    doc.text(k.label, x + 2.5, yPos + 4.5);

    doc.setFontSize(11);
    doc.text(k.val, x + 2.5, yPos + 10.5);
  });

  yPos += boxH + 6;

  // Table columns
  const cols = [
    { title: "ID", width: 22, align: "left" },
    { title: "FECHA", width: 26, align: "center" },
    { title: "PROYECTO & UNIDADES", width: 50, align: "left" },
    { title: "ASESOR", width: 42, align: "left" },
    { title: "JEFE VENTAS", width: 36, align: "left" },
    { title: "RESULTADO", width: 26, align: "center" },
    { title: "REVISOR", width: 30, align: "left" },
    { title: "OBSERVACIONES / DETALLE", width: 41, align: "left" }
  ];

  doc.setFillColor(241, 245, 249);
  doc.rect(margin, yPos, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);

  let curX = margin;
  cols.forEach(c => {
    const tx = c.align === "center" ? curX + c.width / 2 : curX + 1.5;
    doc.text(c.title, tx, yPos + 4.2, { align: c.align as any });
    curX += c.width;
  });
  yPos += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);

  reviews.forEach((r, idx) => {
    checkPageBreak(6);

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yPos - 0.5, contentWidth, 5.5, "F");
    }

    let cx = margin;

    // ID
    doc.setFont("helvetica", "bold");
    doc.setTextColor(234, 88, 12);
    doc.text(r.id.length > 11 ? r.id.substring(0, 11) : r.id, cx + 1.5, yPos + 3.5);
    cx += cols[0].width;

    // Fecha
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(r.dateFormatted.split(" ")[0] || r.createdAt.split("T")[0] || "-", cx + cols[1].width / 2, yPos + 3.5, { align: "center" });
    cx += cols[1].width;

    // Proyecto & Unidades
    doc.setTextColor(15, 23, 42);
    const pu = `${r.proyecto} - ${r.unidades}`;
    doc.text(pu.length > 30 ? pu.substring(0, 28) + "..." : pu, cx + 1.5, yPos + 3.5);
    cx += cols[2].width;

    // Asesor
    doc.text(r.asesor.length > 22 ? r.asesor.substring(0, 20) + "..." : r.asesor, cx + 1.5, yPos + 3.5);
    cx += cols[3].width;

    // Jefe
    doc.text(r.jefeVentas.length > 18 ? r.jefeVentas.substring(0, 16) + "..." : r.jefeVentas, cx + 1.5, yPos + 3.5);
    cx += cols[4].width;

    // Resultado
    doc.setFont("helvetica", "bold");
    if (r.isConforme) {
      doc.setTextColor(4, 120, 87);
      doc.text("CONFORME", cx + cols[5].width / 2, yPos + 3.5, { align: "center" });
    } else {
      doc.setTextColor(185, 28, 28);
      doc.text(`OBSERVADO (${r.observaciones?.length || 1})`, cx + cols[5].width / 2, yPos + 3.5, { align: "center" });
    }
    cx += cols[5].width;

    // Revisor
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(r.reviewedBy.length > 16 ? r.reviewedBy.substring(0, 14) + "..." : r.reviewedBy, cx + 1.5, yPos + 3.5);
    cx += cols[6].width;

    // Observaciones / Detalle
    doc.setTextColor(100, 116, 139);
    const detail = r.isConforme ? "Todo Conforme" : (r.observaciones?.join(", ") || r.comentarios || "Observaciones");
    doc.text(detail.length > 25 ? detail.substring(0, 23) + "..." : detail, cx + 1.5, yPos + 3.5);

    yPos += 5.5;
  });

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);

    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Sistema de Gestión Legal Inmobiliaria  |  Módulo Revisión de FILE  |  Correos @taleinmobiliaria.com`, margin, pageHeight - 4);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 4, { align: "right" });
  }

  return doc;
}
