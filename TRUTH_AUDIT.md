# Truth Audit

Hackathon: Reddit Mod Tools and Migrated Apps Hackathon
Idea: Moderator Decision Memory
Readiness pass: 2026-05-22 IST

| Claim | Reality: real / fixture / mock / blocked / not attempted / removed | Evidence | User-facing label needed? | Action |
|---|---|---|---|---|
| Product is ready for serious end-to-end testing | partially real, auth-blocked | Local E2E/API/build/test stack passes; live Devvit auth/upload/playtest is blocked | Yes | Use final readiness `auth-blocked`, not `testing-ready`. |
| Product is working | real local demo, not submit-ready | `npm run e2e:local` rendered the app, audited actions, handled invalid input, saved a new decision, and copied/fallbacked a template | Yes: local demo uses fixture queue and localStorage | Claim local proof and contract-tested Devvit path only. |
| Fixture queue examples seed the demo | fixture | `src/shared/fixtures.ts`; UI status pill "Fixture demo data"; README says fixture examples seed cold-start demo | Yes | Keep labels in UI, README/demo script, this audit, and gates. |
| Manual capture logic is implemented | real local + contract-tested server | React form calls `createDecisionRecord`; `npm run e2e:local` verifies save; server contract tests pass | Local browser label required; server Redis live claim blocked | Claim local/manual flow and Devvit contract, not live Reddit persistence. |
| Invalid local capture failure is handled | real local | `captureDecision` now catches validation errors; E2E verifies empty summary shows an error | No, it is visible in UI | Keep as readiness hardening improvement. |
| Copy template always works | real with fallback | Clipboard action is attempted; E2E accepts success or explicit fallback message | No | Claim copy/fallback action, not guaranteed clipboard success in every browser. |
| Devvit-compatible app scaffold exists | real static implementation | `devvit.json`, `src/server/index.ts`, `npm run build`, `npm run typecheck` | No | Safe to claim Devvit-compatible source/config, not uploaded/playtested app. |
| Platform auth is implemented | blocked | `npm run e2e:auth` proves CLI not logged in; OAuth self-service attempt hit Reddit network security | Yes | Classify auth as platform-auth and final status as `auth-blocked`. |
| Devvit Redis persistence is live | blocked | Mocked Redis contract tests pass; `npm run e2e:api` valid write returns 503 outside Devvit runtime | Yes | Relabel as "designed and contract-tested for Devvit Redis; live Redis blocked by Devvit auth." |
| Devvit menu/form capture is live | blocked | Endpoint code and config exist; no upload/playtest because Devvit CLI is not logged in | Yes | Do not claim live menu action until playtest proof exists. |
| Scheduler retention cleanup is live | blocked | Cleanup logic and scheduler endpoint tested with mocked scheduler; no live scheduler run | Yes | Claim contract-tested only. |
| `onModAction` ingestion is a dependency | removed as dependency | Code/config exist but README/UI say optional; no live payload proof | Yes | Keep optional; do not use as primary demo claim. |
| Local API endpoints are implemented | real local with boundaries | `npm run e2e:api` returns health 200, demo-state 200, invalid 400, write 503 outside runtime | Yes for write path | Report health/demo-state as local proof and write as Devvit-runtime-dependent. |
| Public GitHub repo exists | real | `gh repo view` returned PUBLIC repo; `git ls-remote origin main` returned `9039fae...` | No | Note current hardening/readiness edits are local and not pushed. |
| Devpost draft exists | blocked / not attempted | Prior hardening read-only Devpost browser snapshot showed account menu and "Join hackathon" gate | Yes | Do not claim draft or submission; next action is explicit approval to join hackathon. |
| Formal `/polish` passed | blocked | M2 start failed with SSH timeout; report filed | Yes | State `local E2E visual screenshots passed; formal-polish-blocked-by-m2`. |
| Local visual QA passed | real local fallback | `npm run e2e:local` screenshots at 375/768/1440 and no horizontal overflow | Yes: fallback, not formal polish | Keep screenshot paths in gates and report. |
| App is submitted/uploaded/deployed/live on Reddit | blocked / not attempted | `npm run e2e:auth` says not logged in; no upload/playtest command run | Yes | Remove submitted/uploaded/live wording until Devvit proof exists. |
| No secrets or production console logs in source/scripts | real scan | `rg` scan over package files, devvit config, source, scripts, `.env`, and `.gitignore` returned no matches after scripts switched to `process.stdout.write` | No | Keep `.env` empty and ignored. |
