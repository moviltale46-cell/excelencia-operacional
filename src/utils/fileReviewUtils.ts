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
 * Resolves the supervisor(s) linked to a given Jefe de Ventas.
 */
export function getSupervisorsForJefe(jefeVentas: string, settings?: AppSettings): string[] {
  if (!jefeVentas || !settings?.supervisoresVentas || settings.supervisoresVentas.length === 0) {
    return [];
  }
  const cleanJefe = jefeVentas.trim().toLowerCase();
  const getCanonicalToken = (str: string) => {
    if (str.includes("francisco")) return "francisco";
    if (str.includes("jhazmin")) return "jhazmin";
    if (str.includes("ninoska")) return "ninoska";
    if (str.includes("paula")) return "paula";
    return str;
  };
  const targetToken = getCanonicalToken(cleanJefe);

  return settings.supervisoresVentas.filter(supName => {
    const rawAssigned = (settings.asesorJefes?.[supName] || "").trim().toLowerCase();
    if (!rawAssigned) return false;
    const supToken = getCanonicalToken(rawAssigned);
    if (targetToken && supToken && targetToken === supToken) return true;
    return rawAssigned === cleanJefe || cleanJefe.includes(rawAssigned) || rawAssigned.includes(cleanJefe);
  });
}

/**
 * Builds clean, deduplicated CC email string.
 * Special rule: If the advisor being sent the review (TO) is the supervisor,
 * they are NOT duplicated into CC as supervisor.
 */
export function buildFileReviewCcList(params: {
  jefeVentasEmail?: string;
  supervisorName?: string;
  supervisorEmail?: string;
  asesorName?: string;
  asesorEmail?: string;
  globalCc?: string;
  adicionalCc?: string;
}): string {
  const {
    jefeVentasEmail,
    supervisorName,
    supervisorEmail,
    asesorName,
    asesorEmail,
    globalCc,
    adicionalCc
  } = params;

  const toClean = (asesorEmail || "").trim().toLowerCase();
  const asesorNameClean = (asesorName || "").trim().toLowerCase();
  const supervisorNameClean = (supervisorName || "").trim().toLowerCase();

  const ccSet = new Set<string>();

  // 1. Jefe de Ventas
  if (jefeVentasEmail && jefeVentasEmail.trim()) {
    const jefeMail = jefeVentasEmail.trim().toLowerCase();
    if (jefeMail !== toClean) {
      ccSet.add(jefeMail);
    }
  }

  // 2. Supervisor de Ventas
  // Requirement: "Igual cuando se envie el correo como asesor que ya no sea necesario volverlo a copiar en el correo como supervisor."
  const isAdvisorTheSupervisor = Boolean(
    (supervisorNameClean && asesorNameClean && supervisorNameClean === asesorNameClean) ||
    (supervisorEmail && supervisorEmail.trim().toLowerCase() === toClean)
  );

  if (!isAdvisorTheSupervisor && supervisorEmail && supervisorEmail.trim()) {
    const supMail = supervisorEmail.trim().toLowerCase();
    if (supMail !== toClean) {
      ccSet.add(supMail);
    }
  }

  // 3. Global CC (e.g. Grupo_Legal_Comercial@taleinmobiliaria.com)
  if (globalCc && globalCc.trim()) {
    const globalMail = globalCc.trim().toLowerCase();
    if (globalMail !== toClean) {
      ccSet.add(globalMail);
    }
  }

  // 4. Correo Adicional (opcional, separated by ; or , or spaces)
  if (adicionalCc && adicionalCc.trim()) {
    const parts = adicionalCc.split(/[,;\n\s]+/).filter(Boolean);
    parts.forEach(part => {
      const clean = part.trim().toLowerCase();
      if (clean && clean.includes("@") && clean !== toClean) {
        ccSet.add(clean);
      }
    });
  }

  return Array.from(ccSet).join("; ");
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
      "Supervisor de Ventas",
      "Correo Supervisor",
      "Copia Adicional",
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
      r.supervisor || "Sin Supervisor",
      r.supervisorEmail || "",
      r.adicionalCc || "",
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

export interface ParsedEmailImportResult {
  success: boolean;
  count: number;
  updatedEmails: Record<string, string>;
  updatedAsesores: string[];
  updatedJefes: Record<string, string>;
  updatedSupervisores: string[];
  stats: {
    emails: number;
    asesores: number;
    supervisores: number;
    jefes: number;
  };
}

/**
 * Generates and downloads an Excel template for corporate emails, advisors, and supervisor assignments.
 */
export function downloadCorporateEmailsTemplateExcel() {
  const wb = XLSX.utils.book_new();

  // 1. Sheet Directorio_Correos
  const headers = [
    "Nombre Completo",
    "Correo Corporativo",
    "Rol / Tipo",
    "Jefe de Ventas Asignado",
    "Es Supervisor (SÍ/NO)"
  ];

  const sampleRows = [
    ["GABRIEL BAUTISTA", "gabriel.bautista@taleinmobiliaria.com", "Supervisor", "Francisco Xavier Laurie Ezeta", "SÍ"],
    ["CARLOS MENDOZA", "carlos.mendoza@taleinmobiliaria.com", "Asesor", "Francisco Xavier Laurie Ezeta", "NO"],
    ["MARIA FERNANDA ROJAS", "maria.rojas@taleinmobiliaria.com", "Asesor", "Jhazmin", "NO"],
    ["FRANCISCO XAVIER LAURIE EZETA", "francisco.laurie@taleinmobiliaria.com", "Jefe de Ventas", "", "NO"],
    ["JHAZMIN", "jhazmin@taleinmobiliaria.com", "Jefe de Ventas", "", "NO"],
    ["NINOSKA", "ninoska@taleinmobiliaria.com", "Jefe de Ventas", "", "NO"],
    ["PAULA CASAS", "paula.casas@taleinmobiliaria.com", "Jefe de Ventas", "", "NO"],
    ["PATRICIA CARDENAS", "patricia.cardenas@taleinmobiliaria.com", "Jefe Legal", "", "NO"]
  ];

  const wsData = [headers, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws["!cols"] = [
    { wch: 34 },
    { wch: 40 },
    { wch: 20 },
    { wch: 34 },
    { wch: 24 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Directorio_Correos");

  // 2. Sheet Instrucciones
  const instructionsData = [
    ["GUÍA DE LLENADO DE PLANTILLA DE CORREOS CORPORATIVOS (@taleinmobiliaria.com)"],
    [""],
    ["Columna", "Descripción", "Valores Permitidos / Recomendados"],
    ["Nombre Completo", "Nombre y Apellidos del asesor o colaborador.", "Texto libre (Ej: GABRIEL BAUTISTA, CARLOS MENDOZA)"],
    ["Correo Corporativo", "Dirección de correo corporativo institucional.", "ejemplo@taleinmobiliaria.com (si se deja vacío se autogenera)"],
    ["Rol / Tipo", "Tipo de perfil en el sistema inmobiliario.", "Asesor, Supervisor, Jefe de Ventas, Jefe Legal, Asistente Legal, Administrador"],
    ["Jefe de Ventas Asignado", "Jefe de Ventas al que pertenece el asesor o supervisor.", "Francisco Xavier Laurie Ezeta, Jhazmin, Ninoska, Paula Casas"],
    ["Es Supervisor (SÍ/NO)", "Habilita al asesor como Supervisor de Ventas de su Jefe.", "SÍ o NO (Si es SÍ, se vinculará automáticamente al revisar FILE)"],
    [""],
    ["IMPORTANTE:", "Al cargar el archivo, los correos se vincularán automáticamente en Revisión de FILE, Acumulado, Asesores y Directorio."]
  ];
  const wsInst = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInst["!cols"] = [{ wch: 28 }, { wch: 48 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInst, "Instrucciones");

  XLSX.writeFile(wb, "Plantilla_Directorio_Correos_Tale.xlsx");
}

/**
 * Parses an uploaded Excel file for corporate emails, linking advisors, supervisors, and jefes de ventas.
 */
export function parseCorporateEmailsExcel(
  buffer: ArrayBuffer,
  existingSettings: AppSettings
): ParsedEmailImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error("El archivo Excel no contiene hojas de datos válidas.");
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rawRows || rawRows.length === 0) {
    throw new Error("La hoja de cálculo está vacía o no tiene registros.");
  }

  const corporateEmails = { ...(existingSettings.corporateEmails || {}) };
  const asesorJefes = { ...(existingSettings.asesorJefes || {}) };
  const supervisoresVentasSet = new Set<string>(existingSettings.supervisoresVentas || []);
  const asesoresSet = new Set<string>(existingSettings.asesores || []);

  let emailsCount = 0;
  let asesoresCount = 0;
  let supervisoresCount = 0;
  let jefesCount = 0;

  const findKey = (row: any, candidates: string[]) => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const match = keys.find(k => k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === cand.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      if (match && row[match] !== undefined && String(row[match]).trim() !== "") {
        return String(row[match]).trim();
      }
    }
    return "";
  };

  rawRows.forEach(row => {
    const rawName = findKey(row, ["nombre completo", "nombre", "asesor", "usuario", "colaborador", "name", "empleado"]);
    if (!rawName) return;

    const rawEmail = findKey(row, ["correo corporativo", "correo", "email", "mail", "e-mail", "direccion"]);
    const rawRole = findKey(row, ["rol / tipo", "rol", "tipo", "cargo", "role", "perfil"]);
    const rawJefe = findKey(row, ["jefe de ventas asignado", "jefe de ventas", "jefe", "jefe asignado", "supervisor de"]);
    const rawIsSupervisor = findKey(row, ["es supervisor (si/no)", "es supervisor", "supervisor", "essupervisor"]);

    const cleanName = rawName.trim();
    const upperName = cleanName.toUpperCase();
    const finalEmail = rawEmail && rawEmail.includes("@") 
      ? rawEmail.trim().toLowerCase() 
      : formatCorporateEmail(cleanName);

    // Save corporate email
    corporateEmails[cleanName] = finalEmail;
    corporateEmails[upperName] = finalEmail;
    emailsCount++;

    const isSupervisor = 
      rawIsSupervisor.toLowerCase() === "si" || 
      rawIsSupervisor.toLowerCase() === "sí" || 
      rawIsSupervisor.toLowerCase() === "yes" || 
      rawIsSupervisor.toLowerCase() === "true" || 
      rawIsSupervisor === "1" || 
      rawRole.toLowerCase() === "supervisor";

    const isAdvisor = 
      !rawRole || 
      rawRole.toLowerCase().includes("asesor") || 
      rawRole.toLowerCase().includes("inmobiliario") || 
      isSupervisor;

    if (isAdvisor) {
      if (!asesoresSet.has(upperName)) {
        asesoresSet.add(upperName);
        asesoresCount++;
      }
    }

    // Resolve assigned Jefe de Ventas if provided
    if (rawJefe) {
      const cleanJefe = rawJefe.trim();
      let canonicalJefe = cleanJefe;
      const lowerJefe = cleanJefe.toLowerCase();
      if (lowerJefe.includes("francisco")) canonicalJefe = "Francisco Xavier Laurie Ezeta";
      else if (lowerJefe.includes("jhazmin")) canonicalJefe = "Jhazmin";
      else if (lowerJefe.includes("ninoska")) canonicalJefe = "Ninoska";
      else if (lowerJefe.includes("paula")) canonicalJefe = "Paula Casas";

      asesorJefes[upperName] = canonicalJefe;
      asesorJefes[cleanName] = canonicalJefe;
      jefesCount++;
    }

    // Handle supervisor role
    if (isSupervisor) {
      supervisoresVentasSet.add(upperName);
      supervisoresCount++;
    }
  });

  const updatedAsesores = Array.from(asesoresSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const updatedSupervisores = Array.from(supervisoresVentasSet).sort();

  return {
    success: true,
    count: emailsCount,
    updatedEmails: corporateEmails,
    updatedAsesores,
    updatedJefes: asesorJefes,
    updatedSupervisores,
    stats: {
      emails: emailsCount,
      asesores: asesoresCount,
      supervisores: supervisoresCount,
      jefes: jefesCount
    }
  };
}

