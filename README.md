# TETO Fitness

A personal training companion for iPhone, installed from Safari to the Home Screen. It works offline, and all data stays on the device.

- App: https://7mdg.github.io/teto-fitness/
- Spec: [SPEC.md](SPEC.md)

**Status:** phase 0. The app is currently a device-check screen that tests what the iPhone supports (install, offline, storage, wake lock, timer, file import/export, calendar).

## Development
```
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run build   # production build to dist/
```
Pushing to `main` deploys automatically: the app to GitHub Pages through `.github/workflows/deploy.yml`, and the calendar Worker through `.github/workflows/worker.yml` (once Cloudflare is configured).

## Calendar Worker setup (one time)
1. Create a free Cloudflare account. Then Workers & Pages → KV → create a namespace named `teto-cal-feeds`.
2. My Profile → API Tokens → create a token from the **Edit Cloudflare Workers** template.
3. In GitHub, go to repo Settings → Secrets and variables → Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `CF_KV_NAMESPACE_ID` (the KV namespace id). After the first Worker deploy, also add `CAL_API_URL` (e.g. `https://teto-cal.<subdomain>.workers.dev`).
4. Run the "Deploy calendar Worker" workflow, then re-run "Deploy app".

Personal data (backups, logs) never belongs in this repository.

© TETO. All rights reserved.
