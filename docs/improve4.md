# CaliPal Web — Improvement Plan 4: Bug Fixes, Visual Polish & Code Quality

## Context

A full-depth audit of the entire CaliPal Web codebase (Next.js 15, React 19, TypeScript, Tailwind CSS, Firebase) surfaced 66 distinct issues across six categories: critical functional bugs, visual/styling inconsistencies, accessibility violations, code quality problems, security gaps, and performance/PWA issues. This plan addresses every finding in priority order so the app is stable, consistent-looking, accessible, and maintainable.

---

## Batch 1: Critical Bugs (Data Corruption, Crashes, Silent Failures)

Fix these first — they cause real data loss or broken core flows.

---

### B1-1 — Workout streak race condition (data corruption)
**File:** `app/(app)/workout/page.tsx` lines 263–283  
Streak `getDoc()` + `updateDoc()` are two separate ops — concurrent saves corrupt the counter.  
**Fix:** Wrap streak update in `runTransaction(db, async tx => { const snap = await tx.get(userRef); ... tx.update(userRef, { currentStreak: newStreak, totalWorkouts: increment(1), lastWorkoutDate: today }) })`. Import `runTransaction` from `firebase/firestore`.  
**Effort:** M

---

### B1-2 — Streak uses `toDateString()` — timezone-brittle
**File:** `app/(app)/workout/page.tsx` lines 269–277  
`new Date().toDateString()` produces locale strings that break across timezones.  
**Fix:** Replace with a local-date helper: `const localDate = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')`. Use `localDate(new Date())` for today and `localDate(new Date(Date.now()-86400000))` for yesterday. Store `lastWorkoutDate` as `"yyyy-MM-dd"`.  
**Effort:** S

---

### B1-3 — `JSON.parse` without proper cleanup crashes on next page load
**File:** `app/(app)/workout/page.tsx` lines 121–141  
`sessionStorage.removeItem` is inside the try block — if `JSON.parse` throws, the bad key persists and re-crashes on the next load.  
**Fix:** Move `sessionStorage.removeItem('calipal_load_training')` to run immediately after `getItem` (before the parse), so it is always cleared regardless of parse success.  
**Effort:** S

---

### B1-4 — Firestore `onSnapshot` cleanup gap (orphaned subscriptions)
**File:** `app/(app)/home/page.tsx` lines 57–88  
`unsubCommProgress` is a `let` captured by closure — the cleanup function may reference a stale value after `favoriteCommunityId` changes.  
**Fix:** Change `let unsubCommProgress` to `const unsubProgressRef = useRef<(() => void) | null>(null)`. Inside the outer `onSnapshot` callback, assign `unsubProgressRef.current = onSnapshot(...)`. In the outer `useEffect` cleanup: `unsubProgressRef.current?.()`. This ensures the latest listener is always cleaned up.  
**Effort:** M

---

### B1-5 — Community join/leave not atomic (member count + doc are separate ops)
**File:** `app/(app)/community/[id]/page.tsx` lines 215–262  
`setDoc` for the member document and `updateDoc` for `memberCount` are two separate Firestore calls — can desync.  
**Fix:** Wrap each of `joinCommunity`, `leaveCommunity`, `kickMember` in a `writeBatch`: batch both the member doc write/delete and the `memberCount` increment/decrement, then `batch.commit()`.  
**Effort:** M

---

### B1-6 — RSVP silent failure
**File:** `app/(app)/home/page.tsx` lines 390–394  
`updateDoc` for RSVP has no try-catch; Firestore permission denials are swallowed.  
**Fix:** Wrap in try-catch. On error, set a local `rsvpError` string state and render a small toast/inline message: `"Nu s-a putut salva RSVP. Încearcă din nou."`.  
**Effort:** S

---

### B1-7 — Memory leak: `URL.createObjectURL()` not revoked
**File:** `app/(app)/profile/edit/page.tsx` line 40  
Each new photo pick creates a blob URL that is never released.  
**Fix:** In `handleFileChange`, call `if (previewUrl) URL.revokeObjectURL(previewUrl)` before creating the new one. Add `useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])` for unmount cleanup.  
**Effort:** S

---

### B1-8 — Stale community events never re-fetched
**File:** `app/(app)/community/page.tsx` line 108  
`loadedEventi` flag is set once and never reset, so events are never refreshed.  
**Fix:** Remove the `loadedEventi` state. Replace with a `useEffect` that fires on `[tab, joinedIds]` change, guarded by `if (tab !== 1) return`. Data is fetched fresh each time the Events tab is opened.  
**Effort:** S

---

### B1-9 — Admin page flashes blank screen before redirect
**File:** `app/(app)/admin/page.tsx` lines 32–36  
`return null` for unauthorized users runs synchronously before `router.replace()` completes.  
**Fix:** Replace `return null` with a full-screen div matching the app background: `<div className="min-h-screen" style={{ backgroundColor: 'var(--app-bg)' }} />`.  
**Effort:** S

---

### B1-10 — Intro skip not recorded/checked
**File:** `app/(auth)/intro/page.tsx` line 62  
`calipal_intro_done` is written on completion but never read on page load; returning users see the intro again.  
**Fix:** Add `useEffect(() => { if (localStorage.getItem('calipal_intro_done')) router.replace('/login') }, [router])` at the top of `IntroPage`.  
**Effort:** S

---

### B1-11 — Forgot password resend errors swallowed
**File:** `app/(auth)/forgot-password/page.tsx` lines 45–49  
`handleResend` catch block is empty.  
**Fix:** Add `useState<string>('')` for `resendError`. In catch: `setResendError('Retrimite a eșuat. Încearcă din nou.')`. Render it near the resend button.  
**Effort:** S

---

### B1-12 — No error state for non-existent community
**File:** `app/(app)/community/[id]/page.tsx`  
If the community ID doesn't exist, `onSnapshot` never sets `community` and the loading spinner runs forever.  
**Fix:** In the `onSnapshot` callback: `if (snap.exists()) { setCommunity(...) } else { setCommunity(null) }; setLoading(false)`. In render, after loading check: `if (!community) return <NotFoundState message="Această comunitate nu există sau a fost ștearsă." />` with a back button.  
**Effort:** S

---

### B1-13 — Chat 404: invalid conversation ID loads empty forever
**File:** `app/(app)/chat/[conversationId]/page.tsx` line ~77  
Error handler only calls `setLoading(false)` — no `notFound` state.  
**Fix:** Add `const [notFound, setNotFound] = useState(false)`. In the `onSnapshot` error callback: `setNotFound(true); setLoading(false)`. Render: `if (notFound) return <NotFoundState message="Conversație negăsită." />`.  
**Effort:** S

---

### B1-14 — Rep/duration steppers allow values below 1
**File:** `app/(app)/workout/page.tsx` (all stepper decrement handlers)  
Users can decrement reps/seconds to 0 or negative.  
**Fix:** Clamp in every decrement handler: `setLogReps(r => Math.max(1, r - 1))`, `setLogSecs(s => Math.max(5, s - 5))`. Same for set-editing popups.  
**Effort:** S

---

### B1-15 — Photo upload has no MIME/size validation
**File:** `app/(app)/profile/edit/page.tsx` (`handleSave` + `handleFileChange`)  
Upload accepts any file type; no size limit enforced before upload attempt.  
**Fix:** In `handleFileChange` validate before setting the file:
```ts
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
if (!ALLOWED.includes(file.type)) { setError('Doar imagini JPEG, PNG sau WebP.'); return }
if (file.size > 5 * 1024 * 1024) { setError('Imaginea nu poate depăși 5MB.'); return }
```
Add `accept="image/jpeg,image/png,image/webp"` to the `<input type="file">`. Set specific upload error message: `"Nu s-a putut încărca fotografia. Verifică dimensiunea (max 5MB) și formatul."`.  
**Effort:** S

---

## Batch 2: Visual Polish (Color, Spacing, Responsive Design)

---

### B2-1 — Inconsistent brand green (3 different hex values)
**Files:** `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `community/create/page.tsx`, `profile/edit/page.tsx`, `map/MapClient.tsx`  
`#1DB954` used in auth pages and `#2EF070` in map instead of canonical `#1ED75F`.  
**Fix:** Replace all inline `style={{ backgroundColor: '#1DB954' }}` button props with `className="bg-brand-green"`. In `MapClient.tsx`, change the `#2EF070` gradient stop to `#1ED75F`.  
**Effort:** S

---

### B2-2 — Missing PWA icons (install fails silently)
**Files:** `public/manifest.json`, `app/layout.tsx`  
`"icons": []` in manifest; `/public/icons/` directory doesn't exist; `layout.tsx` references `/icons/icon-192.png`.  
**Fix:** Create `/public/icons/` directory. Add `icon-192.png` (192×192) and `icon-512.png` (512×512) with CaliPal branding. Update `manifest.json`:
```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
]
```
**Effort:** M

---

### B2-3 — Light mode CSS variables not applied to app background/surface
**File:** `app/globals.css` lines 169–221  
`.light` overrides Tailwind white utilities but `--app-bg`, `--app-surface`, `--background`, `--card` CSS vars are NOT updated — backgrounds stay dark.  
**Fix:** Expand the `.light {}` block to override all dark-mode CSS vars with their light equivalents. Ensure `body { background-color: var(--app-bg) }` applies correctly in both modes.  
**Effort:** M

---

### B2-4 — Inconsistent button heights (52px vs 50px)
**Files:** `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `profile/edit/page.tsx`  
Mix of `h-13`, `style={{ height: 52 }}`, `style={{ height: 50 }}`.  
**Fix:** Standardize on `h-[52px]` Tailwind class everywhere. Remove all inline `style={{ height: ... }}` from primary CTA buttons.  
**Effort:** S

---

### B2-5 — Missing safe-area insets (iPhone home indicator overlaps bottom nav)
**Files:** `app/layout.tsx`, `components/layout/AppNav.tsx`, `app/(app)/layout.tsx`  
No `viewport-fit=cover`; bottom nav has a fixed `h-[64px]` with no `env(safe-area-inset-bottom)`.  
**Fix:** Add `viewportFit: 'cover'` to the viewport export in `layout.tsx`. In `AppNav.tsx` mobile nav: replace fixed `h-[64px]` with `min-h-[64px]` and add `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}`. In `app/(app)/layout.tsx` `<main>`, replace `pb-16` with `pb-[calc(4rem+env(safe-area-inset-bottom))]`.  
**Effort:** S

---

### B2-6 — Z-index chaos (no central system)
**Files:** `OfflineBanner.tsx`, `NotificationPanel.tsx`, `AppNav.tsx`, `app/(app)/layout.tsx`  
Z-indexes scattered across files (z-50, z-[200], z-[500], z-[3000], z-[4000], z-[9000]) with no documentation or guarantees.  
**Fix:** Create `lib/constants.ts` with:
```ts
export const Z = {
  nav: 50,
  miniBar: 200,
  communityModal: 500,
  parkModal: 3000,
  notifications: 4000,
  offlineBanner: 9000,
} as const
```
Replace all inline `z-[...]` values with `style={{ zIndex: Z.xxx }}`. Add a comment in the file documenting the layer order.  
**Effort:** S

---

### B2-7 — Text truncation without `min-w-0` doesn't actually truncate
**Files:** `chat/page.tsx`, `home/page.tsx`  
`.truncate` on flex children without `min-w-0` — text never clips because flex children don't shrink below `auto` by default.  
**Fix:** Add `min-w-0` to every flex child that uses `.truncate`. In non-flex contexts, add `max-w-full`.  
**Effort:** S

---

### B2-8 — Avatar component duplicated in 4 places (shadcn Avatar unused)
**Files:** `chat/page.tsx`, `chat/ChatListPane.tsx`, `community/[id]/page.tsx`, `map/MapClient.tsx`, `components/ui/avatar.tsx`  
Each file has its own slightly-different Avatar implementation; the shadcn `avatar.tsx` component is never imported.  
**Fix:** Create `components/ui/UserAvatar.tsx` accepting `{ src?: string; name?: string; size?: number; className?: string }`. Renders `<img alt={name ?? 'User avatar'}>` with an initial-letter div fallback on `bg-brand-green/20`. Replace all four custom Avatar implementations with this single component.  
**Effort:** M

---

### B2-9 — Sidebar nav transition is instant (no duration specified)
**File:** `components/layout/AppNav.tsx`  
`transition-colors` without a `duration-*` class makes color changes instant.  
**Fix:** Add `duration-150` alongside every `transition-colors` on sidebar nav link elements. Add `transition-[width] duration-200` to the sidebar `<nav>` container for the icon→label width expansion.  
**Effort:** S

---

### B2-10 — Modal overflow/scroll cuts off content on small screens
**File:** `app/(app)/workout/page.tsx` (PostWorkoutDetails, exercise search sheet); `community/[id]/page.tsx`  
`maxHeight: 88vh` and `max-h-[70vh]` modals have no inner scroll container, cutting off content.  
**Fix:** Give all modals a flex-column structure: outer div uses `flex flex-col max-h-[88vh]`, the header/footer are non-growing, and the content area uses `flex-1 overflow-y-auto overscroll-contain`.  
**Effort:** S

---

### B2-11 — Hardcoded auth gradient backgrounds not themeable
**Files:** `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `intro/page.tsx`  
`linear-gradient(135deg, #0F0F0F, #1A2A1A)` used as inline style throughout auth pages.  
**Fix:** Add to `globals.css`: `.auth-bg { background: linear-gradient(135deg, #0F0F0F, #1A2A1A); }`. Replace all inline `style={{ background: 'linear-gradient(...)' }}` with `className="auth-bg"`.  
**Effort:** S

---

### B2-12 — Default Next.js scaffold SVGs still in `/public`
**Files:** `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`  
These are Next.js defaults, not used by any app code, and pollute the public directory.  
**Fix:** Delete all five SVGs. Verify with a grep that no app code references them first.  
**Effort:** S

---

### B2-13 — Color contrast below WCAG AA
**Files:** `globals.css`, `login/page.tsx`  
`text-white/45` for input labels (~3.5:1) and `text-brand-green/80` for the "Forgot password" link fail AA contrast.  
**Fix:** Change `text-white/45` → `text-white/60` in `globals.css`. Change `text-brand-green/80` → `text-brand-green` (full opacity). Bump unread count badge text from `text-[10px]` → `text-[11px]`.  
**Effort:** S

---

## Batch 3: UX & Accessibility

---

### B3-1 — No ARIA labels on icon-only buttons (30+ instances)
**Files:** All pages — priority: `workout/page.tsx`, `community/[id]/page.tsx`, `home/page.tsx`, `chat/[conversationId]/page.tsx`, `profile/page.tsx`  
Screen readers cannot identify icon-only buttons.  
**Fix:** Add `aria-label` to every icon-only button. Common patterns:
- Back buttons → `aria-label="Înapoi"`
- Close/X → `aria-label="Închide"`
- Delete → `aria-label="Șterge"`
- Edit → `aria-label="Editează"`
- Send message → `aria-label="Trimite mesajul"`
- Password toggle → `aria-label={show ? 'Ascunde parola' : 'Arată parola'}`

**Effort:** M

---

### B3-2 — No `alt` text on avatar images
**Files:** All pages (resolved by B2-8 `UserAvatar` consolidation)  
**Fix:** Ensure `UserAvatar.tsx` always passes `alt={name ? \`Avatar ${name}\` : 'User avatar'}` to the `<img>`. Audit any remaining avatar `<img>` tags outside the component.  
**Effort:** S

---

### B3-3 — `userScalable: false` violates WCAG 1.4.4 (Resize Text)
**File:** `app/layout.tsx` line 25  
Prevents users from zooming to 200%.  
**Fix:** Remove `userScalable: false` and `maximumScale: 1` from the viewport export. To prevent iOS auto-zoom on focus, ensure all `<input>` elements use at least `text-base` (16px font size).  
**Effort:** S

---

### B3-4 — Form labels (`<p>` tags) not associated with inputs
**Files:** `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `profile/edit/page.tsx`  
All forms use `<p>` visual labels — screen readers don't associate them with their inputs.  
**Fix:** In the shared `Field` component, replace `<p className="...">` with `<label htmlFor={id} className="...">`. Use `const id = useId()` (React 18) for stable IDs. Add `id={id}` to the `<input>`. Repeat for profile edit fields.  
**Effort:** S

---

### B3-5 — No focus trap in modals (Tab key escapes)
**Files:** `workout/page.tsx` (exercise search, post-workout), `community/[id]/page.tsx`, `map/MapClient.tsx` (ParkRequestModal)  
**Fix:** Create `lib/hooks/useFocusTrap.ts` — a hook that takes a container ref, queries all focusable elements inside, and intercepts Tab/Shift+Tab to cycle focus within. Apply to modal container refs: `useEffect(() => { if (isOpen) containerRef.current?.focus() }, [isOpen])`.  
**Effort:** M

---

### B3-6 — Browser/Android back button doesn't close full-screen overlays
**Files:** `workout/page.tsx` (PostWorkoutDetails, form-check overlays), any full-screen overlay  
Pressing back navigates away from the page instead of closing the overlay.  
**Fix:** When an overlay opens, push a synthetic history entry: `window.history.pushState({ modal: 'overlay-name' }, '')`. Add `window.addEventListener('popstate', handleClose)` and remove the listener on overlay close. The `popstate` event fires on back press, closing the modal.  
**Effort:** M

---

### B3-7 — Color-only status indicators (no text/icon alternative)
**Files:** Community role badges, challenge status, streak counters  
**Fix:** Ensure every color-coded badge also renders a text label alongside the color. For community role badges, `ROLE_LABELS` text must always appear next to the color dot. Audit every colored status pill to confirm it has a text fallback.  
**Effort:** S

---

### B3-8 — Focus ring nearly invisible in dark mode
**File:** `app/globals.css`  
`--ring` resolves to a very low-opacity gray; keyboard users can't see which element is focused.  
**Fix:** In the `.dark` block, set `--ring: oklch(0.6 0.2 150)` (a visible green-tinted ring). In `:root`, set `--ring: oklch(0.4 0.15 150)`. Never use `outline-none` on keyboard-accessible elements without an alternative focus indicator.  
**Effort:** S

---

## Batch 4: Code Quality (DRY, Type Safety, Architecture)

---

### B4-1 — `formatDuration`, `formatDate`, `getDisplayName` each duplicated 3–4×
**Files:** `workout/page.tsx`, `profile/page.tsx`, `community/page.tsx`, `app/(app)/layout.tsx`, `useMyProfile.ts`, `firestore.ts`, `chat/page.tsx`, `community/[id]/page.tsx`  
**Fix:** Create `lib/formatters.ts` exporting `formatDuration(s: number): string`, `formatDate(ts): string`, `formatDateStr(str): string`. Create `lib/getDisplayName.ts` exporting `DEFAULT_DISPLAY_NAME = 'Utilizator'` and `getDisplayName(profile, user): string`. Remove all duplicate definitions; import from these shared modules.  
**Effort:** M

---

### B4-2 — `workout/page.tsx` is 1,438 lines — needs splitting
**File:** `app/(app)/workout/page.tsx`  
A single file handles home tab, active workout, post-workout details, summary overlay, and history.  
**Fix:** Extract into `app/(app)/workout/_components/`:
- `WorkoutHomeTab.tsx` — history list, challenge card, start button
- `ActiveWorkoutView.tsx` — timer UI, exercise list, search sheet
- `PostWorkoutDetails.tsx` — Strava-style photo + description form
- `WorkoutSummaryCard.tsx` — final summary overlay
- `WorkoutHistoryItem.tsx` — individual workout history card

Main `page.tsx` becomes a thin coordinator (~80 lines) that manages `screen` state and renders the correct component. Shared helpers (`exerciseOneLiner`, `totalRepsInWorkout`) move to `workout/_helpers.ts`.  
**Effort:** L

---

### B4-3 — `as unknown as` type casts hide real TypeScript errors
**Files:** `lib/firebase/firestore.ts` line 16, `lib/firebase/auth.ts`  
`null as unknown as ReturnType<typeof getFirestore>` bypasses type safety entirely.  
**Fix:** Replace with a runtime guard: `if (!app) throw new Error('Firebase app not initialized')`. For Firestore document casts (`snap.data() as UserDoc`), create a `parseUserDoc(data: DocumentData): UserDoc` validator that checks required fields exist before narrowing the type.  
**Effort:** M

---

### B4-4 — Empty catch blocks throughout (silent failures)
**Files:** Multiple async operations across all pages  
Errors are silently swallowed making bugs undetectable.  
**Fix:** Audit every `catch` block. For genuinely non-critical errors: add a comment explaining why it's safe to ignore (e.g., `// permission-denied expected for non-members`). For any user-facing operation: add `console.error('[Context]', e)` at minimum, and set a visible error state in the UI where appropriate.  
**Effort:** M

---

### B4-5 — Magic numbers scattered throughout (52, 64, 16, 148, 153, 105)
**Files:** `layout.tsx`, `AppNav.tsx`, `workout/page.tsx`, `lib/ml/rep-counter.ts`  
Heights, widths, and ML angle thresholds are hardcoded literals with no explanation.  
**Fix:** Extend `lib/constants.ts` (created in B2-6) with:
```ts
export const NAV_HEIGHT = 64
export const SIDEBAR_WIDTH_SM = 64
export const SIDEBAR_WIDTH_LG = 192
export const BTN_HEIGHT = 52
export const ML_PULLUP_UP_ANGLE = 148
export const ML_PULLUP_DOWN_ANGLE = 105
export const ML_PUSHUP_UP_ANGLE = 155
export const ML_PUSHUP_DOWN_ANGLE = 90
export const ML_SQUAT_UP_ANGLE = 160
export const ML_SQUAT_DOWN_ANGLE = 100
```
Replace all magic number usages with named constants.  
**Effort:** M

---

### B4-6 — Unused imports accumulating
**Files:** `workout/page.tsx`, `community/[id]/page.tsx`, `admin/page.tsx` (and others)  
**Fix:** Enable `no-unused-vars` in ESLint config (`eslint.config.mjs`). Run `npx next lint` and remove all flagged unused imports. Priority: the three largest page files.  
**Effort:** S

---

### B4-7 — No error boundaries (any component throw crashes the entire app)
**Files:** `app/(app)/layout.tsx` and all complex pages  
**Fix:** Create `components/layout/ErrorBoundary.tsx` — a class component with `getDerivedStateFromError` and `componentDidCatch`. Render fallback: a centered message with a `"Reîncarcă pagina"` button that calls `window.location.reload()`. Wrap `<AppLayoutInner>` in `<ErrorBoundary>` in `app/(app)/layout.tsx`. Also add Next.js `error.tsx` route segment files in `workout/`, `community/`, and `admin/` for fine-grained recovery.  
**Effort:** M

---

### B4-8 — `useMyProfile` display name fallback can return empty string
**File:** `lib/hooks/useMyProfile.ts` line 28  
If `storedName === 'Utilizator'` AND `authName === ''`, the current fallback chain produces `''` — blank names in the UI.  
**Fix:** Change to: `const displayName = (storedName && storedName !== DEFAULT_DISPLAY_NAME) ? storedName : (authName || DEFAULT_DISPLAY_NAME)`. Never return empty string; always fall back to `DEFAULT_DISPLAY_NAME`. Import from `lib/getDisplayName.ts` (created in B4-1).  
**Effort:** S

---

## Batch 5: Security & PWA

---

### B5-1 — Hardcoded superadmin email in 4 source files + Firestore rules
**Files:** `home/page.tsx`, `profile/page.tsx`, `admin/page.tsx`, `community/[id]/page.tsx`, `firestore.rules`  
`aignat131@gmail.com` as a string literal is a security and maintainability problem.  
**Fix (client code):** Create `.env.local` (git-ignored) with `NEXT_PUBLIC_SUPERADMIN_EMAIL=aignat131@gmail.com`. Replace all string literals with `process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL ?? ''`.  
**Fix (Firestore rules):** Set a `superAdmin: true` Firebase custom claim via Admin SDK (in a Cloud Function or admin script). Change `firestore.rules` from email comparison to `request.auth.token.superAdmin == true`. This removes the email from the rules file entirely.  
**Effort:** M

---

### B5-2 — No MIME type or size validation on file uploads
**Files:** `profile/edit/page.tsx` and any other photo upload  
File inputs accept any file type; no size limit enforced client-side.  
**Fix:** In `handleFileChange`:
```ts
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
if (!ALLOWED.includes(file.type)) { setError('Doar imagini JPEG, PNG sau WebP.'); return }
if (file.size > 5 * 1024 * 1024) { setError('Imaginea nu poate depăși 5MB.'); return }
```
Add `accept="image/jpeg,image/png,image/webp"` to the `<input type="file">` element.  
**Effort:** S

---

### B5-3 — No email verification flow
**Files:** `register/page.tsx`, `app/(app)/layout.tsx`  
Users can register with fake/typo'd email addresses.  
**Fix:** After `createUserWithEmailAndPassword`, call `sendEmailVerification(credential.user)`. In the app layout auth guard, add: `if (user && !user.emailVerified && user.providerData[0]?.providerId !== 'google.com') router.replace('/verify-email')`. Create `app/(auth)/verify-email/page.tsx` with a "Verifică emailul tău" message and a "Retrimite email" button.  
**Effort:** M

---

### B5-4 — XSS audit on user-generated content rendering
**Files:** All files rendering user posts, comments, names  
React escapes JSX content by default, but any `dangerouslySetInnerHTML` usage bypasses this.  
**Fix:** Run `grep -r "dangerouslySetInnerHTML" app/`. If any instances exist, wrap content with `DOMPurify.sanitize()` (`npm install dompurify`). Add an ESLint rule to flag any future `dangerouslySetInnerHTML` usage for review.  
**Effort:** S

---

### B5-5 — Missing OG/social meta tags (blank social share previews)
**File:** `app/layout.tsx`  
No `og:title`, `og:description`, `og:image` defined.  
**Fix:** Extend the `metadata` export:
```ts
openGraph: {
  title: 'CaliPal — Calisthenics & Street Workout',
  description: 'Înregistrează antrenamente, găsește parcuri și conectează-te cu comunitatea.',
  url: 'https://calipal.app',
  images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  type: 'website',
},
twitter: { card: 'summary_large_image', title: 'CaliPal', description: '...' },
```
Create `/public/og-image.png` (1200×630) with CaliPal branding on the dark green background.  
**Effort:** M

---

### B5-6 — `themeColor` not dark/light aware
**File:** `app/layout.tsx` line 21  
Single `themeColor: '#1ED75F'` — browser chrome looks wrong in dark mode.  
**Fix:**
```ts
themeColor: [
  { media: '(prefers-color-scheme: dark)', color: '#0D2E2B' },
  { media: '(prefers-color-scheme: light)', color: '#1ED75F' },
],
```
**Effort:** S

---

### B5-7 — PWA screenshots empty (no enhanced Android install dialog)
**File:** `public/manifest.json`  
`"screenshots": []` — the Android install sheet won't show app previews.  
**Fix:** Capture 2–3 app screenshots at 390×844px. Add to `/public/screenshots/`. Update manifest:
```json
"screenshots": [
  { "src": "/screenshots/home.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" },
  { "src": "/screenshots/workout.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow" }
]
```
**Effort:** M

---

### B5-8 — Missing Android Chrome PWA meta
**File:** `app/layout.tsx`  
Only `appleWebApp` meta is set; Android Chrome needs `mobile-web-app-capable`.  
**Fix:** Add to `metadata.other`: `{ 'mobile-web-app-capable': 'yes' }`. Confirm `manifest.json` `theme_color` matches `#1ED75F`.  
**Effort:** S

---

## Batch 6: Performance & Long-Term Quality

---

### B6-1 — No debounce on exercise search (filters every keystroke)
**File:** `app/(app)/workout/page.tsx` lines 576–578  
`filteredCatalogue` is recomputed synchronously on every character typed.  
**Fix:** Create `lib/hooks/useDebounce.ts`:
```ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
```
Use `const debouncedQuery = useDebounce(searchQuery, 150)` and filter against `debouncedQuery`.  
**Effort:** S

---

### B6-2 — No pagination on community listings, workout history, or chat
**Files:** `community/page.tsx`, `workout/page.tsx`, `chat/[conversationId]/page.tsx`  
**Fix:**
- **Community listing:** Add `limit(50)` to the query. Add a "Încarcă mai multe" button that calls `startAfter(lastDoc)` and appends results.
- **Workout history:** Already uses `limit(20)`. Add a "Mai mult" button: `useState<DocumentSnapshot | null>(null)` for `lastDoc`, append on load-more.
- **Chat messages:** Add `limit(50)` ordered `desc`. Reverse array for display. Use an Intersection Observer at the top of the message list to load older messages.

**Effort:** M

---

### B6-3 — Exercise search not diacritic-insensitive
**File:** `app/(app)/workout/page.tsx` line 577  
`"tractiuni"` typed by user should match `"Tracțiuni"` in the catalogue but doesn't with basic `toLowerCase()`.  
**Fix:** Add a normalizer:
```ts
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
```
Use `norm(e.name).includes(norm(debouncedQuery))` in the filter.  
**Effort:** S

---

### B6-4 — Zero tests in the entire codebase
**Files:** N/A (no test files exist)  
**Fix (phased):**
1. Install: `npm install -D jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom`
2. Add `jest.config.ts` and `jest.setup.ts`
3. Write unit tests for pure utilities first: `formatDuration`, `formatDate`, `getDisplayName`, streak `localDate` helper
4. Add component tests for critical auth flows (login, register)
5. Add `error.tsx` route segment files as safety nets

Start with step 3 — small, pure functions are the easiest wins and immediately catch regressions.  
**Effort:** L

---

## Critical Files Summary

| File | Batches |
|------|---------|
| `app/(app)/workout/page.tsx` | B1-1, B1-2, B1-3, B1-14, B2-10, B3-6, B4-2, B4-5, B6-1, B6-2, B6-3 |
| `app/globals.css` | B2-3, B2-11, B3-8, B2-13 |
| `app/layout.tsx` | B2-2, B3-3, B5-5, B5-6, B5-8 |
| `app/(app)/community/[id]/page.tsx` | B1-5, B1-12, B3-1, B3-5, B5-1 |
| `app/(app)/home/page.tsx` | B1-4, B1-6, B5-1 |
| `lib/firebase/firestore.ts` | B1-5, B4-3 |
| `components/layout/AppNav.tsx` | B2-5, B2-6, B2-9 |
| `public/manifest.json` | B2-2, B5-7 |
| `lib/hooks/useMyProfile.ts` | B4-8 |
| `app/(auth)/login/page.tsx` | B2-1, B2-4, B2-13, B3-4 |

---

## New Files to Create

| File | Purpose |
|------|---------|
| `lib/formatters.ts` | Shared `formatDuration`, `formatDate`, `formatDateStr` |
| `lib/getDisplayName.ts` | `getDisplayName()`, `DEFAULT_DISPLAY_NAME` constant |
| `lib/constants.ts` | `Z` (z-index layers), `NAV_HEIGHT`, ML thresholds, button sizes |
| `lib/hooks/useDebounce.ts` | Generic debounce hook |
| `lib/hooks/useFocusTrap.ts` | Modal keyboard focus trap hook |
| `components/ui/UserAvatar.tsx` | Unified avatar component (replaces 4 duplicates) |
| `components/layout/ErrorBoundary.tsx` | App-level React error boundary with reload fallback |
| `app/(auth)/verify-email/page.tsx` | Email verification prompt screen |
| `app/(app)/workout/_components/` | 5 sub-components split from 1,438-line `workout/page.tsx` |

---

## Verification Checklist

| Batch | How to test |
|-------|-------------|
| Batch 1 | Log a workout → streak increments correctly; join/leave community → memberCount stays accurate; open invalid community URL → see error state not spinner; press back in post-workout → modal closes |
| Batch 2 | Install as PWA → icon appears; toggle light mode → backgrounds are light; test on iPhone → nav sits above home indicator; check all auth buttons → same height |
| Batch 3 | Tab through every form → focus ring visible; VoiceOver/TalkBack → all buttons announced; Android back while modal open → modal closes, stays on page |
| Batch 4 | Search `"tractiuni"` → Tracțiuni appears; open/close profile edit with photo → no memory growth in DevTools; workout page renders all screens after split |
| Batch 5 | Build without `.env.local` → no email in output; register with fake email → verification screen appears; share app URL → OG preview renders |
| Batch 6 | Type fast in exercise search → no jank; scroll to bottom of history → "load more" appears; open old chat → loads last 50 messages with scroll-up for more |
