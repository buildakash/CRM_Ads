// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";

import { getDb } from "./db.js";
import authRoutes from "./routes/auth.routes.js";
import googleAdsRoutes from "./routes/googleAds.routes.js";

const app = express();

/* ---------- DB ---------- */
const db = await getDb();
app.set("db", db);

/* ---------- Middleware ---------- */
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

/* ---------- Health checks ---------- */
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/health/db", async (_req, res) => {
  try {
    const [rows] = await app.get("db").query("SELECT 1 AS ok;");
    return res.json({ ok: rows?.[0]?.ok === 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
// in src/app.js, after the health routes
app.get("/health/db/whoami", async (_req, res) => {
  try {
    const [r] = await app.get("db").query("SELECT CURRENT_USER() AS user, DATABASE() AS db;");
    res.json(r[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- Root ---------- */
app.get("/", (_req, res) =>
  res.send("Auth ready. Go to /auth/google/start")
);

/* ---------- Routes ---------- */
app.use("/auth", authRoutes);
app.use("/ads/google", googleAdsRoutes);

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

/* ---------- Error handler ---------- */
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
