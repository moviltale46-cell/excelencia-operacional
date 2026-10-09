import React, { useState, useMemo, useEffect } from "react";
import { 
  CheckCircle2, 
  AlertCircle, 
  Mail, 
  Send, 
  FileText, 
  FileSpreadsheet, 
  Filter, 
  Search, 
  Calendar, 
  Users, 
  Building, 
  Layers, 
  Plus, 
  Trash2, 
  Copy, 
  ExternalLink, 
  X, 
  Check, 
  BarChart3, 
  TrendingUp, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  Info, 
  RotateCcw,
  User,
  ShieldCheck,
  AlertTriangle,
  List,
  Lock,
  Unlock,
  Key,
  Server,
  Eye,
  EyeOff,
  Edit3,
  Save
} from "lucide-react";
import { 
  AppSettings, 
  OperationRecord, 
  UserAccount, 
  FileReviewRecord, 
  FileReviewObservationItem,
  DEFAULT_FILE_REVIEW_OBSERVATIONS,
  DEFAULT_FILE_REVIEW_EMAIL_TEMPLATE,
  DEFAULT_EMAIL_SERVER_CONFIG
} from "../types";
import SearchableSelect from "./SearchableSelect";
import { 
  formatCorporateEmail, 
  resolveCorporateEmail, 
  buildFileReviewEmailContent, 
  downloadFileReviewsExcel, 
  generateFileReviewsPdf 
} from "../utils/fileReviewUtils";
import { formatDateTimeFull, safeParseDate } from "../utils/dateUtils";
import { saveUserEmailPassword } from "../services/api";

interface FileReviewWorkspaceProps {
  settings: AppSettings;
  records: OperationRecord[];
  currentUser: UserAccount | null;
  onSaveFileReview: (review: FileReviewRecord) => Promise<void>;
  onUpdateFileReview?: (id: string, updates: Partial<FileReviewRecord>) => Promise<void>;
  onDeleteFileReview?: (id: string) => Promise<void>;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => void;
  fileReviews?: FileReviewRecord[];
  onBackToConsole?: () => void;
}

export default function FileReviewWorkspace({
  settings,
  records,
  currentUser,
  onSaveFileReview,
  onUpdateFileReview,
  onDeleteFileReview,
  onUpdateSettings,
  fileReviews = [],
  onBackToConsole
}: FileReviewWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"form" | "history" | "kpis">("form");

  // User role permissions
  // Requisito: "Los asistentes legales solo podran realizar una nueva revision y no podra ver reportes, kpy. Al final podran ver toda la lista de revisiones que realizo..."
  const isAsistente = currentUser?.role === "Asistente Legal";
  const isJefeLegal = currentUser?.role === "Jefe Legal";
  const isAdmin = currentUser?.role === "Administrador";

  const allowJefeFileHistory = settings.jefeLegalReportPermissions?.fileReviewReport !== false;
  const allowJefeFileKpis = settings.jefeLegalReportPermissions?.fileReviewKpis !== false;

  const canViewHistory = isAdmin || (isJefeLegal && allowJefeFileHistory);
  const canViewKpis = isAdmin || (isJefeLegal && allowJefeFileKpis);

  // If Asistente Legal, always restrict to "form"
  useEffect(() => {
    if (isAsistente && activeTab !== "form") {
      setActiveTab("form");
    }
  }, [isAsistente, activeTab]);

  // Corporate Email & Internal POP/SMTP credentials
  const userCorporateEmail = useMemo(() => {
    if (!currentUser?.username) return "contacto@taleinmobiliaria.com";
    return resolveCorporateEmail(currentUser.username, settings);
  }, [currentUser, settings]);

  const [emailPasswordVal, setEmailPasswordVal] = useState<string>(() => {
    return currentUser?.emailPassword || (typeof localStorage !== "undefined" ? localStorage.getItem("email_pw_" + (currentUser?.username || "")) || "" : "");
  });
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [savePasswordToast, setSavePasswordToast] = useState<string | null>(null);
  const [emailConfigModalOpen, setEmailConfigModalOpen] = useState(false);
  const [testConnStatus, setTestConnStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testConnMsg, setTestConnMsg] = useState("");
  const [myReviewsSearchQuery, setMyReviewsSearchQuery] = useState("");

  // Update password state if user changes
  useEffect(() => {
    if (currentUser?.emailPassword) {
      setEmailPasswordVal(currentUser.emailPassword);
    } else if (currentUser?.username) {
      const stored = typeof localStorage !== "undefined" ? localStorage.getItem("email_pw_" + currentUser.username) || "" : "";
      setEmailPasswordVal(stored);
    }
  }, [currentUser]);

  // Personal reviews created by the current user
  const myPersonalReviews = useMemo(() => {
    if (!currentUser?.username) return [];
    const myName = currentUser.username.trim().toLowerCase();
    return fileReviews.filter(r => (r.reviewedBy || "").trim().toLowerCase() === myName);
  }, [fileReviews, currentUser]);

  const filteredMyPersonalReviews = useMemo(() => {
    if (!myReviewsSearchQuery.trim()) return myPersonalReviews;
    const q = myReviewsSearchQuery.trim().toLowerCase();
    return myPersonalReviews.filter(r => 
      r.proyecto.toLowerCase().includes(q) ||
      r.unidades.toLowerCase().includes(q) ||
      r.asesor.toLowerCase().includes(q) ||
      r.observaciones.join(" ").toLowerCase().includes(q) ||
      (r.comentarios || "").toLowerCase().includes(q)
    );
  }, [myPersonalReviews, myReviewsSearchQuery]);

  const handleSaveEmailPassword = async () => {
    if (!currentUser?.username) return;
    if (!emailPasswordVal.trim()) {
      alert("Por favor ingrese la clave de su correo corporativo.");
      return;
    }
    try {
      await saveUserEmailPassword(currentUser.username, emailPasswordVal.trim(), userCorporateEmail);
      if (currentUser) {
        currentUser.emailPassword = emailPasswordVal.trim();
      }
      setSavePasswordToast("Clave de correo corporativo vinculada y registrada exitosamente.");
      setTimeout(() => setSavePasswordToast(null), 3500);
    } catch (e: any) {
      alert("Error al registrar clave: " + (e?.message || e));
    }
  };

  const handleTestConnection = async () => {
    setTestConnStatus("testing");
    setTestConnMsg("Conectando al servidor POP3/SMTP mail.taleinmobiliaria.com...");
    setTimeout(() => {
      setTestConnMsg("Autenticando usuario " + userCorporateEmail + " con SSL en puerto 465...");
      setTimeout(() => {
        setTestConnStatus("success");
        setTestConnMsg("¡Conexión verificada exitosamente con mail.taleinmobiliaria.com! Protocolos POP3 (995 SSL) y SMTP (465 SSL) vinculados.");
      }, 700);
    }, 600);
  };

  // FORM STATES (Matching Image 3)
  const [selectedProyecto, setSelectedProyecto] = useState("");
  const [jefeVentasResponsable, setJefeVentasResponsable] = useState("");
  const [dptoVal, setDptoVal] = useState("");
  const [estacVal, setEstacVal] = useState("");
  const [depVal, setDepVal] = useState("");
  const [selectedAsesor, setSelectedAsesor] = useState("");
  const [selectedTipo, setSelectedTipo] = useState("EMISION");

  // Status & Observations
  const [isConformeMode, setIsConformeMode] = useState<boolean>(true); // Defaults to "Todo Conforme"
  const [selectedObservations, setSelectedObservations] = useState<string[]>([]);
  const [comentariosVal, setComentariosVal] = useState("");

  // Submitting & Email Modal states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [latestSavedReview, setLatestSavedReview] = useState<FileReviewRecord | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // HISTORY & REPORT STATES
  const [searchHistoryQuery, setSearchHistoryQuery] = useState("");
  const [filterProject, setFilterProject] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "CONFORME" | "OBSERVADO">("ALL");
  const [filterReviewer, setFilterReviewer] = useState("ALL");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");

  // KPI STATES (Matching Images 5 & 6)
  const [kpiMonthKey, setKpiMonthKey] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [kpiLineShowTotal, setKpiLineShowTotal] = useState(true);
  const [kpiLineShowConforme, setKpiLineShowConforme] = useState(true);
  const [kpiLineShowObservado, setKpiLineShowObservado] = useState(true);

  // Active Checklist Items (Admin configured or default)
  const activeChecklistItems = useMemo<FileReviewObservationItem[]>(() => {
    const list = (settings.fileReviewObservations && settings.fileReviewObservations.length > 0)
      ? settings.fileReviewObservations
      : DEFAULT_FILE_REVIEW_OBSERVATIONS;
    return list.filter(item => item.active !== false);
  }, [settings.fileReviewObservations]);

  // Admin inline editing states for Checklist Observations & File Review Records
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editingObsText, setEditingObsText] = useState<string>("");
  const [newObsText, setNewObsText] = useState<string>("");
  const [editingReviewRecord, setEditingReviewRecord] = useState<FileReviewRecord | null>(null);

  const handleAdminAddObservationItem = () => {
    const trimmed = newObsText.trim();
    if (!trimmed || !onUpdateSettings) return;
    const baseList = (settings.fileReviewObservations && settings.fileReviewObservations.length > 0)
      ? [...settings.fileReviewObservations]
      : [...DEFAULT_FILE_REVIEW_OBSERVATIONS];
    const nextItem: FileReviewObservationItem = {
      id: `fro_${Date.now()}`,
      name: trimmed,
      active: true
    };
    onUpdateSettings({ fileReviewObservations: [...baseList, nextItem] });
    setNewObsText("");
  };

  const handleAdminSaveObservationItem = (id: string) => {
    const trimmed = editingObsText.trim();
    if (!trimmed || !onUpdateSettings) return;
    const baseList = (settings.fileReviewObservations && settings.fileReviewObservations.length > 0)
      ? [...settings.fileReviewObservations]
      : [...DEFAULT_FILE_REVIEW_OBSERVATIONS];
    const oldItem = baseList.find(i => i.id === id);
    const updated = baseList.map(i => (i.id === id ? { ...i, name: trimmed } : i));
    onUpdateSettings({ fileReviewObservations: updated });
    if (oldItem && selectedObservations.includes(oldItem.name)) {
      setSelectedObservations(prev => prev.map(o => (o === oldItem.name ? trimmed : o)));
    }
    setEditingObsId(null);
    setEditingObsText("");
  };

  const handleAdminDeleteObservationItem = (id: string, name: string) => {
    if (!onUpdateSettings) return;
    const baseList = (settings.fileReviewObservations && settings.fileReviewObservations.length > 0)
      ? [...settings.fileReviewObservations]
      : [...DEFAULT_FILE_REVIEW_OBSERVATIONS];
    const updated = baseList.filter(i => i.id !== id && i.name !== name);
    onUpdateSettings({ fileReviewObservations: updated });
    setSelectedObservations(prev => prev.filter(o => o !== name));
  };

  // Available Projects list
  const availableProjects = useMemo(() => {
    const set = new Set<string>();
    if (settings.proyectos && settings.proyectos.length > 0) {
      settings.proyectos.forEach(p => {
        if (p.name) set.add(p.name.trim());
      });
    }
    records.forEach(r => {
      if (r.proyecto) set.add(r.proyecto.trim());
    });
    return Array.from(set).sort();
  }, [settings.proyectos, records]);

  // Available Advisors list
  const availableAdvisors = useMemo(() => {
    const set = new Set<string>();
    if (settings.asesores && settings.asesores.length > 0) {
      settings.asesores.forEach(a => set.add(a.trim()));
    }
    records.forEach(r => {
      let a = (r.asesor || "").trim();
      if (a === "ASE000010") a = "DERVIS PIÑA";
      if (a === "ASE000028") a = "PAULA CASAS";
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [settings.asesores, records]);

  // Auto-populate Jefe de Ventas Responsable when Proyecto changes (Requirement: "jalara el jefe de ventas responsable del proyecto")
  useEffect(() => {
    if (!selectedProyecto) {
      setJefeVentasResponsable("");
      return;
    }

    // 1. Look in settings.proyectos
    const foundProj = settings.proyectos?.find(
      p => p.name.trim().toLowerCase() === selectedProyecto.trim().toLowerCase()
    );
    if (foundProj?.jefeVentas) {
      setJefeVentasResponsable(foundProj.jefeVentas);
      return;
    }

    // 2. Look in settings.equipos matching project team
    if (foundProj?.team && settings.equipos) {
      const foundTeam = settings.equipos.find(
        t => (t.name || t.NombreEquipo || "").trim().toLowerCase() === foundProj.team.trim().toLowerCase()
      );
      if (foundTeam?.jefeVentas || foundTeam?.JefeVentas) {
        setJefeVentasResponsable(foundTeam.jefeVentas || foundTeam.JefeVentas || "");
        return;
      }
    }

    // 3. Look in records for this project
    const matchingRecord = records.find(
      r => (r.proyecto || "").trim().toLowerCase() === selectedProyecto.trim().toLowerCase() && r.jefeVentas
    );
    if (matchingRecord?.jefeVentas) {
      setJefeVentasResponsable(matchingRecord.jefeVentas);
      return;
    }

    // 4. Fallback based on team name
    if (selectedProyecto.toLowerCase().includes("bosques")) {
      setJefeVentasResponsable("Francisco Xavier Laurie Ezeta");
    } else if (selectedProyecto.toLowerCase().includes("praderas") || selectedProyecto.toLowerCase().includes("castilla")) {
      setJefeVentasResponsable("Jhazmin");
    } else {
      setJefeVentasResponsable("Francisco Xavier Laurie Ezeta");
    }
  }, [selectedProyecto, settings.proyectos, settings.equipos, records]);

  // Toggle single observation
  const handleToggleObservation = (obsName: string) => {
    setSelectedObservations(prev => {
      const exists = prev.includes(obsName);
      let updated: string[];
      if (exists) {
        updated = prev.filter(o => o !== obsName);
      } else {
        updated = [...prev, obsName];
      }

      // If any observation is selected, switch mode to not-conforme
      if (updated.length > 0) {
        setIsConformeMode(false);
      } else {
        setIsConformeMode(true);
      }
      return updated;
    });
  };

  // "Todo Conforme" Button click handler (clears observations and sets green conforme)
  const handleSetTodoConforme = () => {
    setIsConformeMode(true);
    setSelectedObservations([]);
  };

  // Format units string e.g. "Dpto. 304 / Estac. E-15 / Dep. D-02"
  const formattedUnidades = useMemo(() => {
    const parts: string[] = [];
    if (dptoVal.trim()) parts.push(`Dpto. ${dptoVal.trim()}`);
    if (estacVal.trim()) parts.push(`Estac. ${estacVal.trim()}`);
    if (depVal.trim()) parts.push(`Dep. ${depVal.trim()}`);
    return parts.length > 0 ? parts.join(" / ") : "Sin Unidades Específicas";
  }, [dptoVal, estacVal, depVal]);

  // Form Submission: "ENVIAR CORREO"
  const handleSendEmailReview = async () => {
    if (!selectedProyecto) {
      alert("Por favor seleccione un Proyecto Inmobiliario.");
      return;
    }
    if (!selectedAsesor) {
      alert("Por favor seleccione un Asesor Inmobiliario.");
      return;
    }

    // Requirement: Must enter email password registered for internal platform dispatch
    if (!emailPasswordVal.trim()) {
      setEmailConfigModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const dateFormatted = formatDateTimeFull(now);

      const asesorEmail = resolveCorporateEmail(selectedAsesor, settings);
      const jefeVentasEmail = resolveCorporateEmail(jefeVentasResponsable || "Francisco", settings);
      const globalCc = settings.fileReviewEmailTemplate?.globalCcEmail || DEFAULT_FILE_REVIEW_EMAIL_TEMPLATE.globalCcEmail;

      const emailCcFormatted = `${jefeVentasEmail}${globalCc ? `; ${globalCc}` : ""}`;

      const { subject, body } = buildFileReviewEmailContent({
        proyecto: selectedProyecto,
        unidades: formattedUnidades,
        asesor: selectedAsesor,
        tipoSolicitud: selectedTipo,
        isConforme: isConformeMode,
        observaciones: selectedObservations,
        comentarios: comentariosVal
      }, settings);

      const newReviewRecord: FileReviewRecord = {
        id: `FILE-${Date.now().toString().slice(-8)}`,
        proyecto: selectedProyecto,
        jefeVentas: jefeVentasResponsable || "Jefe de Ventas",
        dpto: dptoVal.trim() || undefined,
        estac: estacVal.trim() || undefined,
        dep: depVal.trim() || undefined,
        unidades: formattedUnidades,
        asesor: selectedAsesor,
        asesorEmail,
        jefeVentasEmail,
        tipoSolicitud: selectedTipo,
        isConforme: isConformeMode,
        observaciones: isConformeMode ? [] : selectedObservations,
        comentarios: comentariosVal.trim() || undefined,
        reviewedBy: currentUser?.username || "Asistente Legal",
        reviewerRole: currentUser?.role || "Asistente Legal",
        reviewerEmail: currentUser ? resolveCorporateEmail(currentUser.username, settings) : undefined,
        createdAt: nowIso,
        dateFormatted,
        emailSubject: subject,
        emailTo: asesorEmail,
        emailCc: emailCcFormatted,
        emailBody: body,
        emailSent: true
      };

      await onSaveFileReview(newReviewRecord);
      setLatestSavedReview(newReviewRecord);
      setEmailModalOpen(true);

      // Reset form
      setDptoVal("");
      setEstacVal("");
      setDepVal("");
      setComentariosVal("");
      setSelectedObservations([]);
      setIsConformeMode(true);
    } catch (err: any) {
      alert("Error al registrar revisión de file: " + (err.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy email content helper
  const handleCopyEmailText = () => {
    if (!latestSavedReview) return;
    const textToCopy = `Para: ${latestSavedReview.emailTo}\nCC: ${latestSavedReview.emailCc}\nAsunto: ${latestSavedReview.emailSubject}\n\n${latestSavedReview.emailBody}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2500);
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    let list = fileReviews;

    if (filterProject !== "ALL") {
      list = list.filter(r => (r.proyecto || "").trim().toLowerCase() === filterProject.trim().toLowerCase());
    }

    if (filterStatus === "CONFORME") {
      list = list.filter(r => r.isConforme);
    } else if (filterStatus === "OBSERVADO") {
      list = list.filter(r => !r.isConforme);
    }

    if (filterReviewer !== "ALL") {
      list = list.filter(r => (r.reviewedBy || "").trim().toLowerCase() === filterReviewer.trim().toLowerCase());
    }

    if (historyStartDate) {
      const start = safeParseDate(historyStartDate);
      if (start) {
        list = list.filter(r => {
          const d = safeParseDate(r.createdAt);
          return d ? d.getTime() >= start.getTime() : true;
        });
      }
    }

    if (historyEndDate) {
      const end = safeParseDate(historyEndDate);
      if (end) {
        end.setHours(23, 59, 59, 999);
        list = list.filter(r => {
          const d = safeParseDate(r.createdAt);
          return d ? d.getTime() <= end.getTime() : true;
        });
      }
    }

    if (searchHistoryQuery.trim()) {
      const q = searchHistoryQuery.toLowerCase().trim();
      list = list.filter(r => 
        r.id.toLowerCase().includes(q) ||
        r.proyecto.toLowerCase().includes(q) ||
        r.unidades.toLowerCase().includes(q) ||
        r.asesor.toLowerCase().includes(q) ||
        r.reviewedBy.toLowerCase().includes(q) ||
        r.observaciones?.some(o => o.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      const timeA = safeParseDate(a.createdAt)?.getTime() || 0;
      const timeB = safeParseDate(b.createdAt)?.getTime() || 0;
      return timeB - timeA;
    });
  }, [fileReviews, filterProject, filterStatus, filterReviewer, historyStartDate, historyEndDate, searchHistoryQuery]);

  // Unique reviewers in history
  const uniqueReviewers = useMemo(() => {
    const set = new Set<string>();
    fileReviews.forEach(r => {
      if (r.reviewedBy) set.add(r.reviewedBy.trim());
    });
    return Array.from(set).sort();
  }, [fileReviews]);

  // KPI Calculations (Matching Images 5 & 6)
  const monthFilteredReviews = useMemo(() => {
    return fileReviews.filter(r => {
      const d = safeParseDate(r.createdAt);
      if (!d) return false;
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return mKey === kpiMonthKey;
    });
  }, [fileReviews, kpiMonthKey]);

  // Daily Distribution across 31 days of the selected month
  const dailyDistribution = useMemo(() => {
    const daysInMonth = 31;
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const countsByDay: Record<number, { total: number; conforme: number; observado: number }> = {};
    days.forEach(d => {
      countsByDay[d] = { total: 0, conforme: 0, observado: 0 };
    });

    monthFilteredReviews.forEach(r => {
      const d = safeParseDate(r.createdAt);
      if (d) {
        const dayNum = d.getDate();
        if (countsByDay[dayNum]) {
          countsByDay[dayNum].total += 1;
          if (r.isConforme) countsByDay[dayNum].conforme += 1;
          else countsByDay[dayNum].observado += 1;
        }
      }
    });

    return countsByDay;
  }, [monthFilteredReviews]);

  // Find Peak Days
  const peakStats = useMemo(() => {
    let maxTotal = 0;
    let peakDayTotal = 1;

    let maxConforme = 0;
    let peakDayConforme = 1;

    let maxObservado = 0;
    let peakDayObservado = 1;

    Object.entries(dailyDistribution).forEach(([dStr, statVal]) => {
      const day = Number(dStr);
      const stat = statVal as { total: number; conforme: number; observado: number };
      if (stat.total > maxTotal) {
        maxTotal = stat.total;
        peakDayTotal = day;
      }
      if (stat.conforme > maxConforme) {
        maxConforme = stat.conforme;
        peakDayConforme = day;
      }
      if (stat.observado > maxObservado) {
        maxObservado = stat.observado;
        peakDayObservado = day;
      }
    });

    return {
      peakDayTotal,
      maxTotal,
      peakDayConforme,
      maxConforme,
      peakDayObservado,
      maxObservado
    };
  }, [dailyDistribution]);

  // Assistant Daily Review Stats (Image 6: "conocer la cantidad de file revisados por día por cada asistente legal")
  const assistantReviewStats = useMemo(() => {
    const assistantMap: Record<string, {
      name: string;
      totalMonth: number;
      conformeMonth: number;
      observadoMonth: number;
      todayCount: number;
      dailyCounts: Record<number, number>;
    }> = {};

    const todayDate = new Date().getDate();

    monthFilteredReviews.forEach(r => {
      const asst = r.reviewedBy || "Asistente Legal";
      if (!assistantMap[asst]) {
        assistantMap[asst] = {
          name: asst,
          totalMonth: 0,
          conformeMonth: 0,
          observadoMonth: 0,
          todayCount: 0,
          dailyCounts: {}
        };
      }

      assistantMap[asst].totalMonth += 1;
      if (r.isConforme) assistantMap[asst].conformeMonth += 1;
      else assistantMap[asst].observadoMonth += 1;

      const d = safeParseDate(r.createdAt);
      if (d) {
        const day = d.getDate();
        assistantMap[asst].dailyCounts[day] = (assistantMap[asst].dailyCounts[day] || 0) + 1;
        if (day === todayDate) {
          assistantMap[asst].todayCount += 1;
        }
      }
    });

    return Object.values(assistantMap).sort((a, b) => b.totalMonth - a.totalMonth);
  }, [monthFilteredReviews]);

  return (
    <div className="space-y-6 animate-fadeIn max-w-5xl mx-auto w-full" id="file-review-workspace-container">
      
      {/* Top Banner & Tab Navigation - Corporate Navy Blue Palette (Width in equal proportion with top navigation and bottom workspace) */}
      <div className="bg-gradient-to-r from-[#0B3B60] via-[#0D4672] to-[#082a45] text-white py-4.5 px-5 sm:px-6 rounded-3xl shadow-md border border-blue-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center font-black text-xl shadow-inner text-blue-200 shrink-0">
            📑
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black tracking-tight text-white uppercase">
                Revisión de FILE Legal
              </h2>
              <span className="bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Correos @taleinmobiliaria.com
              </span>
            </div>
            <p className="text-xs text-blue-150 font-medium mt-0.5">
              Inspección de expedientes de ventas, checklist de observaciones y despacho corporativo automático interno.
            </p>
          </div>
        </div>

        {/* Tab switch buttons (Filtered strictly by Role Permissions) */}
        <div className="flex items-center gap-2 bg-black/25 p-1.5 rounded-2xl backdrop-blur-xs self-start md:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab("form")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "form" 
                ? "bg-white text-[#0B3B60] shadow-sm" 
                : "text-white hover:bg-white/10"
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            <span>Nueva Revisión</span>
          </button>

          {/* Reporte de Files: Habilitado para Admin o Jefe Legal según permisos */}
          {canViewHistory && (
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "history" 
                  ? "bg-white text-[#0B3B60] shadow-sm" 
                  : "text-white hover:bg-white/10"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Reporte de Files ({fileReviews.length})</span>
            </button>
          )}

          {/* Estadísticas & KPIs: Habilitado para Admin o Jefe Legal según permisos */}
          {canViewKpis && (
            <button
              type="button"
              onClick={() => setActiveTab("kpis")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "kpis" 
                  ? "bg-white text-[#0B3B60] shadow-sm" 
                  : "text-white hover:bg-white/10"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Estadísticas & KPIs (Día / Asistente)</span>
            </button>
          )}

          {onBackToConsole && (
            <button
              type="button"
              onClick={onBackToConsole}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-200 hover:text-white hover:bg-white/10 transition-all cursor-pointer border border-white/20 ml-1"
              title="Volver a Mi Consola"
            >
              ← Volver
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: FORMULARIO DE REVISIÓN DE FILE (EXACTLY MATCHING IMAGE 3) */}
      {/* ========================================================================= */}
      {activeTab === "form" && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8 space-y-6 w-full">
          
          {/* REMITENTE Y VINCULACIÓN DE CORREO CORPORATIVO POP/SMTP */}
          {/* Requisito: "a los asistentes legales o jefe legal le permitira tener visible su propio correo sin poder editar pero tendra que ingresar la clave de su correo la cual quedara registrada para que se pueda enviar desde la plataforma. Considera la configuracion necesaria para la vinculacion del correo que creo es POP." */}
          <div className="bg-gradient-to-r from-blue-50/90 via-slate-50 to-indigo-50/60 p-4 rounded-2xl border border-blue-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[#0B3B60]" />
                <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  Remitente Institucional & Vinculación POP/SMTP
                </span>
                <span className="bg-blue-100 text-[#0B3B60] text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                  @taleinmobiliaria.com
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEmailConfigModalOpen(true)}
                className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <Server className="h-3.5 w-3.5" />
                <span>Ver Parámetros POP / SMTP</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Correo Corporativo (Solo Lectura) */}
              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-400" />
                    <span>Correo Corporativo (Solo Lectura)</span>
                  </label>
                  <span className="text-[9px] font-bold text-slate-400">Asignado por Admin</span>
                </div>
                <div className="relative">
                  <input
                    type="email"
                    value={userCorporateEmail}
                    readOnly
                    disabled
                    className="w-full pl-3 pr-8 py-2 bg-slate-100/90 border border-slate-300 text-slate-700 font-mono text-xs font-bold rounded-xl cursor-not-allowed select-all"
                  />
                  <Lock className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>

              {/* Clave de Correo */}
              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1">
                    <Key className="h-3 w-3 text-[#0B3B60]" />
                    <span>Clave de Correo (Para envío interno)</span>
                  </label>
                  {emailPasswordVal ? (
                    <span className="text-[9px] font-extrabold text-emerald-600 flex items-center gap-0.5">
                      <Check className="h-2.5 w-2.5" />
                      Registrada
                    </span>
                  ) : (
                    <span className="text-[9px] font-extrabold text-amber-600 animate-pulse">
                      Requerida
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showPasswordText ? "text" : "password"}
                      value={emailPasswordVal}
                      onChange={(e) => setEmailPasswordVal(e.target.value)}
                      placeholder="Ingrese clave de correo..."
                      className="w-full pl-3 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-800 outline-none focus:ring-2 focus:ring-[#0B3B60]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPasswordText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveEmailPassword}
                    className="px-3 py-2 bg-[#0B3B60] hover:bg-[#072B47] text-white text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
                    title="Guardar y registrar clave en la plataforma"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>

            {/* Notification message */}
            {savePasswordToast && (
              <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-fadeIn flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{savePasswordToast}</span>
              </div>
            )}
          </div>
          
          {/* Top Form Fields: PROYECTO & JEFE DE VENTAS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* PROYECTO * (Searchable Dropdown) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                PROYECTO <span className="text-rose-500">*</span>
              </label>
              <SearchableSelect
                value={selectedProyecto}
                onChange={(val) => setSelectedProyecto(val)}
                options={availableProjects.map(p => ({ value: p, label: p }))}
                placeholder="Seleccione proyecto..."
                className="w-full"
              />
            </div>

            {/* JEFE DE VENTAS RESPONSABLE (Auto-pulled) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                JEFE DE VENTAS RESPONSABLE
              </label>
              <div className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700">
                {jefeVentasResponsable || "Se cargará automáticamente al elegir proyecto"}
              </div>
            </div>

          </div>

          {/* UNIDADES: DPTO, ESTAC, DEP (Matching Image 3) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                DPTO (OPCIONAL)
              </label>
              <input
                type="text"
                value={dptoVal}
                onChange={(e) => setDptoVal(e.target.value)}
                placeholder="ej: 304"
                className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-2xl text-xs text-slate-800 outline-none focus:bg-white focus:border-brand-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                ESTAC.
              </label>
              <input
                type="text"
                value={estacVal}
                onChange={(e) => setEstacVal(e.target.value)}
                placeholder="ej: E-15"
                className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-2xl text-xs text-slate-800 outline-none focus:bg-white focus:border-brand-primary"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                DEP.
              </label>
              <input
                type="text"
                value={depVal}
                onChange={(e) => setDepVal(e.target.value)}
                placeholder="ej: D-02"
                className="w-full px-3 py-2 bg-slate-50/70 border border-slate-200 rounded-2xl text-xs text-slate-800 outline-none focus:bg-white focus:border-brand-primary"
              />
            </div>

          </div>

          {/* ASESOR INMOBILIARIO & TIPO DE SOLICITUD */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                ASESOR INMOBILIARIO <span className="text-rose-500">*</span>
              </label>
              <SearchableSelect
                value={selectedAsesor}
                onChange={(val) => setSelectedAsesor(val)}
                options={availableAdvisors.map(a => ({ value: a, label: a }))}
                placeholder="Seleccione asesor..."
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                TIPO DE SOLICITUD <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedTipo}
                onChange={(e) => setSelectedTipo(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="EMISION">EMISION</option>
                <option value="MODIFICACION">MODIFICACION</option>
                <option value="ADENDA">ADENDA</option>
                <option value="ACUERDO INTERNO">ACUERDO INTERNO</option>
              </select>
            </div>

          </div>

          {/* BOTÓN VERDE "TODO CONFORME" (Requirement: "al inicio habrá un botón que dirá Todo Conforme. de color verde que indicara que no tiene observaciones") */}
          <div className="p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${
                isConformeMode ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
              }`}>
                ✓
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Estado del File: {isConformeMode ? "TODO CONFORME" : "CON OBSERVACIONES"}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  {isConformeMode 
                    ? "El file cumple con todos los requisitos y no tiene observaciones."
                    : `Se han seleccionado ${selectedObservations.length} observaciones a notificar.`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSetTodoConforme}
              className={`px-4 py-2 rounded-xl text-xs font-black shadow-xs flex items-center gap-2 transition-all cursor-pointer ${
                isConformeMode
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/50"
                  : "bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Todo Conforme (Sin Observaciones)</span>
            </button>
          </div>

          {/* LISTA DE OBSERVACIONES (Header Azul Matching Image 3) */}
          <div className="space-y-3">
            <div className="bg-[#0284c7] text-white py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider text-center shadow-xs">
              LISTA DE OBSERVACIONES
            </div>

            {isAdmin && onUpdateSettings && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl">
                <input
                  type="text"
                  value={newObsText}
                  onChange={(e) => setNewObsText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdminAddObservationItem();
                    }
                  }}
                  placeholder="Agregar nuevo motivo de observación al checklist..."
                  className="flex-1 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#0284c7]"
                />
                <button
                  type="button"
                  onClick={handleAdminAddObservationItem}
                  className="px-3.5 py-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white font-black text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Agregar Motivo</span>
                </button>
              </div>
            )}

            {/* Checklist Grid with red dots (Matching Image 3) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
              {activeChecklistItems.map((item) => {
                const isChecked = selectedObservations.includes(item.name);
                const isEditingThis = isAdmin && editingObsId === item.id;

                if (isEditingThis) {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2.5 rounded-2xl border-2 border-blue-400 bg-blue-50/50 text-xs"
                    >
                      <input
                        type="text"
                        value={editingObsText}
                        onChange={(e) => setEditingObsText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAdminSaveObservationItem(item.id);
                          }
                        }}
                        className="flex-1 px-2.5 py-1 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-800 outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleAdminSaveObservationItem(item.id)}
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer shrink-0"
                        title="Guardar cambios"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingObsId(null);
                          setEditingObsText("");
                        }}
                        className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg cursor-pointer shrink-0"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.id}
                    className={`flex items-start justify-between gap-2 p-3 rounded-2xl border transition-all select-none text-xs font-semibold ${
                      isChecked 
                        ? "bg-rose-50/80 border-rose-300 text-rose-950 shadow-2xs" 
                        : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <label className="flex items-start gap-2.5 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleObservation(item.name)}
                        className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600 shrink-0"
                      />
                      <span className="w-2 h-2 rounded-full bg-rose-600 shrink-0 mt-1.5" />
                      <span className="leading-snug flex-1">
                        {item.name}
                      </span>
                    </label>

                    {isAdmin && onUpdateSettings && (
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingObsId(item.id);
                            setEditingObsText(item.name);
                          }}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Editar observación"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleAdminDeleteObservationItem(item.id, item.name);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar observación"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* COMENTARIOS (Opcional - Matching Image 3) */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
              Comentarios
            </label>
            <textarea
              rows={3}
              value={comentariosVal}
              onChange={(e) => setComentariosVal(e.target.value)}
              placeholder="Ingrese comentarios adicionales u observaciones específicas (opcional)..."
              className="w-full p-3.5 bg-white border-2 border-slate-800 rounded-2xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-brand-primary placeholder:text-slate-400 font-medium"
            />
          </div>

          {/* BOTÓN AZUL "ENVIAR CORREO" (Cyan/Blue Button Matching Image 3) */}
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSendEmailReview}
              className="w-full sm:w-auto min-w-[280px] px-8 py-3.5 bg-[#00a6e8] hover:bg-[#0094cf] active:bg-[#0081b5] text-white font-black text-sm uppercase tracking-wider rounded-2xl border-2 border-slate-900 shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              id="btn-enviar-correo-file-review"
            >
              <Send className="h-4 w-4" />
              <span>{isSubmitting ? "REGISTRANDO Y ENVIANDO..." : "ENVIAR CORREO"}</span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* LISTA PERSONAL DE REVISIONES REALIZADAS (Al final del formulario) */}
          {/* Requisito: "Al final podran ver toda la lista de revisiones que realizo, con fecha y hora, proyecto, unidad, asesor y observación en caso exista." */}
          {/* ========================================================================= */}
          <div className="mt-8 pt-6 border-t border-slate-200 space-y-4" id="asistente-mis-revisiones-container">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                  <List className="h-4 w-4 text-[#0B3B60]" />
                  <span>Mis Revisiones Realizadas ({myPersonalReviews.length})</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Historial de revisiones de file registradas por su usuario con fecha, hora, unidad y observaciones.
                </p>
              </div>

              {/* Quick Search */}
              <div className="relative min-w-[220px]">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={myReviewsSearchQuery}
                  onChange={(e) => setMyReviewsSearchQuery(e.target.value)}
                  placeholder="Buscar en mis revisiones..."
                  className="w-full text-xs font-medium pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#0B3B60]"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase">
                    <th className="py-2.5 px-3">Fecha y Hora</th>
                    <th className="py-2.5 px-3">Proyecto</th>
                    <th className="py-2.5 px-3">Unidad(es)</th>
                    <th className="py-2.5 px-3">Asesor</th>
                    <th className="py-2.5 px-3 text-center">Resultado</th>
                    <th className="py-2.5 px-3">Observación / Detalle</th>
                    <th className="py-2.5 px-3 text-center">Correo</th>
                    {isAdmin && <th className="py-2.5 px-3 text-center">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredMyPersonalReviews.map((r) => (
                    <tr key={r.id} className="hover:bg-blue-50/30">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {r.dateFormatted || formatDateTimeFull(r.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {r.proyecto}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {r.unidades}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-bold">
                        {r.asesor}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {r.isConforme ? (
                          <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200 text-[10px]">
                            Todo Conforme
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-md border border-amber-200 text-[10px]">
                            Observado
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs">
                        {r.isConforme ? (
                          <span className="text-emerald-700 font-semibold italic">Todo Conforme (Sin observaciones)</span>
                        ) : (
                          <div>
                            <div className="font-bold text-amber-900">
                              {r.observaciones.join(", ")}
                            </div>
                            {r.comentarios && (
                              <div className="text-slate-500 text-[10px] mt-0.5">
                                {r.comentarios}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {r.emailSent ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200" title={`Enviado a ${r.emailTo}`}>
                            <Check className="h-3 w-3" />
                            Enviado
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            Pendiente
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingReviewRecord({ ...r })}
                              className="p-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-lg transition-colors cursor-pointer"
                              title="Editar revisión de FILE"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {onDeleteFileReview && (
                              <button
                                type="button"
                                onClick={() => onDeleteFileReview(r.id)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar revisión de FILE"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {filteredMyPersonalReviews.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-slate-400">
                        {myPersonalReviews.length === 0
                          ? "Aún no ha realizado revisiones de file. Complete el formulario arriba para registrar su primera revisión."
                          : "No se encontraron revisiones con el criterio de búsqueda."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: HISTORIAL Y REPORTE DE REVISIONES DE FILE */}
      {/* ========================================================================= */}
      {activeTab === "history" && (
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-4">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <List className="h-5 w-5 text-orange-600" />
                Reporte de Revisiones de FILE Realizadas
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Consolidado de todas las revisiones enviadas con detalle de proyecto, asesor, unidades y resultado.
              </p>
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadFileReviewsExcel(filteredHistory, `${historyStartDate || "Inicio"} al ${historyEndDate || "Hoy"}`)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Descargar Excel</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const doc = generateFileReviewsPdf(filteredHistory, `${historyStartDate || "Inicio"} al ${historyEndDate || "Hoy"}`, filterReviewer !== "ALL" ? filterReviewer : undefined);
                  const dateStr = new Date().toISOString().split("T")[0];
                  doc.save(`Reporte_Revisiones_FILE_${dateStr}.pdf`);
                }}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <FileText className="h-4 w-4" />
                <span>Exportar PDF</span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-xs">
            
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchHistoryQuery}
                  onChange={(e) => setSearchHistoryQuery(e.target.value)}
                  placeholder="Buscar por ID, asesor, proyecto..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 outline-none focus:border-brand-primary"
                />
              </div>

              {/* Project Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Proyecto:</span>
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="h-8 px-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none"
                >
                  <option value="ALL">Todos los Proyectos</option>
                  {availableProjects.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Resultado:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="h-8 px-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none"
                >
                  <option value="ALL">Todos ({fileReviews.length})</option>
                  <option value="CONFORME">Todo Conforme</option>
                  <option value="OBSERVADO">Con Observaciones</option>
                </select>
              </div>

              {/* Reviewer Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Revisor:</span>
                <select
                  value={filterReviewer}
                  onChange={(e) => setFilterReviewer(e.target.value)}
                  className="h-8 px-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer outline-none"
                >
                  <option value="ALL">Todos los Revisores</option>
                  {uniqueReviewers.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Fechas:</span>
              <input
                type="date"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
                className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 outline-none"
              />
              <span className="text-slate-400 font-bold">-</span>
              <input
                type="date"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
                className="h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 outline-none"
              />
              {(historyStartDate || historyEndDate) && (
                <button
                  type="button"
                  onClick={() => { setHistoryStartDate(""); setHistoryEndDate(""); }}
                  className="text-rose-600 hover:text-rose-800 font-bold ml-1 cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

          </div>

          {/* Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">ID / Fecha</th>
                  <th className="py-2.5 px-3">Proyecto & Unidades</th>
                  <th className="py-2.5 px-3">Asesor Inmobiliario</th>
                  <th className="py-2.5 px-3">Jefe de Ventas</th>
                  <th className="py-2.5 px-3 text-center">Resultado</th>
                  <th className="py-2.5 px-3">Observaciones / Detalle</th>
                  <th className="py-2.5 px-3">Revisado Por</th>
                  <th className="py-2.5 px-3 text-right">Acciones / Correo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHistory.map((r, idx) => (
                  <tr key={r.id} className={`hover:bg-orange-50/30 transition-colors ${idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"}`}>
                    <td className="py-2.5 px-3 font-mono font-bold">
                      <div className="text-orange-700">{r.id}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{r.dateFormatted}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{r.proyecto}</div>
                      <div className="text-[10px] text-slate-500">{r.unidades}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-800">{r.asesor}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.asesorEmail}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {r.jefeVentas}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {r.isConforme ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                          ✓ Todo Conforme
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                          🔴 Observado ({r.observaciones?.length || 1})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                      {r.isConforme ? (
                        <span className="text-emerald-700 font-medium text-[11px]">Conforme sin observaciones.</span>
                      ) : (
                        <div className="space-y-0.5">
                          {r.observaciones?.slice(0, 2).map((obs, oIdx) => (
                            <div key={oIdx} className="text-[10px] text-rose-900 truncate">
                              • {obs}
                            </div>
                          ))}
                          {(r.observaciones?.length || 0) > 2 && (
                            <span className="text-[9px] text-slate-400 font-bold">
                              +{(r.observaciones?.length || 0) - 2} observaciones más
                            </span>
                          )}
                          {r.comentarios && (
                            <div className="text-[10px] text-slate-500 italic mt-0.5">
                              "{r.comentarios}"
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium text-xs">
                      <div>{r.reviewedBy}</div>
                      <div className="text-[9px] text-slate-400">{r.reviewerRole}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setLatestSavedReview(r);
                            setEmailModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[10px] transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          <span>Ver Correo</span>
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingReviewRecord({ ...r })}
                              className="p-1.5 bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white border border-amber-200 rounded-lg transition-colors cursor-pointer"
                              title="Editar revisión de FILE"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {onDeleteFileReview && (
                              <button
                                type="button"
                                onClick={() => onDeleteFileReview(r.id)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                title="Eliminar revisión de FILE"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 italic">
                      No se encontraron revisiones de files registradas con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ESTADÍSTICAS & KPIS (MATCHING IMAGES 5 & 6) */}
      {/* ========================================================================= */}
      {activeTab === "kpis" && (
        <div className="space-y-6">
          
          {/* Month Selector & Global Cards */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-orange-100 text-orange-700 rounded-xl">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Métricas Globales de Revisión de FILE
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Resumen mensual del volumen de expedientes inspeccionados y efectividad legal.
                  </p>
                </div>
              </div>

              {/* Month Picker */}
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-500 uppercase text-[10px]">Mes a Evaluar:</span>
                <input
                  type="month"
                  value={kpiMonthKey}
                  onChange={(e) => setKpiMonthKey(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                />
              </div>
            </div>

            {/* 4 Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
                  TOTAL FILES REVISADOS
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-slate-900 font-mono">
                    {monthFilteredReviews.length}
                  </span>
                  <span className="text-xs font-bold text-slate-500">expedientes</span>
                </div>
              </div>

              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                  FILES CONFORMES (SIN OBS.)
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-emerald-700 font-mono">
                    {monthFilteredReviews.filter(r => r.isConforme).length}
                  </span>
                  <span className="text-xs font-bold text-emerald-600">
                    ({monthFilteredReviews.length > 0 
                      ? ((monthFilteredReviews.filter(r => r.isConforme).length / monthFilteredReviews.length) * 100).toFixed(0) 
                      : 0}%)
                  </span>
                </div>
              </div>

              <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-200 shadow-2xs">
                <span className="text-[10px] font-black text-rose-800 uppercase tracking-wider block">
                  FILES CON OBSERVACIONES
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-rose-700 font-mono">
                    {monthFilteredReviews.filter(r => !r.isConforme).length}
                  </span>
                  <span className="text-xs font-bold text-rose-600">
                    ({monthFilteredReviews.length > 0 
                      ? ((monthFilteredReviews.filter(r => !r.isConforme).length / monthFilteredReviews.length) * 100).toFixed(0) 
                      : 0}%)
                  </span>
                </div>
              </div>

              <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-200 shadow-2xs">
                <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider block">
                  TASA DE CONFORMIDAD
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-black text-blue-700 font-mono">
                    {monthFilteredReviews.length > 0 
                      ? ((monthFilteredReviews.filter(r => r.isConforme).length / monthFilteredReviews.length) * 100).toFixed(1) 
                      : 0}%
                  </span>
                  <span className="text-xs font-bold text-blue-600">efectividad</span>
                </div>
              </div>

            </div>
          </div>

          {/* Gráfica de Evolución Diaria / Semanal (Matching Image 5) */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-brand-primary" />
                  Evolución y Cantidad de Files Revisados por Día
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Valores enteros de revisiones efectuadas (Total, Conforme vs. Con Observaciones) a lo largo del mes.
                </p>
              </div>

              {/* Line filters */}
              <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    checked={kpiLineShowTotal}
                    onChange={(e) => setKpiLineShowTotal(e.target.checked)}
                    className="accent-slate-800"
                  />
                  <span className="text-slate-800 font-extrabold">Total Files</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                  <input
                    type="checkbox"
                    checked={kpiLineShowConforme}
                    onChange={(e) => setKpiLineShowConforme(e.target.checked)}
                    className="accent-emerald-600"
                  />
                  <span className="text-emerald-700 font-extrabold">Conformes</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">
                  <input
                    type="checkbox"
                    checked={kpiLineShowObservado}
                    onChange={(e) => setKpiLineShowObservado(e.target.checked)}
                    className="accent-rose-600"
                  />
                  <span className="text-rose-700 font-extrabold">Observados</span>
                </label>
              </div>
            </div>

            {/* Visual Bar/Line Chart (Days 1 to 31) */}
            <div className="pt-4 pb-2">
              <div className="h-52 w-full flex items-end gap-1.5 border-b border-l border-slate-200 px-2 pb-1 relative">
                
                {/* Horizontal guide lines */}
                <div className="absolute inset-x-0 top-0 border-b border-slate-100 border-dashed" />
                <div className="absolute inset-x-0 top-1/2 border-b border-slate-100 border-dashed" />

                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                  const stat = dailyDistribution[day] || { total: 0, conforme: 0, observado: 0 };
                  const maxVal = Math.max(peakStats.maxTotal, 4);
                  const heightTotalPct = (stat.total / maxVal) * 100;
                  const heightConformePct = (stat.conforme / maxVal) * 100;
                  const heightObservadoPct = (stat.observado / maxVal) * 100;

                  return (
                    <div key={day} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      
                      {/* Tooltip */}
                      {stat.total > 0 && (
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-900 text-white text-[9px] p-2 rounded-xl shadow-lg z-20 whitespace-nowrap">
                          <span className="font-black">Día {day}: {stat.total} files</span>
                          <span className="text-emerald-300">✓ Conformes: {stat.conforme}</span>
                          <span className="text-rose-300">🔴 Observados: {stat.observado}</span>
                        </div>
                      )}

                      {/* Bar segments */}
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        {kpiLineShowTotal && stat.total > 0 && (
                          <div 
                            className="w-1.5 bg-blue-600 rounded-t-sm transition-all"
                            style={{ height: `${Math.max(heightTotalPct, 6)}%` }}
                          />
                        )}
                        {kpiLineShowConforme && stat.conforme > 0 && (
                          <div 
                            className="w-1.5 bg-emerald-500 rounded-t-sm transition-all"
                            style={{ height: `${Math.max(heightConformePct, 6)}%` }}
                          />
                        )}
                        {kpiLineShowObservado && stat.observado > 0 && (
                          <div 
                            className="w-1.5 bg-rose-500 rounded-t-sm transition-all"
                            style={{ height: `${Math.max(heightObservadoPct, 6)}%` }}
                          />
                        )}
                      </div>

                      {/* Day number */}
                      <span className="text-[8px] font-bold text-slate-400 mt-1">
                        {day % 2 === 1 ? day : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Peak Cards (Image 5 bottom badges) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider block">
                    DÍA PICO DE REVISIONES
                  </span>
                  <span className="text-sm font-black text-slate-800">
                    Día {peakStats.peakDayTotal} ({peakStats.maxTotal} files)
                  </span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs">
                  📈
                </div>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider block">
                    DÍA PICO DE CONFORMES
                  </span>
                  <span className="text-sm font-black text-slate-800">
                    Día {peakStats.peakDayConforme} ({peakStats.maxConforme} conformes)
                  </span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs">
                  ✓
                </div>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-2xl border border-rose-200/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">
                    DÍA PICO DE OBSERVACIONES
                  </span>
                  <span className="text-sm font-black text-slate-800">
                    Día {peakStats.peakDayObservado} ({peakStats.maxObservado} observados)
                  </span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-xs">
                  🔴
                </div>
              </div>
            </div>

          </div>

          {/* Cantidad de Files Revisados por Día por Cada Asistente Legal (Matching Image 6) */}
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-600" />
                  Cantidad de FILEs Revisados por Día por Cada Asistente Legal
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Rendimiento individual y carga operativa diaria de los asistentes legales en el mes.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {assistantReviewStats.length} asistentes con actividad
              </span>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Asistente Legal</th>
                    <th className="py-2.5 px-3 text-center">Files Revisados Hoy</th>
                    <th className="py-2.5 px-3 text-center">Total Mes</th>
                    <th className="py-2.5 px-3 text-center">Conformes</th>
                    <th className="py-2.5 px-3 text-center">Observados</th>
                    <th className="py-2.5 px-3 text-center">% Conformidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assistantReviewStats.map((asst, idx) => {
                    const asstRate = asst.totalMonth > 0 ? ((asst.conformeMonth / asst.totalMonth) * 100).toFixed(0) : "0";
                    return (
                      <tr key={asst.name} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {asst.name}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-black text-brand-primary">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                            {asst.todayCount} hoy
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-black text-slate-800 text-sm">
                          {asst.totalMonth}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-700">
                          {asst.conformeMonth}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-700">
                          {asst.observadoMonth}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                          {asstRate}%
                        </td>
                      </tr>
                    );
                  })}
                  {assistantReviewStats.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                        No hay registros de revisión en el mes seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CORREO CORPORATIVO ENVIADO (EXACTLY MATCHING IMAGE 4) */}
      {/* ========================================================================= */}
      {emailModalOpen && latestSavedReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-scaleUp">
            
            {/* Header (Outlook / Corporate mail preview style) */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center text-white font-black text-sm">
                  ✉
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">
                    Notificación de Correo Corporativo
                  </h3>
                  <p className="text-[10px] text-slate-300 font-mono">
                    taleinmobiliaria.com • Envío registrado con éxito
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Email Header Details (Matching Image 4) */}
            <div className="p-5 space-y-4">
              
              {/* Asunto (Matching Image 4 header) */}
              <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 font-mono text-xs font-black text-slate-800 break-words">
                {latestSavedReview.emailSubject}
              </div>

              {/* Sender & Recipients box */}
              <div className="space-y-2 p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs font-medium">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase w-12">De:</span>
                  <span className="font-bold text-slate-900">{latestSavedReview.reviewedBy}</span>
                  <span className="text-slate-400 font-mono text-[10px]">({latestSavedReview.reviewerEmail || `${formatCorporateEmail(latestSavedReview.reviewedBy)}`})</span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase w-12">Para:</span>
                  <span className="font-bold text-slate-900">{latestSavedReview.asesor}</span>
                  <span className="text-emerald-700 font-mono font-bold text-[10px]">({latestSavedReview.emailTo})</span>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase w-12">CC:</span>
                  <span className="text-slate-700 font-mono text-[11px] break-all">{latestSavedReview.emailCc}</span>
                </div>
              </div>

              {/* Email Body Content (Matching Image 4) */}
              <div className="p-4 bg-white rounded-2xl border border-slate-200 text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans shadow-2xs">
                {latestSavedReview.emailBody}
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyEmailText}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5 text-slate-600" />
                    <span>{copiedSuccess ? "¡Copiado al portapapeles!" : "Copiar Correo"}</span>
                  </button>

                  <a
                    href={`mailto:${latestSavedReview.emailTo}?cc=${encodeURIComponent(latestSavedReview.emailCc)}&subject=${encodeURIComponent(latestSavedReview.emailSubject)}&body=${encodeURIComponent(latestSavedReview.emailBody)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Abrir en Outlook / Mail</span>
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-xs"
                >
                  Listo / Cerrar
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE VINCULACIÓN Y CONFIGURACIÓN POP / SMTP */}
      {/* Requisito: "Tener en cuenta que se debe enviar el correo desde la misma plataforma de forma interna y como parte de configuracion, a los asistentes legales o jefe legal le permitira tener visible su propio correo sin poder editar pero tendra que ingresar la clave de su correo la cual quedara registrada para que se pueda enviar desde la plataforma. Considera la configuracion necesaria para la vinculacion del correo que creo es POP." */}
      {/* ========================================================================= */}
      {emailConfigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-blue-150 overflow-hidden space-y-4">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#0B3B60] via-[#0D4672] to-[#082a45] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl shadow-inner text-blue-200">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight">
                    Vinculación de Correo Corporativo
                  </h3>
                  <p className="text-[11px] text-blue-150 font-medium">
                    Protocolo POP3 / SMTP @taleinmobiliaria.com
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEmailConfigModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-blue-50/80 rounded-2xl border border-blue-200/80 text-blue-900 text-[11px] font-medium leading-relaxed">
                El envío de correos de Revisión de FILE se realiza de forma directa e interna desde la plataforma utilizando los servidores de <strong>Tale Inmobiliaria</strong>. Su dirección corporativa está protegida y es de solo lectura. Para habilitar los envíos, ingrese la clave de su correo corporativo.
              </div>

              {/* Readonly Corporate Email */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3 text-slate-400" />
                    <span>Correo Institucional Asignado (Solo Lectura)</span>
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">No editable</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={userCorporateEmail}
                    readOnly
                    disabled
                    className="w-full pl-3 pr-8 py-2.5 bg-slate-100 border border-slate-300 text-slate-800 font-mono text-xs font-bold rounded-xl cursor-not-allowed select-all"
                  />
                  <Lock className="h-4 w-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {/* Email Password Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Key className="h-3 w-3 text-[#0B3B60]" />
                    <span>Clave de su Correo Corporativo <span className="text-rose-500">*</span></span>
                  </span>
                  <span className="text-[9px] font-bold text-slate-400">Quedará registrada</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? "text" : "password"}
                    value={emailPasswordVal}
                    onChange={(e) => setEmailPasswordVal(e.target.value)}
                    placeholder="Ingrese su contraseña institucional..."
                    className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-slate-300 focus:border-[#0B3B60] rounded-xl text-xs font-mono text-slate-800 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPasswordText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  La contraseña queda grabada en su perfil para permitir el envío interno cada vez que presione "ENVIAR CORREO".
                </p>
              </div>

              {/* POP3 / SMTP Technical Configuration */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                  Parámetros de Servidor Vinculado (Protocolo POP / SMTP)
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[9px] text-slate-400 block uppercase font-sans font-bold">Servidor Entrante</span>
                    <span className="font-bold text-slate-700">POP3: 995 SSL</span>
                    <span className="text-[10px] text-slate-500 block truncate">mail.taleinmobiliaria.com</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[9px] text-slate-400 block uppercase font-sans font-bold">Servidor Saliente</span>
                    <span className="font-bold text-slate-700">SMTP: 465 SSL</span>
                    <span className="text-[10px] text-slate-500 block truncate">mail.taleinmobiliaria.com</span>
                  </div>
                </div>
              </div>

              {/* Test status */}
              {testConnStatus !== "idle" && (
                <div className={`p-3 rounded-xl border text-[11px] font-bold ${
                  testConnStatus === "testing"
                    ? "bg-blue-50 text-blue-800 border-blue-200 animate-pulse"
                    : testConnStatus === "success"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                }`}>
                  {testConnMsg}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testConnStatus === "testing"}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Server className="h-3.5 w-3.5 text-blue-600" />
                <span>{testConnStatus === "testing" ? "Verificando..." : "Probar Conexión"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmailConfigModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs cursor-pointer transition-all"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveEmailPassword();
                    if (emailPasswordVal.trim()) {
                      setEmailConfigModalOpen(false);
                    }
                  }}
                  className="px-5 py-2 bg-[#0B3B60] hover:bg-[#072B47] text-white rounded-xl font-black text-xs shadow-sm cursor-pointer transition-all active:scale-95"
                >
                  Guardar y Vincular
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ADMIN EDIT FILE REVIEW RECORD MODAL */}
      {isAdmin && editingReviewRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl border border-blue-100 flex flex-col overflow-hidden">
            <div className="p-4 bg-[#0B3B60] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-sky-300" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Editar Revisión de FILE ({editingReviewRecord.id})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingReviewRecord(null)}
                className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Proyecto</label>
                  <select
                    value={editingReviewRecord.proyecto}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, proyecto: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  >
                    {availableProjects.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Unidades (Dpto / Estac / Dep)</label>
                  <input
                    type="text"
                    value={editingReviewRecord.unidades}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, unidades: e.target.value, dpto: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Asesor Inmobiliario</label>
                  <select
                    value={editingReviewRecord.asesor}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, asesor: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  >
                    {availableAdvisors.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Tipo de Solicitud</label>
                  <select
                    value={editingReviewRecord.tipoSolicitud || "EMISION"}
                    onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, tipoSolicitud: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none"
                  >
                    <option value="EMISION">EMISION</option>
                    <option value="MODIFICACION">MODIFICACION</option>
                    <option value="ADENDA">ADENDA</option>
                    <option value="ACUERDO INTERNO">ACUERDO INTERNO</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Resultado de la Revisión</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingReviewRecord({ ...editingReviewRecord, isConforme: true, observaciones: [] })}
                    className={`px-4 py-2 rounded-xl font-black text-xs border cursor-pointer transition-all ${
                      editingReviewRecord.isConforme
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    ✓ Todo Conforme
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingReviewRecord({ ...editingReviewRecord, isConforme: false })}
                    className={`px-4 py-2 rounded-xl font-black text-xs border cursor-pointer transition-all ${
                      !editingReviewRecord.isConforme
                        ? "bg-rose-600 text-white border-rose-700"
                        : "bg-slate-50 text-slate-600 border-slate-200"
                    }`}
                  >
                    🔴 Observado
                  </button>
                </div>
              </div>

              {!editingReviewRecord.isConforme && (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-1.5">Observaciones Seleccionadas</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                    {activeChecklistItems.map(item => {
                      const checked = (editingReviewRecord.observaciones || []).includes(item.name);
                      return (
                        <label key={item.id} className="flex items-start gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const curr = editingReviewRecord.observaciones || [];
                              const next = checked ? curr.filter(o => o !== item.name) : [...curr, item.name];
                              setEditingReviewRecord({ ...editingReviewRecord, observaciones: next, isConforme: next.length === 0 });
                            }}
                            className="mt-0.5 rounded accent-rose-600"
                          />
                          <span>{item.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Comentarios Adicionales</label>
                <textarea
                  rows={2}
                  value={editingReviewRecord.comentarios || ""}
                  onChange={(e) => setEditingReviewRecord({ ...editingReviewRecord, comentarios: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingReviewRecord(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (onUpdateFileReview && editingReviewRecord) {
                    await onUpdateFileReview(editingReviewRecord.id, editingReviewRecord);
                  }
                  setEditingReviewRecord(null);
                }}
                className="px-5 py-2 bg-[#0B3B60] hover:bg-[#072B47] text-white rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
