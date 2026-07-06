var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_vite = require("vite");
var XLSX = __toESM(require("xlsx"), 1);
var app = (0, import_express.default)();
var PORT = 3e3;
var DATA_FILE = import_path.default.join(process.cwd(), "data_records.json");
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
function readDb() {
  try {
    const defaultSettings = {
      platformName: "Excelencia Operacional",
      jefeLegalEnabled: true,
      sharedExcelLink: "https://docs.google.com/spreadsheets/d/1example-link-to-shared-excel/edit",
      sheetsWebhookUrl: "",
      tiposOperacion: ["EMISION", "MODIFICACION", "ADENDA"],
      statuses: ["Pendiente de Firma", "En Revisi\xF3n T\xE9cnica", "Aprobado para Emisi\xF3n", "Observado / Rechazado"],
      proyectos: [
        { name: "Liv 360", team: "FRANCISCO" },
        { name: "Santo Toribio", team: "JHAZMIN" },
        { name: "Open Marsano", team: "NINOSKA" }
      ],
      users: [
        { id: "u-1", username: "admin", password: "admin123", role: "Administrador", active: true, assignedProjects: [] },
        { id: "u-2", username: "ventas", password: "ventas123", role: "Jefe de Ventas", active: true, assignedProjects: [] },
        { id: "u-3", username: "legal", password: "legal123", role: "Jefe Legal", active: true, assignedProjects: [] },
        { id: "u-4", username: "asistente1", password: "", role: "Asistente Legal", active: true, assignedProjects: ["Liv 360", "Santo Toribio"] },
        { id: "u-5", username: "asistente2", password: "asis123", role: "Asistente Legal", active: true, assignedProjects: ["Open Marsano"] }
      ],
      kpiVisibility: {
        "Administrador": true,
        "Jefe de Ventas": false,
        "Jefe Legal": true,
        "Asistente Legal": false
      }
    };
    if (!import_fs.default.existsSync(DATA_FILE)) {
      const initialData = {
        settings: defaultSettings,
        records: [
          {
            id: "rec-1",
            team: "FRANCISCO",
            proyecto: "Liv 360",
            dpto: "102",
            estac: "E-12",
            dep: "D-05",
            asesor: "ROSMERY CENTURION",
            tipo: "MODIFICACION",
            solicitud: "2026-06-28 09:30",
            solicitudAt: new Date(Date.now() - 24 * 3600 * 1e3).toISOString(),
            emision: "2026-06-28 11:15",
            emittedAt: new Date(Date.now() - 23 * 3600 * 1e3).toISOString(),
            status: "Aprobado para Emisi\xF3n",
            comentario: "Revisado por el equipo legal y aprobado.",
            createdAt: new Date(Date.now() - 25 * 3600 * 1e3).toISOString()
          },
          {
            id: "rec-2",
            team: "JHAZMIN",
            proyecto: "Santo Toribio",
            dpto: "305",
            estac: "",
            dep: "",
            asesor: "ANABEL ALBINO",
            tipo: "EMISION",
            solicitud: "2026-06-28 10:15",
            solicitudAt: new Date(Date.now() - 10 * 3600 * 1e3).toISOString(),
            emision: "",
            status: "Pendiente de Firma",
            comentario: "En espera de firma del cliente.",
            createdAt: new Date(Date.now() - 12 * 3600 * 1e3).toISOString()
          },
          {
            id: "rec-3",
            team: "NINOSKA",
            proyecto: "Open Marsano",
            dpto: "1204",
            estac: "E-40",
            dep: "D-18",
            asesor: "SILVANA GODENZZI",
            tipo: "ADENDA",
            solicitud: "2026-06-27 15:45",
            solicitudAt: new Date(Date.now() - 48 * 3600 * 1e3).toISOString(),
            emision: "2026-06-28 08:30",
            emittedAt: new Date(Date.now() - 40 * 3600 * 1e3).toISOString(),
            status: "Observado / Rechazado",
            comentario: "Falta firma en el anexo de estacionamiento.",
            createdAt: new Date(Date.now() - 50 * 3600 * 1e3).toISOString()
          }
        ]
      };
      import_fs.default.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const raw = import_fs.default.readFileSync(DATA_FILE, "utf-8");
    const db = JSON.parse(raw);
    let migrated = false;
    if (!db.settings) {
      db.settings = defaultSettings;
      migrated = true;
    } else {
      if (db.settings.jefeLegalEnabled === void 0) {
        db.settings.jefeLegalEnabled = true;
        migrated = true;
      }
      if (!db.settings.platformName) {
        db.settings.platformName = "Excelencia Operacional";
        migrated = true;
      }
      if (!db.settings.tiposOperacion) {
        db.settings.tiposOperacion = defaultSettings.tiposOperacion;
        migrated = true;
      }
      if (!db.settings.statuses) {
        db.settings.statuses = defaultSettings.statuses;
        migrated = true;
      }
      if (!db.settings.proyectos) {
        db.settings.proyectos = defaultSettings.proyectos;
        migrated = true;
      }
      if (!db.settings.users) {
        db.settings.users = defaultSettings.users;
        migrated = true;
      }
      if (!db.settings.kpiVisibility) {
        db.settings.kpiVisibility = defaultSettings.kpiVisibility;
        migrated = true;
      }
    }
    if (!db.records) {
      db.records = [];
      migrated = true;
    }
    if (migrated) {
      import_fs.default.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    }
    return db;
  } catch (err) {
    console.error("Error reading DB file:", err);
    return {
      settings: {
        platformName: "Excelencia Operacional",
        jefeLegalEnabled: true,
        sharedExcelLink: "",
        sheetsWebhookUrl: "",
        tiposOperacion: ["EMISION", "MODIFICACION", "ADENDA"],
        statuses: ["Pendiente de Firma", "En Revisi\xF3n T\xE9cnica", "Aprobado para Emisi\xF3n", "Observado / Rechazado"],
        statusColors: {
          "Pendiente de Firma": "bg-amber-100 text-amber-800 border-amber-200",
          "En Revisi\xF3n T\xE9cnica": "bg-blue-100 text-blue-800 border-blue-200",
          "Aprobado para Emisi\xF3n": "bg-emerald-100 text-emerald-800 border-emerald-200",
          "Observado / Rechazado": "bg-rose-100 text-rose-800 border-rose-200"
        },
        proyectos: [
          { name: "Liv 360", team: "FRANCISCO", jefeVentas: "ventas" },
          { name: "Santo Toribio", team: "JHAZMIN", jefeVentas: "ventas" },
          { name: "Open Marsano", team: "NINOSKA", jefeVentas: "ventas" }
        ],
        users: [
          { id: "u-1", username: "admin", password: "1506", role: "Administrador", active: true, assignedProjects: [] },
          { id: "u-2", username: "ventas", password: "0000", role: "Jefe de Ventas", active: true, assignedProjects: [] },
          { id: "u-3", username: "legal", password: "0000", role: "Jefe Legal", active: true, assignedProjects: [] },
          { id: "u-4", username: "asistente1", password: "", role: "Asistente Legal", active: true, assignedProjects: ["Liv 360", "Santo Toribio"] },
          { id: "u-5", username: "asistente2", password: "", role: "Asistente Legal", active: true, assignedProjects: ["Open Marsano"] }
        ],
        kpiVisibility: {
          "Administrador": true,
          "Jefe de Ventas": false,
          "Jefe Legal": true,
          "Asistente Legal": false
        }
      },
      records: []
    };
  }
}
function writeDb(data) {
  try {
    import_fs.default.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing DB file:", err);
  }
}
async function triggerSheetsWebhook(record, action, settings) {
  if (!settings.sheetsWebhookUrl) return;
  try {
    const payload = {
      action,
      record: {
        TEAM: record.team,
        PROYECTO: record.proyecto,
        DPTO: record.dpto,
        ESTAC: record.estac,
        DEP: record.dep,
        ASESOR: record.asesor,
        TIPO: record.tipo,
        SOLICITUD: record.solicitud,
        EMISION: record.emision,
        STATUS: record.status,
        COMENTARIO: record.comentario,
        id: record.id
      }
    };
    await fetch(settings.sheetsWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch((e) => console.error("Webhook fetch failed:", e));
  } catch (e) {
    console.error("Error triggering sheets webhook:", e);
  }
}
function getFormattedSystemDateTime() {
  const now = /* @__PURE__ */ new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}
app.get("/api/records", (req, res) => {
  const db = readDb();
  res.json(db.records);
});
app.post("/api/records", async (req, res) => {
  const db = readDb();
  let team = req.body.team || "";
  const proyectoName = req.body.proyecto || "";
  if (proyectoName && db.settings.proyectos) {
    const matched = db.settings.proyectos.find((p) => p.name.toLowerCase() === proyectoName.toLowerCase());
    if (matched) {
      team = matched.team;
    }
  }
  let derivadoA = req.body.derivadoA;
  if (!derivadoA && proyectoName && db.settings.users) {
    const assistants = db.settings.users.filter(
      (u) => u.role === "Asistente Legal" && u.active && u.assignedProjects && u.assignedProjects.some((p) => p.toLowerCase() === proyectoName.toLowerCase())
    );
    if (assistants.length > 0) {
      derivadoA = assistants[0].username;
    }
  }
  let solicitud = req.body.solicitud;
  let solicitudAt = req.body.solicitudAt;
  if (!solicitud && req.body.tipo) {
    solicitud = getFormattedSystemDateTime();
    solicitudAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  const newRecord = {
    id: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    team,
    proyecto: proyectoName,
    dpto: req.body.dpto || "",
    estac: req.body.estac || "",
    dep: req.body.dep || "",
    asesor: req.body.asesor || "",
    tipo: req.body.tipo || "",
    solicitud: solicitud || "",
    solicitudAt: solicitudAt || (solicitud ? (/* @__PURE__ */ new Date()).toISOString() : void 0),
    emision: req.body.emision || "",
    emittedAt: req.body.emittedAt || (req.body.emision ? (/* @__PURE__ */ new Date()).toISOString() : void 0),
    status: req.body.status || "",
    comentario: req.body.comentario || "",
    derivadoA,
    history: req.body.status ? [{
      status: req.body.status,
      comentario: req.body.comentario || "Registro inicial.",
      timestamp: getFormattedSystemDateTime(),
      user: req.body.updatedByUser || "Sistema"
    }] : [],
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.records.unshift(newRecord);
  writeDb(db);
  await triggerSheetsWebhook(newRecord, "INSERT", db.settings);
  res.status(201).json(newRecord);
});
app.put("/api/records/:id", async (req, res) => {
  const db = readDb();
  const index = db.records.findIndex((r) => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Record not found" });
  }
  let team = req.body.team || db.records[index].team;
  const proyectoName = req.body.proyecto || db.records[index].proyecto;
  if (proyectoName && db.settings.proyectos) {
    const matched = db.settings.proyectos.find((p) => p.name.toLowerCase() === proyectoName.toLowerCase());
    if (matched) {
      team = matched.team;
    }
  }
  let derivadoA = req.body.derivadoA !== void 0 ? req.body.derivadoA : db.records[index].derivadoA;
  if (!derivadoA && proyectoName && db.settings.users) {
    const assistants = db.settings.users.filter(
      (u) => u.role === "Asistente Legal" && u.active && u.assignedProjects && u.assignedProjects.some((p) => p.toLowerCase() === proyectoName.toLowerCase())
    );
    if (assistants.length > 0) {
      derivadoA = assistants[0].username;
    }
  }
  let solicitud = req.body.solicitud || db.records[index].solicitud;
  let solicitudAt = req.body.solicitudAt || db.records[index].solicitudAt;
  if (req.body.tipo && !db.records[index].tipo && !solicitud) {
    solicitud = getFormattedSystemDateTime();
    solicitudAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  let emision = req.body.emision || db.records[index].emision;
  let emittedAt = req.body.emittedAt || db.records[index].emittedAt;
  const statusChanged = req.body.status !== void 0 && req.body.status !== db.records[index].status;
  const commentChanged = req.body.comentario !== void 0 && req.body.comentario !== db.records[index].comentario;
  if (statusChanged || commentChanged) {
    emision = getFormattedSystemDateTime();
    emittedAt = (/* @__PURE__ */ new Date()).toISOString();
  }
  let history = db.records[index].history || [];
  if (statusChanged || commentChanged) {
    const historyEntry = {
      status: req.body.status !== void 0 ? req.body.status : db.records[index].status || "Pendiente",
      comentario: req.body.comentario !== void 0 ? req.body.comentario : db.records[index].comentario || "",
      timestamp: getFormattedSystemDateTime(),
      user: req.body.updatedByUser || "Usuario"
    };
    history = [...history, historyEntry];
  }
  const updated = {
    ...db.records[index],
    ...req.body,
    team,
    derivadoA,
    solicitud,
    solicitudAt,
    emision,
    emittedAt,
    history,
    id: db.records[index].id
    // Ensure ID doesn't change
  };
  db.records[index] = updated;
  writeDb(db);
  await triggerSheetsWebhook(updated, "UPDATE", db.settings);
  res.json(updated);
});
app.delete("/api/records/:id", async (req, res) => {
  const db = readDb();
  const index = db.records.findIndex(
    (r) => r.id === req.params.id
  );
  if (index === -1) {
    return res.status(404).json({
      error: "Record not found"
    });
  }
  const deleted = db.records.splice(index, 1)[0];
  writeDb(db);
  await triggerSheetsWebhook(
    deleted,
    "DELETE",
    db.settings
  );
  res.json({
    success: true,
    deletedId: req.params.id
  });
});
app.delete("/api/records/:id", async (req, res) => {
  const db = readDb();
  const index = db.records.findIndex((r) => r.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      error: "Record not found"
    });
  }
  const deleted = db.records.splice(index, 1)[0];
  writeDb(db);
  await triggerSheetsWebhook(deleted, "DELETE", db.settings);
  res.json({
    success: true,
    deletedId: req.params.id
  });
});
app.get("/api/settings", (req, res) => {
  const db = readDb();
  res.json(db.settings);
});
app.put("/api/settings", (req, res) => {
  const db = readDb();
  db.settings = {
    ...db.settings,
    ...req.body
  };
  writeDb(db);
  res.json(db.settings);
});
app.get("/api/export-excel", (req, res) => {
  const db = readDb();
  const excelRows = db.records.map((r) => ({
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
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", "attachment; filename=Excelencia_Operacional.xlsx");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});
app.post("/api/import-excel", (req, res) => {
  try {
    const { fileData } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: "Missing fileData (base64 string)" });
    }
    const buffer = Buffer.from(fileData, "base64");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws);
    const db = readDb();
    const importedRecords = rows.map((row, i) => {
      const getVal = (keys) => {
        for (const k of keys) {
          if (row[k] !== void 0) return String(row[k]);
        }
        return "";
      };
      const proyectoName = getVal(["PROYECTO", "proyecto", "Proyecto", "Project"]);
      let team = getVal(["TEAM", "team", "Team", "Francisco", "Francisco/Jhazmin/Ninoska"]);
      if (proyectoName && db.settings.proyectos) {
        const matched = db.settings.proyectos.find((p) => p.name.toLowerCase() === proyectoName.toLowerCase());
        if (matched) {
          team = matched.team;
        }
      }
      return {
        id: `rec-imported-${Date.now()}-${i}`,
        team,
        proyecto: proyectoName,
        dpto: getVal(["DPTO.", "DPTO", "dpto", "Dpto", "dpto."]),
        estac: getVal(["ESTAC.", "ESTAC", "estac", "Estac", "estac."]),
        dep: getVal(["DEP.", "DEP", "dep", "Dep", "dep."]),
        asesor: getVal(["ASESOR", "asesor", "Asesor", "Advisor"]),
        tipo: getVal(["TIPO", "tipo", "Tipo"]).toUpperCase() || "",
        solicitud: getVal(["SOLICITUD (Fecha y Hora)", "SOLICITUD (Fecha Y Hora)", "SOLICITUD", "solicitud", "Solicitud"]),
        solicitudAt: (/* @__PURE__ */ new Date()).toISOString(),
        emision: getVal(["EMISION (Fecha y Hora)", "EMISION", "emision", "Emision", "emision."]),
        emittedAt: getVal(["EMISION (Fecha y Hora)", "EMISION", "emision", "Emision"]) ? (/* @__PURE__ */ new Date()).toISOString() : void 0,
        status: getVal(["STATUS", "status", "Status"]),
        comentario: getVal(["COMENTARIO", "comentario", "Comentario", "Comment"]),
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    if (importedRecords.length === 0) {
      return res.status(400).json({ error: "No valid rows found in sheet." });
    }
    db.records = [...importedRecords, ...db.records];
    writeDb(db);
    res.json({ success: true, count: importedRecords.length });
  } catch (error) {
    console.error("Excel import error:", error);
    res.status(500).json({ error: "Failed to parse excel file: " + error.message });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    let distPath = import_path.default.join(process.cwd(), "dist");
    if (!import_fs.default.existsSync(import_path.default.join(distPath, "index.html"))) {
      distPath = import_path.default.join(__dirname);
    }
    if (!import_fs.default.existsSync(import_path.default.join(distPath, "index.html"))) {
      distPath = import_path.default.join(__dirname, "../dist");
    }
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
