# AiForge — Product Requirements

## Overview
AiForge is a cyberpunk-themed Android (Expo SDK 54) mobile app for AI-powered creation. Users generate images, videos, 3D-style renders, mesh/SCAD code, and chat with an AI assistant — all from a single unified UI inspired by the user's reference at `fierce-forge-ai-lab.base44.app`.

## Tech Stack
- **Frontend**: Expo Router + React Native + react-native-reanimated + lucide-react-native + expo-linear-gradient + expo-blur + react-native-webview + expo-haptics
- **Backend**: FastAPI + Motor (MongoDB) + JWT auth + emergentintegrations (LLM + Stripe)
- **AI models** (all via `EMERGENT_LLM_KEY`)
  - Image / 3D render: **Gemini Nano Banana** (`gemini-3.1-flash-image-preview`)
  - Video: **Sora 2** (async, returns base64 mp4)
  - Chat / SCAD: **Claude Sonnet 4.6**
- **Payments**: Stripe via emergentintegrations (test mode, `sk_test_emergent`)

## Core Features
1. **Auth** — JWT email/password (bcrypt) + Emergent Google OAuth session exchange
2. **Generation** — `/api/generate` (image, video, model3d) + `/api/generate/scad` + `/api/chat`
3. **Library** — list / filter / get / delete creations, daily stats
4. **Plans (5 tiers)** —
   - Free $0 / 5 per day
   - Spark $4.99 / 30 per day
   - Forge $9.99 / 100 per day
   - Neon Pro $19.99 / 500 per day
   - Quantum $39.99 / unlimited
5. **Usage meters** — `daily_used / daily_limit` enforced server-side, returns 402 over limit
6. **Stripe** — `/api/checkout/create` returns Stripe URL, `/api/checkout/status/{id}` and webhook handler upgrade plan

## Screens (Expo Router)
- `app/index.tsx` — auth gate
- `app/(auth)/login.tsx`, `register.tsx`
- `app/(tabs)/index.tsx` — Home (welcome, usage bar, 3 category cards, recent creations)
- `app/(tabs)/create.tsx` — type selector × 5, prompt, idea chips, video duration picker, Forge It CTA
- `app/(tabs)/library.tsx` — filter chips + grid
- `app/(tabs)/plans.tsx` — 5 plan cards with upgrade buttons
- `app/(tabs)/profile.tsx` — user, plan badge, usage stats, sign out
- `app/creation/[id].tsx` — detail with WebView video player + Trim editor (CapCut-style)
- `app/payment/success.tsx` — Stripe callback

## Visual Design
- Deep cyberpunk galaxy: `#020208` base, neon **cyan #00F0FF**, **green #00FF66**, **purple #B026FF**, **red #FF2D55**
- Animated starfield + shooting stars (Reanimated)
- Ghostly AiForge logo fades in the background on every screen
- Logo is a pulsing gradient-glow stylized starburst (matches user-provided logo screenshots)
- Gradient pill buttons, glassmorphic cards, neon edges, haptic press scale animations

## Android / Play Store readiness
- `app.json`: `package: com.aiforge.app`, dark theme, edge-to-edge, adaptive icon, scheme `aiforge`
- Permissions: `INTERNET` only (no sensitive ones requested in MVP)

## Test credentials
See `/app/memory/test_credentials.md`.

## Known limitations
- Sora 2 video generation runs as a background task and can take up to ~5 min; UI shows "Forging..." state and polls
- 3D-style outputs are rendered images via Nano Banana with isometric prompts (real STL geometry is exported only via SCAD code generation)
- "Multi-AI" today means: Claude (text/SCAD/chat), Gemini (image/3D), Sora 2 (video). Future: add Anthropic vision + GPT image-1 fallback.
