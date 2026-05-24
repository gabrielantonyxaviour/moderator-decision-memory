# Auth Plan

Hackathon: Reddit Mod Tools and Migrated Apps Hackathon
Idea: Moderator Decision Memory
Readiness pass: 2026-05-22 IST

Auth decision: `platform-auth`

Evidence:
- This is a Reddit Devvit moderator tool, not a web3 product. There is no wallet, chain, RPC, transaction, faucet, or private-key path in `README.md`, `devvit.json`, `src/client`, `src/server`, or `package.json`.
- The local Vite preview is a fixture/localStorage demo with no user account boundary. That is acceptable only for local judging workflow proof and is labeled in UI/README/reports.
- The real installed path requires Reddit/Devvit platform auth: a Reddit moderator opens Devvit menu/form actions inside a subreddit, and Devvit runtime provides Redis/scheduler access.
- `devvit.json` declares moderator-scoped Reddit permission, Devvit menu items, forms, Redis, scheduler, and `onModAction`.
- `npm run e2e:auth` proves the current CLI auth state is blocked: `npx devvit --version` returns `@devvit/cli/0.12.24`, while `npx devvit whoami` returns `Not currently logged in`.
- Self-service OAuth was attempted with `npx devvit login --copy-paste`; the generated Reddit authorize URL was opened through `agent-browser --profile "Default"` with narrow Reddit/Devvit domains, but Reddit returned a network-security block. Screenshot: `outputs/e2e/browser/reddit-devvit-oauth-attempt.png`.

| Actor / role | Required auth | Implementation path | Real credential/profile/wallet | Test proof | Status | Blocker |
|---|---|---|---|---|---|---|
| Local judge/demo user | No auth required | Vite preview uses fixture queue items and browser `localStorage` | None | `npm run e2e:local` passed primary flow, failure state, action audit, and screenshots | passed-local | Local proof is not live Reddit/Redis proof. |
| Reddit moderator using installed app | Platform auth | Devvit menu/form endpoints in `devvit.json` and `src/server/index.ts` | Reddit/Devvit auth through Gabriel Chrome profile `Default` and Devvit CLI token | Static config, type/build, contract tests, and API boundary proof pass | auth-blocked | Devvit CLI is not logged in; OAuth self-service hit Reddit network-security block. |
| Devvit CLI operator | Platform auth | `npx devvit login`, `npm run devvit:upload`, `npm run devvit:playtest` | Devvit CLI auth token after Reddit OAuth | `npm run e2e:auth` wrote `outputs/e2e/devvit-auth-preflight.json` and exited 2 | auth-blocked | `npx devvit whoami` says not logged in. |
| Web3 wallet user | Not applicable | None | No wallet required | Code/package audit found no wallet/RPC dependency | not-applicable | None. |

No dummy login button, fake wallet state, or simulated connected account is present in the product UI.

## Kimi Inventory Pass (2026-05-22T02:07Z)

- Re-ran `npm run e2e:auth`: confirmed `auth-blocked`, exit 2, `whoami` = "Not currently logged in".
- Wallet/blockchain `rg` scan over `src/`, `scripts/`, `package.json`, `devvit.json`: zero product-relevant matches (only `token` as NLP tokenization in `memory.ts`).
- `.env` empty and ignored; no secrets in source.
- Full audit written to `outputs/kimi-readiness-inventory.md`.
