# CaliPal Web — Improvement Plan 2

*Generated: 2026-04-28*

---

## PART 1 — Skills: Android Parity

The Android app has a significantly more polished and gamified skills experience. The web app currently shows a flat grid of cards filtered by difficulty. The goal is to match the Android vertical skill tree, category system, and XP/level mechanic.

### 1.1 — Restructure skills into categories

**File:** `lib/skills.ts`

Android uses three categories: **FORȚĂ** (Strength), **MOBILITATE** (Mobility), **CARDIO** (Cardio).
The web currently uses levels only (BEGINNER → ELITE) with no category grouping.

Add a `category` field to `SkillDef` in `types/index.ts`:
```ts
export type SkillCategory = 'STRENGTH' | 'MOBILITY' | 'CARDIO'
```

Re-tag all 26 existing web skills with a category. Mapping:
| Category | Skills |
|----------|--------|
| STRENGTH | dead_hang, pullup, australian_pullup, chest_to_bar, pushup, knee_pushup, diamond_pushup, dip, muscle_up, one_arm_pullup, one_arm_pushup, pike_pushup, hspu, handstand, tuck_planche, planche, ring_muscle_up |
| MOBILITY | lsit, tuck_front_lever, front_lever, back_lever, dragon_flag, dragon_flag_neg |
| CARDIO / CORE | hollow_body, arch_body, basic_squat, pistol_squat |

> Note: The Android app defines 9 default skills (flotari_normale, flotari_diamant, muscle_up, stretching, yoga, full_split, jogging_5k, interval, semi_maraton). The web has 26 more granular skills. Keep the web's skill set — just add the `category` field.

---

### 1.2 — Redesign skill tree page

**File:** `app/(app)/profile/skills/page.tsx`

Replace the flat grid with a **vertical tree** matching the Android layout:

```
[XP Level Card]                      ← top section
[FORȚĂ] [MOBILITATE] [CARDIO]        ← category tabs
│
● ─── [Dead Hang card        ] [+10 🪙]   ← UNLOCKED node (green)
│
● ─── [Tracțiuni australiene ] [+25 🪙]   ← UNLOCKED
│
◌ ─── [Tracțiuni            ] [+40 🪙]   ← IN_PROGRESS (prereqs met, not confirmed yet)
│
○ ─── [Muscle-Up            ] [+100🪙]   ← LOCKED
```

**Node visual states** (matching Android colors mapped to web brand palette):
| Status | Circle | Border | Line below |
|--------|--------|--------|------------|
| UNLOCKED | `#1ED75F` filled | none | solid green `2px` |
| IN_PROGRESS (prereqs met) | transparent | `2px solid #3B82F6` | solid blue `2px` |
| LOCKED | `rgba(255,255,255,0.1)` | none | dashed `rgba(255,255,255,0.15) 2px` |

**Card content (right of the node):**
- Skill name (`font-bold text-sm`)
- Short description (`text-xs text-white/50`)
- Coin reward badge (`+X 🪙`)
- Progress bar (only for IN_PROGRESS): `currentReps / targetReps` if `maxRepsToUnlock` defined
- "✓ Am reușit" unlock button (only when IN_PROGRESS)
- "🔒 Necesită: X, Y" for LOCKED with missing prereqs

**XP Level Card** at the top of the page:
- Map coins to a level system: `level = Math.floor(coins / 100) + 1`, `xpInLevel = coins % 100`
- Show: level badge (circular, `#3B82F6` bg), level title (see table below), XP bar
- Level titles: 1–2 "Începător", 3–5 "Antrenat", 6–9 "Avansat", 10–14 "Expert", 15+ "Elite"
- Animated progress bar (`transition-all duration-700`)

**Category tabs** replace the current level filter pills:
```tsx
['STRENGTH', 'MOBILITY', 'CARDIO']  // filter the vertical tree
```

---

### 1.3 — Extend assessment to match Android (8 questions)

**File:** `app/(app)/profile/assessment/page.tsx`

Android has 8 questions; web has 6. Add the 2 missing question groups:

| # | Question (Android) | Already in web? |
|---|-------------------|-----------------|
| 1 | Pullups count | ✅ |
| 2 | Pushups count | ✅ |
| 3 | Diamond pushups (yes/no) | ❌ — add |
| 4 | Muscle-ups (yes/no) | ❌ — add |
| 5 | Flexibility: touch toes / L-sit hold | ✅ (core/static) |
| 6 | Full splits (yes/no) | ❌ — add (mobility category) |
| 7 | 5 km running (yes/no) | ❌ — add (cardio) |
| 8 | Dips count / squats count | ✅ |

New question unlocks: diamond_pushup, muscle_up, full_split (new skill), jogging_5k (new skill).

---

### 1.4 — Auto-show assessment for new users

**File:** `app/(app)/home/page.tsx`

If `userDoc.assessmentCompleted === false`, show a prominent **banner** above the community section:
```tsx
<div className="rounded-2xl p-4 mb-4 border border-brand-green/30 bg-brand-green/8">
  <p className="font-black text-white text-sm">Completează evaluarea inițială 🎯</p>
  <p className="text-xs text-white/60 mt-1">Descoperă-ți nivelul și deblochează skill-uri personalizate. Durează 2 minute.</p>
  <Link href="/profile/assessment">
    <button className="mt-3 h-9 px-5 rounded-xl bg-brand-green text-black text-sm font-bold">
      Începe evaluarea
    </button>
  </Link>
</div>
```

---

## PART 2 — Security

### 2.1 — Add missing Firestore rules

**File:** `firestore.rules`

**Critical: `form_check_requests` has NO rule.** Anyone can read/write.
Add:
```
match /form_check_requests/{reqId} {
  allow read: if isAuth() && (
    request.auth.uid == resource.data.userId || isSuperAdmin()
  );
  allow create: if isAuth() && request.resource.data.userId == request.auth.uid;
  allow update: if isSuperAdmin();
  allow delete: if isSuperAdmin() || request.auth.uid == resource.data.userId;
}
```

**`park_requests` is also missing a rule.** Add:
```
match /park_requests/{reqId} {
  allow read: if isSuperAdmin();
  allow create: if isAuth() && request.resource.data.requestedByUid == request.auth.uid;
  allow update, delete: if isSuperAdmin();
}
```

**Weekly challenges** should only be readable (not writable) by users — already correct.

---

### 2.2 — Validate coin field on community challenge progress

**File:** `firestore.rules`

Community challenge progress is written by the owner (`users/{uid}/community_challenge_progress`):
- Add field validation: don't trust client-sent `completed` field — only the backend/admin should set it.
- Short-term: tighten the rule so `completed` can only be set to `true` if `currentReps >= targetReps` (Firestore rules can validate this if the targetReps is stored client-side — or move completion detection server-side via Cloud Functions later).

---

### 2.3 — Prevent self-role escalation

**File:** `firestore.rules`

The current rule `allow update: if isOwner(uid) || isCommunityAdmin(communityId)` lets community admins promote anyone to ADMIN, including themselves.

Add a field-level check:
```
allow update: if (
  isOwner(uid) && !('role' in request.resource.data.diff(resource.data).affectedKeys())
) || isCommunityAdmin(communityId) || isSuperAdmin();
```
This means members can only update their own non-role fields (points, displayName), while only admins and super admin can change roles.

---

### 2.4 — Rate-limit park and verification requests (client-side)

Already done for park community requests (3/day). Apply the same pattern to:

**`ParkRequestModal.tsx`**: Before `addDoc`, query `park_requests` for today's requests by this user. Limit: 3 per day.

**`VerificationRequestModal`** (wherever verification requests are submitted): Limit 1 per community per week — check if a PENDING verification request already exists for this community before creating another.

---

### 2.5 — Move superadmin check to UID (not email)

**File:** `firestore.rules` + all files defining `SUPERADMIN`

Currently `request.auth.token.email == 'aignat131@gmail.com'` is used in rules.
Better: Use Firebase custom claims (`request.auth.token.admin == true`) set via Admin SDK, or at minimum use the UID (which can't be spoofed via display name changes).

**Short-term fix** (no backend needed): Add UID as a constant alongside the email:
```ts
const SUPERADMIN_UID = 'YOUR_UID_HERE'  // get from Firebase Console → Authentication
```
In Firestore rules, check:
```
function isSuperAdmin() {
  return isAuth() && request.auth.uid == 'YOUR_UID_HERE';
}
```
Email can change; UID cannot.

---

## PART 3 — Practical Improvements

### 3.1 — Community leaderboard tab

**File:** `app/(app)/community/[id]/page.tsx`

Add a **"Clasament"** tab (4th tab after Membri):
- Lists members sorted by `points` descending
- Show rank number, avatar, name, points, level badge
- Highlight current user's row
- Update `points` field when a member logs a workout while in a community (increment by workout total reps)

---

### 3.2 — Workout sharing to community feed

**File:** `app/(app)/workout/page.tsx` (workout summary modal)

After finishing a workout, add a **"Postează în comunitate"** button in the summary modal:
- If user has a `favoriteCommunityId`, auto-select it; otherwise show a dropdown of joined communities
- Creates a `CommunityPost` with the workout summary (duration, total reps, top exercises) as content
- `authorRole` inherited from member doc

---

### 3.3 — Favorite exercises + quick-add

**File:** `app/(app)/workout/page.tsx`

- Add a "⭐ Favorite" section at the top of the exercise picker
- Exercises starred by the user appear there first
- Star/unstar icon on each exercise card — stored in `users/{uid}/favorite_exercises/{exerciseId}`
- Keeps the last 8 starred exercises

---

### 3.4 — Push notification support (PWA)

**File:** `public/sw.js` (new), `app/layout.tsx`, `lib/firebase/messaging.ts` (new)

- Register a service worker for Firebase Cloud Messaging
- On first login, prompt user to enable push notifications (use `Notification.requestPermission()`)
- Store FCM token in `fcm_tokens/{uid}` (already in Firestore rules)
- Send push for: new chat message, friend request, park approved, community request approved
- Cloud Functions needed for reliable delivery (note: requires Firebase Blaze plan)

---

### 3.5 — Chat: mark as read when open

**File:** `app/(app)/chat/[conversationId]/page.tsx`

Currently, the message notification fires every time a message is sent, even if the recipient is actively in the chat. Fix:
- Before sending `createNotification`, check `convSnap.data().unreadCount[otherUserId] === 0` — if 0, they're reading the chat, skip the notification.
- This unreadCount is already set to 0 when the recipient opens the conversation (line ~72 in the current file).

---

### 3.6 — Community discovery screen

**File:** `app/(app)/community/page.tsx` (existing list page)

Currently shows only joined communities + search. Improvements:
- Add **"Descoperă"** section below joined communities showing top 5 communities by `memberCount` that the user hasn't joined
- Add **search by city** (filter communities where `location` includes the search term)
- Show verified badge on community cards in the list

---

### 3.7 — Profile visibility: public/private toggle

**File:** `app/(app)/profile/settings/page.tsx`

Add a privacy toggle: "Profil public / privat"
- Stored as `isPublic: boolean` on the user doc
- When private: non-friends see only name and photo (no workouts, no skills, no streak)
- Firestore rule: `allow read: if isAuth() && (resource.data.isPublic || isFriend || isOwner)`

---

### 3.8 — Offline indicator

**File:** `components/layout/AppLayout.tsx` or equivalent

Show a subtle banner when the device is offline:
```tsx
// Listen to window 'online'/'offline' events
// Show: "Ești offline. Unele funcții nu sunt disponibile." toast or banner
```

---

## PART 4 — Visual & UX Polish

### 4.1 — Home page: animated streak card

**File:** `app/(app)/home/page.tsx`

Replace the current streak badge in the top bar with a **dedicated streak card** below the greeting:
- Large 🔥 icon with animated pulse when streak > 0
- Shows `currentStreak` days prominently (`text-4xl font-black`)
- Sub-label: "zile consecutiv" or "Încearcă primul antrenament!" if streak = 0
- Tapping opens the streak calendar modal (already exists)
- Design reference: orange gradient card `#FF6B2B15` background, `#FF6B2B` accent

---

### 4.2 — Skeleton loaders everywhere

Currently pages show a spinner while loading. Replace with content-shaped skeletons:
- `components/ui/Skeleton.tsx` (new): `<div className="animate-pulse bg-white/8 rounded-xl" style={{ width, height }} />`
- Use in: home page sections, community feed, workout history, friends list
- Skeletons should match the exact shape of the loaded content (narrow for text, square for avatars)

---

### 4.3 — Micro-animations

**File:** `tailwind.config.ts` or global CSS

Add subtle interactions:
- Workout start button: scale-in animation when workout begins
- Skill unlock: confetti burst (use `canvas-confetti` package, ~3kb) when "✓ Am reușit" is tapped
- Notification bell: wobble animation when a new notification arrives (CSS `@keyframes wiggle`)
- Community post like: heart scale-up animation on tap
- Bottom nav active tab: smooth `translateY(-2px)` lift on active

---

### 4.4 — Community page: cover image + gradient header

**File:** `app/(app)/community/[id]/page.tsx`

Instead of just showing the community letter avatar in the header, use the `imageUrl` field (already stored) as a **full-width cover image**:
- `<img src={community.imageUrl} className="w-full h-32 object-cover" />`
- Overlay a dark gradient: `linear-gradient(to bottom, transparent 0%, var(--app-bg) 100%)`
- Verified badge moves to overlay on the image
- Community name and member count float on top of the gradient

---

### 4.5 — Workout history: personal records highlight

**File:** `app/(app)/workout/page.tsx` (Istoric tab)

When displaying past workouts, detect PRs per exercise (max reps in a set across all history) and mark them:
- Show `🏆 Record personal` badge on the exercise row that achieved the PR
- Highlight in gold/yellow: `text-yellow-400`
- Store PRs client-side by computing on the loaded history (no extra Firestore writes)

---

### 4.6 — Better empty states

Replace the current plain "Nicio provocare" / "Nicio notificare" text with illustrated empty states:
- Each empty state has: large emoji/icon, title, subtitle, optional CTA button
- Examples:
  - Challenges empty: `🏆 Nicio provocare activă` → "Administratorul va adăuga provocări în curând"
  - Feed empty: `📝 Niciun post` → "Fii primul care postează!" → [Post button]
  - Notifications empty: `🔔 Totul e liniștit` → "Vei fi notificat când se întâmplă ceva"
  - Friends empty: `👥 Niciun prieten` → "Caută prieteni după email" → [Go to search]

---

### 4.7 — Map: clustering for dense park pins

**File:** `app/(app)/map/MapClient.tsx`

When many parks are close together, pins overlap. Add **Leaflet marker clustering**:
- Install: `npm install react-leaflet-cluster`
- Wrap `<Marker>` components in `<MarkerClusterGroup>`
- Cluster bubbles show count and expand on click
- Keeps the map readable in cities with many parks

---

### 4.8 — Dark/light mode polished transitions

**File:** `app/globals.css`

Add CSS transition to the root element so switching dark/light mode animates smoothly:
```css
:root {
  transition: background-color 0.2s ease, color 0.2s ease;
}
```
Currently the theme switches instantly which feels jarring.

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 🔴 Critical | 2.1 Missing Firestore rules | Low | Security |
| 🔴 Critical | 2.5 Superadmin UID vs email | Low | Security |
| 🟠 High | 1.2 Skill tree vertical redesign | High | Core feature parity |
| 🟠 High | 1.3 Assessment +2 questions | Medium | Core feature parity |
| 🟠 High | 1.4 Auto-show assessment banner | Low | Onboarding |
| 🟡 Medium | 3.1 Community leaderboard | Medium | Engagement |
| 🟡 Medium | 3.6 Community discovery | Low | Growth |
| 🟡 Medium | 4.1 Streak card redesign | Low | Delight |
| 🟡 Medium | 4.3 Micro-animations | Medium | Polish |
| 🟡 Medium | 4.4 Community cover image | Low | Visual |
| 🟢 Low | 3.2 Workout sharing | Medium | Social |
| 🟢 Low | 3.3 Favorite exercises | Low | UX |
| 🟢 Low | 3.4 PWA push notifications | High | Engagement |
| 🟢 Low | 4.2 Skeleton loaders | Medium | Polish |
| 🟢 Low | 4.5 PR highlights in history | Low | Gamification |
| 🟢 Low | 4.7 Map clustering | Low | UX |
| 🟢 Low | 4.8 Theme transition | Low | Polish |
