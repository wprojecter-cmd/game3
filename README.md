# GAME3 — Earth Explorer

Cross-platform Earth exploration prototype: CesiumJS web engine, Node/Express API, MongoDB user profiles, and an Expo WebView mobile shell (planned).

## Local development
1. Copy `.env.example` to `server/.env` and set `MONGODB_URI`, `JWT_SECRET`, `OPENWEATHER_API_KEY`, and `CESIUM_ION_TOKEN`.
2. For the browser client, set `VITE_CESIUM_ION_TOKEN` in `client/.env.local`. Restrict this public Cesium token to your development and production domains in Cesium ion.
3. Run `npm install`, then `npm run dev` from the repository root.

## Render Web Service
- Runtime: Node
- Build: `npm install && npm run build -w client`
- Start: `npm start -w server`
- Health check: `/api/health`
- Environment: `MONGODB_URI`, `JWT_SECRET`, `CESIUM_ION_TOKEN`, `OPENWEATHER_API_KEY`, optional `CORS_ORIGIN`.

## Current prototype boundaries
The account system and profile settings are persisted in MongoDB. Cesium loads the global terrain and imagery when a restricted Ion token is configured. The weather endpoint currently returns point weather, not global raster overlays. Country borders, ground-level first-person movement, player/drone 3D assets, drone physics, collision/explosion effects, and native Android packaging are subsequent milestones.
