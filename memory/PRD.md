# AiForge — Product Requirements (v2)

## Overview
AiForge is a cyberpunk-themed Android-ready Expo mobile app for AI-powered creation. Users generate images, videos, 3D-style renders, mesh/SCAD code, and chat with a real multi-turn AI assistant — all from a unified, animated UI inspired by the user's reference at `fierce-forge-ai-lab.base44.app`.

## Tech Stack
- **Frontend**: Expo Router (SDK 54) + React Native + react-native-reanimated + lucide-react-native + expo-linear-gradient + expo-blur + react-native-webview + expo-haptics + expo-video
- **Backend**: FastAPI + Motor (MongoDB) + JWT (bcrypt) + emergentintegrations (LLM + Stripe)
- **AI models** (all via `EMERGENT_LLM_KEY`)
  - Image / 3D render / SCAD preview: **Gemini Nano Banana** (`gemini-3.1-flash-image-preview`)
  - Video: **Sora 2** (async, returns base64 mp4)
  - Chat / SCAD code: **Claude Sonnet 4.6** (now with persistent multi-turn history in MongoDB)
- **Payments**: Stripe via emergentintegrations (test mode)

## Auth
- Email + password only (JWT, bcrypt). Google OAuth endpoint exists on backend but is **not** exposed in the UI per latest user spec.

## Core Features
1. **Generation** — `/api/generate` (image, video, model3d) + `/api/generate/scad` (code **and** PNG preview) + `/api/chat` (multi-turn)
2. **Library** — list / filter / get / delete creations
3. **Plans (6 tiers)** —
   - **Free** $0 / 5 per day
   - **Spark** $9.99 / 50 per day
   - **Forge** $29.99 / 200 per day (POPULAR)
   - **Neon Pro** $49.99 / 500 per day
   - **Quantum** $99.99 / 2000 per day
   - **Singularity** $199.99 / unlimited
4. **Usage meters** — `daily_used / daily_limit` enforced server-side (402 over limit)
5. **Stripe** — Checkout for all 5 paid tiers (now including quantum + singularity), webhook upgrades the user plan
6. **Multi-turn AI Assistant** — `/api/chat` persists per-session messages in MongoDB and replays them as primer context every call so the LLM remembers prior turns

## Screens
- `(auth)/login` — email + password only (no Google)
- `(auth)/register`
- `(tabs)/index` — Home with welcome, usage meter, 3 category cards, recent creations
- `(tabs)/create` — Type selector (Image / Video / 3D Render / Mesh-SCAD / AI Assist). AI Assist opens a real chat panel with bubbles, avatars, idea chips.
- `(tabs)/library` — Filter chips + creation grid
- `(tabs)/plans` — 6 plan cards with Upgrade buttons
- `(tabs)/profile` — Avatar + plan badge + usage stats + Sign Out
- `creation/[id]` — Detail view with media:
  - Images: full-bleed render
  - Videos: WebView player + draggable CapCut-style trim editor (0-60s)
  - SCAD: tabbed Preview (PNG via Nano Banana) | Code (Claude-generated OpenSCAD)
  - Chat: scrollable text
- `payment/success` — Stripe callback

## Visual Design
- Deep cyberpunk galaxy: `#020208` base + neon **cyan / green / purple / red** gradients
- Animated starfield with shooting stars
- **Ghostly background AiForge logo** (the actual anvil + circuit-brain PNG provided by the user) breathing in opacity (0.04 → 0.16) with a quick double heart-beat pulse on scale every ~3.5 s
- **Pulsing top-bar logo** (gradient sparkle box) on every screen
- Gradient pill buttons, glassmorphic cards, neon edges
- **Haptic press-scale** on every interactive surface via `PressableScale`

## Android / Play Store readiness
- `app.json`: `package: com.aiforge.app`, dark theme, edge-to-edge, adaptive icon, scheme `aiforge`
- Permissions: `INTERNET` only

## Test status (final)
- Backend pytest: **28/28 PASS** (iteration 3) — auth, generation, multi-turn chat continuity, SCAD preview, all 6 plans, Stripe checkout for every paid tier, usage limits, etc.
- Frontend visually verified end-to-end on mobile viewport: login → home → create (5 types incl. multi-turn AI Assist) → library → plans → profile → creation detail (images / videos / SCAD).
- Known cosmetic warnings: RN-web deprecation messages (`shadow*` and `props.pointerEvents`) — non-functional, console-only.

## Test credentials
See `/app/memory/test_credentials.md`.
