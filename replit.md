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

### Layer B — Live Capture Guidance (Real-Time MediaPipe)
- Captures camera snapshots every 2.5s during recording
- Sends snapshots to WebView MediaPipe bridge for real hand/face detection
- Haptic vibration (Warning) + audio alert beep when hand not detected for 3+ seconds
- Haptic vibration (Error) when face detected for 2+ seconds
- Alerts throttled to max once per 4 seconds to avoid spam
- Pulsing animated banner overlay with severity-colored background
- Uses expo-audio (useAudioPlayer) for alert sound playback

### Layer C — Post-Capture QC Pipeline
- Runs after recording stops, before upload
- **Real MediaPipe ML analysis** (HandLandmarker + FaceLandmarker via @mediapipe/tasks-vision)
- **Full 21-point hand landmarks** per hand (x/y/z for WRIST through PINKY_TIP) on both web and native paths
- Web: direct WASM analysis; Native: WebView bridge extracts JPEG frames → sends to hidden WebView for MediaPipe analysis
- Pixel brightness/blur/contrast computed from actual image data
- Stability tracking via accelerometer readings captured during recording
- Scoring engine with 9 weighted components (0-100)
- Decision: passed (≥85), passed_with_warning (65-84), blocked (<65)

### QC Files
```
lib/
  qc-types.ts                - All QC type definitions (LocalQCReport, QCThresholds, DetectedHand, etc.)
  qc-engine.ts               - Scoring engine (runQCEngine)
  mediapipe-analyzer.ts      - Real MediaPipe frame analysis (web: direct WASM, native: WebView bridge)
  webview-mediapipe-bridge.ts - Bridge types & registration for native MediaPipe via hidden WebView
  orientation-service.ts     - Accelerometer-based orientation and stability tracking
  session-artifacts.ts       - Writes hand_landmarks.jsonl (21 pts), face_presence.jsonl, frame_qc_metrics.jsonl
```
components/
  MediaPipeWebView.tsx       - Hidden WebView running MediaPipe WASM for native analysis

### QC Data Flow
1. Record screen: accelerometer stability readings collected during recording
2. On stop: navigate to review with recording params + videoUri
3. Review screen: calls analyzeVideo() — extracts frames, runs HandLandmarker + FaceLandmarker
4. Full hand landmarks (21 points × up to 2 hands), handedness, bounding boxes, face presence, brightness/blur/contrast per frame
5. QC report persisted to recordings context; semantic artifacts written to session folder
6. On confirm upload: QC payload + all artifacts uploaded to S3

### MediaPipe Integration
- Package: @mediapipe/tasks-vision v0.10.32 (WASM-based)
- Models loaded from Google CDN on first use (~11MB WASM + models, cached after)
- Singleton pattern: HandLandmarker + FaceLandmarker initialized once, reused
- Web path: direct in-browser WASM analysis with canvas seek+capture
- Native path: WebView bridge — expo-video-thumbnails extracts JPEG frames → hidden WebView runs MediaPipe → results sent back via postMessage
- Full hand landmark data: 21 points per hand with x/y/z normalized coords, handedness (Left/Right/Unknown), confidence scores
- Bridge validates payloads: filters malformed hands, normalizes handedness enum, clamps confidence values

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

## Session Artifact Structure
Each recording session generates a structured folder at `sessions/{sessionId}/`.
All timeseries files use `.jsonl` (JSON Lines) format — one JSON object per line, no trailing commas.

### Required Artifacts
| File | Type | Description |
|------|------|-------------|
| `video.mp4` | video | Recorded video |
| `imu.jsonl` | imu_timeseries | Accelerometer + gyroscope at ~100Hz |
| `metadata.json` | metadata | Full session metadata with timing, device, QC summary |
| `qc_report.json` | qc_summary | QC analysis results (aggregate scores) |
| `video_timestamps.jsonl` | video_timestamps | Frame timing reference |

### Optional (Semantic) Artifacts
| File | Type | Description |
|------|------|-------------|
| `hand_landmarks.jsonl` | hand_landmarks | Per-frame 21-point hand detection from MediaPipe |
| `face_presence.jsonl` | face_presence | Per-frame face detection with confidence |
| `frame_qc_metrics.jsonl` | frame_qc_metrics | Per-frame brightness, blur, detection flags |
| `session_manifest.json` | manifest | Self-describing session package manifest |

### Session Manifest (`session_manifest.json`)
A machine-readable manifest for downstream processing. Lists all artifacts that were actually written (not hardcoded). Includes `complete` flag (true only if all required files exist) and `missingRequired` array.

### File Naming Convention
All timeseries use `.jsonl` extension consistently (not `.ndjson`). Content type for uploads: `application/x-ndjson`.

### Artifact Details
- **imu.jsonl**: Direct sensor callback sampling at ~100Hz. Fields: `timestampEpochMs`, `relativeMs`, `accel{x,y,z}`, `gyro{x,y,z}`.
- **video_timestamps.jsonl**: Frame timing (mode: "estimated"). `frameTimestampQualityNote` in metadata explains the method used.
- **hand_landmarks.jsonl**: Full 21-point MediaPipe hand landmarks per detected hand, with handedness (Left/Right) and confidence.
- **face_presence.jsonl**: Boolean face detection with confidence per analyzed frame.
- **frame_qc_metrics.jsonl**: Per-frame brightness, blur scores, and detection flags.
- **metadata.json**: Includes `deviceModel`, `manufacturer`, `deviceType` (from expo-device), `artifactFiles` (dynamically built from real files), `frameTimestampQualityNote`, and `semanticArtifacts` flags.

### `artifactFiles` in metadata
Built dynamically after all files are written. Only lists files that actually exist on disk. Deterministic order: video, imu, metadata, qc_report, video_timestamps, hand_landmarks, face_presence, frame_qc_metrics, session_manifest.

### `videoFrameTimestampMode`
- `"estimated"`: timestamps inferred from videoStartEpochMs + duration + assumed FPS (current default)
- `"native"`: true frame timestamps from capture pipeline (not yet available in Expo camera API)
- `frameTimestampQualityNote` field provides human-readable explanation

### Known Limitations
- Video frame timestamps are **estimated** (not native) — Expo camera API doesn't expose per-frame hardware timestamps.
- IMU frequency depends on device hardware. Target is 100Hz; actual rate reported honestly in metadata.
- `deviceModel` uses expo-device; falls back to "unknown" only as true last resort.

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
