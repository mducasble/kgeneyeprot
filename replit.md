# KGeN Data Collector App

## Overview
A mobile application for collecting real-world video data from users performing specific tasks called 'Quests'. Users can record videos from their daily lives, review recordings, and upload them to a centralized platform.

## Architecture
- **Frontend**: Expo React Native with TypeScript, file-based routing (Expo Router)
- **Backend**: Express.js with TypeScript serving API endpoints and landing page
- **State Management**: React Context (AuthContext, RecordingsContext) + AsyncStorage for persistence
- **Auth**: Token-based authentication stored securely via expo-secure-store (native) / AsyncStorage (web)

## Key Features
- User authentication (login/register)
- Quest browsing with details and instructions
- Video recording tied to quest IDs (expo-camera)
- Upload queue with status tracking (queued, uploading, uploaded, failed, retrying)
- Recordings management with delete capability
- Offline-first design with persistent upload queue
- 4-tab navigation: Quests, Uploads, Recordings, Account

## Tech Stack
- React Native / Expo SDK 54
- expo-router (file-based routing)
- expo-camera (video recording)
- expo-secure-store (token storage)
- @react-native-async-storage/async-storage (data persistence)
- @tanstack/react-query (API communication)
- expo-haptics (feedback)
- Express.js backend with in-memory storage

## Project Structure
```
app/
  _layout.tsx          - Root layout with providers
  (tabs)/
    _layout.tsx        - Tab navigation (NativeTabs + ClassicTabs fallback)
    index.tsx          - Quests list
    uploads.tsx        - Pending uploads queue
    recordings.tsx     - All recordings
    account.tsx        - User profile & settings
  (auth)/
    _layout.tsx        - Auth modal stack
    login.tsx          - Login screen
    register.tsx       - Registration screen
  quest/[id].tsx       - Quest detail view
  record/[questId].tsx - Camera recording screen
  review.tsx           - Recording review screen
lib/
  auth-context.tsx     - Authentication context/provider
  recordings-context.tsx - Recordings state management
  query-client.ts      - API client configuration
  types.ts             - TypeScript interfaces
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
- POST /api/submissions - Create submission
- POST /api/submissions/:id/confirm - Confirm upload

## Color Theme
- Primary: #00D4AA (teal)
- Accent: #0EA5E9 (blue)
- Dark background: #0A0E1A
- Dark surface: #131829
