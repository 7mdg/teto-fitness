# TETO plan format (v1.0.0)

A plan is a JSON file (`.json`) that the app imports. The app is the engine; the plan is the programme. The definitive rules are in the JSON Schema: [`public/schemas/teto-plan.v1.schema.json`](../public/schemas/teto-plan.v1.schema.json).

## Quick start
- **Make a plan with an AI:** in the app, open Settings → Plan generator → Copy AI prompt. Paste it into ChatGPT or Claude, describe what you want below it, save the reply as `my-plan.json`, and import it.
- **Start from an example:** [`public/examples/teto-recomp-12w.json`](../public/examples/teto-recomp-12w.json) (gym, upper/lower, 4 days) or [`full-body-3d-home.json`](../public/examples/full-body-3d-home.json) (dumbbells, A/B weeks).

## Structure
| Key | Required | What it holds |
|---|---|---|
| `format`, `schemaVersion` | ✅ | `"teto-plan"`, `"1.0.0"` |
| `metadata` | ✅ | `id` (permanent slug), `revision` (+1 per edit), `name` |
| `exercises` | ✅ | The exercise library: every exercise used anywhere, with tracking, equipment, weight convention, increment, rest, alternatives |
| `workouts` | ✅ | Templates: exercises with sets and rep ranges (or duration) |
| `schedule` | ✅ | When workouts happen: weekly (`weekday`), one-off (`date`), alternating weeks (`everyNWeeks` + `weekOffset`) |
| `programme` | | `durationWeeks`, `startDate`, `onCompletion`, `phases` (e.g. weeks 1–3 capped at 2 working sets) |
| `habits` | | Daily/weekly tasks; `measurement` habits link to a measurement |
| `measurements` | | What to track (body weight, waist …) |
| `reminders` | | Suggested calendar alert times |
| `profile`, `goals`, `preferences` | | Optional; the profile is only used to pre-fill Settings once |

## Rules that keep history intact
- **Exercise ids are global.** History follows the id across plans: `hammer-curl` in a new plan shows your hammer curl history. A different machine or weight convention gets a different id, so the numbers never mix.
- **Updating a plan:** keep `metadata.id` and all ids, increase `revision`. Import → the app lists the changes → Apply. Completed workouts, logged sets, measurements and habits are never changed.
- **Local tweaks** (exercise swaps marked "always", habit targets, moved sessions) stay on the phone and survive updates, unless the thing they belong to was removed or changed.

## Validation
On import, the app checks the schema and every cross-reference. Errors name the exact place and suggest fixes, e.g. `workouts[1].exercises[3].exerciseId "seated-leg-crul" does not match any exercise. Did you mean "seated-leg-curl"?`. A failed import changes nothing.
