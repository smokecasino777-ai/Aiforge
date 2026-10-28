#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  CURRENT RELEASE SCOPE: User requests fixing AiForge for Google Play AAB,
  current Play Billing standards, and review of uploaded Play Console PDF.
  Historical sections below describe older work, not current payment flow.
  Native app uses RevenueCat 10.15.1 / Play Billing 8.3.0; no Stripe checkout.

backend:
  - task: "Admin Stripe-key endpoints (GET/POST/DELETE + /admin/me)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Added /api/admin/me, GET/POST/DELETE /api/admin/stripe-key.
            Validates new key against https://api.stripe.com/v1/balance, persists
            to backend/.env atomically (KEY=VALUE), and hot-swaps RUNTIME so
            all subsequent StripeCheckout calls use the new key without a restart.
            Admin = email matches ADMIN_EMAIL env, or oldest user (auto-promoted
            once if no admin exists). Verified curl: invalid key rejected with
            Stripe error message; /admin/me returns is_admin:true for demo user.
  - task: "Hot-swap STRIPE_API_KEY (no restart)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Replaced all hard references to STRIPE_API_KEY in checkout/create,
            checkout/status, webhook with current_stripe_key() reading from a
            single RUNTIME dict updated by the admin endpoint.
  - task: "Revert revoked live Stripe key back to sandbox (cleanup)"
    implemented: true
    working: true
    file: "/app/backend/.env"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            The sk_live_… key from the prior session was confirmed dead by
            Stripe ("Invalid API Key provided"). Reverted to sk_test_emergent so
            the app keeps functioning; the user can now rotate a fresh live key
            in-app via /admin/secrets.

frontend:
  - task: "Replace deprecated shadow* props with boxShadow"
    implemented: true
    working: true
    file: "src/components/*.tsx, app/(tabs)/*.tsx, app/creation/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Converted CreationCard, GradientButton, StarryBackground, Logo,
            tabs/_layout, tabs/plans, tabs/create, creation/[id]. Logo wraps
            the animated halo in a Platform.OS===web branch to keep native
            shadow* (still valid on iOS). After log-clear the warning count is
            zero on fresh page loads.
  - task: "Onboarding tutorial slideshow"
    implemented: true
    working: true
    file: "/app/frontend/app/onboarding.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            6-slide horizontal-pager (Welcome, Images, Videos, 3D+SCAD, AI
            Assist, Referrals) with cyberpunk-themed iconography. Gated via
            storage.getItem('aiforge_onboarded'). Screenshot confirms render.
  - task: "Admin Secrets page (secure Stripe-key box)"
    implemented: true
    working: true
    file: "/app/frontend/app/admin/secrets.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Reachable from Profile→"Owner · App Secrets" (only shown when
            adminMe returns is_admin). Masked input with eye-toggle, validates
            against Stripe before save, displays current mode badge
            (LIVE/SANDBOX) and fingerprint, supports reset-to-sandbox. Verified
            via screenshot in authed + unauthed states.
  - task: "Interactive 3D SCAD viewer with STL export"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/components/Scad3DViewer.tsx, app/creation/[id].tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: |
            New 3D tab in creation/[id] for SCAD creations. WebView renders a
            self-contained Three.js scene that parses common OpenSCAD
            primitives (cube/sphere/cylinder + translate/rotate/scale/color/
            union/difference/intersection) and renders a rotatable mesh with
            orbit controls. Includes "EXPORT STL" button via THREE.STLExporter.
            Needs end-to-end verification with a freshly generated SCAD.

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 5
  run_ui: true

test_plan:
  current_focus:
    - "Android release source export, clean prebuild and .easignore native exclusion"
    - "RevenueCat platform-key guard, current account identity and restore state"
    - "Verified subscription timestamps, expiration and read-only sync"
    - "Atomic token credit/retry/refund, duplicates and receipt validation"
    - "Plans accurate localized pricing, no false trials/unlimited claims or native web checkout"
    - "Legal API links and mobile onset/onboarding resizing"
    - "Onboarding tutorial slideshow"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: |
        Implemented in this iteration:
          1) Reverted the revoked live Stripe key to sandbox so the app works again.
          2) Added a secure in-app Stripe-key box (Admin Secrets page) with
             backend validation, atomic .env write, and hot-swap of the
             in-process key (no restart needed).
          3) Cleaned up every shadow* deprecation warning in our own source
             files - fresh log tail now shows 0 warnings on page loads.
          4) Added a 6-slide onboarding tutorial gated by AsyncStorage flag.
          5) Built a real interactive 3D SCAD viewer (Three.js in WebView)
             with rotate/zoom and STL export to replace the static preview.
        Please regression-test:
          - All existing auth/generation/library flows.
          - New admin endpoints (with demo@example.com / demo1234 as the
            auto-promoted owner): GET /api/admin/me, GET/POST/DELETE
            /api/admin/stripe-key (POST with sk_test_emergent should succeed
            and re-arm sandbox).
          - Onboarding redirect for fresh users.
          - Admin Secrets page render + form validation.
          - 3D SCAD viewer renders a mesh and STL export downloads a file.

frontend:
  - task: "AI-powered Editor (matching IMG_6867 mockup)"
    implemented: true
    working: true
    file: "/app/frontend/app/editor.tsx, src/api/client.ts, src/components/CreationCard.tsx, app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Built /editor route matching the design exactly: ⚡ EDITOR header, tool
            grid (Move/Crop/Cut/Rotate L/R/Flip H/V/Add Text/Reset), Upload File
            + Import from Library entry, canvas with applied transforms, AI tools
            row (Enhance · Style · BG Remove · Caption). Entry points: home tab
            "OPEN THE EDITOR" tile + Edit chip on every Library CreationCard.
            Verified visually with cr_f7af600612544f loaded.

backend:
  - task: "AI Editor endpoints (Nano Banana image edit + Claude captions + save)"
    implemented: true
    working: true
    file: "/app/backend/routes/editor.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            POST /api/editor/enhance|style|bg-remove (Nano Banana image-in image-out),
            POST /api/editor/caption (Claude Sonnet JSON), POST /api/editor/save.
            Smoke-verified with curl: empty image → 400, invalid style → 400 with
            allowed-list, caption returns clean JSON, save returns creation_id,
            85MB synthetic payload → 413. Quota-guarded except /save.

  - task: "Backend refactor: server.py 1040 → 53 lines + routes/* + core.py + models.py"
    implemented: true
    working: true
    file: "/app/backend/server.py, core.py, models.py, routes/*"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Split into core (config/db/JWT/admin helpers), models (Pydantic),
            and routes/{auth,referrals,generation,checkout,admin,legal,assets,editor}.
            server.py is now a slim entrypoint. Backend hot-reloaded cleanly,
            existing curl flows still 200.

  - task: "Google Play Store asset endpoints (/api/assets/playstore/*)"
    implemented: true
    working: true
    file: "/app/backend/routes/assets.py, /app/playstore_assets/"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            Generated 512x512 icon, 1024x500 feature graphic, 1024x1024 hi-res icon,
            adaptive foreground and 432x432 themed icon from existing source PNGs.
            Exposed via /api/assets/playstore (HTML index with thumbnails + download)
            and /api/assets/playstore/<file>?inline=1 for in-browser preview.

agent_communication:
    -agent: "main"
    -message: |
        v2.2 iteration complete. Shipped: (1) AI image/video editor matching the
        IMG_6867 design with Nano Banana enhance/style/bg-remove, Claude captions,
        local transforms (rotate, flip, crop, trim, text overlay), and save-as-new.
        (2) Edit shortcuts in CreationCard + home tile. (3) Google Play asset
        gallery + download endpoints. (4) Slimmed server.py via core/models/routes
        split. (5) Reverted revoked live Stripe key to sandbox. The Admin Secrets
        page is the user's path to rotate a fresh live Stripe key without ever
        pasting it in chat.

        BLOCKING ON USER: a *fresh, un-leaked* sk_live_... key. Both prior keys
        the user pasted in chat were auto-revoked by Stripe (HTTP 401 confirmed).

frontend:
  - task: "CAD Generator full-screen page (matching IMG_6865)"
    implemented: true
    working: true
    file: "/app/frontend/app/cad.tsx, src/components/Scad3DViewer.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            New /cad route matches the design exactly: cyan "3D / CAD GENERATOR"
            title, toolbar (UNDO · HIST · ZOOM+ · ZOOM- · STL · trash), big cyan
            viewport with wireframe-cube empty state, bottom CAD VIEW tag, idea
            pill row, prompt input + cyan send button.
            Scad3DViewer refactored to forwardRef exposing imperative API
            (zoomIn/zoomOut/resetView/exportSTL) via WebView injectJavaScript.
            History stack for undo/redo of multiple generations.
            View SCAD source modal via </> button in header.
            Library "3D" chip on model3d creation cards routes here.
            Verified visually in empty + loaded states.

  - task: "Editor invalid-input semantics (400 instead of 422)"
    implemented: true
    working: true
    file: "/app/backend/routes/editor.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: |
            StyleRequest moved from Pydantic Literal[...] to plain str with
            in-handler validation. Empty image_b64 now returns 400 with a clear
            message (was 502 from upstream). Invalid style returns 400 with the
            allowed-list. Verified via curl.

agent_communication:
    -agent: "main"
    -message: |
        v2.3 iteration complete. Shipped: (1) CAD Generator full-screen route
        matching IMG_6865 with forwardRef-driven Scad3DViewer (zoomIn/zoomOut/
        resetView/exportSTL imperative API + WebView injectJavaScript), history
        stack with undo/redo, SCAD source modal, 6 quick prompt ideas. Entry
        points from Home tile and Library 3D card chip. (2) Editor input
        validation improved to return 400 with allowed-list (was 422). (3) The
        Stripe key rotation path (Profile → Owner · App Secrets) remains the
        documented way to go live; user must roll a fresh key in Stripe
        Dashboard, NOT paste in chat.

release_build:
  - task: "Android AAB release-build configuration"
    implemented: true
    working: "pending verification"
    file: "/app/frontend/eas.json"
    stuck_count: 1
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "user"
        comment: "User reported that the Play Store build keeps failing, without build-log text."
      - working: "pending verification"
        agent: "main"
        comment: "Found no eas.json in the Expo project. Added explicit preview APK and production Android App Bundle profiles."
      - working: true
        agent: "main"
        comment: "Validated JSON and Expo prebuild config; Android Metro export completed successfully with 3,950 modules and 25 assets. The first local bytecode attempt only failed because this ARM container cannot execute React Native's bundled x64 Hermes binary; --no-bytecode export completed cleanly. Preview also rendered after restart."
      - working: true
        agent: "testing"
        comment: "Release regression report iteration_19 independently confirmed the AAB profile, Android config/plugin resolution, Android no-bytecode export, backend health, and mobile preview."

backend_followup:
  - task: "Azure text fallback for caption and text generation"
    implemented: true
    working: true
    file: "/app/backend/ai_providers.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: "Iteration_19 found POST /api/editor/caption returning 502 because Azure returned 401 PermissionDenied."
      - working: true
        agent: "main"
        comment: "Azure HTTP and network failures now use the existing Emergent Claude fallback. Verified with an authenticated caption request: 200 with hook, caption, and hashtag list."
  - task: "Ingress-compatible API health check"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: false
        agent: "testing"
        comment: "Iteration_19 noted that GET /api/health was absent while root health probes worked."
      - working: true
        agent: "main"
        comment: "Added GET /api/health and verified it returns HTTP 200 with status ok."

release_followup_2026_10_27:
  working: "testing pending"
  needs_retesting: true
  agent: main
  summary: |
    Read supplied Play Console PDF. Actual /app remotes match named repo,
    but active branch codespace-special-spork-4qq7969947963v4j differs from
    authorized purge branches: stopped all remote/history write actions.
    No EAS commands allowed by environment, no Play Console access confirmed,
    highest versionCode unknown. Kept package and version unchanged.
    Fixed 3 TypeScript errors; tsc + expo dependency check pass.
    Android no-bytecode export /tmp/aiforge-android-release-js passed.
    Clean prebuild /tmp/aiforge-clean-native-T7RGVW passed. Does NOT prove AAB signing.
    EAS archive excludes generated native trees so plugins/app.json apply.
    Added minimal media/overlay permissions exclusions.
    RevenueCat connected via managed proxy; native SDK dependency verified:
    RN10.15.1 -> hybrid19.14.1 -> Android10.28.1 -> Billing8.3.0.
    Scoped billing identity to actual SDK getAppUserID and backend account,
    removed original-anonymous-ID rejection bug and account-cache leakage.
    Restore uses returned CustomerInfo, not stale React state. Missing webhook
    confirmation shows pending, not an invented success. Added refresh/manage.
    Fixed entitlement/timestamp validation, old events, expiry access guard,
    duplicate/crash-retry-safe token credit and refund handling. Server DB state
    never trusts entitlement_active client claims. Production rejects Test Store.
    Removed misleading unlimited/12k users/guaranteed7day trial copy; corrected
    refund wording and billing-data privacy in app + public API legal pages.
    Native web checkout callbacks redirect to Plans, API client rejects checkout,
    admin Stripe panel remains web-only. No provider keys or passwords changed.
    Check all changes, screenshots 390x844, no paid AI calls or real purchases.
    Use credentials from private memory file only; NEVER include credentials
    or secret values in reports, screenshots, fixtures or command output.
