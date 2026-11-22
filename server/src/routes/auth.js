import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = Router();
const makeToken = (user) => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

router.post("/register", async (req, res) => {
  try {
    const nickname = String(req.body.nickname || "").trim();
    const password = String(req.body.password || "");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(nickname))
      return res.status(400).json({ error: "Nickname must be 3–20 characters (letters, numbers, underscore)." });
    if (password.length < 8 || password.length > 128)
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (await User.exists({ nickname: new RegExp("^" + nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") }))
      return res.status(409).json({ error: "This nickname is already taken." });
    const user = await User.create({ nickname, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: makeToken(user), user: { id: user.id, nickname, settings: user.settings } });
  } catch (e) { res.status(500).json({ error: "Registration failed." }); }
});

router.post("/login", async (req, res) => {
  const nickname = String(req.body.nickname || "").trim();
  const user = await User.findOne({ nickname: new RegExp("^" + nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") });
  if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash)))
    return res.status(401).json({ error: "Incorrect nickname or password." });
  res.json({ token: makeToken(user), user: { id: user.id, nickname: user.nickname, settings: user.settings } });
});
export default router;
