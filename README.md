# Moderator Decision Memory

Devvit mod tool that gives Reddit moderator teams a searchable, retention-aware memory of prior borderline decisions.

Moderators often need consistency more than another classifier. This app lets a team capture why a post or comment was approved, removed, escalated, locked, or held for second review. When a similar queue item appears later, it surfaces prior precedents with transparent match reasons and reusable explanation templates.

## Live on Reddit

- **App listing:** https://developers.reddit.com/apps/modmemoryx
- Built on **Devvit 0.13**. Uploaded, installed, and playtested on `r/modmemoryx_dev`; the live `onModAction` trigger was verified firing during a playtest session, and a defensive fix was applied to the trigger handler so it never raises an unhandled rejection on malformed events.
- Submitted to the Devvit App Directory for review (apps that create custom posts require approval before public install).

## What It Proves

- Manual decision capture through a Devvit menu/form path.
- Subreddit-local precedent records with retention metadata.
- Transparent matching by rule tag, report family, and keywords.
- Copyable moderator explanation templates.
- Devvit-compatible backend endpoints for Redis persistence and scheduler cleanup.
- A polished responsive command surface for demo and judging.

Fixture examples are clearly labeled in the UI. They seed the cold-start demo only; the intended real state transition is moderator capture -> Redis record -> precedent lookup -> retention cleanup.

## Stack

- React 19 + TypeScript + Vite for the Devvit Web surface.
- Devvit Web server APIs with Hono.
- Devvit Redis for persistence.
- Devvit scheduler for retention cleanup.
- Vitest for decision-memory logic.

## Local Development

```bash
npm install
npm run dev
```

The local preview opens on Vite. The browser preview uses fixture data plus browser `localStorage` so judges can exercise the workflow without Reddit credentials. Redis writes require the app to run inside an initialized Devvit runtime.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm run e2e:api
npm run e2e:local
npm audit --omit=dev
```

Devvit upload/playtest requires a logged-in Devvit CLI:

```bash
npx devvit login
npm run e2e:auth
npm run devvit:upload
npm run devvit:playtest
```

## Devvit Integration

`devvit.json` declares the app as `modmemoryx`. The server implements:

- `POST /internal/menu/capture-decision`
- `POST /internal/form/capture-decision-submit`
- `POST /internal/menu/show-precedents`
- `POST /internal/triggers/mod-action`
- `POST /internal/scheduler/retention-cleanup`
- `GET /api/health`
- `GET /api/demo-state`
- `POST /api/decisions`
- `POST /api/match`

`onModAction` is wired and was verified firing live during playtest; its handler defensively swallows persistence errors so a malformed event can never crash the trigger. The primary launch path remains app-mediated moderator capture, which keeps the demo honest and deterministic.
