# Claude Code Instructions

## Repository
This working directory is a local clone of `Skorepa/AI-development` on GitHub.
All projects live here as subfolders. **Never** create separate GitHub repositories — always add new projects as a new folder in this repo.

- Remote: `git@github.com:Skorepa/AI-development.git`
- Default branch: `main`
- Always co-author commits with: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Workflow rules
- New project → create a subfolder here, commit, push to the remote.
- Work directly in `/home/developer/Code/`, never in `/tmp/`.
- Keep local and remote in sync after every meaningful change.
- The user is not a deeply experienced developer. Prefer slices that produce **visible** feedback (UI changes, smoke-test output) over backend-only refactors. When asked "what next?" with two options, pick the one with the clearer demo path.

## Project tree
```
Code/                        ← root = Skorepa/AI-development
├── CLAUDE.md                ← this file
├── flexis-extreme/          ← browser tetris-ish puzzle game
├── neon-hello-world/        ← neon + matrix Hello World page
├── test-project/            ← minimal Python hello world
└── Pentest-platform/        ← multi-tenant PTaaS — main active project
```

## Pentest Platform — active build

A Cyver-style multi-tenant pentest operations platform. Reference UX comes from 43 Cyver screenshots + a sample PDF at `/home/developer/Cyver copy/`. The user is reproducing all of Cyver's surface area (10+ pentest tabs, 9+ client sub-tabs, 14 settings + admin pages, scanner integrations, report editor, client portal).

### Architecture
NestJS API + two Next.js frontends + PostgreSQL via Prisma. Mono-repo with pnpm workspaces.

```
Pentest-platform/
├── apps/
│   ├── api/         ← NestJS 10 + Prisma 5 (PostgreSQL)
│   ├── web/         ← Next.js 14 internal pentester console (port 3000)
│   └── portal/      ← Next.js 14 client-facing portal (port 3001)
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

Backend modules (each is a NestJS module under `apps/api/src/modules/`):
`api-keys, assets, audit, auth, checklists, client-portal, clients, files, findings, frameworks, imports, insights, labels, library, messages, notifications, projects, remediation, reports, retests, tenants, users, webhooks, worklogs`.

### Local dev — running it

Everything runs in docker compose:
```
cd Pentest-platform
docker compose up -d              # postgres + api + web + portal
```
Containers: `pentest-platform-{postgres,api,web,portal}-1`. Ports: `5432, 4000, 3000, 3001`.

Default seed credentials (created by `apps/api/prisma/seed.ts`):
- Internal (web): `admin@acme.test` / `ChangeMe123!`
- Portal: `alice@globex.test` / `PortalPass123!`

The API container's CMD runs `prisma db push --accept-data-loss --skip-generate && node dist/main.js`, so schema changes auto-apply on container start.

### Working on the Pentest Platform

**Slice-by-slice approach.** Each shipped slice is one focused git commit covering schema + backend + UI + smoke test. Track progress in `~/.claude/projects/-home-developer-Code/memory/project_pentest_platform.md`. After every slice: commit, push, update the memory file.

**Standard slice sequence:**
1. Edit Prisma schema if needed
2. Add/update RBAC perms in `apps/api/prisma/seed-data/rbac.ts`
3. Build the NestJS module (service + controller + module file) under `apps/api/src/modules/<name>/`
4. Wire it into `apps/api/src/app.module.ts`
5. Update web (and portal where relevant)
6. Rebuild the Docker images for what changed (`docker compose build api web portal` — usually in parallel as background tasks)
7. `docker compose up -d` to restart
8. Run seed if RBAC changed: `docker compose exec api sh -c "cd /app/apps/api && /app/node_modules/.bin/ts-node prisma/seed.ts"`
9. Smoke test via `curl` against `http://localhost:4000/api/v1/...`
10. Commit + push + memory update

**Permissions are RBAC-checked by NestJS guards.** When you add a new `*.read` / `*.write` perm:
- Add it to `defaultPermissions` in `rbac.ts`
- Wire it into the right roles (tenant_admin gets everything; pentester+PM usually get write; viewer gets read)
- **You must reseed** for the perm to be granted to existing roles. A 403 "Missing required permission" right after a slice is almost always this.

**NestJS modules that use `JwtAuthGuard` must `imports: [AuthModule]`** or DI fails at startup.

**`prisma db push` blocks on adding unique constraints to existing data** until `--accept-data-loss` is set. Already in the api Dockerfile CMD — keep it there.

**Tenant scoping is mandatory.** Every service method that touches tenant-owned data must accept `tenantId` and filter on it. Helper pattern: `assertTenant<X>(tenantId, id)` returning the row or throwing `NotFoundException`.

**FormData uploads need special handling in the web api.ts.** The helper skips `Content-Type: application/json` when the body is FormData so multer can pick its multipart boundary. There's also `apiRaw` and `apiDownload` helpers for non-JSON responses.

**Default request body limit was raised to 20 MB** in `apps/api/src/main.ts` so scanner imports fit. Multer uploads cap at 50 MB per file independently.

### Slice progress (current)

The full per-slice changelog with commit hashes lives in the **project memory** at `~/.claude/projects/-home-developer-Code/memory/project_pentest_platform.md` — load it before starting work. Summary:

- **Phase 4 (backend foundation):** 9 slices shipped — Assets, Finding codes/assignees/labels, Checklist runs, Messages (public/internal), Files (visibleToClient), Worklog, Scanner imports (nuclei + CSV), Insights dashboard, Webhook delivery.
- **Phase 5 (pentester UI):** 1 slice — cross-project Findings page with filters.
- **Phase 6 (reports):** 2 slices — Generated reports + browser-print PDF, Approve/Publish controls. Token-based template engine port from Cyver is **designed but not yet implemented** (see below).
- **Phase 7 (client portal):** 2 slices — Polished portal finding detail + remediation, Portal reports list + viewer.

Phase 4 leftovers: granular roles (Owner/Manager/Project-only), smaller schema chunks (PentestTemplate, ComplianceNorm, RequestForm, FindingField).

Future phases per the agreed roadmap: Phase 5 (more pentester UI), Phase 6 (deeper report editor — see "Report engine" below), Phase 7 (more client portal), Phase 8 = Settings + admin UI, Phase 9 = third-party integrations.

### Report engine — Cyver token language port (planned)

The user wants to mirror Cyver's report templating system. Local PDF docs (18 articles) are at `Pentest-platform/docs/source/Documentation/`. Full design synthesis is in **`~/.claude/projects/-home-developer-Code/memory/project_report_engine_design.md`** — load it before any report-template slice.

Quick orientation:
- **Two token flavours:** bare `{Project_Name}` and parameterised `{Finding_Details?group.1.fields=description,impact&setting.layout=headings}`. Parameter syntax: `?` separates name from query, `&` separates pairs, `.` for sub-keys, `,` for value lists.
- **Three-level architecture:** Tenant `ReportTemplate` (with ordered sections) → project-scoped `Report` → `ReportVersion` (each independently publishable).
- **Token output is wrapped in well-known CSS classes** so users style via custom CSS — `{Token_Name}` → `.token_name`, etc.
- **Status enum mismatch is the biggest design decision pending.** Cyver: `Draft, ToReview, Reviewed, PendingFix, ReadyRetest, Accepted, Mitigated, PartialFix, FalsePositive, Raised, ReOpen`. Ours: `draft, in_review, approved, published, retest_pending, retest_passed, retest_failed, closed`. Decide before implementing the parameterised filter on `{Finding_Details}`.
- **Recommended slice order:** A (token engine v1 + 10 bare tokens), B (template editor + section schema), C (full `{Finding_Details}`), D (AttackChain models), E (Text Blocks), F (per-report section management), G (External PDF + Word export), H (comments + version diff).

**Today's report viewer is hardcoded layout, not section-iterating.** Slice A migrates it to render through the new token pipeline against a hardcoded default template. Slice B adds the user-editable template store.

### Conventions established by past slices

- F-YYYY-NNNN finding codes are allocated atomically per tenant per year via the `FindingCounter` model (composite PK `[tenantId, year]`, `lastSeq` int).
- Internal vs portal split: anything client-visible filters by `visibleToClient` / `isInternal` / `readyForClient`. The portal route always **forces** the safer value on writes regardless of payload.
- Author-only mutations (messages, worklogs, file deletes) are checked in the service layer; tenant_admin overrides via the `tenant.manage` perm.
- Webhook signatures use `X-Pentest-Signature: sha256=<hex>` over the raw JSON body, with the per-webhook secret. Retries: 3 attempts on 5xx with 0/1/4 s backoff. Each attempt persists a `WebhookDelivery` row.
- Background work (webhook dispatch, etc.) is currently fire-and-forget Promises in-process — there is **no job queue**. Fine for dev; needs BullMQ/SQS before production.
- Storage driver is local FS at `${STORAGE_LOCAL_PATH}` (default `/data/storage`), mounted via the `api_storage` docker volume. Path layout: `{tenantId}/{attachmentId}`.
- Seed code is **idempotent by design** — use `findFirst ?? create` or `upsert`. A pre-existing bug in the WSTG template seed (no upsert) caused duplicates that had to be cleaned via SQL; future seed steps must avoid this.

### Things in memory (not in code)
The project memory at `~/.claude/projects/-home-developer-Code/memory/project_pentest_platform.md` tracks the per-slice changelog with commit hashes. Read it before starting work to know what landed.
