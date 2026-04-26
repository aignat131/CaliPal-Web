# CaliPal Web Replica — Plan

## IDE & Tools

- **VS Code** — free, best for Next.js/TypeScript/Tailwind. Download: https://code.visualstudio.com/
- **Node.js 20 LTS** — https://nodejs.org
- **Python 3.10+** — only needed once for the TFLite model conversion in Phase 5

**VS Code Extensions to install:**
- ESLint
- Tailwind CSS IntelliSense
- Prettier - Code Formatter
- Firebase
- ES7+ React/Redux/React-Native snippets

---

## Project Location

`E:\Web_APPs\CaliPal-Web\`

---

## Tech Stack

| | |
|---|---|
| Framework | Next.js 15 App Router |
| UI | shadcn/ui + Tailwind CSS |
| Hosting | Cloudflare Pages (free, unlimited bandwidth) |
| Maps | Leaflet.js + OpenStreetMap (free, no API key) |
| ML — Pose | @mediapipe/tasks-vision (same .task file as Android) |
| ML — Model | TF.js SavedModel (converted once from .tflite) |
| Video trim | ffmpeg.wasm |

**Brand colors:**
- Primary: `#1ED75F`
- Background dark: `#0D2E2B` / Surface dark: `#164742`
- Background light: `#F2F7F4` / Text dark: `#0D1B1A`

---

## Initial Setup Steps

### Step 1 — Create the project folder
```bash
mkdir E:\Web_APPs\CaliPal-Web
cd E:\Web_APPs\CaliPal-Web
```

### Step 2 — Scaffold the Next.js app
```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --import-alias "@/*"
```
When prompted: Turbopack → **Yes**, everything else → defaults.

### Step 3 — Install dependencies
```bash
npm install firebase @mediapipe/tasks-vision @tensorflow/tfjs
npm install leaflet react-leaflet @types/leaflet
npm install @ffmpeg/ffmpeg @ffmpeg/util
npx shadcn@latest init
```
shadcn prompts: Style → **Default**, Base color → **Zinc**, CSS variables → **Yes**.

### Step 4 — Add shadcn components
```bash
npx shadcn@latest add button card dialog sheet tabs input avatar badge
```

### Step 5 — Create `.env.local` (never commit this)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```
Get these from Firebase Console → Project Settings → Your apps → Web app.

### Step 6 — Add brand colors to `tailwind.config.ts`
```ts
theme: {
  extend: {
    colors: {
      brand: {
        green: '#1ED75F',
        darkBg: '#0D2E2B',
        darkSurface: '#164742',
        lightBg: '#F2F7F4',
        darkText: '#0D1B1A',
      }
    }
  }
}
```

### Step 7 — Add CORP headers to `next.config.ts` (required for ML)
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    }]
  },
}

export default nextConfig
```

### Step 8 — Copy ML model files from the Android project
```bash
mkdir public\models
copy "E:\Android_APPs\CaliPal\app\src\main\assets\pullup_model6.tflite" "public\models\"
copy "E:\Android_APPs\CaliPal\app\src\main\assets\pose_landmarker_lite.task" "public\models\"
copy "E:\Android_APPs\CaliPal\app\src\main\assets\normalization_params.json" "public\models\"
```

### Step 9 — Run the dev server
```bash
npm run dev
```
Open `http://localhost:3000` — ready to build.

---

## Project Structure

```
E:\Web_APPs\CaliPal-Web\
├── app/
│   ├── (auth)/
│   │   ├── intro/page.tsx
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   └── (app)/
│       ├── layout.tsx              # Bottom nav + WorkoutBanner
│       ├── home/page.tsx
│       ├── community/
│       │   ├── page.tsx
│       │   ├── create/page.tsx
│       │   └── [id]/page.tsx       # Members / Trainings / Leaderboard tabs
│       ├── workout/
│       │   ├── page.tsx
│       │   ├── form-check/page.tsx
│       │   ├── record/page.tsx
│       │   └── autocut/page.tsx
│       ├── map/page.tsx
│       ├── chat/
│       │   ├── page.tsx
│       │   └── [conversationId]/page.tsx
│       └── profile/
│           ├── page.tsx
│           ├── edit/page.tsx
│           ├── skills/page.tsx
│           ├── assessment/page.tsx
│           ├── friends/page.tsx
│           └── settings/page.tsx
├── components/
│   ├── ui/                         # shadcn/ui components
│   ├── layout/                     # AppNav, WorkoutBanner
│   ├── community/
│   ├── map/
│   ├── workout/
│   ├── chat/
│   └── profile/
├── lib/
│   ├── firebase/                   # config.ts, auth.ts, firestore.ts, storage.ts
│   ├── ml/
│   │   ├── pullup-classifier.ts    # TF.js wrapper — input shape (1, 90, 8)
│   │   ├── pose-preprocessor.ts    # Port of PosePreprocessor.kt
│   │   ├── rep-counter.ts          # Port of RepetitionCounter.kt
│   │   └── normalization.ts
│   ├── hooks/                      # useAuth, useFirestoreDoc, useGeolocation…
│   └── utils/
│       ├── pose-math.ts            # Port of PoseMathUtils.kt
│       └── conversation-id.ts      # min(a,b) + "_" + max(a,b)
├── types/
│   └── user.ts, community.ts, chat.ts, park.ts, workout.ts, challenge.ts, skills.ts
└── public/models/
    ├── pullup_tfjs/                # Converted model (model.json + *.bin)
    ├── pose_landmarker_lite.task
    └── normalization_params.json
```

---

## Implementation Phases

### Phase 1 — Auth + Shell (Days 1–3)
- Intro, Login, Register, Forgot Password screens
- 5-tab bottom nav layout (Acasă, Comunitate, Antrenament, Hartă, Profil)
- `useAuth` hook + auth guard
- Deploy to Cloudflare Pages from git

### Phase 2 — Social Features (Days 4–8)
- Profile: load `users/{uid}`, display stats, avatar from Storage
- Edit Profile: update Firestore + upload photo to `profile_photos/{uid}/photo.jpg`
- Community list + detail (Members / Trainings / Leaderboard tabs), RSVP, roles
- Create Community with browser Geolocation
- Chat: real-time `onSnapshot`, conversation IDs = `min(uid_a,uid_b)_max(uid_a,uid_b)`
- Friends: send/accept/decline via `friend_requests/{fromUid}_{toUid}`

### Phase 3 — Map + Presence (Days 9–11)
- Leaflet map with park markers from `parks` Firestore collection
- Pulsing presence rings (CSS `@keyframes`) from `park_presence/{communityId}/active_members`
- `navigator.geolocation.watchPosition()` → write to `live_locations/{uid}`
- Park bottom sheet with active users + community link
- `beforeunload` cleans up presence doc

### Phase 4 — Workout + Gamification (Days 12–14)
- Workout timer, add exercises (reps/seconds), save to `users/{uid}/workouts`
- History: paginated workout list
- Weekly challenge from `weekly_challenges`, progress bar, coin award
- Skills tree (port `SkillModels.kt` to TypeScript — pure logic)
- Assessment multi-step quiz
- All 18 tasks + coin conditions from `CoinsRepository`

### Phase 5 — ML Form Analysis (Days 15–20)

**One-time model conversion:**
```bash
pip install tensorflowjs
tensorflowjs_converter --input_format=tflite \
  public/models/pullup_model6.tflite public/models/pullup_tfjs/
```

**Port these files (pure TypeScript, no UI):**
- `pose-math.ts` — `angleBetween()` and `verticalReach()` from `PoseMathUtils.kt`
- `pose-preprocessor.ts` — 8 features/frame, resample to 90 frames, min-max normalize
- `rep-counter.ts` — exact thresholds: HANG_ENTER=148°, HANG_EXIT=153°, PEAK=105°, CONFIRM=2 frames, MIN_REP=20 frames

**Form check pipeline:**
```
Webcam → MediaPipe PoseLandmarker → pose-preprocessor.ts → tf.tensor3d([1,90,8]) → form label + rep count
```

**AutoCut:** ffmpeg.wasm trims video segments at rep boundaries.

### Phase 6 — Polish (Days 21–24)
- Home feed: weekly challenge card, recent workouts, community activity
- Admin Hub + Coach Hub (gated by email `aignat131@gmail.com`)
- Firebase Web Push notifications + service worker
- Dark/light mode (persisted to localStorage)
- PWA `manifest.json` for "Add to Home Screen"
- Lazy load ML models + code-split map/chat pages

---

## Cost

| | |
|---|---|
| Cloudflare Pages | $0 (unlimited bandwidth) |
| Firebase Firestore (Spark) | $0 until ~200 DAU |
| Firebase Auth + Storage | $0 |
| Leaflet tiles | $0 |
| Domain (optional) | ~$10/year |
| **Total at launch** | **$0/month** |
