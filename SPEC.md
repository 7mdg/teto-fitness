# TETO Fitness — Implementation Spec

**Status:** final draft for approval. All open decisions are resolved (§0). No code until this is signed off.
**Supersedes:** `PROPOSAL.md` and `GPT prompt.md` (kept for reference only).
**Verified:** November 2026 against WebKit, Apple, GitHub and Cloudflare documentation (sources at the end).

> **The app is the engine; the imported JSON is the programme.** A personal training and routine tool that you open, use and close within seconds. It works offline, stores data on the phone, and has no accounts.

---

## 0. Decisions (resolved 24 Nov 2026)

| # | Decision | Outcome |
|---|---|---|
| A1 | Tech stack | TypeScript + Preact + Vite, Dexie on IndexedDB, deployed automatically by GitHub Actions, minimal dependencies (§3) |
| A2 | Calendar | Cloudflare Worker subscribed calendar: a unique, **revocable** link per user, carrying schedule data only. A manual `.ics` export is the fallback. The app works fully without it. Not "done" until refresh and alerts are tested on iOS (§9). |
| A3 | Start date | Your plan starts **Monday 30 November 2026**. The start date can be set in each plan and **changed at activation** (§7). |
| A4 | Equipment | Defaults listed in §6.3. They're configurable plan data, not hardcoded. Decimal weights and per-exercise increments are supported. Unilateral exercises are logged combined by default, with optional per-side logging (§8.3). |
| A5 | Reminders | **24 h and 30 min** before each workout. Each can be turned off on its own, and custom times can be added (§9). |
| A6 | Repo / URL | `7mdg/teto-fitness` → `https://7mdg.github.io/teto-fitness/` |
| A7 | License | None. All rights reserved. |
| — | Emphasis | **Swapping an exercise mid-workout** is a core v1 feature (§8.4) |
| — | Rule | Every exercise, piece of equipment, schedule, increment and programme setting comes from plan data. Nothing personal is hardcoded. |

---

## 1. Platform facts the design depends on

| Capability | Status | Consequence for the design |
|---|---|---|
| Home Screen install (iOS 26+: every site added to the Home Screen opens as a web app) | ✅ | Install instructions shown on first launch in Safari |
| Works in the EU | ✅ | Apple reversed the planned removal in March 2024 |
| Offline (service worker) | ✅ | The whole app is cached; works with no signal |
| IndexedDB storage | ✅ | Primary database |
| Storage guaranteed permanent | ⚠️ | `navigator.storage.persist()` is requested and its result shown honestly. Deleting the app icon deletes all data, so **backups are a first-class feature.** |
| Storage shared between Safari and the Home Screen app | ❌ | **Install first, then import.** The app detects Safari-tab mode and shows install steps instead of onboarding. |
| Screen wake lock in the Home Screen app | ✅ iOS 18.4+ (you're on 27.2) | The screen stays on during a workout. Re-acquired when the app returns to the foreground. |
| Rest timer while the app is open | ✅ | Calculated from timestamps, so it stays correct after leaving and coming back |
| Rest timer alert while locked or in the background | ❌ | Not possible. Mitigated by keeping the screen on. |
| Vibration | ❌ | Feedback is visual, plus sound in the foreground |
| Sound | ⚠️ | Foreground only, after the first tap in a session |
| Local notifications scheduled with no server | ❌ | Calendar alerts are used instead |
| Web Push | 🔧 | Possible later through the same Worker. Not in v1. |
| Sharing files (export) | ✅ | Backups, plans and CSVs go out through the Share sheet |
| Importing files | ✅ | File picker, from Files or iCloud Drive |
| Subscribed calendar (webcal) | ✅ | Calendar updates itself, so there's no manual cleanup |
| Apple Health / Apple Watch / Bluetooth | ❌ | Out of scope |

**Storage origin:** your data belongs to `https://7mdg.github.io`.
- Changing your **GitHub username**, or moving to a **custom domain**, means a new origin with empty storage. Restore from a backup in that case.
- Renaming the **repo** keeps the data, but breaks the installed icon's start link, so you'd have to re-add the icon. Pick the name once.
- All Pages sites under `7mdg.github.io` share one origin, so the database is namespaced `teto-fitness`.

---

## 2. Scope

### v1 includes
- Importable, versioned plans, with preview, updates that show what changed, and switching between plans
- AI plan generator kit: prompt, JSON Schema, example plans
- Today screen: today's workout or the next one, programme week and phase, habits
- Workout session: one-tap set logging, previous-performance autofill, rest timer, progression hints, draft recovery
- **Exercise substitution mid-workout** (plan alternatives, any library exercise, or a quick custom exercise), without changing the programme
- Unilateral exercises: combined logging by default, per-side logging optional
- Phase handling (e.g. weeks 1–3 at 2 working sets)
- Flexible scheduling: weekly, multiple sessions per day, alternating weeks, date-specific sessions, optional sessions, moving a single session
- Workout history and per-exercise progress charts
- Light habit tracking, where measurement habits link straight to the measurement input
- Measurements with trend charts; body weight with a 7-day rolling average
- Optional profile
- Workout reminders through a subscribed calendar (Cloudflare Worker), plus a manual `.ics` export fallback
- Full backup and restore (merge or replace), plan export, CSV exports
- Offline, persistent storage, safe updates and migrations

### Excluded from v1 (no placeholders, no disabled menu items)
- Nutrition of any kind. The schema keeps an optional `nutrition` block, and the app ignores it.
- Push notifications, accounts, sync, social features, leaderboards, streaks, gamification
- BMI, body-fat estimates, fitness scores
- Duplicating a plan (exporting and editing does the same job)
- Manually linking equivalent exercises (scheduled for v1.1)
- Progress photos, GPS, Apple Health

---

## 3. Architecture

| Layer | Choice | Reason |
|---|---|---|
| Hosting | GitHub Pages, public repo `7mdg/teto-fitness` | Free, HTTPS, independent of your PC |
| Build/deploy | GitHub Actions on push to `main`: test → build → deploy Pages | The build runs on GitHub, not on your PC |
| Language | TypeScript (strict) | Scheduling, phases, update comparisons and migrations are where bugs hide |
| UI | Preact + `@preact/signals` | The same approach as React at about a tenth of the size |
| Database | Dexie (IndexedDB) | Transactions, versioned migrations, indexes |
| Validation | Ajv against JSON Schema 2020-12, **precompiled at build time** (standalone mode) | No runtime code generation, so a strict Content-Security-Policy works and loading is faster |
| PWA | `vite-plugin-pwa` (Workbox precache), `registerType: "prompt"` | Hashed assets and an update banner, never reloading in the middle of a workout |
| Charts | Hand-written SVG components | Only a few line charts are needed |
| Dates | `Intl` + small in-house helpers for plan-timezone dates | Avoids a date library. Daylight-saving behaviour is covered by tests. |
| Fonts | Instrument Sans + JetBrains Mono, self-hosted woff2 (OFL licence) | Works offline, no Google requests |
| Tests | Vitest: schema, scheduler, phases, progression, update comparison, migrations, backup round-trips | The risky logic is pure functions |
| Calendar sync | Cloudflare Worker + KV, code in `/worker`, deployed by GitHub Actions with the `wrangler` tool | §9 |

**Dependency policy:** pinned lockfile, no automatic upgrades. Runtime dependencies are Preact, signals, Dexie and the Workbox runtime. Nothing else without a reason written down.

**Security and privacy**
- Plan and backup files are parsed with `JSON.parse` only and checked against the schema. A 2 MB limit applies, and unknown properties are rejected with a clear message.
- All user text is rendered as text, never as HTML. Plans can't carry markup or code.
- CSP: `default-src 'self'`; `connect-src 'self'` plus the Worker origin. No inline scripts, no third-party scripts.
- No analytics, no tracking, no personal data in URLs or in the repo.
- The Worker receives only the generated calendar text: workout names, times and prescriptions. Never logged sets, measurements, habits or profile.

### Repository structure
```
teto-fitness/
  src/
    app/            (shell, router, tab bar, update banner)
    screens/        today/  workout/  progress/  settings/  onboarding/
    features/
      plans/        (import, validate, compare, activate, export)
      schedule/     (occurrence generator, phases, overrides)
      training/     (session engine, progression, rest timer, wake lock)
      habits/
      measurements/
      calendar/     (ICS generator, Worker client)
      backup/       (backup, restore, CSV)
    db/             (Dexie schema, migrations)
    ui/             (TETO components + tokens)
    utils/
  public/
    icons/  fonts/
    examples/       teto-recomp-12w.json  full-body-3d-home.json
    schemas/        teto-plan.v1.schema.json  teto-backup.v1.schema.json
  docs/             PLAN_FORMAT.md  AI_GENERATOR_PROMPT.md  DEPLOYMENT.md  CALENDAR.md
  worker/           src/index.ts  wrangler.toml
  tests/
  .github/workflows/  deploy.yml  worker.yml
```

---

## 4. Design system: TETO "night" (from TETO Grid Lab and Redesign direction A · Presence)

**Colour tokens**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D171D` | App background |
| `--panel` | `#111E25` | Cards, sheets |
| `--panel-2` | `#16252D` | Raised / selected |
| `--chip` | `rgba(255,255,255,.06)` | Secondary buttons, inputs |
| `--line` | `rgba(255,255,255,.08)` | Dividers |
| `--ink` | `#E8EEEC` | Primary text |
| `--sub` | `#B9C8C9` | Secondary text |
| `--mut` | `#8FA3A6` | Labels, meta |
| `--acc` | `#7FD6CB` | Primary actions, the active state, the timer |
| `--lime` | `#A8D63A` | PRs, progression hints, completed state |
| `--danger` | `#FFB4A8` | Destructive actions, validation errors |

**Type:** Instrument Sans 400/500/600 for text. JetBrains Mono 400/500 for every number that changes (weights, reps, timer, dates in tables), with tabular figures.
**Brand:** the spaced-out wordmark `T.E.T.O.` (letter-spacing .32em) and the moustache mark, used for the app icon and splash.
**Shapes:**
- Pill buttons 44 px tall, radius 22.
- The main action is a round button (72–88 px) with a teal 10 px halo.
- Card radius 16, input radius 10. Icons are 1.8 px stroke SVG, never emoji.

**Layout and interaction rules**
- Thumb zone: primary actions sit in the bottom 40% of the screen. Touch targets are at least 44 pt. Content respects the notch and home-indicator safe areas.
- Number inputs use the numeric keypad (`inputmode="decimal"`), and ± steppers cover common adjustments.
- Dark only in v1. Respect `prefers-reduced-motion`.
- Every element must answer "what can I do or decide here?" No greetings, no stat tiles without an action, no gradient banners, no glass cards, no left-border accent cards, no centred paragraphs of copy.
- Copy is short and specific: "Start Upper A", not "Let's crush today's workout!"

---

## 5. Data model

Three independent layers. Deleting or changing one never silently changes another.

### 5.1 Programme configuration
| Table | Key | Contents |
|---|---|---|
| `plans` | `id` | `status: active\|inactive\|archived`, `revision`, `importedAt`, `activatedAt`, `startDate` (activation start date, a local override; the plan file is untouched), `json` (the validated plan) |
| `planRevisions` | `[planId+revision]` | Every imported revision, kept so you can see what changed and roll back |

### 5.2 Personal records
| Table | Key / indexes | Contents |
|---|---|---|
| `sessions` | `id`; `startedAt`, `[planId+workoutId]`, `status` | `planId, planRevision, workoutId, occurrenceKey, scheduledDate, startedAt, endedAt, status: active\|completed\|discarded, note, prescription` (a **snapshot** of the workout as it was prescribed at the time), `substitutions: [{slot, plannedExerciseId, performedExerciseId, fromSetIndex}]` |
| `sets` | `id`; `sessionId`, `[exerciseId+loggedAt]` | `exerciseId` (the exercise **actually performed**), `slot` (its position in the workout), `order, setIndex, kind: working\|warmup\|extra, side: both\|left\|right, weightKg` (any decimal)`, reps, durationSec, distanceM, completed, loggedAt` |
| `customExercises` | `id` (`custom-<slug>`) | Exercises you create at the gym: name, tracking, equipment, weightMode, increment, unilateral. Global and usable in any plan. |
| `measurements` | `id`; `[measurementId+date]` | `measurementId (bodyweight, waist…), value, unit, date, loggedAt` |
| `habitLogs` | `[habitId+date]` | `done, value?, loggedAt` |
| `scheduleOverrides` | `id`; `[planId+occurrenceKey]` | Moved or skipped single sessions |

### 5.3 Application preferences
| Table | Key | Contents |
|---|---|---|
| `settings` | `"app"` | Weight unit (kg/lb), rest timer on/off, sound, keep screen awake, active plan id |
| `profile` | `"me"` | Height, starting weight (approximate), activity level, experience, goal, priorities. Seeded from the plan only on first import. |
| `overrides` | `[planId+kind+itemId]` | Local tweaks that survive plan updates: habit enabled/target, exercise increment, rest time, per-side logging, **permanent slot swap** ("always use this alternative"), activation start date |
| `reminderPrefs` | `"workout"` | Reminder offsets `[{minutes, enabled}]`, seeded from the plan the first time, after which yours take priority |
| `calendarLink` | `"feed"` | Worker feed id + write token (deleted and recreated when you revoke the link) |
| `meta` | `"meta"` | `dbVersion, lastBackupAt, persistGranted, installId` |

**Rules**
- **Weights are stored in kg; lengths in cm.** Display conversion only, so switching units is lossless.
- **Current body weight = the latest logged `bodyweight` measurement.** The profile's starting weight is a reference only.
- Measurements and set history are keyed by global IDs (`measurementId`, `exerciseId`), not by plan, so they carry across plans.
- **Different equipment or weight convention means a different `exerciseId`, so separate history.** A machine row and a dumbbell row are never mixed, and neither are per-dumbbell and total weights. A substitution logs sets under the exercise you actually did.
- Weight input accepts both `22,5` and `22.5` (Belgian keyboards type a comma).
- **Deleting a plan never deletes history.** "Delete plan and its history" is a separate action with its own confirmation, and it states what will be removed.
- Every set is written to IndexedDB in its own transaction the moment it's confirmed.
- Migrations: Dexie `version(n).upgrade()`. A migration only ever adds; it never drops data. An automatic local snapshot is taken before each version upgrade (the last 3 are kept).

---

## 6. Plan format (`teto-plan`, schema v1.0.0)

JSON, `.json`, validated with JSON Schema Draft 2020-12, documented in `docs/PLAN_FORMAT.md`. Plans contain data only, never code or HTML.

### 6.1 Root objects
| Key | Required | Purpose |
|---|---|---|
| `format` | ✅ | Always `"teto-plan"` |
| `schemaVersion` | ✅ | Semver string, e.g. `"1.0.0"`. A major version newer than the app is rejected with an explanation. |
| `metadata` | ✅ | `id` (slug, stable forever), `revision` (integer, increases with each edit), `name`, `author?`, `description?`, `createdAt?` |
| `exercises` | ✅ | The exercise library |
| `workouts` | ✅* | Workout templates (*can be empty for a habit-only plan) |
| `schedule` | ✅* | When workouts happen |
| `programme` | — | `durationWeeks?`, `startDate?`, `onCompletion: "continue"\|"stop"`, `phases[]` |
| `profile` | — | Optional personal information |
| `goals` | — | `primary`, `priorities[]` (shown in Settings → Profile only) |
| `habits` | — | Recurring daily tasks |
| `measurements` | — | Which measurements to track |
| `reminders` | — | Suggested reminder offsets (the user's own settings take priority) |
| `preferences` | — | Plan defaults: `weightUnit`, `progressionMethod`, `restTimerEnabled` |
| `nutrition` | — | Accepted but ignored in v1 |

### 6.2 Key definitions
- **Exercise:**
  - `id` is a global, canonical slug. History matches on this; equal IDs are the same exercise. Never merge by name.
  - `name`, `tracking: strength|bodyweight|duration|cardio|isometric|checkbox`.
  - `equipment: barbell|dumbbell|machine|cable|bodyweight|kettlebell|band|other`, `muscleGroups[]`.
  - `weightMode: total|per_dumbbell|per_side|added|assisted` (required for strength). `total` covers barbell including the bar, machine weight and cable stack.
  - `category: compound|isolation`, `defaultRestSeconds`, `weightIncrementKg` (any positive decimal), `notes?`.
  - `unilateral?` (default false), `sideLogging?: combined|separate` (default `combined`).
  - `alternatives?: [exerciseId]`: suggested swaps. Each must exist in `exercises`. Order is the order shown.
- **Workout:** `id`, `name`, `focus?`, `estimatedDurationMinutes?` (integer, or `{min,max}`), `exercises[]`.
  - Each exercise item: `exerciseId`, `sets`, `repsMin`/`repsMax` (or `durationSec` / `distanceM` depending on tracking), `restSeconds?` (overrides the exercise default), `optional?`, `notes?`, `alternatives?` (extends the exercise's own list for this slot only).
- **Phase:** `id`, `name`, `startWeek`, `endWeek`, `workingSetsCap?`, `targetRir?`, `notes?`.
  - Effective sets = `min(prescribed sets, workingSetsCap)`.
  - Phases must not overlap and must stay within `durationWeeks`.
- **Schedule:** `timezone` (IANA, default `Europe/Brussels`), `weekStartsOn`, `entries[]`.
  - Each entry: `id`, `workoutId`, `weekday` **or** `date`, `time` (`HH:MM`), `everyNWeeks?` (default 1), `weekOffset?` (for alternating weeks), `optional?`.
  - Multiple entries on the same day are allowed. Days with no entries are rest days.
- **Habit:** `id`, `name`, `type: checkbox|duration|count|measurement`, `target?` (`{min,max,unit}`), `weekdays[]` or `frequency: daily|weekly`, `scheduledTime?`, `measurementId?` (required when `type = measurement`).
- **Measurement:** `id` (canonical: `bodyweight`, `waist`, `chest`, `upper-arm`, …), `name`, `unit: kg|cm|lb|in|%`, `frequency: daily|weekly|monthly`, `trend?: "rolling7"`.
- **Reminders:** `workout.offsetsMinutes[]` (e.g. `[120, 30]`).

**Cross-reference rules (checked at import, errors name the exact path):**
- Every `exerciseId` and every `alternatives` entry exists in `exercises`, and no exercise lists itself as an alternative.
- Every `workoutId` exists in `workouts`.
- Every habit's `measurementId` exists in `measurements`.
- All IDs are unique within their list.
- Phase weeks fit within `durationWeeks`.
- A `date` entry falls inside the programme when `durationWeeks` is set.

Example error: `workouts[1].exercises[3].exerciseId "pec-dek" does not match any exercise. Did you mean "pec-deck"?`

### 6.3 Your plan: `teto-recomp-12w.json` (shipped as an example; imported, not hardcoded)
- Goal: recomposition · 12 weeks · start **2026-11-30** · `onCompletion: continue` · kg · double progression
- Phases: `intro` weeks 1–3, `workingSetsCap: 2` · `progression` weeks 4–12, full volume
- Rest: compound 120 s · isolation 90 s
- No starting weights. The first session shows empty fields, and from the second session on, fields are prefilled.

| Day | Workout | Time | Duration |
|---|---|---|---|
| Mon | Upper A: chest emphasis | 20:00 | 50–60 min |
| Tue | Lower A | 20:00 | 35–45 min |
| Thu | Upper B: back & arms | 20:00 | 50–60 min |
| Sun | Lower B: legs & accessories | 11:00 | 40–50 min |

**Exercise library (IDs are shared across workouts so history connects)**

| id | Name | Category | Equipment / weight mode | Incr. kg | Used in | Alternatives |
|---|---|---|---|---|---|---|
| `incline-dumbbell-press` | Incline dumbbell press | compound | dumbbell / per_dumbbell | 2 | Upper A 3×8–12 | `incline-chest-press`, `incline-smith-press` |
| `machine-chest-press` | Machine chest press | compound | machine / total | 5 | Upper A 3×8–12 | `dumbbell-bench-press`, `smith-bench-press` |
| `lat-pulldown` | Lat pulldown | compound | cable / total | 2.5 | Upper A · Upper B 3×8–12 | `machine-pulldown`, `assisted-pull-up` |
| `cable-lateral-raise` | Cable lateral raises | isolation | single-arm cable / per_side · unilateral | 1.25 | Upper A 3×12–20 | `dumbbell-lateral-raise`, `machine-lateral-raise` |
| `hammer-curl` | Hammer curls | isolation | dumbbell / per_dumbbell | 1 | Upper A 3×10–15 · Lower B 2×10–15 | `cable-rope-hammer-curl` |
| `triceps-pushdown` | Triceps pushdown | isolation | cable / total | 2.5 | Upper A 2×10–15 | `overhead-triceps-extension`, `machine-dip` |
| `leg-press` | Leg press | compound | machine / total | 5 | Lower A 3×8–12 · Lower B 3×10–15 | `hack-squat`, `smith-squat` |
| `romanian-deadlift` | Romanian deadlift | compound | barbell / total incl. bar | 5 | Lower A 3×8–12 | `dumbbell-romanian-deadlift` |
| `leg-extension` | Leg extension | isolation | machine / total | 2.5 | Lower A · Lower B 2×10–15 | `single-leg-extension` |
| `seated-leg-curl` | Seated leg curl | isolation | machine / total | 2.5 | Lower A 2×10–15 · Lower B 3×10–15 | `lying-leg-curl` |
| `calf-raise-leg-press` | Calf raises (leg press) | isolation | leg press machine / total | 5 | Lower A 2×12–20 | `standing-calf-raise`, `seated-calf-raise` |
| `chest-supported-row` | Chest-supported row | compound | machine / total | 5 | Upper B 3×8–12 | `seated-cable-row`, `dumbbell-row` |
| `incline-chest-press` | Incline chest press | compound | machine / total | 5 | Upper B 3×8–12 | `incline-dumbbell-press`, `incline-smith-press` |
| `pec-deck` | Pec deck | isolation | machine / total | 2.5 | Upper B 2×10–15 | `cable-fly` |
| `dumbbell-lateral-raise` | Lateral raises | isolation | dumbbells / per_dumbbell | 1 | Upper B 3×12–20 · Lower B 2×12–20 | `cable-lateral-raise`, `machine-lateral-raise` |
| `preacher-curl` | Preacher curls | isolation | machine / total | 2.5 | Upper B 3×10–15 | `ez-bar-preacher-curl`, `cable-curl` |
| `overhead-triceps-extension` | Overhead triceps extension | isolation | cable / total (stack) | 2.5 | Upper B 2×10–15 | `triceps-pushdown`, `dumbbell-overhead-extension` |
| `cable-crunch` | Cable crunch | isolation | cable / total | 2.5 | Lower B 3×12–20 | `machine-crunch` |

The alternative exercises are full library entries with their own equipment, weight mode and increment (e.g. `dumbbell-bench-press`: dumbbell / per_dumbbell / 2). The alternatives listed are proposals; edit the plan file freely.

Increments are plan defaults and can be changed per exercise in the app (stored as local overrides). Weights accept any decimal (e.g. 23.75 kg) for machines with odd plates.

**Habits:** Lunch walk (Mon–Fri, 25–30 min, duration) · Sleep (daily, 7–9 h, duration in hours) · Morning weigh-in (daily, measurement → `bodyweight`) · Waist measurement (weekly, measurement → `waist`)
**Measurements:** bodyweight kg daily (`rolling7`) · waist cm weekly · chest cm monthly · upper-arm cm monthly
**Profile:** your personal values (height, starting weight, activity, experience, priorities) go only in your private copy of the plan file. The public example in this repo ships **without** a profile.
**Reminders:** `[1440, 30]`: 24 hours and 30 minutes before each workout

A second, fictional example (`full-body-3d-home.json`: 3 days a week, dumbbells only) proves the format isn't built around your plan.

---

## 7. Plan lifecycle

**Import:** pick file → parse → validate schema → check references → **preview** → confirm → save in one transaction → generate schedule → refresh the calendar feed (if linked).
- The preview shows: name, weeks, workouts per week, number of exercises, habits, measurements, phases, and an **editable start date**.
- **Start date at activation:** defaults to the plan's `programme.startDate`. If the plan has none, or that date is in the past, it defaults to the next occurrence of the first scheduled weekday. Changing it is stored as a local override; the plan file itself is untouched.
- The start date can also be changed later (Settings → Plans → active plan). Week numbers and phases recalculate from that day. Past sessions keep the dates and prescriptions they were logged with.
- A failed import changes nothing and lists every error with its path.

**Update (same `metadata.id`):** offers *Update existing* · *Import as separate plan* · *Cancel*. The summary of changes only lists what matters:
```
Programme update  r1 → r2
2 exercises changed · Lower B moved to Saturday · Week 4–12 sets 3 → 4 on Leg press
Your training history is preserved.
[ Apply update ]
```
- An update can change future workouts, order, targets, schedule, phases, habits and reminders.
- It never touches completed sessions (they keep their prescription snapshots), logged sets, measurements, habit history or other plans.
- Local overrides are kept unless the item they belong to was removed.

**Plans screen (Settings → Plans):** active plan card · inactive and archived lists · per plan: Preview, Activate, Export, Archive, Delete.
- Delete: removes the configuration only. **Delete with history** is a separate, explicit action.
- Only one plan is active at a time. Reaching the end of the programme doesn't deactivate it: `continue` keeps repeating the last phase.
- Export: the plan as `.json` (no history), with an option to strip the profile before sharing.

**Plan generator (Settings → Plan generator):**
- Copy AI prompt (from `docs/AI_GENERATOR_PROMPT.md`, with the full format rules and an example)
- Download schema · Download example plan · Import generated plan
- Instructions for updating a plan: "Export → give the file to ChatGPT or Claude with your changes → tell it to keep all `id`s and increase `revision` → import."

---

## 8. Screens and flows

**Navigation:** three tabs (**Today · Progress · Settings**) plus the full-screen workout.

### 8.1 First launch
- **Opened in a Safari tab:** a single screen with Add to Home Screen steps (Share → Add to Home Screen) and why ("your data lives in the installed app").
- **Installed, no data:** three buttons: **Import plan** · **Restore backup** · **Get example plan**. No questionnaire.

### 8.2 Today
- Header: date · `Week 2 / 12 · Intro` (it changes the sets, so it earns its place).
- **Workout card:** today's workout, or "Rest day · Next: Upper B, Thu 20:00". Shows exercise count and estimated duration. **Start** (or **Resume** if a draft exists). Optional sessions are marked.
- **Week strip:** 7 days, each marked done, missed, planned or rest. Tap a day to see it; long-press a planned day to move or skip it.
- **Habits:** only today's. Tap to complete. Duration habits open a small number sheet. Measurement habits open the measurement input, and saving it ticks the habit. The section is hidden if the plan has no habits.
- Backup nudge: one line, only when it's overdue (14 days or 10 sessions).

### 8.3 Workout (full-screen)
- **Opening the app with a session in progress goes straight back into it.**
- Exercise list, the current exercise expanded:
  - Target: `3 × 8–12 · rest 2:00` (phase-adjusted).
  - **Last time:** `22 × 12, 12, 11` (per-dumbbell values labelled).
  - Set rows prefilled from the last session of the same `exerciseId`, from any plan. Values: weight · reps · ✓.
  - **One tap on ✓ logs a set exactly as prefilled.** Tapping a number opens the numeric keypad; ± steppers use the exercise's increment and 1 rep.
- **Progression hint (lime):** `↑ 2 kg` when all working sets hit `repsMax` last time. The next weight is prefilled at +increment with the reps target at `repsMin`.
- **Time since last set (default, from user feedback):** a bottom bar counts up from the last logged set and names it ("1:42 since last set · Incline dumbbell press · set 2 · 24.5 × 8"). The countdown below is an optional setting.
- **Rest timer (optional):** starts automatically on ✓. A sticky bottom bar shows the countdown with −15 / +15 / Skip. The screen is kept awake.
  - **The end of rest is signalled visually first**, because the ringer is usually off and iOS web apps can't vibrate. The bar turns lime, shows "Rest done" and pulses gently (respecting reduced motion).
  - Sound is optional. Phase 1 tests `navigator.audioSession.type = 'playback'` to play the beep through the silent switch. If that works on device, it's offered as a setting; if not, the timer stays visual only.
- Row actions (⋯ on the exercise header): **swap** · add set · skip exercise · log sides separately (unilateral only) · note. Optional exercises are collapsed.
- **Unilateral exercises:** by default one row means both sides at the same weight and reps (`side: both`). With per-side logging on, each set row splits into L and R reps; the weight is shared unless you edit one side. The choice is remembered per exercise.
- **Finish:** a summary with duration, sets done and PRs (heaviest weight; best estimated 1RM by the Epley formula), plus an optional note. **Discard** asks for confirmation.
- Incomplete sets at Finish are dropped (not saved as zeros).

### 8.4 Exercise substitution (core v1 feature)
Built for "the machine is taken": **two taps, then keep training.**

1. Tap **⋯ → Swap** on the exercise header (or swipe the row left).
2. A bottom sheet lists:
   - **Plan alternatives** for this slot, each with its last performance (`Dumbbell bench press · last 24 × 10, 10, 9`)
   - **Other exercise…**: search the whole library (plan exercises + your custom ones), filtered to the same muscle groups first
   - **Create exercise…**: name, equipment, weight mode, increment (4 fields with sensible defaults). Saved globally as `custom-<slug>`.
3. Pick one. The row now shows the substitute and a small "swapped from Machine chest press" label. Tap the label to undo.

**What a swap does and doesn't change**
- The **prescription stays with the slot**: sets, rep range, phase cap and rest time carry over.
- **Equipment-specific values come from the substitute:** weight mode, increment, the prefilled weights from *its own* history, its own progression hint.
- Sets are logged under the **substitute's `exerciseId`**, so history stays separate per equipment and weight convention.
- Swapping after some sets: sets already logged stay with the original exercise; the remaining sets move to the substitute.
- **Scope:** *this session only* (default). Or tick **"Always use this in Upper A"**, which saves a permanent slot swap as a local override. It's revertible in Settings → Plans, survives plan updates while the slot exists, and is never written into the plan file.
- **The programme isn't touched:** future sessions, the schedule, calendar events and the plan revision stay the same (unless you chose "always", which only changes the exercise name shown in future sessions and calendar notes).
- The session's `substitutions` record keeps both IDs, so history shows "Dumbbell bench press (for Machine chest press)".

### 8.5 Progress (segmented: Exercises · Body · History)
- **Exercises:** the list of trained exercises, then per exercise: a chart of best estimated 1RM or top set (switchable), PR markers and the logged sets.
- **Body:** a card per measurement with its latest value. Body weight shows the daily points and a 7-day rolling-average line. Tap for history and editing. Profile height is shown here as a reference.
- **History:** sessions newest first; tap for the details and the prescription snapshot.

### 8.6 Settings
Plans (incl. start date, permanent swaps) · Plan generator · Exercises (increments, per-side logging, custom exercises) · Habits (enable/disable, edit target) · Profile · Reminders (calendar link, reminder times, `.ics` export) · Units · Workout (rest timer, sound, keep screen awake) · Data (backup, restore, CSV, storage status) · About (version, schema version).

**Speed target:** open → Start → first set logged in **under 5 seconds**.

---

## 9. Reminders: subscribed calendar through a Cloudflare Worker

**Why:** a downloaded `.ics` copies events once, so changes mean deleting them by hand. A **subscribed** calendar is re-checked by iOS automatically, so plan changes appear on their own, and unsubscribing removes every event in one step.

**Optional by design:** nothing in the app depends on the calendar. Without a link, or offline, or if Cloudflare is unavailable, every feature still works; only reminders are missing.

**Roles:**
- GitHub Pages serves the app.
- The Worker serves the calendar feed and stores the latest calendar text in KV.
- **The app generates the calendar text; the Worker only stores and serves it.**

**Flow**
1. Settings → Reminders → **Add to Calendar** → the app calls `POST /api/feeds` and gets back `{ id (128-bit random), writeToken }` → opens `webcal://teto-cal.<subdomain>.workers.dev/c/<id>.ics` → iOS asks "Subscribe?" → done.
2. On any change to the plan, schedule, override or reminder setting, the app regenerates the calendar text and sends it with `PUT /api/feeds/<id>` (Bearer writeToken). If offline, it's queued and sent later.
3. The Calendar app polls `GET /c/<id>.ics`.
4. **Revoke / reset link:** `DELETE /api/feeds/<id>` disables writes, and the old link then serves an **empty calendar** for 90 days, so iOS removes every event on its next refresh. After that it returns 404. (Tested: a `410 Gone` made iOS keep its last copy, so an empty feed is used instead.) "Reset link" then creates a new feed and offers Subscribe again. Use it if the link was shared by accident.
5. Remove entirely: revoke, plus a note to delete the subscription in the Calendar app.

**Reminder times (Settings → Reminders)**
- Defaults come from the plan: 24 h and 30 min. Each has its own on/off switch.
- **Add custom:** a number plus minutes, hours or days before, or "at start time". Remove any of them.
- Once you've edited them, your settings win; a plan update never overwrites them.
- All changes regenerate the feed, so the calendar alerts follow.

**Manual `.ics` export (fallback):** Settings → Reminders → *Export calendar file*. It generates the same content, shared through the Share sheet. It's labelled clearly as a one-time copy that doesn't update: plan changes then mean deleting and re-importing. Stable UIDs mean re-importing updates events where iOS supports that, which isn't guaranteed.

**Calendar content (generated by the app)**
- One recurring event per schedule entry per phase (`RRULE:FREQ=WEEKLY;INTERVAL=n;BYDAY=..;UNTIL=<phase end>`), with no end date when `onCompletion: continue`. **Recurrence rules mean the feed never goes stale**, even if you don't open the app for weeks.
- Moved or skipped sessions: `EXDATE` on the series plus a single replacement event.
- Stable UIDs: `<planId>.<entryId>.<phaseId>@teto-fitness`. `VTIMEZONE` for the plan timezone, so daylight-saving changes come out right.
- Title: `Upper A · TETO`. Notes: the exercises with phase-adjusted sets and reps (permanent swaps included).
- `VALARM` for each enabled reminder offset.

**Worker**
- About 80 lines of TypeScript.
- Size limit 256 KB per feed. CORS limited to `https://7mdg.github.io`. Basic rate limiting. No logging of feed bodies.
- Deployed by `.github/workflows/worker.yml` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets. No secrets in the repo.
- Cost: €0 on the free plan (requests and KV limits are far above what this uses).

**Backups and the feed link:** the feed id and write token **are included in the full backup**, so a restored phone keeps updating the same calendar instead of making you unsubscribe and resubscribe. This deliberately differs from the ChatGPT plan's "no secrets in backups" rule. The token can only rewrite your own workout calendar, and the backup lives in your iCloud Drive. Plan exports never include it.

**Device results (phase 0, iPhone 16 Pro, iOS 27.2):**
- Subscribing from the Home Screen app works.
- **All 3 alerts per event were kept.** No limit warning is needed for 3 reminders.
- A feed change shows immediately on a manual refresh in Calendar. The automatic refresh interval is iOS's choice, which is fine because the recurrence rules keep the feed correct without refreshes.
- A revoked link answering 410 left the events in place, so revoke now serves an empty calendar instead. *Re-verify: refresh Calendar after revoking and confirm the events disappear.*
- The one-time `.ics` file works through **Save to Files → open the file**. The fallback instructions say exactly that.

**Done means:** the feature is only marked complete after the re-verification above and the phase 5 acceptance checks pass on your iPhone.

**Fallback:** if subscribing fails in standalone mode, the button opens the same webcal link through Safari.

---

## 10. Backup, restore, export

| Export | Contents | Format |
|---|---|---|
| **Full backup** | All plans, revisions, personal records, preferences, profile, overrides, calendar link | `teto-backup-YYYY-MM-DD.json`: `{format:"teto-backup", schemaVersion, exportedAt, appVersion, data}` |
| **Plan** | One plan configuration, optionally without the profile | `<plan-id>-r<revision>.json` |
| **CSV** | `sessions.csv`, `sets.csv`, `measurements.csv`, `habits.csv` | UTF-8, ISO-8601 dates, unit in the column name (`weight_kg`), one header row |

- Exports go through the Share sheet (Save to Files, AirDrop…), with a download fallback.
- **Restore:** validate → preview counts → *Merge* (by id, newest `loggedAt` wins) or *Replace*. A local snapshot is taken first, so a restore can be undone.
- `navigator.storage.persist()` is requested after the first import, and the Data screen shows "Persistent storage: granted / not granted" honestly.

---

## 11. Scheduling engine (pure functions, fully tested)

- `occurrences(plan, overrides, from, to)` → `[{occurrenceKey, date, time, workoutId, phaseId, optional}]`
- `occurrenceKey = <entryId>@<YYYY-MM-DD>`, stable even when other entries change.
- The week number is counted from `programme.startDate` in the plan timezone. Days before the start show "Starts Mon 30 Nov".
- Phase lookup from the week number. After `durationWeeks`: `continue` = the last phase repeats; `stop` = no more sessions.
- Missed sessions stay "missed". Nothing shifts automatically; you choose to move one.
- Tests cover the daylight-saving changes (last Sunday of March and of October), alternating weeks, multiple sessions per day, date entries and phase boundaries.

---

## 12. Acceptance criteria

1. Opening the URL on an iPhone in Safari shows the install steps; once installed, the app runs full-screen.
2. A valid external plan imports through a preview and works immediately.
3. Today shows the right workout, week and phase for any date, including across daylight-saving changes.
4. A workout can be started and sets logged. Repeating last time's numbers costs **one tap per set**.
5. Logged sets survive closing the app, killing it and rebooting the phone, and resume in the middle of the session.
6. Previous performance appears for the same `exerciseId` across workouts and plans.
7. Weeks 1–3 show 2 working sets; week 4 switches to the full volume.
8. Importing a revised plan shows what changed and preserves all history.
9. A completely different plan (the home full-body example) works with no code changes.
10. An invalid plan is rejected with path-specific errors, and stored data is untouched.
11. The app works fully in airplane mode after installation.
12. Data survives app updates and database migrations (tested with a migration fixture).
13. A full backup exports, and restores on a fresh install with identical data.
14. The CSVs open correctly in Excel and Google Sheets.
15. The subscribed calendar shows the correct events and alerts, and updates after a plan change with no manual steps. Revoking the link stops it. The manual `.ics` export imports correctly.
16. Habits show on Today, complete with one tap, and measurement habits complete when the measurement is logged.
17. The body-weight chart shows a 7-day rolling average.
18. The visual identity matches the TETO tokens; no nutrition UI, no placeholder screens.
19. The AI prompt plus the schema let ChatGPT or Claude produce a plan that passes validation on the first try (tested with 3 different requests).
20. Lighthouse PWA install checks pass. Touch targets are at least 44 pt. Text contrast is at least 4.5:1.
21. **Swapping an exercise mid-workout takes at most 2 taps.** It carries the prescription over, prefills from the substitute's own history, logs under the substitute's ID and leaves the programme unchanged. "Always use this" persists and can be undone.
22. A custom exercise can be created at the gym in under 15 seconds and appears in later swaps.
23. Unilateral exercises log combined by default; per-side logging works and is remembered.
24. The start date can be changed at activation and later; weeks and phases follow it, and past sessions are unchanged.
25. Weights accept decimals with a comma or a dot, and each exercise's increment can be edited.
26. Reminder times can each be turned off, and custom ones added; the calendar reflects them.
27. With no calendar link and in airplane mode, every non-reminder feature works.

---

## 13. Build order

| Phase | Deliverables | Verify |
|---|---|---|
| **0 · Spike ✅ done 24 Nov** | Minimal PWA on Pages + Worker + test feed | Passed on iPhone: install, offline, persistent storage (granted), data across restarts, wake lock, timestamp timer, file import, Share export, calendar subscription with 3 alerts, live feed update. Revoke changed to an empty feed (re-verify). |
| **1 · Foundation ✅ built 24 Nov** | Repo, CI deploy, design tokens and components, schema v1 + precompiled validator, Dexie schema, onboarding, plan import + preview | 37 unit tests; both example plans import. Not built yet: the update change summary (phase 3) and Restore backup on first launch (phase 4). |
| **2 · Core training ✅ built 24 Nov** | Scheduler + phases, Today, workout session, prefill, rest timer, progression, **exercise substitution + custom exercises**, unilateral logging, history | 64 unit tests; full mock session in the browser (log, carry-forward, auto-resume after reload, swap, rest done, finish, progression on the next session). Charts and the week-strip move/skip are scheduled for phases 3 and 4. |
| **3 · Plan management ✅ built 24 Nov** | Updates with change summaries, switching, archive/delete, schedule overrides, habits | 71 unit tests (diff, habit scheduling, measurement-linked habits, move/skip/restore, update pruning of stale overrides). Also from feedback: lime for every pressable action, a reference-style set logger (SET · KG · REPS · check), removable extra sets, a "since last set" bar instead of the countdown (countdown optional in Settings), a lime workout timer, a top status-bar fade, and an iOS 26 bottom-gap correction. |
| **4 · Progress & portability ✅ built 24 Nov** | Charts, measurements (rolling average), backup/restore, CSV, profile, plan generator kit | 78 unit tests (backup round trip, merge, undo via snapshot, CSV escaping, rolling average). Also from feedback: month view for planning, the weight convention moved into the column header, a static bottom offset (no more jumping buttons). **Still open:** the device backup round trip and the AI generation test ×3. |
| **5 · Reminders & polish** | Calendar feed integration (revoke, reminder settings, `.ics` export), accessibility pass, offline pass, visual review against the TETO references | Full acceptance checklist on your iPhone |

---

## 14. Costs and maintenance

| Item | Cost |
|---|---|
| GitHub (public repo, Pages, Actions) | €0 |
| Cloudflare Workers + KV (free plan) | €0 |
| Custom domain | Not used |
| **Maintenance** | Retest after each major iOS release (September). Make your own backups. No dependency upgrades unless something breaks. |

**Risks:**
1. Data loss from deleting the app, mitigated by backup nudges and persistent storage.
2. Calendar subscription behaving differently in standalone mode, verified in phase 0.
3. Origin change, avoided by fixing the URL now.
4. Ajv or Workbox upgrades, avoided by pinning.

---

## 15. Repository setup (one time, by you)

1. Create `7mdg/teto-fitness`: **Public**, no README, no .gitignore, **no license**. The first push brings everything else.
2. After the first push: Settings → Pages → Source: **GitHub Actions**.
3. Create a free Cloudflare account, then create an API token (template: *Edit Cloudflare Workers*).
4. In the repo: Settings → Secrets and variables → Actions → add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. On your iPhone: open `https://7mdg.github.io/teto-fitness/` in Safari → Share → Add to Home Screen → open from the icon → Import plan.

---

## Sources
- WebKit: [Web Push for Web Apps on iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) · [Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/) · [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) · [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/)
- Apple: [Safari 18.4 release notes (Wake Lock in Home Screen apps)](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes) · [Forum: timers suspended when locked](https://developer.apple.com/forums/thread/839578) · [Forum: .ics in PWA](https://developer.apple.com/forums/thread/744029)
- WebKit bugs: [181849 storage not shared with Safari](https://bugs.webkit.org/show_bug.cgi?id=181849) · [271401 persist() returns false](https://bugs.webkit.org/show_bug.cgi?id=271401) · [291892 AudioContext after background](https://bugs.webkit.org/show_bug.cgi?id=291892)
- [caniuse: Vibration](https://caniuse.com/vibration) · [caniuse: canShare files](https://caniuse.com/mdn-api_navigator_canshare_data_files_parameter) · [caniuse: storage.persist](https://caniuse.com/mdn-api_storagemanager_persist) · [Chrome: Notification Triggers (Chrome-only)](https://developer.chrome.com/docs/web-platform/notification-triggers)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) · [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- EU: [MacRumors: Apple walks back EU web app removal](https://www.macrumors.com/2024/03/01/apple-walks-back-decision-to-disable-eu-web-apps/) · iOS 26: [heise](https://heise.de/-10749652)
- TETO identity: [TETO Grid Lab](https://claude.ai/artifact/7L1Y5uyXQCtgVNBVewbPqe) · [T.E.T.O. redesign directions](https://claude.ai/artifact/QeLuonooRt8oN85uuTTUSk) (direction A · Presence)
