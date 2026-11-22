import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema({
  imagery: { type: String, default: "satellite" },
  terrain: { type: String, default: "cesium-world-terrain" },
  weather: { type: String, default: "none" },
  weatherOpacity: { type: Number, default: 0.65, min: 0, max: 1 },
  weatherSaturation: { type: Number, default: 1, min: 0, max: 2 },
  borders: { type: Boolean, default: true },
  gameTime: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  nickname: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  passwordHash: { type: String, required: true },
  settings: { type: settingsSchema, default: () => ({}) }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
