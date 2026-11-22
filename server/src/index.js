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
app.get("/api/config", (_req, res) => res.json({ cesiumIonToken: process.env.CESIUM_ION_TOKEN || "" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), authRoutes);
app.use("/api/profile", profileRoutes);
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "game3-api", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

const weatherTileNames = new Set(["temp_new", "pressure_new", "precipitation_new", "wind_new", "clouds_new"]);
app.get("/api/weather/tiles/:layer/:z/:x/:y.png", async (req, res) => {
  const { layer, z, x, y } = req.params;
  if (!weatherTileNames.has(layer)) return res.status(400).json({ error: "Unsupported weather layer." });
  const coords = [z, x, y].map(Number);
  if (!coords.every(Number.isInteger) || coords[0] < 0 || coords[0] > 19 || coords[1] < 0 || coords[2] < 0 || coords[1] >= 2 ** coords[0] || coords[2] >= 2 ** coords[0]) {
    return res.status(400).json({ error: "Invalid tile coordinates." });
  }
  if (!process.env.OPENWEATHER_API_KEY) return res.status(503).json({ error: "OPENWEATHER_API_KEY is not configured." });
  try {
    const tileUrl = new URL(`https://tile.openweathermap.org/map/${layer}/${z}/${x}/${y}.png`);
    tileUrl.searchParams.set("appid", process.env.OPENWEATHER_API_KEY);
    const upstream = await fetch(tileUrl, { signal: AbortSignal.timeout(12000) });
    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("OpenWeather tile error:", upstream.status, detail.slice(0, 300));
      return res.status(upstream.status).json({ error: "OpenWeather tile request failed.", providerStatus: upstream.status });
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.set({
      "Content-Type": upstream.headers.get("content-type") || "image/png",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*"
    });
    res.send(bytes);
  } catch (error) {
    console.error("OpenWeather tile proxy error:", error.message);
    res.status(502).json({ error: "Weather tile provider unavailable." });
  }
});

app.get("/api/weather", async (req, res) => {
  const { lat, lon, mode } = req.query;
  if (!process.env.OPENWEATHER_API_KEY) return res.status(503).json({ error: "Weather service is not configured." });
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return res.status(400).json({ error: "Valid lat and lon are required." });
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
