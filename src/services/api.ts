import * as XLSX from "xlsx";
import { AppSettings, OperationRecord, UserAccount, ProjectConfig } from "../types";

function getGasUrl(): string {
  const localWebhookUrl = localStorage.getItem("sheets_webhook_url");
  if (localWebhookUrl && localWebhookUrl.trim().startsWith("http")) {
    return localWebhookUrl.trim();
  }
  return "https://script.google.com/macros/s/AKfycbyyi5tXsWY_-Apa2gBcnS9ck0VcsBOkwGx8YtFv9XmS_rgnV5f2DUlh5WIY8o2zndhHXw/exec";
}

// Cache for lookups to translate IDs to Names and vice versa
let cachedUsers: any[] = [];
let cachedTeams: any[] = [];
let cachedAdvisors: any[] = [];
let cachedProjects: any[] = [];
let cachedStatuses: any[] = [];
let cachedTypes: any[] = [];
let cachedHistory: any[] = [];

// Helper to make a GET request to Google Apps Script
async function gasGet(action: string): Promise<any> {
  const url = `${getGasUrl()}?action=${action}&_t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch action ${action}: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || `Error in GAS action ${action}`);
  }
  return json.data;
}

// Helper to make a POST request to Google Apps Script
async function gasPost(action: string, data: any): Promise<any> {
  const payload = {
    action,
    data,
    ...data
  };
  const res = await fetch(getGasUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "text/plain"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`Failed to post action ${action}: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || `Error in GAS post action ${action}`);
  }
  return json.data;
}

// Format date-time exactly like Peru's timezone (PET)
export function getFormattedSystemDateTime(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

// Load all lookups needed for translating IDs to Names
export async function loadLookups() {
  try {
    const [users, teams, advisors, projects, statuses, types, history] = await Promise.all([
      gasGet("getUsers").catch(() => []),
      gasGet("getTeams").catch(() => []),
      gasGet("getAdvisors").catch(() => []),
      gasGet("getProjects").catch(() => []),
      gasGet("getStatus").catch(() => []),
      gasGet("getTypes").catch(() => []),
      gasGet("getHistory").catch(() => [])
    ]);

    cachedUsers = users;
    cachedTeams = teams;
    cachedAdvisors = advisors;
    cachedProjects = projects;
    cachedStatuses = statuses;
    cachedTypes = types;
    cachedHistory = history;
  } catch (error) {
    console.error("Error loading lookups from GAS:", error);
  }
}

// Map a GAS Operation row to React OperationRecord
function mapGasToReactRecord(row: any): OperationRecord {
  // Translate IDs to Names using cached lookups
  const project = cachedProjects.find(p => p.IdProyecto === row.IdProyecto);
  const team = cachedTeams.find(t => t.IdEquipo === row.IdEquipo);
  const advisor = cachedAdvisors.find(a => a.IdAsesor === row.Asesor);
  const type = cachedTypes.find(t => t.IdTipo === row.TipoOperacion);
  const status = cachedStatuses.find(s => s.IdEstado === row.Estado);

  // Group history for this operation
  const relatedHistory = cachedHistory
    .filter(h => h.IdOperacion === row.IdOperacion)
    .map(h => {
      const hStatus = cachedStatuses.find(s => s.IdEstado === h.Estado);
      return {
        status: hStatus ? hStatus.NombreEstado : h.Estado,
        comentario: h.Comentario || "",
        timestamp: h.FechaRegistro || h.Fecha || h.Timestamp || "",
        user: h.UsuarioRegistro || h.Usuario || "Sistema"
      };
    });

  return {
    id: row.IdOperacion,
    proyecto: project ? project.NombreProyecto : (row.IdProyecto || ""),
    team: team ? team.NombreEquipo : (row.IdEquipo || ""),
    dpto: row.Dpto || "",
    estac: row.Estacionamiento || "",
    dep: row.Deposito || "",
    asesor: advisor ? advisor.Nombre : (row.Asesor || ""),
    tipo: type ? type.NombreTipo : (row.TipoOperacion || ""),
    solicitud: row.FechaSolicitud || "",
    solicitudAt: row.FechaRegistro || row.FechaSolicitud ? new Date(row.FechaRegistro || row.FechaSolicitud).toISOString() : undefined,
    emision: row.FechaEmision || "",
    emittedAt: row.FechaModificacion || row.FechaEmision ? new Date(row.FechaModificacion || row.FechaEmision).toISOString() : undefined,
    status: status ? status.NombreEstado : (row.Estado || ""),
    comentario: row.Comentario || "",
    derivadoA: row.DerivadoA || "",
    history: relatedHistory,
    createdAt: row.FechaRegistro ? new Date(row.FechaRegistro).toISOString() : new Date().toISOString()
  };
}

// Map React OperationRecord to GAS format row
function mapReactToGasRecord(record: Partial<OperationRecord>): any {
  // Translate Names to IDs using cached lookups
  const project = cachedProjects.find(p => p.NombreProyecto === record.proyecto);
  const team = cachedTeams.find(t => t.NombreEquipo === record.team);
  const advisor = cachedAdvisors.find(a => a.Nombre === record.asesor);
  const type = cachedTypes.find(t => t.NombreTipo === record.tipo);
  const status = cachedStatuses.find(s => s.NombreEstado === record.status);

  return {
    IdOperacion: record.id,
    IdProyecto: project ? project.IdProyecto : record.proyecto,
    IdEquipo: team ? team.IdEquipo : record.team,
    Dpto: record.dpto,
    Estacionamiento: record.estac,
    Deposito: record.dep,
    Asesor: advisor ? advisor.IdAsesor : record.asesor,
    TipoOperacion: type ? type.IdTipo : record.tipo,
    FechaSolicitud: record.solicitud,
    FechaEmision: record.emision,
    Estado: status ? status.IdEstado : record.status,
    Comentario: record.comentario,
    DerivadoA: record.derivadoA,
    UsuarioRegistro: record.updatedByUser || "Sistema",
    FechaRegistro: record.createdAt || getFormattedSystemDateTime(),
    Activo: true
  };
}

// -------------------------------------------------------------
// PUBLIC API EXPORTS
// -------------------------------------------------------------

export async function getRecords(): Promise<OperationRecord[]> {
  await loadLookups();
  const rawRecords = await gasGet("getOperations");
  return rawRecords.map(mapGasToReactRecord);
}

export async function createRecord(recordData: Partial<OperationRecord>): Promise<OperationRecord> {
  const gasRecord = mapReactToGasRecord(recordData);
  const savedRecord = await gasPost("saveOperation", gasRecord);
  
  // Save initial history if a status is present
  if (recordData.status) {
    const statusObj = cachedStatuses.find(s => s.NombreEstado === recordData.status);
    await gasPost("saveHistory", {
      IdOperacion: recordData.id,
      Estado: statusObj ? statusObj.IdEstado : recordData.status,
      Comentario: recordData.comentario || "Registro inicial.",
      UsuarioRegistro: recordData.updatedByUser || "Sistema",
      FechaRegistro: getFormattedSystemDateTime()
    }).catch(e => console.error("Error saving history during creation:", e));
  }

  await loadLookups(); // Refresh lookups & history cache
  return mapGasToReactRecord(savedRecord || gasRecord);
}

export async function updateRecord(id: string, updatedFields: Partial<OperationRecord>): Promise<OperationRecord> {
  await loadLookups();
  
  // Find current operation from GAS to check current state
  const operations = await gasGet("getOperations").catch(() => []) || [];
  const currentOp = operations.find((o: any) => o.IdOperacion === id) || {};
  
  const mappedUpdate = mapReactToGasRecord({ id, ...updatedFields });
  const savedRecord = await gasPost("updateOperation", mappedUpdate);

  // We want to record ALL modifications (any field updated is a "toque")
  const modifiedKeys: string[] = [];
  const fieldsToCheck: (keyof OperationRecord)[] = ["proyecto", "team", "dpto", "estac", "dep", "asesor", "tipo", "status", "comentario", "derivadoA"];
  
  // Translate current operation back to react values to compare
  const currentReact = currentOp.IdOperacion ? mapGasToReactRecord(currentOp) : null;
  
  if (currentReact) {
    fieldsToCheck.forEach(key => {
      if (updatedFields[key] !== undefined && String(updatedFields[key]) !== String(currentReact[key])) {
        modifiedKeys.push(key);
      }
    });
  } else {
    // Fallback if we couldn't load the current operation
    Object.keys(updatedFields).forEach(k => {
      if (k !== "id" && k !== "updatedByUser" && updatedFields[k as keyof OperationRecord] !== undefined) {
        modifiedKeys.push(k);
      }
    });
  }

  if (modifiedKeys.length > 0 || updatedFields.comentario !== undefined) {
    const statusObj = cachedStatuses.find(s => s.NombreEstado === (updatedFields.status || (currentReact ? currentReact.status : "")));
    
    let historyComment = updatedFields.comentario || "";
    if (!historyComment || historyComment === currentReact?.comentario) {
      historyComment = `[Modificación] Se actualizaron los campos: ${modifiedKeys.join(", ")}.`;
    }

    await gasPost("saveHistory", {
      IdOperacion: id,
      Estado: statusObj ? statusObj.IdEstado : (updatedFields.status || (currentReact ? currentReact.status : "PENDIENTE")),
      Comentario: historyComment,
      UsuarioRegistro: updatedFields.updatedByUser || "Usuario",
      FechaRegistro: getFormattedSystemDateTime()
    }).catch(e => console.error("Error saving history during update:", e));
  }

  await loadLookups();
  return mapGasToReactRecord(savedRecord || mappedUpdate);
}

export async function deleteRecord(id: string, deletedByUser?: string): Promise<{ success: boolean; deletedId: string }> {
  await loadLookups();
  // Find current operation from GAS before deleting
  const operations = await gasGet("getOperations").catch(() => []) || [];
  const currentOp = operations.find((o: any) => o.IdOperacion === id);
  if (currentOp) {
    const statusObj = cachedStatuses.find(s => s.IdEstado === currentOp.Estado);
    await gasPost("saveHistory", {
      IdOperacion: id,
      Estado: currentOp.Estado,
      Comentario: `[Eliminación] Registro eliminado de la lista activa por el usuario.`,
      UsuarioRegistro: deletedByUser || "Administrador",
      FechaRegistro: getFormattedSystemDateTime()
    }).catch(e => console.error("Error saving deletion history:", e));
  }
  await gasPost("deleteOperation", { IdOperacion: id });
  return { success: true, deletedId: id };
}

export async function getSettings(): Promise<AppSettings> {
  await loadLookups();

  // Load general config from localStorage
  const localPlatformName = localStorage.getItem("platform_name") || "Excelencia Operacional";
  const localPlatformLogo = localStorage.getItem("platform_logo") || "";
  const localJefeLegalEnabled = localStorage.getItem("jefe_legal_enabled") !== "false";
  const localSharedExcelLink = localStorage.getItem("shared_excel_link") || "";
  const localWebhookUrl = localStorage.getItem("sheets_webhook_url") || "";
  const localKpiVisibility = localStorage.getItem("kpi_visibility") 
    ? JSON.parse(localStorage.getItem("kpi_visibility")!) 
    : {
        "Administrador": true,
        "Jefe de Ventas": false,
        "Jefe Legal": true,
        "Asistente Legal": false
      };

  // Map users
  let usersMapped: UserAccount[] = cachedUsers.map(u => ({
    id: u.id,
    username: u.username,
    password: u.password,
    role: u.role,
    active: u.active === true || u.active === "TRUE",
    assignedProjects: Array.isArray(u.assignedProjects) 
      ? u.assignedProjects.map((p: any) => String(p).trim()).filter(Boolean)
      : (typeof u.assignedProjects === "string" && u.assignedProjects 
          ? u.assignedProjects.split(",").map((p: string) => p.trim()).filter(Boolean) 
          : [])
  }));

  // Fallback to localStorage for users to preserve assignedProjects across sessions
  const localUsersStr = localStorage.getItem("platform_users");
  if (localUsersStr) {
    try {
      const localUsers = JSON.parse(localUsersStr) as UserAccount[];
      if (usersMapped.length > 0) {
        usersMapped = usersMapped.map(u => {
          const match = localUsers.find(lu => lu.id === u.id || lu.username.toLowerCase() === u.username.toLowerCase());
          if (match) {
            return {
              ...u,
              assignedProjects: match.assignedProjects || u.assignedProjects || []
            };
          }
          return u;
        });
      } else {
        usersMapped = localUsers;
      }
    } catch (e) {
      console.error("Error loading local users fallback:", e);
    }
  }

  // Map advisors
  let advisorsMapped: string[] = cachedAdvisors.map(a => a.Nombre || a.nombre).filter(Boolean);
  const localAdvisorsStr = localStorage.getItem("platform_advisors");
  if (localAdvisorsStr) {
    try {
      const localAdvisors = JSON.parse(localAdvisorsStr) as string[];
      if (advisorsMapped.length > 0) {
        advisorsMapped = Array.from(new Set([...advisorsMapped, ...localAdvisors]));
      } else {
        advisorsMapped = localAdvisors;
      }
    } catch (e) {
      console.error("Error loading local advisors fallback:", e);
    }
  }
  if (advisorsMapped.length === 0) {
    advisorsMapped = [
      "ANABEL ALBINO", "SILVANA GODENZZI", "ROSMERY CENTURION", "DERVIS PIÑA", 
      "CARLOS TORRES", "MARIA FERNANDA CHACON", "IVAN SOTO", "CHRISTIAN BARRIENTOS", 
      "PAULA CASAS", "VICTOR SALAS", "MARITZA BRAVO", "EDUARDO BECERRA", 
      "LUIS MANUEL DE LOS RIOS", "ROY OTERO", "FARIHD JASAUI", "ALEJANDRA PEREZ CAMPOS"
    ];
  }

  // Map projects
  const projectsMapped: ProjectConfig[] = cachedProjects.map(p => {
    const team = cachedTeams.find(t => t.IdEquipo === p.IdEquipo);
    return {
      name: p.NombreProyecto,
      team: team ? team.NombreEquipo : (p.IdEquipo || ""),
      jefeVentas: team ? team.JefeVentas : ""
    };
  });

  // Map status color presets or fallback color mapping
  const statusColors: Record<string, string> = {};
  cachedStatuses.forEach(s => {
    // Map hex colors to Tailwind classes
    if (s.Color === "#FACC15" || s.Color === "yellow") {
      statusColors[s.NombreEstado] = "bg-amber-100 text-amber-800 border-amber-200";
    } else if (s.Color === "#3B82F6" || s.Color === "blue") {
      statusColors[s.NombreEstado] = "bg-blue-100 text-blue-800 border-blue-200";
    } else if (s.Color === "#10B981" || s.Color === "emerald" || s.Color === "green") {
      statusColors[s.NombreEstado] = "bg-emerald-100 text-emerald-800 border-emerald-200";
    } else if (s.Color === "#EF4444" || s.Color === "rose" || s.Color === "red") {
      statusColors[s.NombreEstado] = "bg-rose-100 text-rose-800 border-rose-200";
    } else {
      statusColors[s.NombreEstado] = "bg-slate-100 text-slate-800 border-slate-200";
    }
  });

  return {
    platformName: localPlatformName,
    platformLogo: localPlatformLogo,
    jefeLegalEnabled: localJefeLegalEnabled,
    sharedExcelLink: localSharedExcelLink,
    sheetsWebhookUrl: localWebhookUrl,
    tiposOperacion: cachedTypes.map(t => t.NombreTipo),
    statuses: cachedStatuses.length > 0 ? cachedStatuses.map(s => s.NombreEstado) : ["Pendiente de Firma", "En Revisión Técnica", "Aprobado para Emisión", "Observado / Rechazado", "Desistido", "Cierre Completo"],
    statusColors,
    proyectos: projectsMapped,
    users: usersMapped,
    kpiVisibility: localKpiVisibility,
    asesores: advisorsMapped
  };
}

export async function updateSettings(newSettings: Partial<AppSettings>, oldSettings: AppSettings): Promise<AppSettings> {
  // Update localStorage for local settings
  if (newSettings.platformName !== undefined) localStorage.setItem("platform_name", newSettings.platformName);
  if (newSettings.platformLogo !== undefined) localStorage.setItem("platform_logo", newSettings.platformLogo);
  if (newSettings.jefeLegalEnabled !== undefined) localStorage.setItem("jefe_legal_enabled", String(newSettings.jefeLegalEnabled));
  if (newSettings.sharedExcelLink !== undefined) localStorage.setItem("shared_excel_link", newSettings.sharedExcelLink);
  if (newSettings.sheetsWebhookUrl !== undefined) localStorage.setItem("sheets_webhook_url", newSettings.sheetsWebhookUrl);
  if (newSettings.kpiVisibility !== undefined) localStorage.setItem("kpi_visibility", JSON.stringify(newSettings.kpiVisibility));
  if (newSettings.asesores !== undefined) {
    localStorage.setItem("platform_advisors", JSON.stringify(newSettings.asesores));
    const oldAdvisors = oldSettings.asesores || [];
    const newAdvisors = newSettings.asesores || [];
    // Sync newly added advisors to GAS
    for (const name of newAdvisors) {
      if (!oldAdvisors.includes(name)) {
        await gasPost("saveAdvisor", {
          IdAsesor: `ASE${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          Nombre: name,
          IdEquipo: "EQ000001",
          Activo: true,
          FechaCreacion: getFormattedSystemDateTime()
        }).catch(e => console.error("Error creating advisor on sheet:", e));
      }
    }
    // Sync deleted advisors to GAS
    const deletedAdvisors = oldAdvisors.filter(name => !newAdvisors.includes(name));
    for (const name of deletedAdvisors) {
      const match = cachedAdvisors.find(ca => ca.Nombre === name);
      if (match) {
        await gasPost("deleteAdvisor", { IdAsesor: match.IdAsesor }).catch(e => {
          const msg = (e?.message || String(e)).toLowerCase();
          if (msg.includes("no encontrado") || msg.includes("not found")) {
            console.warn("Advisor already removed from Google Sheets:", name);
          } else {
            console.error("Error deleting advisor on sheet:", e);
          }
        });
      }
    }
  }

  // Sync users list if updated
  if (newSettings.users !== undefined) {
    localStorage.setItem("platform_users", JSON.stringify(newSettings.users));
    const oldUsers = oldSettings.users || [];
    const newUsers = newSettings.users || [];

    // Find deleted users
    const deletedUsers = oldUsers.filter(ou => !newUsers.some(nu => nu.id === ou.id));
    for (const u of deletedUsers) {
      await gasPost("deleteUser", { id: u.id }).catch(e => {
        const msg = (e?.message || String(e)).toLowerCase();
        if (msg.includes("no encontrado") || msg.includes("not found")) {
          console.warn("User already removed from Google Sheets:", u.username);
        } else {
          console.error("Error deleting user:", e);
        }
      });
    }

    // Find added or updated users
    for (const u of newUsers) {
      const oldUser = oldUsers.find(ou => ou.id === u.id);
      if (!oldUser) {
        // Create user
        await gasPost("saveUser", {
          id: u.id || `USR${Date.now()}`,
          username: u.username,
          password: u.password || "0000",
          role: u.role,
          active: u.active,
          assignedProjects: Array.isArray(u.assignedProjects) ? u.assignedProjects.join(",") : (u.assignedProjects || ""),
          nombre: u.username
        }).catch(e => console.error("Error creating user:", e));
      } else if (
        oldUser.username !== u.username ||
        oldUser.password !== u.password ||
        oldUser.role !== u.role ||
        oldUser.active !== u.active ||
        JSON.stringify(oldUser.assignedProjects) !== JSON.stringify(u.assignedProjects)
      ) {
        // Update user
        await gasPost("updateUser", {
          id: u.id,
          username: u.username,
          password: u.password,
          role: u.role,
          active: u.active,
          assignedProjects: Array.isArray(u.assignedProjects) ? u.assignedProjects.join(",") : (u.assignedProjects || ""),
          nombre: u.username
        }).catch(e => console.error("Error updating user:", e));
      }
    }
  }

  // Sync projects list if updated
  if (newSettings.proyectos !== undefined) {
    const oldProjects = oldSettings.proyectos || [];
    const newProjects = newSettings.proyectos || [];

    // Find deleted projects
    const deletedProjects = oldProjects.filter(op => !newProjects.some(np => np.name === op.name));
    for (const p of deletedProjects) {
      const match = cachedProjects.find(cp => cp.NombreProyecto === p.name);
      if (match) {
        await gasPost("deleteProject", { IdProyecto: match.IdProyecto }).catch(e => {
          const msg = (e?.message || String(e)).toLowerCase();
          if (msg.includes("no encontrado") || msg.includes("not found")) {
            console.warn("Project already removed from Google Sheets:", p.name);
          } else {
            console.error("Error deleting project:", e);
          }
        });
      }
    }

    // Find added or updated projects
    for (const p of newProjects) {
      const oldProj = oldProjects.find(op => op.name === p.name);
      const match = cachedProjects.find(cp => cp.NombreProyecto === p.name);

      if (!oldProj && !match) {
        // Create team first if it doesn't exist
        let teamId = "EQ000001"; // fallback
        const teamMatch = cachedTeams.find(ct => ct.NombreEquipo === p.team);
        if (!teamMatch) {
          const newTeam = await gasPost("saveTeam", {
            IdEquipo: `EQ${Date.now()}`,
            NombreEquipo: p.team,
            JefeVentas: p.jefeVentas || "ventas",
            Activo: true,
            FechaCreacion: getFormattedSystemDateTime()
          }).catch(() => null);
          if (newTeam) teamId = newTeam.IdEquipo;
        } else {
          teamId = teamMatch.IdEquipo;
        }

        // Create project
        await gasPost("saveProject", {
          IdProyecto: `PRO${Date.now()}`,
          NombreProyecto: p.name,
          IdEquipo: teamId,
          Activo: true,
          FechaCreacion: getFormattedSystemDateTime()
        }).catch(e => console.error("Error creating project:", e));
      }
    }
  }

  // Sync statuses list if updated
  if (newSettings.statuses !== undefined) {
    const oldStatuses = oldSettings.statuses || [];
    const newStatuses = newSettings.statuses || [];

    // Find deleted statuses
    const deletedStatuses = oldStatuses.filter(os => !newStatuses.some(ns => ns === os));
    for (const s of deletedStatuses) {
      const match = cachedStatuses.find(cs => cs.NombreEstado === s);
      if (match) {
        await gasPost("deleteStatus", { IdEstado: match.IdEstado }).catch(e => {
          const msg = (e?.message || String(e)).toLowerCase();
          if (msg.includes("no encontrado") || msg.includes("not found")) {
            console.warn("Status already removed from Google Sheets:", s);
          } else {
            console.error("Error deleting status:", e);
          }
        });
      }
    }

    // Find added statuses
    for (const s of newStatuses) {
      const oldStat = oldStatuses.find(os => os === s);
      const match = cachedStatuses.find(cs => cs.NombreEstado === s);
      if (!oldStat && !match) {
        await gasPost("saveStatus", {
          IdEstado: `EST${Date.now()}`,
          NombreEstado: s,
          Color: s.includes("Firma") ? "#FACC15" : s.includes("Revisión") ? "#3B82F6" : s.includes("Aprobado") ? "#10B981" : "#EF4444",
          Orden: 5,
          Activo: true
        }).catch(e => console.error("Error creating status:", e));
      }
    }
  }

  // Sync types of operation list if updated
  if (newSettings.tiposOperacion !== undefined) {
    const oldTypes = oldSettings.tiposOperacion || [];
    const newTypes = newSettings.tiposOperacion || [];

    // Find deleted types
    const deletedTypes = oldTypes.filter(ot => !newTypes.some(nt => nt === ot));
    for (const t of deletedTypes) {
      const match = cachedTypes.find(ct => ct.NombreTipo === t);
      if (match) {
        await gasPost("deleteType", { IdTipo: match.IdTipo }).catch(e => {
          const msg = (e?.message || String(e)).toLowerCase();
          if (msg.includes("no encontrado") || msg.includes("not found")) {
            console.warn("Type already removed from Google Sheets:", t);
          } else {
            console.error("Error deleting type:", e);
          }
        });
      }
    }

    // Find added types
    for (const t of newTypes) {
      const oldTy = oldTypes.find(ot => ot === t);
      const match = cachedTypes.find(ct => ct.NombreTipo === t);
      if (!oldTy && !match) {
        await gasPost("saveType", {
          IdTipo: `TIP${Date.now()}`,
          NombreTipo: t,
          Activo: true
        }).catch(e => console.error("Error creating type:", e));
      }
    }
  }

  await loadLookups();
  return getSettings();
}

// -------------------------------------------------------------
// CLIENT-SIDE EXCEL HANDLING
// -------------------------------------------------------------

export async function importExcel(fileBase64: string): Promise<{ success: boolean; count: number }> {
  try {
    const buffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
    const wb = XLSX.read(buffer, { type: "array" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws);

    await loadLookups();

    let count = 0;
    for (const row of rows as any[]) {
      const getVal = (keys: string[]) => {
        for (const k of keys) {
          if (row[k] !== undefined) return String(row[k]);
        }
        return "";
      };

      const proyectoName = getVal(["PROYECTO", "proyecto", "Proyecto", "Project"]);
      let teamName = getVal(["TEAM", "team", "Team", "Francisco", "Francisco/Jhazmin/Ninoska"]);
      
      // Auto-resolve team based on project name
      if (proyectoName) {
        const matchedProj = cachedProjects.find(p => p.NombreProyecto.toLowerCase() === proyectoName.toLowerCase());
        if (matchedProj) {
          const matchedTeam = cachedTeams.find(t => t.IdEquipo === matchedProj.IdEquipo);
          if (matchedTeam) teamName = matchedTeam.NombreEquipo;
        }
      }

      const newRecordData: Partial<OperationRecord> = {
        id: `rec-imported-${Date.now()}-${count}`,
        team: teamName,
        proyecto: proyectoName,
        dpto: getVal(["DPTO.", "DPTO", "dpto", "Dpto", "dpto."]),
        estac: getVal(["ESTAC.", "ESTAC", "estac", "Estac", "estac."]),
        dep: getVal(["DEP.", "DEP", "dep", "Dep", "dep."]),
        asesor: getVal(["ASESOR", "asesor", "Asesor", "Advisor"]),
        tipo: (getVal(["TIPO", "tipo", "Tipo"]).toUpperCase() || ""),
        solicitud: getVal(["SOLICITUD (Fecha y Hora)", "SOLICITUD (Fecha Y Hora)", "SOLICITUD", "solicitud", "Solicitud"]) || getFormattedSystemDateTime(),
        emision: getVal(["EMISION (Fecha y Hora)", "EMISION", "emision", "Emision", "emision."]),
        status: getVal(["STATUS", "status", "Status"]) || "Pendiente de Firma",
        comentario: getVal(["COMENTARIO", "comentario", "Comentario", "Comment"]),
        createdAt: new Date().toISOString()
      };

      await createRecord(newRecordData);
      count++;
    }

    return { success: true, count };
  } catch (err) {
    console.error("Excel Client Import Error:", err);
    throw err;
  }
}

export function exportExcel(records: OperationRecord[]) {
  const excelRows = records.map((r) => ({
    "TEAM": r.team,
    "PROYECTO": r.proyecto,
    "DPTO.": r.dpto,
    "ESTAC.": r.estac,
    "DEP.": r.dep,
    "ASESOR": r.asesor,
    "TIPO": r.tipo,
    "SOLICITUD (Fecha y Hora)": r.solicitud,
    "EMISION (Fecha y Hora)": r.emision,
    "STATUS": r.status,
    "COMENTARIO": r.comentario
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(excelRows);
  XLSX.utils.book_append_sheet(wb, ws, "OPERACIONES");
  
  // Write and trigger download in browser
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Excelencia_Operacional.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
