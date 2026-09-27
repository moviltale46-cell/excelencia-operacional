import * as XLSX from "xlsx";
import { AppSettings, OperationRecord, StatusHistoryEntry, DEFAULT_WORKING_SCHEDULE } from "../types";
import { 
  safeParseDate, 
  formatDateTimeFull, 
  formatUnitDisplay, 
  formatProjectAndUnits, 
  isOtherAreasObservation,
  resolveJefeVentasForAdvisor 
} from "./dateUtils";
import { 
  calculateBusinessTime, 
  calculateOperationTimeBreakdown 
} from "./workingHours";

export interface ObservationExportItem {
  idOperacion: string;
  proyecto: string;
  unidad: string;
  dpto: string;
  estac: string;
  dep: string;
  asesor: string;
  equipo: string;
  jefeVentas: string;
  asistenteLegal: string;
  tipoOperacion: string;
  areaOrigen: "Asesor / Legal" | "Otras Áreas";
  afectaAsesor: boolean;
  afectaAsesorTexto: "SÍ" | "NO";
  motivos: string;
  comentario: string;
  usuarioRegistro: string;
  fechaObservacion: string;
  fechaObservacionTimestamp?: number;
  fechaSubsanacion: string;
  estadoObservacion: "Subsanada / Levantada" | "Pendiente / Abierta";
  horasHabiles: number;
  minutosHabiles: number;
  tiempoDetallado: string;
  horasAsesor: number;
  horasOtrasAreas: number;
  horasLegal: number;
  minutosLegal: number;
  tiempoLegal: string;
  horasRespuestaAsesor: number;
  minutosRespuestaAsesor: number;
  tiempoRespuestaAsesor: string;
  estadoActualExpediente: string;
  fechaSolicitud: string;
  fechaEmision: string;
}

/**
 * Extracts all observation events (both historical and active, affecting advisor and other areas)
 * with business hours, resolution status, and complete operational metadata.
 */
export function extractAllObservations(
  records: OperationRecord[],
  settings?: AppSettings
): ObservationExportItem[] {
  const schedule = settings?.workingSchedule || DEFAULT_WORKING_SCHEDULE;
  const items: ObservationExportItem[] = [];
  const now = new Date();

  records.forEach((record) => {
    const unitFormatted = formatUnitDisplay(record);
    const projName = record.proyecto || "Sin Proyecto";
    const advisorName = record.asesor || "Sin Asesor";
    const teamName = record.team || "";
    const jefeVentasName = resolveJefeVentasForAdvisor(advisorName, projName, teamName, record, settings);
    const assistantName = record.derivadoA || "Sin Asignar";
    const tipoOp = record.tipo || "EMISION";
    const currentStatus = record.status || "Pendiente";
    const solicitudDate = record.solicitud || "";
    const emisionDate = record.emision || "";

    const breakdown = calculateOperationTimeBreakdown(record, schedule, now);
    const obsSegments = breakdown.segments.filter(
      s => s.role === 'ADVISOR' || s.role === 'OTHER_AREAS'
    );

    // Track which history entries we've processed
    const processedHistoryIndices = new Set<number>();

    // 1. Process from history events
    if (Array.isArray(record.history) && record.history.length > 0) {
      record.history.forEach((h: StatusHistoryEntry, idx: number) => {
        const s = (h.status || "").toLowerCase();
        const c = (h.comentario || "").toLowerCase();
        const isObsStatus = s.includes("observad") || s.includes("rechazad");
        const isObsComment = c.includes("[observación") || c.includes("[observacion") || c.includes("observad") || c.includes("rechazad");
        const hasObsReasons = Array.isArray(h.observationReasons) && h.observationReasons.length > 0;
        const isOther = isOtherAreasObservation(h) || h.tipoObservacion === "Observaciones de otras áreas" || h.affectsAdvisor === false;

        if (!isObsStatus && !isObsComment && !hasObsReasons && !isOther) {
          return;
        }

        processedHistoryIndices.add(idx);

        const obsStartDate = safeParseDate(h.timestamp) || safeParseDate(record.solicitudAt || record.createdAt) || now;
        
        // Find subsequent event when this observation was resolved / lifted / changed
        let liftDate: Date | null = null;
        let liftUser = "";
        let isResolved = false;

        for (let j = idx + 1; j < record.history!.length; j++) {
          const nextH = record.history![j];
          const nextC = (nextH.comentario || "").toLowerCase();
          const nextS = (nextH.status || "").toLowerCase();
          const isLifted = nextC.includes("levant") || nextC.includes("reapertura") || nextC.includes("reingres");
          const isStatusTransition = !nextS.includes("observad") && !nextS.includes("rechazad") && (nextS.includes("emitid") || nextS.includes("modific") || nextS.includes("revis") || nextS.includes("cierre") || nextS.includes("desist"));

          if (isLifted || isStatusTransition) {
            liftDate = safeParseDate(nextH.timestamp);
            liftUser = nextH.user || "";
            isResolved = true;
            break;
          }
        }

        // If no subsequent history entry lifted it, check if operation as a whole was emitted or re-entered or closed
        if (!isResolved) {
          if (record.reingresadoAt) {
            liftDate = safeParseDate(record.reingresadoAt);
            isResolved = true;
          } else if (record.emittedAt && !currentStatus.toLowerCase().includes("observad")) {
            liftDate = safeParseDate(record.emittedAt);
            isResolved = true;
          } else if ((currentStatus.includes("Cierre Completo") || currentStatus.includes("Desistido")) && record.updatedAt) {
            liftDate = safeParseDate(record.updatedAt);
            isResolved = true;
          }
        }

        // Find matching segment from time breakdown for ultra-precise SLA minutes
        const matchingSegment = obsSegments.find(seg => {
          const diffStart = Math.abs(seg.startTime.getTime() - obsStartDate.getTime());
          return diffStart < 5000;
        });

        let bizMinutes = 0;
        let bizHours = 0;
        let detailedTime = "0h 0m";

        if (matchingSegment) {
          bizMinutes = matchingSegment.minutes;
          bizHours = matchingSegment.hours;
          detailedTime = `${Math.floor(bizMinutes / 60)}h ${bizMinutes % 60}m (${bizMinutes} min)`;
        } else {
          const endDateForCalc = isResolved && liftDate ? liftDate : now;
          const calc = calculateBusinessTime(obsStartDate, endDateForCalc, schedule);
          bizMinutes = calc.totalMinutes;
          bizHours = Number((bizMinutes / 60).toFixed(2));
          detailedTime = calc.formattedDetailed;
        }

        // Reasons string
        let reasonsList: string[] = [];
        if (Array.isArray(h.observationReasons) && h.observationReasons.length > 0) {
          reasonsList = h.observationReasons;
        } else if (Array.isArray(record.observationReasons) && record.observationReasons.length > 0) {
          reasonsList = record.observationReasons;
        }

        const reasonsStr = reasonsList.length > 0 
          ? reasonsList.join("; ") 
          : (isOther ? "Observaciones de otras áreas" : "Observación técnica / documental");

        const affectsAdvisor = !isOther;

        items.push({
          idOperacion: record.id,
          proyecto: projName,
          unidad: unitFormatted || "-",
          dpto: record.dpto || "",
          estac: record.estac || "",
          dep: record.dep || "",
          asesor: advisorName,
          equipo: teamName,
          jefeVentas: jefeVentasName,
          asistenteLegal: assistantName,
          tipoOperacion: tipoOp,
          areaOrigen: isOther ? "Otras Áreas" : "Asesor / Legal",
          afectaAsesor: affectsAdvisor,
          afectaAsesorTexto: affectsAdvisor ? "SÍ" : "NO",
          motivos: reasonsStr,
          comentario: h.comentario || record.observacion || "Sin comentario adicional",
          usuarioRegistro: h.user || record.updatedByUser || "Sistema",
          fechaObservacion: formatDateTimeFull(obsStartDate),
          fechaObservacionTimestamp: obsStartDate.getTime(),
          fechaSubsanacion: isResolved && liftDate ? formatDateTimeFull(liftDate) : "Pendiente de Subsanación",
          estadoObservacion: isResolved ? "Subsanada / Levantada" : "Pendiente / Abierta",
          horasHabiles: bizHours,
          minutosHabiles: bizMinutes,
          tiempoDetallado: detailedTime,
          horasAsesor: affectsAdvisor ? bizHours : 0,
          horasOtrasAreas: isOther ? bizHours : 0,
          horasLegal: breakdown.legalHours,
          minutosLegal: breakdown.legalMinutes,
          tiempoLegal: breakdown.legalFormatted || `${Math.floor(breakdown.legalMinutes / 60)}h ${breakdown.legalMinutes % 60}m`,
          horasRespuestaAsesor: affectsAdvisor ? bizHours : 0,
          minutosRespuestaAsesor: affectsAdvisor ? bizMinutes : 0,
          tiempoRespuestaAsesor: affectsAdvisor ? detailedTime : "0h 0m",
          estadoActualExpediente: currentStatus,
          fechaSolicitud: solicitudDate,
          fechaEmision: emisionDate
        });
      });
    }

    // 2. If record is currently observed or has observation data but wasn't captured in history loop
    const currentIsObs = currentStatus.toLowerCase().includes("observad") || currentStatus.toLowerCase().includes("rechazad");
    const currentIsOther = isOtherAreasObservation(record) || record.tipoObservacion === "Observaciones de otras áreas" || record.affectsAdvisor === false;
    const hasActiveObservationData = currentIsObs || currentIsOther || Boolean(record.observacion) || (Array.isArray(record.observationReasons) && record.observationReasons.length > 0);

    if (processedHistoryIndices.size === 0 && hasActiveObservationData) {
      const isOther = currentIsOther;
      const affectsAdvisor = !isOther;
      const obsStartDate = safeParseDate(record.updatedAt || record.solicitudAt || record.createdAt) || now;
      const isResolved = !currentIsObs && !currentIsOther;
      const liftDate = isResolved ? safeParseDate(record.reingresadoAt || record.emittedAt || record.updatedAt) : null;
      
      const endDateForCalc = isResolved && liftDate ? liftDate : now;
      const calc = calculateBusinessTime(obsStartDate, endDateForCalc, schedule);
      const bizMinutes = calc.totalMinutes;
      const bizHours = Number((bizMinutes / 60).toFixed(2));

      const reasonsStr = Array.isArray(record.observationReasons) && record.observationReasons.length > 0
        ? record.observationReasons.join("; ")
        : (isOther ? "Observaciones de otras áreas" : "Observación técnica / documental");

      items.push({
        idOperacion: record.id,
        proyecto: projName,
        unidad: unitFormatted || "-",
        dpto: record.dpto || "",
        estac: record.estac || "",
        dep: record.dep || "",
        asesor: advisorName,
        equipo: teamName,
        jefeVentas: jefeVentasName,
        asistenteLegal: assistantName,
        tipoOperacion: tipoOp,
        areaOrigen: isOther ? "Otras Áreas" : "Asesor / Legal",
        afectaAsesor: affectsAdvisor,
        afectaAsesorTexto: affectsAdvisor ? "SÍ" : "NO",
        motivos: reasonsStr,
        comentario: record.observacion || record.comentario || "Sin comentario",
        usuarioRegistro: record.updatedByUser || "Sistema",
        fechaObservacion: formatDateTimeFull(obsStartDate),
        fechaObservacionTimestamp: obsStartDate.getTime(),
        fechaSubsanacion: isResolved && liftDate ? formatDateTimeFull(liftDate) : "Pendiente de Subsanación",
        estadoObservacion: isResolved ? "Subsanada / Levantada" : "Pendiente / Abierta",
        horasHabiles: bizHours,
        minutosHabiles: bizMinutes,
        tiempoDetallado: calc.formattedDetailed,
        horasAsesor: affectsAdvisor ? bizHours : 0,
        horasOtrasAreas: isOther ? bizHours : 0,
        horasLegal: breakdown.legalHours,
        minutosLegal: breakdown.legalMinutes,
        tiempoLegal: breakdown.legalFormatted || `${Math.floor(breakdown.legalMinutes / 60)}h ${breakdown.legalMinutes % 60}m`,
        horasRespuestaAsesor: affectsAdvisor ? bizHours : 0,
        minutosRespuestaAsesor: affectsAdvisor ? bizMinutes : 0,
        tiempoRespuestaAsesor: affectsAdvisor ? calc.formattedDetailed : "0h 0m",
        estadoActualExpediente: currentStatus,
        fechaSolicitud: solicitudDate,
        fechaEmision: emisionDate
      });
    }
  });

  // Sort by observation date descending (newest observations first)
  return items.sort((a, b) => {
    const tA = safeParseDate(a.fechaObservacion)?.getTime() || 0;
    const tB = safeParseDate(b.fechaObservacion)?.getTime() || 0;
    return tB - tA;
  });
}

/**
 * Downloads a comprehensive multi-sheet Excel file (.xlsx) with all observations:
 * - Sheet 1: TODAS LAS OBSERVACIONES (Master table)
 * - Sheet 2: OBSERVACIONES ASESOR (AFECTAN)
 * - Sheet 3: OBSERVACIONES OTRAS ÁREAS (NO AFECTAN)
 * - Sheet 4: RESUMEN POR ASESOR Y ÁREA (Aggregated KPIs)
 * - Sheet 5: RESUMEN POR MOTIVO DE OBSERVACIÓN
 */
export function downloadObservationsExcel(
  records: OperationRecord[],
  settings?: AppSettings,
  areaFilter: "all" | "advisor_only" | "other_areas_only" = "all",
  customItems?: ObservationExportItem[]
) {
  const allItems = customItems || extractAllObservations(records, settings);

  let filteredItems = allItems;
  if (areaFilter === "advisor_only") {
    filteredItems = allItems.filter(item => item.afectaAsesor);
  } else if (areaFilter === "other_areas_only") {
    filteredItems = allItems.filter(item => !item.afectaAsesor);
  }

  // 1. Format rows for Excel
  const formatRowsForSheet = (itemsList: ObservationExportItem[]) => {
    return itemsList.map((item, idx) => ({
      "NRO.": idx + 1,
      "ID OPERACIÓN": item.idOperacion,
      "FECHA OBSERVACIÓN": item.fechaObservacion,
      "ESTADO OBSERVACIÓN": item.estadoObservacion,
      "FECHA SUBSANACIÓN": item.fechaSubsanacion,
      "TIEMPO (HORAS HÁBILES)": item.horasHabiles,
      "TIEMPO (MINUTOS HÁBILES)": item.minutosHabiles,
      "TIEMPO FORMATEADO": item.tiempoDetallado,
      "ÁREA / ORIGEN": item.areaOrigen,
      "¿AFECTA AL ASESOR?": item.afectaAsesorTexto,
      "TIEMPO CARGADO AL ASESOR (HRS)": item.horasAsesor,
      "TIEMPO CARGADO OTRAS ÁREAS (HRS)": item.horasOtrasAreas,
      "MOTIVO(S) DE OBSERVACIÓN": item.motivos,
      "DETALLE / COMENTARIO": item.comentario,
      "PROYECTO": item.proyecto,
      "UNIDAD(ES)": item.unidad,
      "DPTO": item.dpto,
      "ESTACIONAMIENTO": item.estac,
      "DEPÓSITO": item.dep,
      "ASESOR INMOBILIARIO": item.asesor,
      "EQUIPO / TEAM": item.equipo,
      "JEFE DE VENTAS": item.jefeVentas,
      "ASISTENTE LEGAL": item.asistenteLegal,
      "TIPO DE OPERACIÓN": item.tipoOperacion,
      "ESTADO ACTUAL EXPEDIENTE": item.estadoActualExpediente,
      "USUARIO QUE OBSERVÓ": item.usuarioRegistro,
      "FECHA SOLICITUD": item.fechaSolicitud,
      "FECHA EMISIÓN": item.fechaEmision
    }));
  };

  // 2. Summary by Advisor
  const advisorMap = new Map<string, {
    asesor: string;
    equipo: string;
    totalObs: number;
    obsAfectanAsesor: number;
    obsOtrasAreas: number;
    obsSubsanadas: number;
    obsPendientes: number;
    totalHorasAsesor: number;
    totalHorasOtrasAreas: number;
    totalHoras: number;
  }>();

  allItems.forEach(item => {
    const key = item.asesor || "Sin Asesor";
    if (!advisorMap.has(key)) {
      advisorMap.set(key, {
        asesor: key,
        equipo: item.equipo || "-",
        totalObs: 0,
        obsAfectanAsesor: 0,
        obsOtrasAreas: 0,
        obsSubsanadas: 0,
        obsPendientes: 0,
        totalHorasAsesor: 0,
        totalHorasOtrasAreas: 0,
        totalHoras: 0
      });
    }
    const stat = advisorMap.get(key)!;
    stat.totalObs++;
    if (item.afectaAsesor) {
      stat.obsAfectanAsesor++;
      stat.totalHorasAsesor += item.horasAsesor;
    } else {
      stat.obsOtrasAreas++;
      stat.totalHorasOtrasAreas += item.horasOtrasAreas;
    }
    if (item.estadoObservacion === "Subsanada / Levantada") {
      stat.obsSubsanadas++;
    } else {
      stat.obsPendientes++;
    }
    stat.totalHoras += item.horasHabiles;
  });

  const summaryAdvisorRows = Array.from(advisorMap.values())
    .sort((a, b) => b.totalObs - a.totalObs)
    .map(s => ({
      "ASESOR INMOBILIARIO": s.asesor,
      "EQUIPO": s.equipo,
      "TOTAL OBSERVACIONES": s.totalObs,
      "OBS. QUE AFECTAN AL ASESOR (LEGAL)": s.obsAfectanAsesor,
      "OBS. QUE NO AFECTAN AL ASESOR (OTRAS ÁREAS)": s.obsOtrasAreas,
      "SUBSANADAS / LEVANTADAS": s.obsSubsanadas,
      "PENDIENTES ACTIVAS": s.obsPendientes,
      "TOTAL HORAS ASESOR (HÁBILES)": Number(s.totalHorasAsesor.toFixed(2)),
      "TOTAL HORAS OTRAS ÁREAS (HÁBILES)": Number(s.totalHorasOtrasAreas.toFixed(2)),
      "TIEMPO PROMEDIO RESOLUCIÓN (HRS)": s.totalObs > 0 ? Number((s.totalHoras / s.totalObs).toFixed(2)) : 0
    }));

  // 3. Summary by Reason
  const reasonMap = new Map<string, { count: number; totalHours: number; area: string }>();
  filteredItems.forEach(item => {
    const reasons = item.motivos.split(";").map(r => r.trim()).filter(Boolean);
    const primaryReason = reasons.length > 0 ? reasons[0] : item.motivos;
    if (!reasonMap.has(primaryReason)) {
      reasonMap.set(primaryReason, { count: 0, totalHours: 0, area: item.areaOrigen });
    }
    const rStat = reasonMap.get(primaryReason)!;
    rStat.count++;
    rStat.totalHours += item.horasHabiles;
  });

  const summaryReasonRows = Array.from(reasonMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([reason, data]) => ({
      "MOTIVO DE OBSERVACIÓN": reason,
      "ÁREA / CATEGORÍA": data.area,
      "FRECUENCIA (CANTIDAD)": data.count,
      "HORAS HÁBILES ACUMULADAS": Number(data.totalHours.toFixed(2)),
      "PROMEDIO HORAS POR INCIDENCIA": data.count > 0 ? Number((data.totalHours / data.count).toFixed(2)) : 0
    }));

  // Create workbook and append sheets
  const wb = XLSX.utils.book_new();

  // Helper to enable native Excel filter dropdowns on the header row
  const enableAutoFilter = (ws: XLSX.WorkSheet) => {
    if (ws && ws["!ref"]) {
      ws["!autofilter"] = { ref: ws["!ref"] };
    }
  };

  // Sheet 1: Master
  const wsMaster = XLSX.utils.json_to_sheet(formatRowsForSheet(filteredItems));
  enableAutoFilter(wsMaster);
  XLSX.utils.book_append_sheet(wb, wsMaster, "TODAS LAS OBSERVACIONES");

  // Sheet 2: Advisor Observations (affects)
  const advisorObs = allItems.filter(item => item.afectaAsesor);
  const wsAdvisor = XLSX.utils.json_to_sheet(formatRowsForSheet(advisorObs));
  enableAutoFilter(wsAdvisor);
  XLSX.utils.book_append_sheet(wb, wsAdvisor, "OBSERVACIONES ASESOR");

  // Sheet 3: Other Areas Observations (does not affect)
  const otherAreasObs = allItems.filter(item => !item.afectaAsesor);
  const wsOtherAreas = XLSX.utils.json_to_sheet(formatRowsForSheet(otherAreasObs));
  enableAutoFilter(wsOtherAreas);
  XLSX.utils.book_append_sheet(wb, wsOtherAreas, "OBSERVACIONES OTRAS ÁREAS");

  // Sheet 4: Summary by Advisor
  const wsSummaryAdv = XLSX.utils.json_to_sheet(summaryAdvisorRows);
  enableAutoFilter(wsSummaryAdv);
  XLSX.utils.book_append_sheet(wb, wsSummaryAdv, "RESUMEN POR ASESOR");

  // Sheet 5: Summary by Reason
  const wsSummaryReason = XLSX.utils.json_to_sheet(summaryReasonRows);
  enableAutoFilter(wsSummaryReason);
  XLSX.utils.book_append_sheet(wb, wsSummaryReason, "RESUMEN POR MOTIVO");

  // Write file
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const filterTag = areaFilter === "advisor_only" ? "Asesores_" : areaFilter === "other_areas_only" ? "OtrasAreas_" : "Completo_";
  a.download = `Reporte_Observaciones_${filterTag}${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
