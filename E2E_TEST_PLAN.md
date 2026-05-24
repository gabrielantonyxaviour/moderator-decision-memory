# E2E Test Plan

Hackathon: Reddit Mod Tools and Migrated Apps Hackathon
Idea: Moderator Decision Memory
Readiness pass: 2026-05-22 IST

| Flow | Preconditions | Test command/browser proof | Expected result | Status | Blocker |
|---|---|---|---|---|---|
| Primary happy path | Dependencies installed; local port 5186 available | `npm run e2e:local` | Vite app renders at 375/768/1440 with no horizontal overflow, queue item selection works, invalid form state is handled, valid decision save increases `localStorage` memory from 5 to 6, copy action reports success/fallback, screenshots saved under `outputs/e2e/local/screenshots/` | passed | Local demo uses fixture/localStorage by design. |
| Action audit | Same as primary happy path | `npm run e2e:local` action audit | All 5 visible links target real page sections; all 7 visible buttons are named, enabled, and exercised or covered by the primary flow | passed | None for local surface. |
| Failure path | Built client/server and local browser flow | `npm run e2e:local`; `npm run e2e:api` | Empty decision summary shows validation error instead of crashing; invalid API decision returns 400; valid write outside Devvit runtime returns 503 with explicit Redis runtime dependency | passed | Live Redis write remains blocked by Devvit auth. |
| API/integration smoke | `npm run build` has produced `dist/server/server/index.js` | `npm run e2e:api` | `/api/health` 200, `/api/demo-state` 200 with `fixture-empty`, invalid decision 400, valid decision write 503 outside initialized Devvit runtime | passed | This proves the local runtime boundary, not live Devvit Redis. |
| Auth path | Devvit CLI installed through project dependencies | `npm run e2e:auth` | `npx devvit --version` works; `npx devvit whoami` should return an authenticated Devvit user before upload/playtest | auth-blocked | Current result is `Not currently logged in`; self-service OAuth hit Reddit network-security block. |
| Live Devvit upload/playtest | Auth path passes; Gabriel explicitly approves platform mutation if needed | `npm run devvit:upload`; `npm run devvit:playtest` | App installs in test subreddit; menu/form capture writes to Redis; match endpoint returns live stored precedent; scheduler can be invoked/proven | blocked | Not run because auth is blocked and upload/playtest mutates platform state. |
| Formal visual QA | M2 worker reachable over SSH/Tailscale | `PLAYWRIGHT_CLI_REMOTE=m2worker npx playwright-cli-sessions@latest browser start` then formal polish route | Attached Chrome available for project-standard `/polish` | blocked | SSH timeout to `m2worker`; report saved at `~/.playwright-sessions/.reports/2026-05-22T01-39-12-024-moderator-decision-memory-readiness-formal-polis.md`. |

E2E files added:
- `scripts/e2e-local.mjs`
- `scripts/e2e-api-smoke.mjs`
- `scripts/devvit-auth-preflight.mjs`

Package scripts added:
- `npm run e2e:local`
- `npm run e2e:api`
- `npm run e2e:auth`

## Kimi Inventory Pass (2026-05-22T02:07Z)

Re-run evidence:
- `npm test`: 2 files passed, 7 tests passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run e2e:api`: passed (health 200, demo-state 200 mode=fixture-empty, invalid 400, write 503).
- `npm run e2e:auth`: auth-blocked exit 2 (expected).
- `npm audit --omit=dev`: 0 vulnerabilities.
- Action audit reconfirmed: 5 links target real sections; 7 buttons named and enabled; 0 disabled states.
- Full audit written to `outputs/kimi-readiness-inventory.md`.
