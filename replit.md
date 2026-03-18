# KGeN Data Collector App

## Overview
A mobile application for collecting real-world video data from users performing specific tasks called 'Quests'. Users can record videos from their daily lives, review recordings, and upload them to a centralized platform. Includes a full on-device Quality Control (QC) pipeline that validates recordings before upload.

## Architecture
- **Frontend**: Expo React Native with TypeScript, file-based routing (Expo Router)
- **Backend**: Express.js with TypeScript serving API endpoints and landing page
- **State Management**: React Context (AuthContext, RecordingsContext) + AsyncStorage for persistence
- **Auth**: Token-based authentication stored securely via expo-secure-store (native) / AsyncStorage (web)
- **QC System**: Multi-layer on-device QC pipeline with scoring engine, orientation enforcement, live guidance, and decision engine

## Key Features
- User authentication (login/register)
- Quest browsing with details and instructions
- Video recording tied to quest IDs (expo-camera)
- **On-device QC pipeline**: Post-capture frame analysis, block/pass/warning decisions (0-100 score)
- **Orientation enforcement**: Accelerometer-based portrait/landscape detection with lock gate
- **Live capture guidance**: Debounced hints (hand visibility, face privacy, lighting, stability)
- **QC Review Screen**: Animated readiness score, per-metric check rows, blocking/warning reasons
- Upload queue with status tracking and QC metadata in submission payload
- Recordings management with QC score badges
- Offline-first design with persistent upload queue
- 4-tab navigation: Quests, Uploads, Recordings, Account

## Tech Stack
- React Native / Expo SDK 54
- expo-router (file-based routing)
- expo-camera (video recording)
- expo-sensors@~15.0.8 (accelerometer for stability + orientation detection; SDK 54 compatible)
- expo-secure-store (token storage)
- @react-native-async-storage/async-storage (data persistence)
- @tanstack/react-query (API communication)
- expo-haptics (feedback)
- Express.js backend with in-memory storage

## QC System Architecture

### Layer A — Pre-Capture Validation
- Orientation gate blocks recording start if device orientation is wrong
- Pre-capture guide overlay with camera, lighting, face, and hand tips

### Layer B — Live Capture Guidance
- Runs every 400ms during recording
- Debounced hints (2s for hands, 1s for face, 2.5s for lighting)
- Hints: hand visibility, face detected, lighting, stability

### Layer C — Post-Capture QC Pipeline
- Runs after recording stops, before upload
- Generates 1fps frame samples with simulated ML analysis
- Real stability tracking via accelerometer
- Scoring engine with 9 weighted components (0-100)
- Decision: passed (≥85), passed_with_warning (65-84), blocked (<65)

### QC Files
```
lib/
  qc-types.ts        - All QC type definitions (LocalQCReport, QCThresholds, etc.)
  qc-engine.ts       - Scoring engine (runQCEngine, generateFrameSamples)
  orientation-service.ts - Accelerometer-based orientation and stability tracking
```

### QC Data Flow
1. Record screen: accelerometer stability readings collected during recording
2. On stop: navigate to review with recording params
3. Review screen: runs QC analysis (3s simulated analysis animation)
4. QC report persisted to recordings context
5. On confirm upload: QC payload included in submission API call

## Project Structure
```
app/
  _layout.tsx          - Root layout with providers
  (tabs)/
    _layout.tsx        - Tab navigation (NativeTabs + ClassicTabs fallback)
    index.tsx          - Quests list
    uploads.tsx        - Pending uploads queue (with QC score badges + extended metadata)
    recordings.tsx     - All recordings (with QC result badges)
    account.tsx        - User profile & settings
  (auth)/
    _layout.tsx        - Auth modal stack
    login.tsx          - Login screen
    register.tsx       - Registration screen
  quest/[id].tsx       - Quest detail view
  record/[questId].tsx - Camera recording screen (orientation gate + live guidance)
  review.tsx           - QC review screen (analysis loader + full report)
lib/
  auth-context.tsx     - Authentication context/provider
  recordings-context.tsx - Recordings state management (with qcReport persistence)
  query-client.ts      - API client configuration
  types.ts             - TypeScript interfaces (Recording includes qcReport)
  qc-types.ts          - QC type definitions
  qc-engine.ts         - QC scoring engine
  orientation-service.ts - Orientation/stability detection
constants/
  colors.ts            - Theme colors (dark teal/navy palette)
server/
  index.ts             - Express server setup
  routes.ts            - API routes (auth, quests, submissions)
  storage.ts           - In-memory storage
```

## API Endpoints
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login
- GET /api/auth/me - Get current user
- POST /api/auth/logout - Logout
- GET /api/quests - List all quests
- GET /api/quests/:id - Get quest details
- POST /api/submissions - Create submission (accepts qcPayload with full LocalQCReport)
- POST /api/submissions/:id/confirm - Confirm upload

## Color Theme
- Primary: #00D4AA (teal)
- Accent: #0EA5E9 (blue)
- Dark background: #0A0E1A
- Dark surface: #131829
