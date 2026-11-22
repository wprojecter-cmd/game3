import { Router } from "express";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
router.get("/me", async (req, res) => {
  const user = await User.findById(req.userId).select("nickname settings");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ id: user.id, nickname: user.nickname, settings: user.settings });
});
router.put("/settings", async (req, res) => {
  const allowed = ["imagery", "terrain", "weather", "weatherOpacity", "weatherSaturation", "borders", "gameTime"];
  const patch = {};
  for (const key of allowed) if (req.body[key] !== undefined) patch["settings." + key] = req.body[key];
  if (patch["settings.weatherOpacity"] !== undefined) patch["settings.weatherOpacity"] = Math.min(1, Math.max(0, Number(patch["settings.weatherOpacity"])));
  if (patch["settings.weatherSaturation"] !== undefined) patch["settings.weatherSaturation"] = Math.min(2, Math.max(0, Number(patch["settings.weatherSaturation"])));
  const user = await User.findByIdAndUpdate(req.userId, { $set: patch }, { new: true, runValidators: true }).select("nickname settings");
  res.json({ settings: user.settings });
});
export default router;
