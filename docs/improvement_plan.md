# CaliPal Web — Improvement Plan (vs Android)

## Context

The web app has completed the original 6-phase plan (auth, social, map, workout, ML, polish).
This document tracks everything present in the Android app that is missing or incomplete in the
web version, plus desktop responsiveness improvements.

---

## 1. Other User Profile (Member Profile Screen) 🔴 HIGH

**Problem:** No way to view another user's profile. Clicking a member name has no destination.

**Android equivalent:** `MemberProfileScreen` — avatar, name, stats, skills, recent workouts, friend button.

**To implement:**
- `app/(app)/profile/[uid]/page.tsx` — public profile view
- Show: avatar, name, bio, role/level in community context, friend count, workouts, coins, streak, recent workouts (last 3), unlocked skills, strength assessment
- Friend request button (send / pending / friends / remove)
- Wire member names in `community/[id]/page.tsx` → `/profile/[uid]`
- Wire friends list and chat headers → `/profile/[uid]`

**Status:** ✅ Done — `app/(app)/profile/[uid]/page.tsx` created; member rows in community detail and friends list now link to it.

---

## 2. Location Permission Request on Map Entry 🔴 HIGH

**Problem:** Map opens silently — no explanation of why location is needed, no handling of denied state.

**Android equivalent:** System permission dialog + rationale dialog if denied.

**To implement:**
- `components/map/LocationPermissionSheet.tsx` — bottom sheet explaining location use
- Show on map mount if permission is `prompt` or `denied`
- Store consent in `localStorage: location_consent`
- Show browser-settings instructions banner if permanently denied

**Status:** ✅ Done — `LocationPermissionSheet` component built inline in `MapClient.tsx`; auto-starts sharing on revisit; `calipal_location_consent` key in localStorage; denied state shows browser-settings instructions.

---

## 3. Desktop Responsiveness 🔴 HIGH

**Problem:** App is mobile-only. Chat fills full viewport, bottom nav is awkward on desktop, content too wide.

### 3a. Bottom Nav → Left Sidebar on desktop (md: breakpoint)
- `app/(app)/layout.tsx` — conditional nav rendering
- `components/layout/AppNav.tsx` — sidebar variant (icon-only at md:, icon+label at lg:)
- Main content: `md:ml-16 lg:ml-48` padding

### 3b. Chat — Split-pane on desktop
- `app/(app)/chat/layout.tsx` (new) — flex row: left panel (conversation list, 300px) + right panel (messages)
- Mobile: keep stack navigation

### 3c. Max-width caps for content
- `max-w-2xl mx-auto` on: Home, Profile, Friends, Settings, Workout, Skills, Assessment, Community list
- `max-w-5xl` on: Community detail, Map
- `max-w-4xl` on: Admin Hub

### 3d. Map sidebar on desktop
- Left panel (320px): park list + active users
- Right: map fills rest
- Park bottom sheet → right sidebar panel on md:

### 3e. Community detail — 2-column tabs on desktop

**Status:** ✅ Done (3a, 3b, 3d partially) — Sidebar nav implemented in `AppNav.tsx` + `layout.tsx`; chat split-pane via `chat/layout.tsx` + `ChatListPane.tsx`; map height fixed for desktop. Max-width (3c) already existed on most pages. Map sidebar panel (3d full) and 2-col community tabs (3e) deferred.

---

## 4. Community Posts Tab 🟡 MEDIUM

**Problem:** Community detail has Members/Trainings tabs but no Posts tab.

**Android equivalent:** Posts tab with text/image community updates.

**To implement:**
- Add "Postări" tab to `app/(app)/community/[id]/page.tsx`
- `components/community/PostCard.tsx` (new)
- `components/community/CreatePostModal.tsx` (new)
- Stored in `communities/{id}/posts` subcollection

**Status:** ⬜ Not started

---

## 5. In-App Notification Panel 🟡 MEDIUM

**Problem:** FCM tokens saved but no in-app notification inbox.

**Android equivalent:** Bell icon + badge on Home, panel with mark-read/delete.

**To implement:**
- Bell icon in Home header
- `components/layout/NotificationPanel.tsx` (new) — Sheet sliding from right
- `lib/firebase/notifications.ts` (new)
- Stored in `notifications/{uid}/items/{notifId}`
- Handle types: NEW_MESSAGE, FRIEND_REQUEST, FRIEND_REQUEST_ACCEPTED, TRAINING_STARTED, TRAINING_UPDATED, TRAINING_DELETED, COMMUNITY_DELETED, FRIEND_AT_YOUR_PARK, PARK_REQUEST, PARK_CREATED, OFFICIAL_TRAINING_POSTED

**Status:** ⬜ Not started

---

## 6. Training RSVP 🟡 MEDIUM

**Problem:** Planned trainings have no RSVP.

**Android equivalent:** GOING / MAYBE / NOT_GOING buttons, attendee counts, reminders.

**To implement:**
- RSVP buttons on training cards in `community/[id]/page.tsx`
- Stored in `communities/{id}/trainings/{trainingId}/rsvps/{uid}`
- Show attendee count per response type
- Optional reminder toggle via browser Notification API

**Status:** ⬜ Not started

---

## 7. Admin — Park Request Workflow 🟡 MEDIUM

**Problem:** Users can't submit park requests; admin panel doesn't handle approval.

**Android equivalent:** Users submit park requests → admins approve/reject → park created.

**To implement:**
- "Solicită un parc" button on Map page → form modal (name, address, city, coords, description)
- Writes to `park_requests/{requestId}`
- Admin Hub Parks tab: pending requests list with Approve/Reject buttons
- Approve → creates park + deletes request

**Status:** ⬜ Not started

---

## 8. Coach Hub 🟡 MEDIUM

**Problem:** No Coach Hub for trainers, no Master Coach review system.

**Android equivalent:** Separate Coach Hub screen; users pay 30 coins to submit videos for expert review.

**To implement (Coach Hub — trainer side):**
- `app/(app)/coach/page.tsx` (new) — gated by `isCoach` flag or trainer role
- Tab 1: Form check requests (video + notes, submit feedback)
- Tab 2: Training plan requests (accept/decline)
- Visible in Settings only to coaches/trainers

**To implement (Master Coach — user side):**
- Card in `app/(app)/workout/page.tsx`
- Form: select video, add notes, confirm 30-coin deduction
- Writes to `form_check_requests/{id}` + uploads to Storage
- Request history view

**Status:** ⬜ Not started

---

## 9. Live Location Sharing Modes 🟢 LOWER

**Problem:** Map broadcasts location to everyone; Android has OFF / FRIENDS_ONLY / EVERYWHERE / TRAINING_ONLY.

**To implement:**
- Add `locationSharingMode` to UserDoc type
- Settings page picker
- Map page respects mode before starting watchPosition
- Friends' locations filtered on reads

**Status:** ⬜ Not started

---

## 10. Favorite Community 🟢 LOWER

**Problem:** No way to star a community as favorite; Android shows it prominently on Home.

**To implement:**
- Star icon on community cards
- `favoriteCommunityId` on UserDoc
- Favorite community card on Home page

**Status:** ⬜ Not started

---

## 11. Push-up & Squat Form Check 🟢 LOWER

**Problem:** Form Check only supports pull-ups.

**To implement:**
- Exercise selector in `app/(app)/workout/form-check/page.tsx`
- Push-up: track elbow angle (wrist/elbow/shoulder), rule-based rep counting
- Squat: track knee angle (hip/knee/ankle), rule-based rep counting
- `lib/ml/pose-math.ts`: add `kneeAngle()` helper

**Status:** ⬜ Not started

---

## 12. Language & Units Settings 🟢 LOWER

**Problem:** Romanian-only; Android supports 5 languages and metric/imperial.

**To implement (phase 1 — defer full i18n):**
- Settings page: language picker (RO, EN) stored in `localStorage`
- Settings page: units picker (Metric / Imperial) affects workout weight display

**Status:** ⬜ Not started

---

## 13. About & Privacy Pages 🟢 LOWER

**Problem:** Settings links go nowhere.

**To implement:**
- `app/(app)/profile/about/page.tsx`
- `app/(app)/profile/privacy/page.tsx`

**Status:** ⬜ Not started

---

## 14. Offline Indicator 🟢 LOWER

**Problem:** Actions fail silently when offline.

**To implement:**
- `components/layout/OfflineBanner.tsx` — listens to `window online/offline` events
- Fixed top banner when offline
- Mount in `app/(app)/layout.tsx`

**Status:** ⬜ Not started

---

## Priority Summary

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Other user profile | 🔴 High | ✅ |
| 2 | Location permission on map | 🔴 High | ✅ |
| 3 | Desktop responsiveness | 🔴 High | ✅ |
| 4 | Community Posts tab | 🟡 Medium | ⬜ |
| 5 | In-app notifications | 🟡 Medium | ⬜ |
| 6 | Training RSVP | 🟡 Medium | ⬜ |
| 7 | Admin park requests | 🟡 Medium | ⬜ |
| 8 | Coach Hub | 🟡 Medium | ⬜ |
| 9 | Live location modes | 🟢 Lower | ⬜ |
| 10 | Favorite community | 🟢 Lower | ⬜ |
| 11 | Push-up/Squat form check | 🟢 Lower | ⬜ |
| 12 | Language & Units | 🟢 Lower | ⬜ |
| 13 | About & Privacy | 🟢 Lower | ⬜ |
| 14 | Offline indicator | 🟢 Lower | ⬜ |
