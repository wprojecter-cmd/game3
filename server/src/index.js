import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));
app.use(express.json({ limit: "32kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), authRoutes);
app.use("/api/profile", profileRoutes);
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "game3-api", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

// OpenWeather is proxied so the secret API key is never shipped in the client bundle.
app.get("/api/weather", async (req, res) => {
  const { lat, lon, mode } = req.query;
  if (!process.env.OPENWEATHER_API_KEY) return res.status(503).json({ error: "Weather service is not configured." });
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return res.status(400).json({ error: "Valid lat and lon are required." });
  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.search = new URLSearchParams({ lat, lon, appid: process.env.OPENWEATHER_API_KEY, units: "metric" });
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || "Weather request failed." });
    res.json({ ...data, requestedLayer: mode || "temperature" });
  } catch { res.status(502).json({ error: "Weather provider unavailable." }); }
});

const webRoot = path.resolve(__dirname, "../../client/dist");
app.use(express.static(webRoot));
app.get("*", (req, res, next) => req.path.startsWith("/api/") ? next() : res.sendFile(path.join(webRoot, "index.html")));
const port = Number(process.env.PORT || 10000);
try {
  if (process.env.MONGODB_URI) await mongoose.connect(process.env.MONGODB_URI);
  else console.warn("MONGODB_URI is missing; API health will report database disconnected.");
  app.listen(port, "0.0.0.0", () => console.log(`Game3 listening on ${port}`));
} catch (error) {
  console.error("MongoDB connection failed:", error.message);
  process.exit(1);
}
