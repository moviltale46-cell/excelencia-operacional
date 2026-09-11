import React, { useState, useEffect, useRef, useMemo } from "react";
import { AppSettings, OperationRecord, UserAccount, StatusHistoryEntry, STANDARD_OBSERVATIONS, STANDARD_OTHER_AREAS_OBSERVATIONS, getActiveObservationReasons, getActiveObservationReasonConfigs, ObservationCategory } from "../types";
import ActionSummaryModal, { ActionSummaryData } from "./ActionSummaryModal";
import { 
  Save, Info, AlertOctagon, CheckCircle2, List, FileCheck, Edit3, Clock, 
  PlusCircle, History, SlidersHorizontal, Calendar, Briefcase, Plus, User, 
  MessageSquare, ChevronDown, ChevronUp, RotateCcw, Search, CheckSquare, 
  Square, Users, Building, Filter, Check, XCircle, AlertCircle, FileCheck2,
  BarChart3, Layers, FileSpreadsheet, Lock, UserCheck, ArrowRight, ArrowLeft
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import StatusHistoryModal from "./StatusHistoryModal";
import { safeGetTime, formatDateTimeFull, formatUnitDisplay, getDateAndTimeString, formatProjectAndUnits, checkDuplicateUnitOperation, isOtherAreasObservation } from "../utils/dateUtils";
import { calculateBusinessTime } from "../utils/workingHours";

interface JefeLegalPanelProps {
  records: OperationRecord[];
  settings: AppSettings;
  currentUser: UserAccount;
  onUpdateRecord: (id: string, updatedFields: Partial<OperationRecord>) => void;
  onAddRecord: (recordData: Partial<OperationRecord>) => void;
}

export default function JefeLegalPanel({ 
  records, 
  settings, 
  currentUser,
  onUpdateRecord, 
  onAddRecord 
}: JefeLegalPanelProps) {
  // Sub-navigation inside Jefe Legal Panel
  const [jefeSubTab, setJefeSubTab] = useState<"new_request" | "register" | "emit" | "edit" | "actions_history">("new_request");
  const [historyModalRecord, setHistoryModalRecord] = useState<OperationRecord | null>(null);

  // FORM FOR BRAND NEW REQUEST (Jefe Legal)
  // Requirement: Default "Emisión" type while allowing any other selection
  const [newProjName, setNewProjName] = useState("");
  const [newJefeVentas, setNewJefeVentas] = useState("");
  const [newDpto, setNewDpto] = useState("");
  const [newEstac, setNewEstac] = useState("");
  const [newDep, setNewDep] = useState("");
  const [newAsesor, setNewAsesor] = useState("ANABEL ALBINO");
  const [newTipo, setNewTipo] = useState("EMISION");
  const [newComment, setNewComment] = useState("");
  const [isSubmittingNewRequest, setIsSubmittingNewRequest] = useState(false);

  // State for annexed modification alert
  const [annexedAlert, setAnnexedAlert] = useState<{
    show: boolean;
    message: string;
    recordId: string;
    project: string;
    dpto: string;
    asesor: string;
    prevStatus: string;
  } | null>(null);

  // MODE 1: REGISTER SOLICITUD (TIPO) FOR INCOMPLETE VENTAS OPERATIONS
  const [selectedRegRecordId, setSelectedRegRecordId] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [regObservations, setRegObservations] = useState("");
  const [showRegPreview, setShowRegPreview] = useState(false);

  // MODE 2: EMITIR EXPEDIENTES (ADVANCED FILTERS & FULL EMISSION FORM)
  const [selectedEmitRecordId, setSelectedEmitRecordId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [emitComment, setEmitComment] = useState("");
  const [showEmitPreview, setShowEmitPreview] = useState(false);
  const [emitFilterTeam, setEmitFilterTeam] = useState("");
  const [emitFilterProject, setEmitFilterProject] = useState("");
  const [emitFilterAdvisor, setEmitFilterAdvisor] = useState("");
  const [emitFilterAssistant, setEmitFilterAssistant] = useState("");
  const [emitSearchQuery, setEmitSearchQuery] = useState("");
  const [emitSelectedObservations, setEmitSelectedObservations] = useState<string[]>([]);
  const [emitObsCategoryTab, setEmitObsCategoryTab] = useState<ObservationCategory>("legal");
  const [emitAffectsAdvisor, setEmitAffectsAdvisor] = useState<boolean>(true);
  const [emitDpto, setEmitDpto] = useState("");
  const [emitEstac, setEmitEstac] = useState("");
  const [emitDep, setEmitDep] = useState("");
  const [emitAsesor, setEmitAsesor] = useState("");
  const [emitSortOrder, setEmitSortOrder] = useState<"oldest" | "newest">("oldest");

  // MODE 3: EDIT RECORDS (6-HOUR LIMIT)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<OperationRecord>>({});

  // Advanced Filters State
  const [filterDate, setFilterDate] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // TRAMITES PENDIENTES: Sub-tabs for Observed Operations vs Untyped
  const [tramiteSubTab, setTramiteSubTab] = useState<"observed" | "untyped">("observed");
  const [obsSearch, setObsSearch] = useState("");
  const [liftingRecordId, setLiftingRecordId] = useState<string | null>(null);
  const [liftComment, setLiftComment] = useState("");
  const [liftReassignAssistant, setLiftReassignAssistant] = useState("");
  const [isLiftingSubmitting, setIsLiftingSubmitting] = useState(false);

  // HISTORIAL Y ACCIONES: Closed Operations Filter & Reopening State
  const [closedOnlyFilter, setClosedOnlyFilter] = useState(true);
  const [reopeningRecordId, setReopeningRecordId] = useState<string | null>(null);
  const [reopenNewStatus, setReopenNewStatus] = useState("Modificado");
  const [reopenComment, setReopenComment] = useState("");
  const [isReopeningSubmitting, setIsReopeningSubmitting] = useState(false);

  // REASSIGNMENT MODAL STATE: Quick Reassign to another Legal Assistant
  const [reassignModalRecord, setReassignModalRecord] = useState<OperationRecord | null>(null);
  const [reassignTargetAssistant, setReassignTargetAssistant] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);

  // Action Logging & Re-assignment State
  const [selectedHistoryRecordId, setSelectedHistoryRecordId] = useState<string | null>(null);
  const [newActionType, setNewActionType] = useState("Observación Legal");
  const [customActionType, setCustomActionType] = useState("");
  const [newActionComment, setNewActionComment] = useState("");
  const [assignedAssistant, setAssignedAssistant] = useState("");

  // Expanded actions state for collapsible history list
  const [expandedActionIdx, setExpandedActionIdx] = useState<Record<number, boolean>>({});

  // Reset expanded actions index when selected history record changes
  useEffect(() => {
    setExpandedActionIdx({});
  }, [selectedHistoryRecordId]);

  // Live system clock states
  const [currentDateStr, setCurrentDateStr] = useState("--/--/----");
  const [currentTimeStr, setCurrentTimeStr] = useState("--:--");
  const [isSuccessState, setIsSuccessState] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Confirmation Action Summary Modal states
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryModalData, setSummaryModalData] = useState<ActionSummaryData | null>(null);
  const [pendingActionType, setPendingActionType] = useState<"emit" | "cierre" | "desistido" | null>(null);

  // Get dynamic options
  const tiposOperacion = settings.tiposOperacion && settings.tiposOperacion.length > 0
    ? settings.tiposOperacion
    : ["EMISION", "MODIFICACION", "ADENDA"];

  const statusesList = settings.statuses && settings.statuses.length > 0
    ? settings.statuses
    : ["Pendiente de Firma", "En Revisión Técnica", "Aprobado para Emisión", "Observado / Rechazado"];

  const projectOptions = settings.proyectos || [];

  const advisorOptions = settings.asesores && settings.asesores.length > 0
    ? settings.asesores
    : [
        "ANABEL ALBINO", "SILVANA GODENZZI", "ROSMERY CENTURION", "DERVIS PIÑA", 
        "CARLOS TORRES", "MARIA FERNANDA CHACON", "IVAN SOTO", "CHRISTIAN BARRIENTOS", 
        "PAULA CASAS", "VICTOR SALAS", "MARITZA BRAVO", "EDUARDO BECERRA", 
        "LUIS MANUEL DE LOS RIOS", "ROY OTERO", "FARIHD JASAUI", "ALEJANDRA PEREZ CAMPOS"
      ];

  // Available records for assigning TIPO
  const regAvailableRecords = records.filter(r => !r.tipo);

  // Available records for emitting (must have a type assigned, but can update status)
  const emitAvailableRecords = records.filter(r => r.tipo);

  // Update clock periodically
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentDateStr(now.toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }));
      setCurrentTimeStr(now.toLocaleTimeString("es-PE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }));
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Set default project once on load and ensure newTipo defaults to "EMISION"
  const hasInitializedLegalProj = useRef(false);
  useEffect(() => {
    if (projectOptions.length > 0 && !hasInitializedLegalProj.current && !newProjName) {
      setNewProjName(projectOptions[0].name);
      hasInitializedLegalProj.current = true;
    }
    if (tiposOperacion.length > 0) {
      const emisionOption = tiposOperacion.find(t => t.toUpperCase().includes("EMISI")) || tiposOperacion[0];
      if (!newTipo || newTipo === "EMISION") {
        setNewTipo(emisionOption);
      }
    }
  }, [projectOptions, tiposOperacion, newTipo]);

  // Helper to normalize operation type key
  const normalizeTipoKey = (t?: string) => {
    const s = (t || "").toUpperCase();
    if (s.includes("EMISI")) return "EMISION";
    if (s.includes("MODIFIC")) return "MODIFICACION";
    if (s.includes("ADENDA")) return "ADENDA";
    return "OTROS";
  };

  // Auto-resolve Jefe de Ventas based on selected project for brand new request
  useEffect(() => {
    if (newProjName && projectOptions.length > 0) {
      const matched = projectOptions.find(p => p.name === newProjName);
      if (matched) {
        setNewJefeVentas(matched.jefeVentas || "Sin asignar");
      }
    }
  }, [newProjName, projectOptions]);

  // Update register preview
  useEffect(() => {
    setShowRegPreview(!!selectedType);
  }, [selectedType]);

  // Update emit preview
  useEffect(() => {
    setShowEmitPreview(!!selectedStatus);
  }, [selectedStatus]);

  // Handler: Register brand new Request
  const handleAddNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingNewRequest) return;
    if (!newProjName) {
      alert("Por favor seleccione un proyecto.");
      return;
    }
    if (!newDpto.trim() && !newEstac.trim() && !newDep.trim()) {
      alert("Por favor ingrese al menos una unidad (Dpto, Estac. o Dep.).");
      return;
    }

    setIsSubmittingNewRequest(true);

    try {
      const matchedProj = projectOptions.find(p => p.name === newProjName);
      const finalTeam = matchedProj?.team || "A";

      const now = new Date();
      const timestampStr = formatDateTimeFull(now);

      // Requirement: Check if entering a Modificación and there is an existing match for Proyecto, Unidad (Dpto) and Asesor
      const isModificacion = (newTipo || "").trim().toUpperCase().includes("MODIFIC");

      if (isModificacion) {
        const normalizeStr = (val?: string) => 
          (val || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const matchedRecord = records.find(r => {
          const matchProj = normalizeStr(r.proyecto) === normalizeStr(newProjName);
          const matchAsesor = normalizeStr(r.asesor) === normalizeStr(newAsesor);
          const matchDpto = Boolean(newDpto.trim()) && normalizeStr(r.dpto) === normalizeStr(newDpto);
          return matchProj && matchAsesor && matchDpto;
        });

        if (matchedRecord) {
          // Operation already exists! Annex modification even if it reached Cierre Completo
          const commentSuffix = newComment.trim() ? ` Detalle: ${newComment.trim()}` : "";
          const annexComment = `[Modificación Anexada] Nueva solicitud de modificación registrada por ${currentUser.username}.${commentSuffix}`;

          await onUpdateRecord(matchedRecord.id, {
            tipo: "MODIFICACION",
            status: "Pendiente",
            solicitud: timestampStr,
            solicitudAt: now.toISOString(),
            emision: "",
            emittedAt: undefined,
            comentario: annexComment,
            updatedByUser: currentUser.username,
            ...(newEstac.trim() ? { estac: newEstac.trim() } : {}),
            ...(newDep.trim() ? { dep: newDep.trim() } : {})
          });

          const alertMsg = `La operación de tipo modificación ya existe para el Proyecto "${matchedRecord.proyecto}", Unidad "${matchedRecord.dpto}" y Asesor "${matchedRecord.asesor}". La solicitud se ha anexado al expediente existente ${matchedRecord.id} (así la operación haya tenido CIERRE COMPLETO).`;

          setAnnexedAlert({
            show: true,
            message: alertMsg,
            recordId: matchedRecord.id,
            project: matchedRecord.proyecto,
            dpto: matchedRecord.dpto,
            asesor: matchedRecord.asesor,
            prevStatus: matchedRecord.status || "Cierre Completo"
          });

          setSuccessMsg(alertMsg);
          setIsSuccessState(true);

          setTimeout(() => {
            setNewDpto("");
            setNewEstac("");
            setNewDep("");
            setNewComment("");
            setNewTipo(tiposOperacion.find(t => t.toUpperCase().includes("EMISI")) || "EMISION");
            setIsSuccessState(false);
            setIsSubmittingNewRequest(false);
          }, 3500);

          return;
        }
      }

      // Check duplicate unit in the same project
      const duplicateCheck = checkDuplicateUnitOperation(records, {
        proyecto: newProjName,
        dpto: newDpto,
        estac: newEstac,
        dep: newDep,
        tipo: newTipo
      });

      if (duplicateCheck.isDuplicate) {
        setIsSubmittingNewRequest(false);
        alert(duplicateCheck.errorMessage);
        return;
      }

      await onAddRecord({
        proyecto: newProjName,
        team: finalTeam,
        dpto: newDpto,
        estac: newEstac,
        dep: newDep,
        asesor: newAsesor,
        tipo: newTipo || "EMISION",
        solicitud: timestampStr,
        solicitudAt: now.toISOString(),
        emision: "",
        comentario: newComment || "Solicitud registrada por Jefe Legal.",
        status: "Pendiente",
        updatedByUser: currentUser.username
      });

      setSuccessMsg(`¡Solicitud registrada con éxito! El expediente se derivará automáticamente.`);
      setIsSuccessState(true);

      setTimeout(() => {
        setNewDpto("");
        setNewEstac("");
        setNewDep("");
        setNewComment("");
        setNewTipo(tiposOperacion.find(t => t.toUpperCase().includes("EMISI")) || "EMISION");
        setIsSuccessState(false);
        setIsSubmittingNewRequest(false);
      }, 2500);
    } catch (err) {
      setIsSubmittingNewRequest(false);
    }
  };

  // Handler: Register Solicitud (Tipo) for incomplete Ventas records
  const handleRegisterOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRegRecordId) {
      alert("Por favor seleccione un expediente.");
      return;
    }
    if (!selectedType) {
      alert("Por favor seleccione un tipo de operación.");
      return;
    }

    const now = new Date();
    const timestampStr = formatDateTimeFull(now);

    onUpdateRecord(selectedRegRecordId, {
      tipo: selectedType,
      solicitud: timestampStr,
      solicitudAt: now.toISOString(),
      comentario: regObservations || `Asignado tipo por Jefe Legal.`,
      updatedByUser: currentUser.username
    });

    setSuccessMsg(`¡Operación registrada! Tipo: ${selectedType}. Solicitud sellada.`);
    setIsSuccessState(true);

    setTimeout(() => {
      setSelectedRegRecordId("");
      setSelectedType("");
      setRegObservations("");
      setIsSuccessState(false);
    }, 2500);
  };

  // Assistants and teams lists for dynamic filtering
  const activeAssistantsUsers = (settings.users || []).filter(u => u.role === "Asistente Legal" && u.active);
  const teamsList = settings.equipos?.map(e => e.name) || Array.from(new Set(records.map(r => r.team).filter(Boolean)));

  // Filtered records for "Emitir Expedientes" tab based on top filters
  const filteredEmitRecords = records.filter(r => {
    // Basic criteria: must have a tipo (or general records)
    const hasTipo = !!r.tipo;
    if (!hasTipo) return false;

    // Filter by Team
    if (emitFilterTeam && r.team !== emitFilterTeam) return false;

    // Filter by Project
    if (emitFilterProject && r.proyecto !== emitFilterProject) return false;

    // Filter by Advisor
    if (emitFilterAdvisor && r.asesor !== emitFilterAdvisor) return false;

    // Filter by Assistant
    if (emitFilterAssistant) {
      if (r.derivadoA) {
        if (r.derivadoA !== emitFilterAssistant) return false;
      } else {
        const asst = activeAssistantsUsers.find(a => a.username === emitFilterAssistant);
        if (!asst?.assignedProjects?.includes(r.proyecto)) return false;
      }
    }

    // Filter by general search string
    if (emitSearchQuery.trim()) {
      const q = emitSearchQuery.toLowerCase();
      const matchProj = r.proyecto?.toLowerCase().includes(q);
      const matchDpto = r.dpto?.toLowerCase().includes(q);
      const matchAsesor = r.asesor?.toLowerCase().includes(q);
      const matchId = r.id?.toLowerCase().includes(q);
      const matchTeam = r.team?.toLowerCase().includes(q);
      const matchStatus = r.status?.toLowerCase().includes(q);
      if (!matchProj && !matchDpto && !matchAsesor && !matchId && !matchTeam && !matchStatus) return false;
    }

    return true;
  });

  // Sort expedientes oldest-first so the oldest operation is at the top, newest at the bottom
  const getRecordEntryTime = (r: OperationRecord): number => {
    const t = safeGetTime(r.solicitudAt || r.solicitud || r.createdAt);
    if (t !== null && !isNaN(t)) return t;
    if (r.history && r.history.length > 0) {
      const hTime = safeGetTime(r.history[0]?.timestamp);
      if (hTime !== null && !isNaN(hTime)) return hTime;
    }
    return Number.MAX_SAFE_INTEGER;
  };

  const sortedEmitRecords = [...filteredEmitRecords].sort((a, b) => {
    const tA = getRecordEntryTime(a);
    const tB = getRecordEntryTime(b);
    if (tA !== tB) {
      return emitSortOrder === "oldest" ? tA - tB : tB - tA;
    }
    return (a.id || "").localeCompare(b.id || "");
  });

  // KPI Calculations: Breakdown matching the current console view / expedientes
  const activeRecordsForKpi = filteredEmitRecords.length > 0 ? filteredEmitRecords : records;

  const kpiRegisteredCounts = {
    emision: activeRecordsForKpi.filter(r => normalizeTipoKey(r.tipo) === "EMISION").length,
    modificacion: activeRecordsForKpi.filter(r => normalizeTipoKey(r.tipo) === "MODIFICACION").length,
    adenda: activeRecordsForKpi.filter(r => normalizeTipoKey(r.tipo) === "ADENDA").length,
    total: activeRecordsForKpi.length
  };

  // Additional KPI for Jefe Legal: Emissions emitted by Jefe Legal
  const myName = (currentUser?.username || "").toLowerCase();
  const jefeEmittedRecords = records.filter(r => {
    const hasEmission = Boolean(r.emision || r.emittedAt);
    if (!hasEmission) return false;
    const isJefeAction = 
      (r.updatedByUser || "").toLowerCase() === myName ||
      (r.derivadoA || "").toLowerCase() === myName ||
      (r.history && r.history.some(h => (h.user || "").toLowerCase() === myName && h.status && !h.status.toLowerCase().includes("pendiente")));
    return isJefeAction;
  });
  const kpiJefeLegalEmissionsCount = jefeEmittedRecords.length;

  // Additional KPI for Jefe Legal: Minuta requests closed or processed with full closure by Jefe Legal
  const kpiJefeLegalClosures = records.filter(r => {
    const statusUpper = (r.status || "").toUpperCase();
    const isClosed = statusUpper.includes("CIERRE") || statusUpper.includes("EMITID") || statusUpper.includes("ENTREGAD") || statusUpper.includes("FIRMA");
    if (!isClosed) return false;
    
    // Attributed to Jefe Legal when entered or closed by him/her (even if derivadoA is assistant)
    const isJefeAction = 
      (r.updatedByUser || "").toLowerCase() === myName ||
      (r.comentario || "").toLowerCase().includes(myName) ||
      (r.history && r.history.some(h => (h.user || "").toLowerCase() === myName));
    return isJefeAction;
  }).length;

  const handleSelectEmitRecord = (r: OperationRecord) => {
    setSelectedEmitRecordId(r.id);
    if (r.status) {
      setSelectedStatus(r.status);
    } else if (statusesList.length > 0) {
      setSelectedStatus(statusesList[0]);
    }
    
    // Check if the record already has standard observations in its comment
    const foundObs: string[] = [];
    const activeReasons = getActiveObservationReasons(settings);
    if (r.comentario) {
      activeReasons.forEach(obs => {
        const clean = obs.replace(".", "").toLowerCase();
        if (r.comentario.toLowerCase().includes(clean)) {
          foundObs.push(obs);
        }
      });
    }
    setEmitSelectedObservations(foundObs);
    if (r.affectsAdvisor !== undefined) {
      setEmitAffectsAdvisor(r.affectsAdvisor);
    } else if (isOtherAreasObservation(r)) {
      setEmitAffectsAdvisor(false);
    } else {
      setEmitAffectsAdvisor(true);
    }

    if (isOtherAreasObservation(r) || foundObs.some(o => STANDARD_OTHER_AREAS_OBSERVATIONS.includes(o as any))) {
      setEmitObsCategoryTab("otras_areas");
    } else {
      setEmitObsCategoryTab("legal");
    }

    setEmitComment(r.comentario || "");
    setEmitDpto(r.dpto || "");
    setEmitEstac(r.estac || "");
    setEmitDep(r.dep || "");
    setEmitAsesor(r.asesor || "");
  };

  const handleToggleEmitObservation = (obs: string) => {
    setEmitSelectedObservations(prev => {
      const isChecked = prev.includes(obs);
      const next = isChecked ? prev.filter(o => o !== obs) : [...prev, obs];
      
      // Auto-suggest status and affectsAdvisor when adding an observation
      if (!isChecked && next.length > 0) {
        const obsCfg = settings.observationReasons?.find(r => r.name === obs);
        if (obsCfg?.affectsAdvisor !== undefined) {
          setEmitAffectsAdvisor(obsCfg.affectsAdvisor);
        } else if (emitObsCategoryTab === "otras_areas") {
          setEmitAffectsAdvisor(false);
        }

        const isOther = next.some(o => 
          STANDARD_OTHER_AREAS_OBSERVATIONS.includes(o as any) || 
          o.toLowerCase().includes("otras áreas") || 
          o.toLowerCase().includes("otras areas")
        ) || emitObsCategoryTab === "otras_areas";

        if (isOther) {
          const otherStatus = statusesList.find(s => s.toLowerCase().includes("otras áreas") || s.toLowerCase().includes("otras areas"));
          if (otherStatus) {
            setSelectedStatus(otherStatus);
          } else {
            setSelectedStatus("Observado (Otras Áreas)");
          }
        } else {
          const obsStatus = statusesList.find(s => 
            s.toLowerCase().includes("observad") || s.toLowerCase().includes("rechazad")
          );
          if (obsStatus) setSelectedStatus(obsStatus);
        }
      }
      return next;
    });
  };

  // Open Summary Modal before Emit
  const handleOpenEmitSummaryModal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedEmitRecordId) {
      alert("Por favor seleccione un expediente de la lista para emitir.");
      return;
    }
    if (!selectedStatus) {
      alert("Por favor seleccione un estado legal para emitir el expediente.");
      return;
    }

    const activeRec = records.find(r => r.id === selectedEmitRecordId);
    const unitParts: string[] = [];
    const dVal = emitDpto || activeRec?.dpto;
    const eVal = emitEstac || activeRec?.estac;
    const dpVal = emitDep || activeRec?.dep;
    if (dVal) unitParts.push(`DPTO: ${dVal}`);
    if (eVal) unitParts.push(`Estac: ${eVal}`);
    if (dpVal) unitParts.push(`Dep: ${dpVal}`);
    const unitStr = unitParts.length > 0 ? unitParts.join(" • ") : "Sin unidad asignada";

    setSummaryModalData({
      projectName: activeRec?.proyecto || "Expediente",
      unit: unitStr,
      advisor: emitAsesor || activeRec?.asesor || "Sin asignar",
      emissionStatus: selectedStatus,
      observationReasons: emitSelectedObservations.length > 0 ? emitSelectedObservations : undefined,
      comment: emitComment.trim() || undefined,
      affectsAdvisor: emitAffectsAdvisor,
      actionTitle: "Registrar Emisión / Acción Legal"
    });
    setPendingActionType("emit");
    setSummaryModalOpen(true);
  };

  // Open Summary Modal before Cierre / Desistido
  const handleOpenCloseSummaryModal = (status: "Cierre Completo" | "Desistido") => {
    if (!selectedEmitRecordId) {
      alert("Por favor seleccione un expediente de la lista.");
      return;
    }

    const activeRec = records.find(r => r.id === selectedEmitRecordId);
    const unitParts: string[] = [];
    const dVal = emitDpto || activeRec?.dpto;
    const eVal = emitEstac || activeRec?.estac;
    const dpVal = emitDep || activeRec?.dep;
    if (dVal) unitParts.push(`DPTO: ${dVal}`);
    if (eVal) unitParts.push(`Estac: ${eVal}`);
    if (dpVal) unitParts.push(`Dep: ${dpVal}`);
    const unitStr = unitParts.length > 0 ? unitParts.join(" • ") : "Sin unidad asignada";

    setSummaryModalData({
      projectName: activeRec?.proyecto || "Expediente",
      unit: unitStr,
      advisor: emitAsesor || activeRec?.asesor || "Sin asignar",
      emissionStatus: status,
      observationReasons: emitSelectedObservations.length > 0 ? emitSelectedObservations : undefined,
      comment: emitComment.trim() || undefined,
      affectsAdvisor: false,
      actionTitle: `Finalizar Trámite: ${status}`
    });
    setPendingActionType(status === "Cierre Completo" ? "cierre" : "desistido");
    setSummaryModalOpen(true);
  };

  // Execute Confirmed Emit Operation
  const executeEmitOperation = () => {
    if (!selectedEmitRecordId || !selectedStatus) return;

    const now = new Date();
    const timestampStr = formatDateTimeFull(now);

    const isOther = !emitAffectsAdvisor || emitSelectedObservations.some(obs => 
      STANDARD_OTHER_AREAS_OBSERVATIONS.includes(obs as any) || 
      obs.toLowerCase().includes("otras áreas") || 
      obs.toLowerCase().includes("otras areas")
    ) || emitObsCategoryTab === "otras_areas" || selectedStatus.toLowerCase().includes("otras áreas") || selectedStatus.toLowerCase().includes("otras areas");

    // Construct final comment from checklist + freeform comment
    let finalComment = emitComment.trim();
    if (emitSelectedObservations.length > 0) {
      const prefix = !emitAffectsAdvisor || isOther ? `[Observación - Otras Áreas]` : `[Observación]`;
      const obsPrefix = `${prefix} Motivos: ${emitSelectedObservations.join(" | ")}`;
      if (finalComment && !finalComment.startsWith("[Observación")) {
        finalComment = `${obsPrefix}. Detalle: ${finalComment}`;
      } else if (!finalComment) {
        finalComment = obsPrefix;
      }
    } else if (!finalComment) {
      const isObs = selectedStatus.toLowerCase().includes("observad") || selectedStatus.toLowerCase().includes("rechazad");
      finalComment = !emitAffectsAdvisor || isOther 
        ? `[Observación - Otras Áreas] Expediente observado sin afectar KPI de asesor (temporizador detenido).`
        : (isObs 
          ? `[Observación] Expediente observado por el área legal.`
          : `Expediente emitido con estado "${selectedStatus}" por Jefe Legal.`);
    }

    const finalStatus = (!emitAffectsAdvisor || isOther) && !selectedStatus.toLowerCase().includes("otras") && (selectedStatus.toLowerCase().includes("observad") || selectedStatus.toLowerCase().includes("rechazad"))
      ? "Observado (Otras Áreas)"
      : selectedStatus;

    const activeRec = records.find(r => r.id === selectedEmitRecordId);
    const projectName = activeRec?.proyecto || "el expediente";

    onUpdateRecord(selectedEmitRecordId, {
      status: finalStatus,
      comentario: finalComment,
      tipoObservacion: isOther ? "Observaciones de otras áreas" : (emitSelectedObservations.length > 0 ? "Asesor" : undefined),
      affectsAdvisor: emitAffectsAdvisor,
      observationReasons: emitSelectedObservations,
      dpto: emitDpto,
      estac: emitEstac,
      dep: emitDep,
      asesor: emitAsesor,
      emision: timestampStr,
      emittedAt: now.toISOString(),
      updatedByUser: currentUser.username
    });

    setToastMessage(`La EMISIÓN para ${formatProjectAndUnits({ proyecto: projectName, dpto: emitDpto || activeRec?.dpto, estac: emitEstac || activeRec?.estac, dep: emitDep || activeRec?.dep })} ha sido registrada exitosamente el ${timestampStr}.`);

    // Reset selection and form immediately
    setSelectedEmitRecordId("");
    setEmitComment("");
    setEmitSelectedObservations([]);
    setSelectedStatus("");
    setEmitDpto("");
    setEmitEstac("");
    setEmitDep("");
    setEmitAsesor("");

    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Execute Confirmed Close Process
  const executeCloseProcess = (status: "Cierre Completo" | "Desistido") => {
    if (!selectedEmitRecordId) return;

    const now = new Date();
    const timestampStr = formatDateTimeFull(now);

    const commentText = status === "Cierre Completo"
      ? `[Cierre Completo] Expediente finalizado y cerrado con éxito.`
      : `[Desistido] Trámite finalizado por desistimiento del cliente/operación.`;

    const activeRec = records.find(r => r.id === selectedEmitRecordId);
    const projectName = activeRec?.proyecto || "el expediente";

    onUpdateRecord(selectedEmitRecordId, {
      status: status,
      comentario: emitComment ? `[${status}] ${emitComment}` : commentText,
      dpto: emitDpto,
      estac: emitEstac,
      dep: emitDep,
      asesor: emitAsesor,
      emision: timestampStr,
      emittedAt: now.toISOString(),
      updatedByUser: currentUser.username
    });

    setToastMessage(`El trámite para ${projectName} ha sido marcado como "${status}" exitosamente.`);

    // Reset selection and form immediately
    setSelectedEmitRecordId("");
    setEmitComment("");
    setEmitSelectedObservations([]);
    setSelectedStatus("");
    setEmitDpto("");
    setEmitEstac("");
    setEmitDep("");
    setEmitAsesor("");

    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Handle Confirmed Action from Modal
  const handleConfirmSummaryAction = () => {
    if (pendingActionType === "emit") {
      executeEmitOperation();
    } else if (pendingActionType === "cierre") {
      executeCloseProcess("Cierre Completo");
    } else if (pendingActionType === "desistido") {
      executeCloseProcess("Desistido");
    }
    setSummaryModalOpen(false);
    setPendingActionType(null);
    setSummaryModalData(null);
  };

  // Check if a record is within the 6-hour edit limit for Jefe Legal
  const isWithinSixHours = (record: OperationRecord) => {
    const basisTime = record.createdAt || record.solicitudAt || record.emittedAt;
    if (!basisTime) return true;
    
    const time = safeGetTime(basisTime);
    if (!time) return true;
    const elapsedMs = Date.now() - time;
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return elapsedMs >= 0 && elapsedMs <= sixHoursMs;
  };

  // Time remaining helper
  const getRemainingTimeStr = (record: OperationRecord) => {
    const basisTime = record.createdAt || record.solicitudAt || record.emittedAt;
    if (!basisTime) return "6 hrs";
    
    const time = safeGetTime(basisTime);
    if (!time) return "6 hrs";
    const elapsedMs = Date.now() - time;
    const sixHoursMs = 6 * 60 * 60 * 1000;
    const remainingMs = sixHoursMs - elapsedMs;
    
    if (remainingMs <= 0) return "Bloqueado";
    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const startEditingRecord = (r: OperationRecord) => {
    if (!isWithinSixHours(r)) {
      alert("No se puede editar: ya transcurrieron más de 6 horas desde la creación de la operación.");
      return;
    }
    setEditingRecordId(r.id);
    setEditFields({
      team: r.team,
      proyecto: r.proyecto,
      dpto: r.dpto,
      estac: r.estac,
      dep: r.dep,
      asesor: r.asesor,
      tipo: r.tipo,
      status: r.status,
      solicitud: r.solicitud,
      emision: r.emision,
      comentario: r.comentario
    });
  };

  const handleSaveEdit = () => {
    if (!editingRecordId) return;
    const target = records.find(r => r.id === editingRecordId);
    if (target && !isWithinSixHours(target)) {
      alert("El plazo de edición de 6 horas para el Jefe Legal ha expirado para este expediente.");
      setEditingRecordId(null);
      return;
    }
    onUpdateRecord(editingRecordId, {
      ...editFields,
      updatedByUser: currentUser.username
    });
    setEditingRecordId(null);
    setSuccessMsg("Expediente actualizado exitosamente.");
    setIsSuccessState(true);
    setTimeout(() => setIsSuccessState(false), 2000);
  };

  // Helper to parse history and summarize counts of actions
  const getActionSummary = (record: OperationRecord) => {
    const historyList = record.history || [];
    const parsed = historyList.map(h => {
      let type = "Cambio de Estado";
      let comment = h.comentario || "";
      
      const tagMatch = comment.match(/^\[(.*?)\]\s*(.*)$/);
      if (tagMatch) {
        type = tagMatch[1];
        comment = tagMatch[2];
      } else if (comment.includes("Asignado tipo") || comment.includes("tipo por Jefe Legal")) {
        type = "Asignación Tipo de Trámite";
      } else if (comment.includes("Reasignado") || comment.includes("Derivado")) {
        type = "Re-asignación de Asistente";
      } else if (comment === "Registro inicial." || comment.includes("inicial")) {
        type = "Registro Inicial";
      }
      return { type, comment, user: h.user || record.updatedByUser || "Jefe Legal", timestamp: h.timestamp, status: h.status };
    });

    const counts: Record<string, number> = {};
    parsed.forEach(p => {
      counts[p.type] = (counts[p.type] || 0) + 1;
    });

    // Sort strictly by date descending (newest on top)
    parsed.sort((a, b) => {
      const tA = safeGetTime(a.timestamp) || 0;
      const tB = safeGetTime(b.timestamp) || 0;
      return tB - tA;
    });

    return {
      total: parsed.length,
      actions: parsed,
      counts
    };
  };

  const handleRegisterAction = (recordId: string) => {
    if (!newActionComment.trim()) {
      alert("Por favor escribe un comentario o detalle de la acción.");
      return;
    }
    const finalActionType = newActionType === "Otro" ? (customActionType.trim() || "Otro") : newActionType;
    
    // Check if we are also assigning/reassigning an assistant
    const updatedFields: Partial<OperationRecord> = {
      comentario: assignedAssistant 
        ? `[${finalActionType}] ${newActionComment.trim()} (Asignado/Derivado a: ${assignedAssistant})`
        : `[${finalActionType}] ${newActionComment.trim()}`,
      updatedByUser: currentUser.username
    };

    if (assignedAssistant) {
      updatedFields.derivadoA = assignedAssistant;
    }

    onUpdateRecord(recordId, updatedFields);

    setNewActionComment("");
    setCustomActionType("");
    setAssignedAssistant("");
    setSuccessMsg(`Acción "${finalActionType}" registrada con éxito en el historial.`);
    setIsSuccessState(true);
    setTimeout(() => setIsSuccessState(false), 3000);
  };

  // Legal assistants list combining database users and default assistants
  const assistantsList = useMemo(() => {
    const fromUsers = settings.users?.filter(u => u.role === "Asistente Legal").map(u => u.username) || [];
    const baseNames = ["Franco Odar", "Daniel Hurtado", "Marilyn Saona", "Sthief Vidalon"];
    const combined = [...fromUsers];
    for (const name of baseNames) {
      if (!combined.some(n => n.toLowerCase() === name.toLowerCase())) {
        combined.push(name);
      }
    }
    return combined;
  }, [settings.users]);

  // Helper to retrieve observation event and timestamp
  const getObservationEvent = (item: OperationRecord) => {
    const isOther = isOtherAreasObservation(item);
    const isObs = (item.status || "").toLowerCase().includes("observad") || (item.status || "").toLowerCase().includes("rechazad") || isOther;
    if (!isObs) return null;

    const obsHistory = item.history?.slice().reverse().find(h => 
      (h.status && (h.status.toLowerCase().includes("observad") || h.status.toLowerCase().includes("rechazad") || isOtherAreasObservation(h))) ||
      (h.comentario && (h.comentario.toLowerCase().includes("[observación") || h.comentario.toLowerCase().includes("[observacion") || isOtherAreasObservation(h)))
    );

    const obsTime = obsHistory?.timestamp || item.updatedAt || item.solicitudAt || item.createdAt;
    return {
      isObs: true,
      isOtherAreas: isOther,
      obsTime
    };
  };

  const getWaitingTimeStr = (startVal?: string) => {
    if (!startVal) return "Sin tiempo";
    const res = calculateBusinessTime(startVal, new Date(), settings.workingSchedule);
    return res.formattedDetailed;
  };

  const getWaitingColorClass = (startVal?: string) => {
    if (!startVal) return "text-slate-400 bg-slate-50 border-slate-200";
    const res = calculateBusinessTime(startVal, new Date(), settings.workingSchedule);
    const hours = res.totalMinutes / 60;
    if (hours < 4) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (hours < 8) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-rose-700 bg-rose-50 border-rose-200";
  };

  // Operations that have received attention by legal assistant and are observed or have observations in history
  const attendedObservedOperations = useMemo(() => {
    return records.filter(r => {
      if (r.status === "Cierre Completo" || r.status === "Desistido") return false;
      const normStatus = (r.status || "").toLowerCase();
      const isObs = normStatus.includes("observad") || normStatus.includes("rechazad") || isOtherAreasObservation(r);
      const hasReasons = Array.isArray(r.observationReasons) && r.observationReasons.length > 0;
      const hasObsText = Boolean(r.observacion && r.observacion.trim());
      const hasHistoryObs = Array.isArray(r.history) && r.history.some(h => {
        const s = (h.status || "").toLowerCase();
        const c = (h.comentario || "").toLowerCase();
        return s.includes("observad") || s.includes("rechazad") || c.includes("[observación") || c.includes("[observacion");
      });
      const hasLegalAttention = Boolean(r.derivadoA || r.emittedAt || r.emision || hasHistoryObs);
      return isObs || hasReasons || hasObsText || (hasLegalAttention && normStatus.includes("revis"));
    });
  }, [records]);

  // Filtered list of attended observed operations
  const filteredObservedOperations = useMemo(() => {
    if (!obsSearch.trim()) return attendedObservedOperations;
    const q = obsSearch.toLowerCase().trim();
    return attendedObservedOperations.filter(r => {
      return (
        (r.proyecto && r.proyecto.toLowerCase().includes(q)) ||
        (r.dpto && r.dpto.toLowerCase().includes(q)) ||
        (r.estac && r.estac.toLowerCase().includes(q)) ||
        (r.dep && r.dep.toLowerCase().includes(q)) ||
        (r.asesor && r.asesor.toLowerCase().includes(q)) ||
        (r.derivadoA && r.derivadoA.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q)) ||
        (r.status && r.status.toLowerCase().includes(q))
      );
    });
  }, [attendedObservedOperations, obsSearch]);

  // Handler: Lift observation and re-enter into legal assistant pending workflow
  const handleConfirmLiftObservation = async (rec: OperationRecord) => {
    if (!liftComment.trim()) {
      alert("Por favor ingresa un comentario indicando cómo se levantó la observación.");
      return;
    }
    setIsLiftingSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const targetAssistant = liftReassignAssistant || rec.derivadoA || "Sin Asignar";
      const historyComment = `[Observación Levantada por Jefe Legal] ${liftComment.trim()}${liftReassignAssistant && liftReassignAssistant !== rec.derivadoA ? ` (Reasignado a ${liftReassignAssistant})` : ""}`;
      
      const newHistoryEntry: StatusHistoryEntry = {
        status: "Pendiente",
        comentario: historyComment,
        timestamp: formatDateTimeFull(new Date()),
        user: currentUser?.username || "Jefe Legal",
        affectsAdvisor: false,
        derivadoA: targetAssistant
      };

      await onUpdateRecord(rec.id, {
        status: "Pendiente",
        observacion: "",
        observationReasons: [],
        tipoObservacion: undefined,
        affectsAdvisor: false,
        emittedAt: null,
        reingresadoAt: nowIso,
        derivadoA: targetAssistant,
        updatedByUser: currentUser?.username || "Jefe Legal",
        history: [...(rec.history || []), newHistoryEntry]
      });

      setLiftingRecordId(null);
      setLiftComment("");
      setLiftReassignAssistant("");
      setToastMessage(`Observación levantada exitosamente. El expediente ${formatProjectAndUnits(rec)} reingresó a los pendientes del Asistente Legal.`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      alert("Error al levantar observación: " + e.message);
    } finally {
      setIsLiftingSubmitting(false);
    }
  };

  // Handler: Reopen closed operation and assign new legal status
  const handleConfirmReopen = async (rec: OperationRecord) => {
    if (!reopenNewStatus) {
      alert("Por favor selecciona un nuevo estado legal para reabrir la operación.");
      return;
    }
    setIsReopeningSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const statusEntry: StatusHistoryEntry = {
        status: reopenNewStatus,
        comentario: `[Operación Reabierta por Jefe Legal] Estado cambiado de "${rec.status}" a "${reopenNewStatus}". ${reopenComment ? "Comentario: " + reopenComment : ""}`.trim(),
        timestamp: formatDateTimeFull(new Date()),
        user: currentUser?.username || "Jefe Legal",
        derivadoA: rec.derivadoA
      };

      await onUpdateRecord(rec.id, {
        status: reopenNewStatus,
        reingresadoAt: nowIso,
        emittedAt: reopenNewStatus === "Emitido" ? nowIso : null,
        updatedByUser: currentUser?.username || "Jefe Legal",
        history: [...(rec.history || []), statusEntry]
      });

      setReopeningRecordId(null);
      setReopenComment("");
      setToastMessage(`Operación ${formatProjectAndUnits(rec)} reabierta con éxito con estado "${reopenNewStatus}".`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      alert("Error al reabrir operación: " + e.message);
    } finally {
      setIsReopeningSubmitting(false);
    }
  };

  // Handler: Reassign assistant legal generating history log
  const handleConfirmReassign = async () => {
    if (!reassignModalRecord) return;
    if (!reassignTargetAssistant) {
      alert("Por favor selecciona el nuevo asistente legal a cargo.");
      return;
    }
    setIsReassigning(true);
    try {
      const oldAssistant = reassignModalRecord.derivadoA || "Sin Asignar";
      const historyEntry: StatusHistoryEntry = {
        status: reassignModalRecord.status,
        comentario: `[Reasignación] Expediente reasignado de "${oldAssistant}" a "${reassignTargetAssistant}" por Jefe Legal.${reassignReason ? " Motivo: " + reassignReason : ""}`.trim(),
        user: currentUser?.username || "Jefe Legal",
        timestamp: formatDateTimeFull(new Date()),
        derivadoA: reassignTargetAssistant
      };

      await onUpdateRecord(reassignModalRecord.id, {
        derivadoA: reassignTargetAssistant,
        updatedByUser: currentUser?.username || "Jefe Legal",
        history: [...(reassignModalRecord.history || []), historyEntry]
      });

      setToastMessage(`Expediente reasignado exitosamente a ${reassignTargetAssistant}.`);
      setTimeout(() => setToastMessage(null), 4000);
      setReassignModalRecord(null);
      setReassignTargetAssistant("");
      setReassignReason("");
    } catch (e: any) {
      alert("Error al reasignar asistente: " + e.message);
    } finally {
      setIsReassigning(false);
    }
  };

  // Filter records for "Historial de Acciones" tab
  const filteredAllRecords = records.filter(r => {
    if (closedOnlyFilter) {
      const isClosed = r.status === "Cierre Completo" || r.status === "Desistido";
      if (!isClosed) return false;
    }
    if (filterDate) {
      const recordDate = r.createdAt?.substring(0, 10); // YYYY-MM-DD
      const matchCreated = recordDate === filterDate;
      const matchSolicitud = r.solicitud?.substring(0, 10);
      if (!matchCreated && !matchSolicitud) return false;
    }
    if (filterProject && r.proyecto !== filterProject) {
      return false;
    }
    if (filterStatus && r.status !== filterStatus) {
      return false;
    }
    return true;
  });

  // If disabled by administrator
  if (!settings.jefeLegalEnabled) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-rose-100 shadow-sm text-center max-w-lg mx-auto space-y-4" id="jefe-legal-disabled">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100 animate-pulse">
          <AlertOctagon className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wide">Registro Deshabilitado</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          El Administrador de la plataforma ha desactivado la capacidad de registro para el perfil de <strong>Jefe Legal</strong>.
        </p>
        <div className="p-3 bg-slate-50 rounded-xl text-slate-600 text-xs font-semibold border border-slate-150 inline-block">
          Comunícate con el Administrador para volver a activar el servicio.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6" id="jefe-legal-panel-container">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-slate-900 text-white p-4 rounded-xl shadow-2xl z-50 animate-bounce-in border border-slate-700 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold leading-tight mb-1 text-emerald-400">Notificación</p>
            <p className="opacity-90">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* Dashboard Greeting */}
      <section className="flex justify-between items-center bg-blue-50/20 p-4 rounded-2xl border border-blue-100/50">
        <div>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Flujo de Trabajo</p>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Consola Jefe Legal</h2>
        </div>
        <div className="text-right font-mono text-[10px] text-slate-400 leading-tight">
          <div>{currentDateStr}</div>
          <div className="font-bold text-brand-primary">{currentTimeStr}</div>
        </div>
      </section>

      {/* KPI Summary Strip for Jefe Legal: Breakdown by Emisión, Modificación, Adenda */}
      <div className="bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/60 p-3.5 rounded-2xl border border-blue-100/80 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-primary text-white rounded-xl shadow-xs">
              <BarChart3 className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">
                KPIs Jefe Legal: Operaciones Registradas
              </h4>
              <p className="text-[10px] text-slate-500 font-medium">
                Desglose por tipo registrado: Emisión, Modificación y Adenda
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-white px-3 py-1.5 rounded-xl border border-blue-200 shadow-2xs flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-blue-700 uppercase">Emisión:</span>
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-lg font-mono font-black">
                {kpiRegisteredCounts.emision}
              </span>
            </div>

            <div className="bg-white px-3 py-1.5 rounded-xl border border-amber-200 shadow-2xs flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-amber-700 uppercase">Modificación:</span>
              <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-lg font-mono font-black">
                {kpiRegisteredCounts.modificacion}
              </span>
            </div>

            <div className="bg-white px-3 py-1.5 rounded-xl border border-purple-200 shadow-2xs flex items-center gap-2">
              <span className="text-[10px] font-extrabold text-purple-700 uppercase">Adenda:</span>
              <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-lg font-mono font-black">
                {kpiRegisteredCounts.adenda}
              </span>
            </div>

            <div className="bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs flex items-center gap-2" title="Solicitudes con minuta emitida directamente por el Jefe Legal">
              <span className="text-[10px] font-extrabold text-indigo-700 uppercase">Emisiones Jefe Legal:</span>
              <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-lg font-mono font-black">
                {kpiJefeLegalEmissionsCount}
              </span>
            </div>

            <div className="bg-white px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs flex items-center gap-2" title="Solicitudes atendidas o cerradas completamente por el Jefe Legal">
              <span className="text-[10px] font-extrabold text-emerald-700 uppercase">Cierres Jefe Legal:</span>
              <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-lg font-mono font-black">
                {kpiJefeLegalClosures}
              </span>
            </div>

            <div className="bg-slate-900 text-white px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase">Total:</span>
              <span className="bg-slate-800 text-white text-xs px-2 py-0.5 rounded-lg font-mono font-black">
                {kpiRegisteredCounts.total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Jefe Legal Sub Tab options */}
      <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setJefeSubTab("new_request")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "new_request" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <PlusCircle className="h-3.5 w-3.5 inline mr-1" />
          Ingresar Solicitud
        </button>
        <button
          onClick={() => setJefeSubTab("register")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "register" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <List className="h-3.5 w-3.5 inline mr-1" />
          Trámites Pendientes
        </button>
        <button
          onClick={() => setJefeSubTab("emit")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "emit" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <FileCheck className="h-3.5 w-3.5 inline mr-1" />
          Emitir Expedientes
        </button>
        <button
          onClick={() => setJefeSubTab("edit")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "edit" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <Edit3 className="h-3.5 w-3.5 inline mr-1" />
          Editar (6 Hrs)
        </button>
        <button
          onClick={() => setJefeSubTab("actions_history")}
          className={`flex-1 text-center py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            jefeSubTab === "actions_history" ? "bg-white text-brand-primary shadow-sm" : "text-slate-600 hover:bg-white/50"
          }`}
        >
          <History className="h-3.5 w-3.5 inline mr-1" />
          Historial y Acciones
        </button>
      </div>

      {/* Success Banner */}
      {isSuccessState && (
        <div className="bg-emerald-600 text-white p-4 rounded-xl shadow-lg flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="h-5 w-5 text-emerald-200 shrink-0" />
          <p className="text-xs font-bold">{successMsg}</p>
        </div>
      )}

      {/* Annexed Modification Notice */}
      {annexedAlert?.show && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl shadow-md space-y-2 animate-fadeIn" id="annexed-modification-banner">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
                <AlertCircle className="h-5 w-5 text-amber-700" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
                  <span>Operación de Modificación Existente Anexada</span>
                  <span className="bg-amber-200 text-amber-900 text-[9px] px-1.5 py-0.5 rounded font-bold">Aviso Oficial</span>
                </h4>
                <p className="text-xs font-medium text-amber-900 leading-relaxed">
                  {annexedAlert.message}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
                  <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md border border-amber-200">
                    ID Expediente: {annexedAlert.recordId}
                  </span>
                  <span className="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md border border-amber-200">
                    Estado Anterior: {annexedAlert.prevStatus}
                  </span>
                  <span className="bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Nuevo Estado: Pendiente
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAnnexedAlert(null)}
              className="text-amber-700 hover:text-amber-950 font-black text-xs px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
            >
              Cerrar ✕
            </button>
          </div>
        </div>
      )}

      {/* SUB-PANEL 0: NEW REQUEST REGISTRATION (JEFE LEGAL - IMAGE 4 REDESIGN) */}
      {jefeSubTab === "new_request" && (
        <form onSubmit={handleAddNewRequest} className="space-y-5 animate-fadeIn bg-white p-6 rounded-3xl border border-slate-150 shadow-sm" id="jefe-new-request-form">
          <div className="flex items-center gap-2 pb-3.5 border-b border-slate-100">
            <div className="p-1.5 bg-blue-50 text-brand-primary rounded-lg">
              <PlusCircle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                Ingresar Nueva Solicitud Legal
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Auto-asignación activa basada en proyecto y equipo</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Proyecto selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">PROYECTO *</label>
              <SearchableSelect
                value={newProjName}
                onChange={(val) => setNewProjName(val)}
                options={projectOptions.map(p => ({ value: p.name, label: p.name }))}
                placeholder="Seleccionar proyecto..."
                className="w-full font-medium"
              />
            </div>

            {/* Auto-resolved Jefe de Ventas */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wide ml-0.5">Jefe de Ventas Responsable</label>
              <input
                type="text"
                disabled
                value={newJefeVentas}
                className="h-10 border border-slate-200 bg-slate-50 rounded-xl px-3 font-semibold text-slate-500 outline-none cursor-not-allowed text-xs"
              />
            </div>

            {/* Dpto, Estac, Dep */}
            <div className="md:col-span-2 grid grid-cols-3 gap-2 bg-slate-50/50 p-2.5 rounded-2xl border border-slate-100">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide text-center">Dpto (opcional)</label>
                <input
                  type="text"
                  placeholder="ej: 304"
                  value={newDpto}
                  onChange={(e) => setNewDpto(e.target.value)}
                  className="h-10 border border-slate-200 bg-white rounded-xl px-3 outline-none text-center font-mono font-bold text-xs text-slate-700 focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide text-center">Estac.</label>
                <input
                  type="text"
                  placeholder="ej: E-15"
                  value={newEstac}
                  onChange={(e) => setNewEstac(e.target.value)}
                  className="h-10 border border-slate-200 bg-white rounded-xl px-3 outline-none text-center font-mono font-bold text-xs text-slate-700 focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide text-center">Dep.</label>
                <input
                  type="text"
                  placeholder="ej: D-02"
                  value={newDep}
                  onChange={(e) => setNewDep(e.target.value)}
                  className="h-10 border border-slate-200 bg-white rounded-xl px-3 outline-none text-center font-mono font-bold text-xs text-slate-700 focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              {/* Reactive duplicate detection message */}
              {(() => {
                const dupCheck = newProjName && (newDpto.trim() || newEstac.trim() || newDep.trim())
                  ? checkDuplicateUnitOperation(records, {
                      proyecto: newProjName,
                      dpto: newDpto,
                      estac: newEstac,
                      dep: newDep,
                      tipo: newTipo
                    })
                  : null;

                if (dupCheck?.isDuplicate) {
                  return (
                    <div className="col-span-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-start gap-2 animate-fadeIn">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-amber-900">Alerta de Unidad Duplicada:</span>
                        <span>{dupCheck.errorMessage}</span>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Asesor Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">Asesor Inmobiliario *</label>
              <SearchableSelect
                value={newAsesor}
                onChange={(val) => setNewAsesor(val)}
                options={advisorOptions.map(adv => ({ value: adv, label: adv }))}
                placeholder="Seleccionar asesor..."
                className="w-full font-medium"
                allowCustom={false}
              />
            </div>

            {/* Tipo de solicitud selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">Tipo de Solicitud *</label>
              <SearchableSelect
                value={newTipo}
                onChange={(val) => setNewTipo(val)}
                options={tiposOperacion.map(t => ({ value: t, label: t }))}
                placeholder="Seleccionar tipo de solicitud..."
                className="w-full font-medium"
              />
            </div>

            {/* Initial Comment */}
            <div className="md:col-span-2 flex flex-col gap-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide ml-0.5">Comentarios de Apertura</label>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Indica las instrucciones iniciales, prioridad o detalles clave del expediente..."
                rows={2.5}
                className="border border-slate-200 bg-slate-50 rounded-xl p-3 outline-none focus:bg-white text-xs text-slate-700 font-medium placeholder:text-slate-400 focus:ring-1 focus:ring-brand-primary resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmittingNewRequest}
            className={`w-full py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.99] shadow-md shadow-blue-100 cursor-pointer mt-2 ${
              isSubmittingNewRequest 
                ? "bg-slate-400 text-white cursor-not-allowed" 
                : "bg-brand-primary hover:bg-brand-secondary text-white"
            }`}
          >
            {isSubmittingNewRequest ? "Registrando expediente..." : "Aperturar Expediente Legal e Iniciar Flujo"}
          </button>
        </form>
      )}

      {/* SUB-PANEL 1: TRAMITES PENDIENTES */}
      {jefeSubTab === "register" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Sub-view switcher tabs */}
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setTramiteSubTab("observed")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                tramiteSubTab === "observed"
                  ? "bg-white text-brand-primary shadow-xs"
                  : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <AlertCircle className="h-4 w-4 text-rose-500" />
              <span>Expedientes Observados / Con Atención Legal</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                attendedObservedOperations.length > 0
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-200 text-slate-600"
              }`}>
                {attendedObservedOperations.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTramiteSubTab("untyped")}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                tramiteSubTab === "untyped"
                  ? "bg-white text-brand-primary shadow-xs"
                  : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <List className="h-4 w-4 text-brand-primary" />
              <span>Clasificar Nuevos Ingresos de Ventas (Sin Tipo)</span>
              <span className="bg-blue-100 text-brand-primary px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                {regAvailableRecords.length}
              </span>
            </button>
          </div>

          {/* VIEW A: OBSERVED & ATTENDED OPERATIONS */}
          {tramiteSubTab === "observed" && (
            <div className="space-y-4 animate-fadeIn">
              {/* Filter bar */}
              <div className="bg-white p-3.5 rounded-2xl border border-blue-100 shadow-2xs flex flex-col sm:flex-row gap-2.5 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={obsSearch}
                    onChange={(e) => setObsSearch(e.target.value)}
                    placeholder="Buscar por proyecto, lote, asesor o asistente..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary font-medium"
                  />
                  {obsSearch && (
                    <button
                      onClick={() => setObsSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <span>Mostrando <strong className="text-slate-800">{filteredObservedOperations.length}</strong> de {attendedObservedOperations.length} expedientes observados</span>
                </div>
              </div>

              {/* List of observed operations */}
              <div className="space-y-3">
                {filteredObservedOperations.map((r) => {
                  const refNum = `EXP-${r.id.substr(4, 3).toUpperCase()}`;
                  const isOther = isOtherAreasObservation(r);
                  const obsEvent = getObservationEvent(r);
                  const isLifting = liftingRecordId === r.id;

                  return (
                    <div
                      key={r.id}
                      className={`bg-white rounded-2xl p-4 border transition-all shadow-xs ${
                        isOther 
                          ? "border-blue-200 hover:border-blue-300 bg-linear-to-r from-white to-blue-50/20" 
                          : "border-rose-100 hover:border-rose-200 bg-linear-to-r from-white to-rose-50/20"
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                              {refNum}
                            </span>
                            <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-brand-primary border border-blue-100">
                              {r.tipo || "EMISION"}
                            </span>
                            {/* Status badge */}
                            {isOther ? (
                              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                OBSERVADO (OTRAS ÁREAS)
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {r.status || "OBSERVADO / RECHAZADO"}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                            {r.proyecto}
                          </h4>
                          <p className="text-xs font-bold text-brand-primary font-mono bg-blue-50/80 px-2 py-0.5 rounded-lg border border-blue-100/70 inline-block">
                            {formatUnitDisplay(r)}
                          </p>
                        </div>

                        {/* Timer and Responsible */}
                        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
                          {obsEvent && (
                            <div className="flex flex-col items-start md:items-end gap-1">
                              {isOther ? (
                                <div className="flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200 shadow-2xs">
                                  <Clock className="h-3 w-3 text-blue-600" />
                                  <span>Otras Áreas • Tiempo Asesor Detenido</span>
                                </div>
                              ) : (
                                <div className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border shadow-2xs ${getWaitingColorClass(obsEvent.obsTime)}`}>
                                  <Clock className="h-3 w-3" />
                                  <span>Espera Asesor: {getWaitingTimeStr(obsEvent.obsTime)}</span>
                                </div>
                              )}
                              <span className="text-[9px] text-slate-400 italic">
                                En espera de subsanación de observación
                              </span>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 text-[10px] pt-1">
                            <span className="bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                              <User className="h-2.5 w-2.5 text-slate-400" />
                              Asesor: <strong>{r.asesor || "Sin Asignar"}</strong>
                            </span>
                            <span className="bg-purple-50 text-purple-700 border border-purple-100 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Users className="h-2.5 w-2.5 text-purple-500" />
                              Asistente: <strong>{r.derivadoA || "Sin Asignar"}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Observations details */}
                      <div className="py-2.5 space-y-2">
                        {/* Tags */}
                        {Array.isArray(r.observationReasons) && r.observationReasons.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Motivos:</span>
                            {r.observationReasons.map((reason, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-100"
                              >
                                • {reason}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Observation comment text */}
                        {(r.observacion || r.comentario) && (
                          <div className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-700">
                            <span className="font-bold text-slate-800 text-[10px] uppercase block text-rose-600 mb-0.5">
                              Detalle de la Observación:
                            </span>
                            <p className="italic">"{r.observacion || r.comentario}"</p>
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="pt-2 flex flex-wrap items-center gap-2 justify-end border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setHistoryModalRecord(r)}
                          className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <History className="h-3.5 w-3.5 text-slate-500" />
                          <span>Ver Historial</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReassignModalRecord(r);
                            setReassignTargetAssistant(r.derivadoA || "");
                            setReassignReason("");
                          }}
                          className="py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Users className="h-3.5 w-3.5 text-purple-600" />
                          <span>Reasignar Asistente</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (isLifting) {
                              setLiftingRecordId(null);
                            } else {
                              setLiftingRecordId(r.id);
                              setLiftComment("");
                              setLiftReassignAssistant(r.derivadoA || "");
                            }
                          }}
                          className={`py-2 px-4 font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                            isLifting
                              ? "bg-slate-200 text-slate-700"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white"
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>{isLifting ? "Cancelar" : "Levantar Observación y Reingresar al Flujo"}</span>
                        </button>
                      </div>

                      {/* INLINE LIFT OBSERVATION PANEL */}
                      {isLifting && (
                        <div className="mt-3 p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 animate-fadeIn">
                          <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase tracking-wide">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            <span>Levantamiento de Observación • Reingreso al Flujo Legal</span>
                          </div>
                          <p className="text-[11px] text-emerald-800 leading-relaxed">
                            Al confirmar, <strong>se detendrá el temporizador del asesor</strong> y comenzará a correr el <strong>tiempo de atención para el Asistente Legal</strong> en su bandeja de pendientes.
                          </p>

                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] font-bold text-emerald-900 uppercase block mb-1">
                                Comentario de Levantamiento de Observación *
                              </label>
                              <textarea
                                value={liftComment}
                                onChange={(e) => setLiftComment(e.target.value)}
                                placeholder="Indica detalladamente que la observación ha sido levantada o subsanada (ej. 'Se adjuntó la documentación solicitada por el asesor y está expedita para emisión')..."
                                rows={2.5}
                                className="w-full bg-white border border-emerald-300 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-slate-400"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-emerald-900 uppercase block mb-1">
                                Asistente Legal a cargo (Opcional - Mantener o Cambiar):
                              </label>
                              <select
                                value={liftReassignAssistant}
                                onChange={(e) => setLiftReassignAssistant(e.target.value)}
                                className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                              >
                                <option value="">-- Mantener actual ({r.derivadoA || "Sin Asignar"}) --</option>
                                {assistantsList.map(a => (
                                  <option key={a} value={a}>{a}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setLiftingRecordId(null)}
                              className="py-2 px-3 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isLiftingSubmitting || !liftComment.trim()}
                              onClick={() => handleConfirmLiftObservation(r)}
                              className={`py-2 px-4 font-black text-xs uppercase rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
                                isLiftingSubmitting || !liftComment.trim()
                                  ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95"
                              }`}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{isLiftingSubmitting ? "Reingresando..." : "Confirmar Levantamiento y Reingresar al Flujo"}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredObservedOperations.length === 0 && (
                  <div className="text-center p-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                    <h5 className="font-bold text-slate-700 text-sm">No hay expedientes observados pendientes</h5>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {obsSearch ? "Ningún expediente coincide con el criterio de búsqueda." : "No existen operaciones observadas en espera de levantamiento de observación."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW B: UNTYPED VENTAS OPERATIONS */}
          {tramiteSubTab === "untyped" && (
            <form onSubmit={handleRegisterOperation} className="space-y-4 animate-fadeIn bg-white p-5 rounded-2xl border border-blue-100 shadow-2xs">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                  Seleccionar Expediente Registrado por Ventas (Sin Tipo)
                </label>
                <SearchableSelect
                  value={selectedRegRecordId}
                  onChange={(val) => setSelectedRegRecordId(val)}
                  options={[
                    { value: "", label: "-- Selecciona un expediente --" },
                    ...regAvailableRecords.map(r => ({
                      value: r.id,
                      label: `${formatProjectAndUnits(r)} - Ingresado por ${r.team}`
                    }))
                  ]}
                  placeholder="Buscar expediente de ventas..."
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2 ml-0.5">
                  Asignar Tipo de Trámite Legal (TIPO)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {tiposOperacion.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelectedType(t)}
                      className={`py-3 px-2 border rounded-xl font-bold text-[11px] transition-all active:scale-[0.98] ${
                        selectedType === t
                          ? "ring-2 ring-brand-primary bg-blue-50 border-brand-primary text-brand-primary"
                          : "bg-white border-blue-100 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Panel */}
              {showRegPreview && (
                <div className="bg-brand-primary p-4 rounded-xl shadow-lg text-white space-y-2 animate-fadeIn">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider opacity-90">
                    <span>Acción Legal</span>
                    <span>Sello Automático SOLICITUD</span>
                  </div>
                  <div className="flex justify-between border-t border-white/20 pt-1.5 text-xs">
                    <span className="font-bold text-emerald-300">SOLICITUD DE {selectedType}</span>
                    <span className="font-mono font-bold text-white">{currentTimeStr}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide ml-0.5">
                  Observaciones del Trámite (Comentario Opcional)
                </label>
                <textarea
                  value={regObservations}
                  onChange={(e) => setRegObservations(e.target.value)}
                  placeholder="Indica notas o instrucciones específicas para este expediente..."
                  rows={3}
                  className="w-full bg-white border border-blue-100 rounded-xl p-3 focus:ring-1 focus:ring-brand-primary outline-none text-xs text-slate-700 placeholder:text-slate-400"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-blue-100 cursor-pointer"
              >
                Registrar Tipo Legal y Sellar Solicitud
              </button>
            </form>
          )}
        </div>
      )}

      {/* SUB-PANEL 2: EMITIR EXPEDIENTES (TOP FILTERS & FULL EMISSION FORM) */}
      {jefeSubTab === "emit" && (
        <div className="space-y-6 animate-fadeIn" id="jefe-emitir-expedientes-panel">
          
          {/* 1. TOP FILTERS FOR LOCATING OPERATIONS */}
          <div className="bg-white p-5 rounded-3xl border border-slate-150 shadow-sm space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 text-brand-primary rounded-lg">
                  <SlidersHorizontal className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                    Filtros de Búsqueda y Ubicación de Expedientes
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">Ubica expedientes por team, proyecto, asesor o asistente legal</p>
                </div>
              </div>

              {(emitFilterTeam || emitFilterProject || emitFilterAdvisor || emitFilterAssistant || emitSearchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setEmitFilterTeam("");
                    setEmitFilterProject("");
                    setEmitFilterAdvisor("");
                    setEmitFilterAssistant("");
                    setEmitSearchQuery("");
                  }}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  Limpiar Filtros
                </button>
              )}
            </div>

            {/* Filter Controls Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Filter 1: Team */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Equipo / Team
                </label>
                <select
                  value={emitFilterTeam}
                  onChange={(e) => setEmitFilterTeam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="">Todos los Teams</option>
                  {teamsList.map(t => (
                    <option key={t} value={t}>Team {t}</option>
                  ))}
                </select>
              </div>

              {/* Filter 2: Project */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Proyecto
                </label>
                <SearchableSelect
                  value={emitFilterProject}
                  onChange={(val) => setEmitFilterProject(val)}
                  options={[
                    { value: "", label: "Todos los Proyectos" },
                    ...projectOptions.map(p => ({ value: p.name, label: p.name }))
                  ]}
                  placeholder="Filtrar por proyecto..."
                  className="w-full"
                />
              </div>

              {/* Filter 3: Advisor */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Asesor Inmobiliario
                </label>
                <SearchableSelect
                  value={emitFilterAdvisor}
                  onChange={(val) => setEmitFilterAdvisor(val)}
                  options={[
                    { value: "", label: "Todos los Asesores" },
                    ...advisorOptions.map(a => ({ value: a, label: a }))
                  ]}
                  placeholder="Filtrar por asesor..."
                  className="w-full"
                />
              </div>

              {/* Filter 4: Assistant Legal */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Asistente Legal
                </label>
                <SearchableSelect
                  value={emitFilterAssistant}
                  onChange={(val) => setEmitFilterAssistant(val)}
                  options={[
                    { value: "", label: "Todos los Asistentes" },
                    ...assistantsList.map(u => ({ value: u.username, label: `@${u.username}` }))
                  ]}
                  placeholder="Filtrar por asistente..."
                  className="w-full"
                />
              </div>
            </div>

            {/* Filter 5: Quick Text Search */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={emitSearchQuery}
                onChange={(e) => setEmitSearchQuery(e.target.value)}
                placeholder="Búsqueda rápida por DPTO, ID de Operación, Asesor, Proyecto o Estado..."
                className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 outline-none"
              />
              {emitSearchQuery && (
                <button
                  type="button"
                  onClick={() => setEmitSearchQuery("")}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Matching items counter banner */}
            <div className="flex justify-between items-center pt-2 text-xs">
              <span className="font-bold text-slate-600">
                {filteredEmitRecords.length} expedientes coincidentes con los filtros
              </span>
              {selectedEmitRecordId && (
                <span className="text-[11px] font-bold text-brand-primary bg-blue-50 px-2 py-0.5 rounded-md">
                  Expediente seleccionado: {selectedEmitRecordId}
                </span>
              )}
            </div>
          </div>

          {/* 2. MAIN 2-COLUMN SECTION: EXPEDIENTS LIST & SELECTED EXPEDIENT EMISSION FORM */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: LIST OF MATCHING EXPEDIENTS */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
                    <List className="h-4 w-4 text-brand-primary" />
                    Expedientes Ubicados ({sortedEmitRecords.length})
                  </h4>
                </div>

                {/* Interactive Sorting Controls (Oldest vs Newest) */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setEmitSortOrder("oldest")}
                    className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      emitSortOrder === "oldest"
                        ? "bg-amber-500 text-white shadow-xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Mostrar primero el expediente más antiguo ingresado"
                  >
                    <span>⏳ Más antiguo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmitSortOrder("newest")}
                    className={`px-3 py-1 font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                      emitSortOrder === "newest"
                        ? "bg-blue-600 text-white shadow-xs font-black"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                    title="Mostrar primero el expediente más nuevo ingresado"
                  >
                    <span>⚡ Más nuevo</span>
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[660px] overflow-y-auto pr-1">
                {sortedEmitRecords.length === 0 ? (
                  <div className="p-8 bg-white rounded-2xl border border-slate-150 text-center space-y-2">
                    <Info className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">No se encontraron expedientes</p>
                    <p className="text-[11px] text-slate-400">Prueba ajustando o limpiando los filtros superiores.</p>
                  </div>
                ) : (
                  sortedEmitRecords.map((r, idx) => {
                    const isSelected = selectedEmitRecordId === r.id;
                    const isObserved = (r.status || "").toLowerCase().includes("observad") || (r.status || "").toLowerCase().includes("rechazad");
                    const isApproved = (r.status || "").toLowerCase().includes("aprobad");

                    return (
                      <div
                        key={r.id}
                        onClick={() => handleSelectEmitRecord(r)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-left overflow-hidden ${
                          isSelected
                            ? "bg-blue-50/70 border-brand-primary shadow-sm ring-2 ring-brand-primary/40"
                            : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-xs"
                        }`}
                      >
                        {/* TOP ROW: Index and Operation Status Badge */}
                        <div className="flex justify-between items-center gap-2 mb-1.5">
                          <span className="font-mono text-xs font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                            #{idx + 1}
                          </span>

                          {/* Status Badge: Stays neatly inside the box, never overflows */}
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border truncate max-w-[62%] shrink-0 text-center ${
                              isObserved
                                ? "bg-rose-100 text-rose-800 border-rose-200"
                                : isApproved
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-amber-100 text-amber-800 border-amber-200"
                            }`}
                            title={r.status || "Sin Estado"}
                          >
                            {r.status || "Sin Estado"}
                          </span>
                        </div>

                        {/* ROW 3: Proyecto & Clean Unit Display (No '(-)', handles dpto/estac/dep) */}
                        <div className="flex items-center justify-between gap-2 min-w-0 mb-1">
                          <span className="font-black text-sm text-slate-900 truncate" title={r.proyecto}>
                            {r.proyecto}
                          </span>
                          <span className="font-mono text-[11px] font-black text-brand-primary bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 shrink-0 whitespace-nowrap">
                            {formatUnitDisplay(r)}
                          </span>
                        </div>

                        {/* ROW 3: Asesor & Team with reduced font size so full name is clearly visible */}
                        <div className="text-[10.5px] text-slate-600 leading-tight mb-2" title={`Asesor: ${r.asesor || "No asignado"} • Team ${r.team || "A"}`}>
                          <span className="text-slate-400 font-medium">Asesor:</span>{" "}
                          <strong className="text-slate-800 font-bold uppercase break-words">{r.asesor || "No asignado"}</strong>
                          <span className="text-slate-300 mx-1.5">•</span>
                          <span className="font-bold text-slate-700 text-[10px]">Team {r.team || "A"}</span>
                        </div>

                        {/* ROW 4: Date & Time in 2 separate rows + Type */}
                        <div className="pt-2 border-t border-slate-150 flex items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
                          <div className="flex flex-col gap-0.5 leading-tight">
                            <span>Fecha: <strong className="text-slate-800 font-bold">{getDateAndTimeString(r.solicitudAt || r.solicitud || r.createdAt).date}</strong></span>
                            <span>Hora: <strong className="text-slate-800 font-bold">{getDateAndTimeString(r.solicitudAt || r.solicitud || r.createdAt).time}</strong></span>
                          </div>
                          <span className="text-slate-900 bg-slate-100 px-2 py-1 rounded border border-slate-200 text-[10px] font-bold shrink-0">
                            {r.tipo}
                          </span>
                        </div>

                        <div className="mt-1 text-[10px] text-slate-500 flex items-center justify-between">
                          <span>Asistente: <strong className="text-slate-800 capitalize">{r.derivadoA || "Auto"}</strong></span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: "EMITIR EXPEDIENTE SELECCIONADO" FORM */}
            <div className="lg:col-span-7">
              {selectedEmitRecordId ? (
                (() => {
                  const currentRec = records.find(r => r.id === selectedEmitRecordId);
                  return (
                    <div className="bg-white p-6 rounded-3xl border border-slate-150 shadow-sm space-y-5">
                      
                      {/* Selected Expediente Header Banner */}
                      <div className="p-4 bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 rounded-2xl space-y-2">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">
                              Emitir Expediente Seleccionado
                            </span>
                            <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                              {formatProjectAndUnits({ proyecto: currentRec?.proyecto, dpto: emitDpto || currentRec?.dpto, estac: emitEstac || currentRec?.estac, dep: emitDep || currentRec?.dep })}
                            </h3>
                          </div>
                          {/* Top-right corner ID badge matching image.png */}
                          <div className="bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2 text-right shadow-xs shrink-0">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-tight">ID:</span>
                            <span className="font-mono text-xs md:text-sm font-black text-slate-700 block tracking-tight leading-tight mt-0.5">
                              {currentRec?.id || selectedEmitRecordId}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-blue-100/60 text-[10px]">
                          <div>
                            <span className="text-slate-400 block font-bold">Team:</span>
                            <span className="font-bold text-slate-700">Team {currentRec?.team || "A"}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold">Asesor:</span>
                            <span className="font-bold text-slate-700 truncate block">{emitAsesor || currentRec?.asesor}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold">Tipo:</span>
                            <span className="font-bold text-brand-primary">{currentRec?.tipo}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold">Asistente:</span>
                            <span className="font-bold text-slate-700 truncate block">{currentRec?.derivadoA || "Asignado"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Editable / Verifiable Details */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Datos de la Operación (Verificar / Modificar si es necesario)
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block">DPTO *</span>
                            <input
                              type="text"
                              value={emitDpto}
                              onChange={(e) => setEmitDpto(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-1 focus:ring-brand-primary"
                              placeholder="Dpto"
                            />
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block">ESTACIONAMIENTO</span>
                            <input
                              type="text"
                              value={emitEstac}
                              onChange={(e) => setEmitEstac(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-brand-primary"
                              placeholder="Estac."
                            />
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block">DEPÓSITO</span>
                            <input
                              type="text"
                              value={emitDep}
                              onChange={(e) => setEmitDep(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-brand-primary"
                              placeholder="Dep."
                            />
                          </div>
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block">ASESOR</span>
                            <SearchableSelect
                              value={emitAsesor}
                              onChange={(val) => setEmitAsesor(val)}
                              options={advisorOptions.map(a => ({ value: a, label: a }))}
                              placeholder="Asesor..."
                              className="w-full"
                              allowCustom={false}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Status Legal Assignment */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Asignar Estado Legal (STATUS) *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {statusesList.map((s) => {
                            const isSelected = selectedStatus === s;
                            const isObs = s.toLowerCase().includes("observad") || s.toLowerCase().includes("rechazad");
                            const isAppr = s.toLowerCase().includes("aprobad");

                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setSelectedStatus(s)}
                                className={`py-2.5 px-3 border rounded-xl font-bold text-xs transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between ${
                                  isSelected
                                    ? isObs
                                      ? "ring-2 ring-rose-500 bg-rose-50 border-rose-400 text-rose-900 shadow-xs"
                                      : isAppr
                                      ? "ring-2 ring-emerald-500 bg-emerald-50 border-emerald-400 text-emerald-900 shadow-xs"
                                      : "ring-2 ring-brand-primary bg-blue-50 border-blue-400 text-brand-primary shadow-xs"
                                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <span>{s}</span>
                                {isSelected && <Check className="h-4 w-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Observations Checklist with Category Tabs and KPI Impact */}
                      <div className="space-y-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                        <div className="flex justify-between items-center">
                          <div>
                            <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
                              Checklist de Observaciones Estandarizadas
                            </label>
                            <p className="text-[10px] text-slate-500 font-medium">
                              Marca los motivos que apliquen para generar el registro y alimentar el KPI
                            </p>
                          </div>
                          {emitSelectedObservations.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setEmitSelectedObservations([])}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer"
                            >
                              Limpiar ({emitSelectedObservations.length})
                            </button>
                          )}
                        </div>

                        {/* Category Tabs: Legal vs Otras Áreas */}
                        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setEmitObsCategoryTab("legal");
                              setEmitAffectsAdvisor(true);
                            }}
                            className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              emitObsCategoryTab === "legal"
                                ? "bg-white text-rose-700 shadow-xs border border-rose-200"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${emitObsCategoryTab === "legal" ? "bg-rose-500" : "bg-slate-300"}`} />
                            <span>Legal / Asesor</span>
                            {(() => {
                              const legalCount = emitSelectedObservations.filter(o => !STANDARD_OTHER_AREAS_OBSERVATIONS.includes(o as any) && !o.toLowerCase().includes("otras áreas") && !o.toLowerCase().includes("otras areas")).length;
                              return legalCount > 0 ? (
                                <span className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                                  {legalCount}
                                </span>
                              ) : null;
                            })()}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEmitObsCategoryTab("otras_areas");
                              setEmitAffectsAdvisor(false);
                            }}
                            className={`py-1.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              emitObsCategoryTab === "otras_areas"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "text-blue-700 hover:text-blue-900 bg-blue-50/60"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${emitObsCategoryTab === "otras_areas" ? "bg-white" : "bg-blue-500"}`} />
                            <span>Otras Áreas</span>
                            {(() => {
                              const otherCount = emitSelectedObservations.filter(o => STANDARD_OTHER_AREAS_OBSERVATIONS.includes(o as any) || o.toLowerCase().includes("otras áreas") || o.toLowerCase().includes("otras areas")).length;
                              return otherCount > 0 ? (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${emitObsCategoryTab === "otras_areas" ? "bg-white text-blue-700" : "bg-blue-200 text-blue-900"}`}>
                                  {otherCount}
                                </span>
                              ) : null;
                            })()}
                          </button>
                        </div>

                        {/* Contenido según Categoría Seleccionada: Legal / Asesor vs Otras Áreas */}
                        {emitObsCategoryTab === "otras_areas" ? (
                          <div className="space-y-3 animate-fadeIn">
                            {/* Imagen 2 / 5: Comentario y aviso al inicio de Otras Áreas (Automático: NO afecta al asesor) */}
                            <div className="flex items-start gap-3 p-3 rounded-2xl border bg-blue-50/90 border-blue-300 text-blue-950 shadow-xs select-none">
                              <div className="flex items-center justify-center h-4 w-4 rounded border border-blue-400 bg-white mt-0.5 shrink-0">
                                {/* Check desmarcado automático para NO */}
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-xs font-black">
                                    ¿Afecta al Asesor en su KPI? (NO)
                                  </span>
                                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase border bg-blue-100 text-blue-800 border-blue-200">
                                    ⏱️ TIEMPO ASESOR DETENIDO
                                  </span>
                                </div>
                                <p className="text-[10px] mt-0.5 leading-snug font-medium text-blue-700">
                                  La observación NO afecta al asesor. El tiempo que transcurre en el asesor se detiene.
                                </p>
                              </div>
                            </div>

                            {/* Lista de motivos de Otras Áreas agregados desde admin */}
                            {(() => {
                              const reasons = getActiveObservationReasonConfigs(settings, "otras_areas");
                              if (reasons.length === 0) {
                                return (
                                  <div className="p-4 bg-white border border-dashed border-blue-200 rounded-xl text-center space-y-1">
                                    <p className="text-xs font-bold text-slate-700">Lista en 0 motivos para Otras Áreas</p>
                                    <p className="text-[11px] text-slate-500">
                                      Aún no has agregado motivos en Otras Áreas. Puedes agregarlos desde el Perfil Administrador en la pestaña "Motivos de Observación".
                                    </p>
                                  </div>
                                );
                              }
                              return (
                                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                                  {reasons.map((reasonCfg) => {
                                    const obs = reasonCfg.name;
                                    const isChecked = emitSelectedObservations.includes(obs);
                                    const reasonColor = reasonCfg.color || "#2563eb";

                                    return (
                                      <div
                                        key={reasonCfg.id || obs}
                                        onClick={() => handleToggleEmitObservation(obs)}
                                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all select-none cursor-pointer ${
                                          isChecked
                                            ? "bg-blue-50/95 border-blue-400 text-blue-950 shadow-xs ring-1 ring-blue-300"
                                            : "bg-blue-50/20 hover:bg-blue-50/60 border-blue-150 text-slate-700"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {}}
                                          className="rounded h-4 w-4 mt-0.5 shrink-0 pointer-events-none text-blue-600 focus:ring-blue-500 border-blue-300"
                                        />
                                        <span 
                                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1 border border-black/15 shadow-2xs" 
                                          style={{ backgroundColor: reasonColor }} 
                                          title={`Color asignado: ${reasonColor}`}
                                        />
                                        <div className="flex-1 text-left min-w-0">
                                          <span className={`text-xs font-semibold leading-relaxed break-words block ${isChecked ? "text-blue-950 font-bold" : ""}`}>
                                            {obs}
                                          </span>
                                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                            <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">
                                              [Otras Áreas • Tiempo Detenido]
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* Imagen 3: Banner informativo que aparece AL FINAL DE TODA LA LISTA */}
                            <div className="bg-blue-50 border border-blue-200 p-2.5 rounded-xl flex items-start gap-2 text-blue-900 animate-fadeIn">
                              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                              <div className="text-[11px] leading-tight">
                                <p className="font-extrabold text-blue-900">Observaciones de otras áreas (Color Azul)</p>
                                <p className="text-blue-700 text-[10px] mt-0.5">
                                  No afecta el KPI del asesor y <strong>detiene su temporizador</strong>. Se computa en una columna separada de KPI.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 animate-fadeIn">
                            {/* Imagen 4: Banner automático para Legal / Asesor (SÍ afecta al asesor) */}
                            <div className="flex items-start gap-3 p-3 rounded-2xl border bg-rose-50/90 border-rose-300 text-rose-950 shadow-xs select-none">
                              <div className="flex items-center justify-center h-4 w-4 rounded border border-rose-600 bg-rose-600 text-white mt-0.5 shrink-0">
                                <Check className="h-3 w-3 stroke-[3]" />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-xs font-black">
                                    ¿Afecta al Asesor en su KPI? (SÍ)
                                  </span>
                                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase border bg-rose-100 text-rose-800 border-rose-200">
                                    ⏱️ CORRE TIEMPO ASESOR
                                  </span>
                                </div>
                                <p className="text-[10px] mt-0.5 leading-snug font-medium text-rose-700">
                                  La observación afecta el KPI del asesor. El temporizador de espera corre en contra del asesor.
                                </p>
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-400 leading-snug">
                              Marca una o varias casillas para considerar como observación legal del asesor.
                            </p>

                            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                              {getActiveObservationReasonConfigs(settings, "legal").map((reasonCfg) => {
                                const obs = reasonCfg.name;
                                const isChecked = emitSelectedObservations.includes(obs);
                                const reasonColor = reasonCfg.color || "#e11d48";

                                return (
                                  <div
                                    key={reasonCfg.id || obs}
                                    onClick={() => handleToggleEmitObservation(obs)}
                                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all select-none cursor-pointer ${
                                      isChecked
                                        ? "bg-rose-50/90 border-rose-300 text-rose-950 shadow-xs ring-1 ring-rose-200"
                                        : "bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      className="rounded h-4 w-4 mt-0.5 shrink-0 pointer-events-none text-rose-600 focus:ring-rose-500 border-slate-300"
                                    />
                                    <span 
                                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-1 border border-black/15 shadow-2xs" 
                                      style={{ backgroundColor: reasonColor }} 
                                      title={`Color asignado: ${reasonColor}`}
                                    />
                                    <div className="flex-1 text-left min-w-0">
                                      <span className={`text-xs font-semibold leading-relaxed break-words block ${isChecked ? "text-rose-950 font-bold" : ""}`}>
                                        {obs}
                                      </span>
                                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                        <span className="text-[9px] font-bold text-rose-600 uppercase tracking-wider">
                                          {reasonCfg.affectsAdvisor === false ? "[Legal • Tiempo Detenido]" : "[Legal • Corre Tiempo Asesor]"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Optional Custom Comments */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Comentario / Observaciones Adicionales (Opcional)
                        </label>
                        <textarea
                          value={emitComment}
                          onChange={(e) => setEmitComment(e.target.value)}
                          placeholder="Añade notas o consideraciones legales adicionales..."
                          rows={3}
                          className="w-full bg-white border border-slate-200 rounded-2xl p-3 focus:ring-1 focus:ring-brand-primary outline-none text-xs text-slate-700 placeholder:text-slate-400 leading-relaxed"
                        />
                      </div>

                      {/* Action Button & Closure controls (Image 2 style) */}
                      <div className="space-y-3 pt-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEmitSummaryModal()}
                          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-xs cursor-pointer uppercase tracking-wider shadow-md shadow-blue-600/20"
                          id="btn-jefe-registrar-accion"
                        >
                          <Save className="h-4.5 w-4.5" />
                          Registrar Acción / Grabar Emisión
                        </button>

                        <div className="pt-3 border-t border-slate-100 space-y-2 animate-slideIn">
                          <p className="text-[10px] font-black uppercase text-rose-500 tracking-wider text-center block">
                            ¿Finalizar Trámite y Remover de la Lista?
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenCloseSummaryModal("Cierre Completo")}
                              className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm uppercase tracking-wide"
                              id="btn-jefe-cierre-completo"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Cierre Completo
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenCloseSummaryModal("Desistido")}
                              className="h-11 bg-slate-600 hover:bg-slate-700 text-white font-extrabold text-[11px] rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm uppercase tracking-wide"
                              id="btn-jefe-desistido"
                            >
                              <AlertOctagon className="h-4 w-4" />
                              Desistió
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="bg-white p-12 rounded-3xl border border-slate-150 shadow-sm text-center space-y-4">
                  <div className="w-16 h-16 bg-blue-50 text-brand-primary rounded-full flex items-center justify-center mx-auto border border-blue-100">
                    <FileCheck className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                      Ningún Expediente Seleccionado
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Utiliza los filtros de arriba para ubicar la operación que deseas emitir, o selecciona un expediente de la lista izquierda.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-PANEL 3: EDIT RECORDS (6-HOUR LOCK) */}
      {jefeSubTab === "edit" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-slate-600 text-xs leading-normal">
            <p className="font-bold text-brand-primary flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Regla de Edición de 6 Horas:
            </p>
            <p className="mt-0.5">
              Como <strong>Jefe Legal</strong>, puedes editar y corregir cualquier dato de los expedientes de todos los perfiles hasta <strong>6 horas después</strong> de su registro. Transcurrido ese plazo, los registros quedarán bloqueados para resguardar la integridad.
            </p>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {records.map((r) => {
              const isEditable = isWithinSixHours(r);
              const remainingStr = getRemainingTimeStr(r);
              const isCurrentEditing = editingRecordId === r.id;

              return (
                <div key={r.id} className={`p-4 rounded-xl border transition-all ${
                  isCurrentEditing ? "bg-blue-50/30 border-blue-400" : "bg-white border-slate-100 hover:border-blue-100"
                }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs">
                        {r.proyecto} <span className="font-mono text-slate-500 font-semibold">({formatUnitDisplay(r)})</span>
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Asesor: {r.asesor} • Team: {r.team} • Tipo: {r.tipo || "Sin asignar"} • Estado: {r.status || "Borrador"}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        isEditable ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                      }`}>
                        {isEditable ? `Editable: ${remainingStr}` : "Bloqueado (>6 Hrs)"}
                      </span>
                    </div>
                  </div>

                  {isCurrentEditing ? (
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                      <div className="col-span-2 grid grid-cols-2 gap-3">
                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Proyecto *</label>
                          <SearchableSelect
                            value={editFields.proyecto || ""}
                            onChange={(val) => {
                              const matchedProj = projectOptions.find(p => p.name === val);
                              setEditFields(prev => ({ 
                                ...prev, 
                                proyecto: val, 
                                team: matchedProj ? matchedProj.team : prev.team 
                              }));
                            }}
                            options={projectOptions.map(p => ({ value: p.name, label: p.name }))}
                            placeholder="Proyecto..."
                            className="w-full mt-0.5"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Asesor *</label>
                          <SearchableSelect
                            value={editFields.asesor || ""}
                            onChange={(val) => setEditFields(prev => ({ ...prev, asesor: val }))}
                            options={advisorOptions.map(a => ({ value: a, label: a }))}
                            placeholder="Asesor..."
                            className="w-full mt-0.5"
                            allowCustom={false}
                          />
                        </div>
                      </div>

                      <div className="col-span-2 grid grid-cols-3 gap-2">
                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Dpto. *</label>
                          <input
                            type="text"
                            value={editFields.dpto || ""}
                            onChange={(e) => setEditFields(prev => ({ ...prev, dpto: e.target.value }))}
                            className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Estac.</label>
                          <input
                            type="text"
                            value={editFields.estac || ""}
                            onChange={(e) => setEditFields(prev => ({ ...prev, estac: e.target.value }))}
                            className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        </div>

                        <div>
                          <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Dep.</label>
                          <input
                            type="text"
                            value={editFields.dep || ""}
                            onChange={(e) => setEditFields(prev => ({ ...prev, dep: e.target.value }))}
                            className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs text-center font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                          />
                        </div>
                      </div>

                      <div className="col-span-2">
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Tipo de Operación</label>
                        <SearchableSelect
                          value={editFields.tipo || ""}
                          onChange={(val) => setEditFields(prev => ({ ...prev, tipo: val }))}
                          options={[
                            { value: "", label: "-- Sin Tipo --" },
                            ...tiposOperacion.map(t => ({ value: t, label: t }))
                          ]}
                          placeholder="Buscar tipo..."
                          className="w-full mt-0.5"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Sello Solicitud</label>
                        <input
                          type="text"
                          value={editFields.solicitud || ""}
                          onChange={(e) => setEditFields(prev => ({ ...prev, solicitud: e.target.value }))}
                          className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Sello Emisión</label>
                        <input
                          type="text"
                          value={editFields.emision || ""}
                          onChange={(e) => setEditFields(prev => ({ ...prev, emision: e.target.value }))}
                          className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs font-mono focus:ring-1 focus:ring-brand-primary outline-none"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Estado (Status)</label>
                        <SearchableSelect
                          value={editFields.status || ""}
                          onChange={(val) => setEditFields(prev => ({ ...prev, status: val }))}
                          options={[
                            { value: "", label: "-- Sin Estado --" },
                            ...statusesList.map(s => ({ value: s, label: s }))
                          ]}
                          placeholder="Buscar estado..."
                          className="w-full mt-0.5"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="font-bold text-slate-500 block uppercase tracking-wider text-[9px]">Comentario</label>
                        <textarea
                          value={editFields.comentario || ""}
                          onChange={(e) => setEditFields(prev => ({ ...prev, comentario: e.target.value }))}
                          className="w-full p-2 border border-blue-100 rounded-lg mt-0.5 text-xs outline-none focus:ring-1 focus:ring-brand-primary"
                          rows={2}
                        />
                      </div>

                      <div className="col-span-2 flex gap-2 pt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg cursor-pointer"
                        >
                          Guardar Cambios
                        </button>
                        <button
                          onClick={() => setEditingRecordId(null)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-right">
                      {isEditable ? (
                        <button
                          onClick={() => startEditingRecord(r)}
                          className="bg-blue-50 hover:bg-brand-primary hover:text-white text-brand-primary font-bold px-3 py-1.5 rounded-lg text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar Registro ({remainingStr})
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed">
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                          Edición Bloqueada (&gt;6 horas)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {records.length === 0 && (
              <p className="text-center text-slate-400 italic text-xs">No hay expedientes en el sistema.</p>
            )}
          </div>
        </div>
      )}

      {/* SUB-PANEL 4: ADVANCED ACTION HISTORY & RE-ASSIGNMENT */}
      {jefeSubTab === "actions_history" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Mode Switcher: Closed Operations vs All Operations */}
          <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
            <button
              type="button"
              onClick={() => setClosedOnlyFilter(true)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                closedOnlyFilter
                  ? "bg-white text-emerald-800 shadow-xs"
                  : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Solo Operaciones Cerradas (Cierre Completo / Desistido)</span>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                {records.filter(r => r.status === "Cierre Completo" || r.status === "Desistido").length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setClosedOnlyFilter(false)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                !closedOnlyFilter
                  ? "bg-white text-brand-primary shadow-xs"
                  : "text-slate-600 hover:bg-white/50"
              }`}
            >
              <List className="h-4 w-4 text-brand-primary" />
              <span>Ver Todas las Operaciones</span>
              <span className="bg-blue-100 text-brand-primary text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                {records.length}
              </span>
            </button>
          </div>

          {/* Advanced Filters Card */}
          <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-brand-primary" />
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Filtros de Búsqueda</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Date Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-slate-400" />
                  Fecha de Registro
                </label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                />
              </div>

              {/* Project Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-slate-400" />
                  Proyecto
                </label>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                >
                  <option value="">-- Todos los Proyectos --</option>
                  {settings.proyectos?.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-slate-400" />
                  Estado de Solicitud
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs focus:bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                >
                  <option value="">-- Todos los Estados --</option>
                  {statusesList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {(filterDate || filterProject || filterStatus) && (
              <button
                onClick={() => {
                  setFilterDate("");
                  setFilterProject("");
                  setFilterStatus("");
                }}
                className="w-full py-1.5 text-center text-[10px] text-rose-500 font-bold bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-xl transition-all cursor-pointer"
              >
                Limpiar Filtros
              </button>
            )}
          </div>

          {/* Records List */}
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {filteredAllRecords.map((r) => {
              const isSelected = selectedHistoryRecordId === r.id;
              const summary = getActionSummary(r);
              const refNum = `EXP-${r.id.substr(4, 3).toUpperCase()}`;
              const isClosed = r.status === "Cierre Completo" || r.status === "Desistido";

              return (
                <div
                  key={r.id}
                  className={`p-3.5 bg-white border rounded-2xl transition-all shadow-2xs ${
                    isSelected 
                      ? "ring-2 ring-brand-primary border-transparent bg-blue-50/20" 
                      : "border-slate-150 hover:border-brand-primary/50"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div 
                      className="cursor-pointer flex-1"
                      onClick={() => {
                        setSelectedHistoryRecordId(r.id);
                        setNewActionComment("");
                        setAssignedAssistant(r.derivadoA || "");
                        setReopenNewStatus("Modificado");
                        setReopenComment("");
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[9px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">{refNum}</span>
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          isClosed 
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : "bg-blue-50 text-brand-primary border-blue-100"
                        }`}>
                          {r.status || "Sin Estado"}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {r.tipo || "EMISION"}
                        </span>
                      </div>
                      <h5 className="font-bold text-xs text-slate-900 mt-1">{r.proyecto}</h5>
                      <p className="text-[10px] text-slate-500">
                        {formatUnitDisplay(r)} • Asesor: <strong className="text-slate-700">{r.asesor || "-"}</strong>
                      </p>
                    </div>

                    <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-purple-50 text-purple-700 border border-purple-100 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Users className="h-3 w-3 text-purple-500" />
                          {r.derivadoA || "Sin Asignar"}
                        </span>
                        <span className="bg-blue-50 text-brand-primary font-bold text-[9px] px-2 py-0.5 rounded-full border border-blue-100 flex items-center gap-1">
                          <History className="h-2.5 w-2.5" />
                          {summary.total} Acciones
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReassignModalRecord(r);
                            setReassignTargetAssistant(r.derivadoA || "");
                            setReassignReason("");
                          }}
                          className="py-1 px-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Users className="h-3 w-3" />
                          <span>Reasignar</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryModalRecord(r);
                          }}
                          className="py-1 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <History className="h-3 w-3" />
                          <span>Historial</span>
                        </button>

                        {isClosed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedHistoryRecordId(r.id);
                              setReopenNewStatus("Modificado");
                              setReopenComment("");
                            }}
                            className="py-1 px-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reabrir</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredAllRecords.length === 0 && (
              <div className="text-center p-8 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-xs italic text-slate-400">
                {closedOnlyFilter 
                  ? "No se encontraron operaciones cerradas (Cierre Completo o Desistido) con los filtros actuales."
                  : "Ningún expediente coincide con los filtros especificados o registrados."}
              </div>
            )}
          </div>

          {/* Action Log and History Detail Form */}
          {selectedHistoryRecordId && (() => {
            const selectedRec = records.find(r => r.id === selectedHistoryRecordId);
            if (!selectedRec) return null;
            const summary = getActionSummary(selectedRec);

            return (
              <div className="bg-white border border-blue-100 rounded-2xl p-4 shadow-md space-y-4 animate-slideIn">
                <div className="pb-3 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-bold text-brand-primary uppercase tracking-wide">Acciones del Expediente</span>
                    <h4 className="font-black text-slate-800 text-xs mt-0.5">{formatProjectAndUnits(selectedRec)}</h4>
                  </div>
                  <button
                    onClick={() => setSelectedHistoryRecordId(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Cerrar Detalle
                  </button>
                </div>

                {/* Reopen Closed Operation banner (Jefe Legal Exclusivity) */}
                {(selectedRec.status === "Cierre Completo" || selectedRec.status === "Desistido") && (
                  <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 animate-fadeIn">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-amber-900 flex items-center gap-1.5">
                        <AlertOctagon className="h-4 w-4 text-amber-600" />
                        Trámite Finalizado: {selectedRec.status}
                      </span>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                        Exclusivo Jefe Legal
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Este expediente cuenta con cierre formal. Como Jefe Legal, puedes reabrir la operación y asignarle un nuevo estado legal para reactivar su flujo de trabajo.
                    </p>

                    <div className="space-y-2 pt-1">
                      <label className="text-[10px] font-black text-amber-950 uppercase tracking-wide block">
                        Asignar Estado Legal para la Reapertura (STATUS) *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {["Modificado", "En Revisión", "Emitido", "Observado / Rechazado", "Pendiente", "Pendiente de Firma"].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setReopenNewStatus(s)}
                            className={`py-2 px-2.5 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer active:scale-95 ${
                              reopenNewStatus === s
                                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                : "bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      <div className="pt-1">
                        <label className="text-[10px] font-black text-amber-950 uppercase tracking-wide block mb-1">
                          Comentario de Reapertura (Opcional):
                        </label>
                        <textarea
                          value={reopenComment}
                          onChange={(e) => setReopenComment(e.target.value)}
                          placeholder="Indica el motivo de la reapertura (ej. 'Se solicita rectificación de minuta')..."
                          rows={2}
                          className="w-full bg-white border border-amber-300 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <button
                          type="button"
                          disabled={isReopeningSubmitting || !reopenNewStatus}
                          onClick={() => handleConfirmReopen(selectedRec)}
                          className={`flex-1 py-2.5 text-white font-extrabold text-xs uppercase rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                            isReopeningSubmitting || !reopenNewStatus
                              ? "bg-slate-400 cursor-not-allowed"
                              : "bg-amber-600 hover:bg-amber-700"
                          }`}
                        >
                          <RotateCcw className="h-4 w-4" />
                          <span>{isReopeningSubmitting ? "Reabriendo..." : "Confirmar Reapertura y Cambiar Estado"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryModalRecord(selectedRec)}
                          className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase rounded-xl transition-all border border-amber-200 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <History className="h-4 w-4 text-slate-500" />
                          <span>Ver Historial</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* KPI/Counts summary of Action types */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                    <History className="h-3.5 w-3.5 text-brand-primary animate-pulse" />
                    Cantidad y Tipo de Acciones Registradas:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="bg-slate-900 text-white text-[9px] font-bold px-2 py-0.5 rounded-md shadow-xs shrink-0">
                      Total: {summary.total}
                    </span>
                    {Object.entries(summary.counts).map(([type, count]) => (
                      <span key={type} className="bg-blue-100 text-brand-primary text-[9px] font-bold px-2 py-0.5 rounded-md border border-blue-200 shrink-0">
                        {type}: {count}
                      </span>
                    ))}
                    {summary.total === 0 && (
                      <span className="text-slate-400 italic text-[9px]">Aún no hay acciones registradas.</span>
                    )}
                  </div>
                </div>

                 {/* Timeline list of past actions */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto border border-blue-50 rounded-xl p-2.5 bg-slate-50/20">
                  {summary.actions.map((act, index) => {
                    const isExpanded = !!expandedActionIdx[index];
                    return (
                      <div
                        key={index}
                        onClick={() => {
                          setExpandedActionIdx(prev => ({
                            ...prev,
                            [index]: !prev[index]
                          }));
                        }}
                        className={`p-2.5 bg-white rounded-lg border transition-all duration-200 cursor-pointer hover:bg-slate-50/50 ${
                          isExpanded ? "border-brand-primary/40 shadow-xs ring-1 ring-brand-primary/10" : "border-slate-100"
                        } space-y-1 text-xs`}
                      >
                        <div className="flex justify-between items-center gap-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="bg-blue-50 text-brand-primary border border-blue-100 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase truncate">
                              {act.type}
                            </span>
                            <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-200 flex items-center gap-1 shrink-0">
                              <User className="h-2.5 w-2.5 text-slate-500" />
                              {act.user}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 shrink-0">{act.timestamp}</span>
                          </div>
                          <span className="text-slate-400 shrink-0">
                            {isExpanded ? (
                              <ChevronUp className="h-3 w-3 text-brand-primary" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </span>
                        </div>
                        
                        {isExpanded ? (
                          <div className="space-y-1.5 animate-fadeIn">
                            <p className="text-slate-700 text-xs font-medium italic pl-1 border-l-2 border-brand-primary">
                              "{act.comment}"
                            </p>
                            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 border-t border-slate-50">
                              <span className="flex items-center gap-1 font-bold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-150">
                                <User className="h-2.5 w-2.5 text-brand-primary" />
                                Responsable: {act.user}
                              </span>
                              <span>Estado: {act.status}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-600 text-[11px] truncate pl-1 border-l border-slate-200">
                            <strong className="text-slate-800 font-bold mr-1">[{act.user}]:</strong>
                            {act.comment} <span className="text-[9px] text-brand-primary font-bold ml-1">(Ver más)</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {summary.actions.length === 0 && (
                    <p className="text-center text-slate-400 italic text-xs py-4">Ingreso inicial registrado.</p>
                  )}
                </div>

                {/* Log new Action and optional Re-assignment form */}
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5 text-brand-primary" />
                    Registrar Acción y Derivar/Reasignar
                  </p>

                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Tipo de Acción *</label>
                      <select
                        value={newActionType}
                        onChange={(e) => setNewActionType(e.target.value)}
                        className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2 text-xs outline-none focus:bg-white"
                      >
                        <option value="Observación Legal">Observación Legal</option>
                        <option value="Subida de Firma">Subida de Firma</option>
                        <option value="Revisión Técnica">Revisión Técnica</option>
                        <option value="Contacto con Asesor">Contacto con Asesor</option>
                        <option value="Corrección de Datos">Corrección de Datos</option>
                        <option value="Re-Asignación de Asistente">Derivación / Asignación</option>
                        <option value="Otro">Otro (Especificar...)</option>
                      </select>
                    </div>

                    {newActionType === "Otro" && (
                      <div className="animate-slideIn">
                        <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Especificar Tipo de Acción *</label>
                        <input
                          type="text"
                          value={customActionType}
                          onChange={(e) => setCustomActionType(e.target.value)}
                          placeholder="Nombre de la acción..."
                          className="w-full h-9 bg-slate-50 border border-blue-100 rounded-xl px-2.5 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary"
                        />
                      </div>
                    )}

                    {/* Re-assignment selector specifically for Jefe Legal */}
                    <div>
                      <label className="text-[9px] font-bold text-rose-500 block uppercase mb-1 flex items-center gap-1">
                        <span>Re-Asignar Asistente Legal a Cargo (Opcional)</span>
                      </label>
                      <select
                        value={assignedAssistant}
                        onChange={(e) => setAssignedAssistant(e.target.value)}
                        className="w-full h-9 bg-slate-50 border border-rose-200 rounded-xl px-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-rose-400"
                      >
                        <option value="">-- Dejar asignación actual ({selectedRec.derivadoA || "Ninguno"}) --</option>
                        {assistantsList.map(a => (
                          <option key={a} value={a}>Asistente: {a}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-500 block uppercase mb-1">Detalle o Comentario de la Acción *</label>
                      <textarea
                        value={newActionComment}
                        onChange={(e) => setNewActionComment(e.target.value)}
                        placeholder="Ingresa notas detalladas de la acción realizada..."
                        rows={2.5}
                        className="w-full bg-slate-50 border border-blue-100 rounded-xl p-2 text-xs outline-none focus:bg-white focus:ring-1 focus:ring-brand-primary resize-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRegisterAction(selectedRec.id)}
                      className="w-full h-9 bg-brand-primary hover:bg-brand-secondary text-white font-bold text-xs uppercase rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Grabar Acción y Reasignar
                    </button>
                  </div>
                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* Modal: Reasignar Asistente Legal */}
      {reassignModalRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-150 space-y-4 animate-scaleUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
                <h4 className="text-sm font-black text-slate-900 uppercase">Reasignar Asistente Legal</h4>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalRecord(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-purple-50 rounded-2xl border border-purple-100 text-xs space-y-1">
              <p className="font-extrabold text-purple-900">{formatProjectAndUnits(reassignModalRecord)}</p>
              <p className="text-purple-700 text-[11px]">
                Asistente actual: <strong>{reassignModalRecord.derivadoA || "Sin Asignar"}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1">
                  Nuevo Asistente Legal a Cargo *
                </label>
                <select
                  value={reassignTargetAssistant}
                  onChange={(e) => setReassignTargetAssistant(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-bold outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                >
                  <option value="">-- Selecciona el Asistente Legal --</option>
                  {assistantsList.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide block mb-1">
                  Motivo o Comentario de Reasignación (Opcional)
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Indica el motivo del cambio de asignación..."
                  rows={2.5}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReassignModalRecord(null)}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isReassigning || !reassignTargetAssistant}
                onClick={handleConfirmReassign}
                className={`py-2.5 px-5 font-black text-xs uppercase tracking-wide rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 ${
                  isReassigning || !reassignTargetAssistant
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700 text-white active:scale-95"
                }`}
              >
                <UserCheck className="h-4 w-4" />
                <span>{isReassigning ? "Reasignando..." : "Confirmar Reasignación"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Action Summary Modal */}
      <ActionSummaryModal
        isOpen={summaryModalOpen}
        data={summaryModalData}
        onCancel={() => {
          setSummaryModalOpen(false);
          setPendingActionType(null);
          setSummaryModalData(null);
        }}
        onConfirm={handleConfirmSummaryAction}
      />

      {/* Status History Timeline Modal */}
      {historyModalRecord && (
        <StatusHistoryModal
          record={records.find(r => r.id === historyModalRecord.id) || historyModalRecord}
          availableStatuses={settings.statuses}
          isAdmin={currentUser.role === "Administrador"}
          onUpdateRecord={onUpdateRecord}
          onClose={() => setHistoryModalRecord(null)}
        />
      )}

    </div>
  );
}
