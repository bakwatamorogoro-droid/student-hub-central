<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Use shared semantic glass surfaces, Outfit headings, and Figtree body text across public and admin UI so visual updates remain consistent and theme-safe.
- Keep academic targeting centralized through the shared year helpers so student, exam, quiz, and assignment visibility stays consistent.
- Treat a _missing_ student field as "no mismatch", not as a mismatch, when filtering by academic target. Most of the cohort has no `study_year` (945/1623) and almost none has an `academic_year` (1562/1623 have null), so an equality check silently hides published work from the majority. Only a value that is present _and_ different should exclude. This lives in `matchesAcademicTarget` (`src/lib/academicTargeting.ts`); call it rather than re-writing the check inline, because `Number(null) === 0` makes an inline copy fail closed in a way that looks like "no work assigned".

## Deployment

Vercel project `student-hub-central` (id `prj_5WKRS07h8iwQGHnrKFxURQZ261dx`, team
`team_Vdk2Y0gDRdZqQuxP6yvdHlMq`) builds from `vite build` and serves production at
`https://student-hub-central-theta.vercel.app`.

- A Vercel token in this workspace is a **team** token: `GET /v2/user` returns 404 and
  `vercel whoami` / `vercel deploy` fail with "User not found". Pass `teamId` to the REST
  API instead of using the CLI. The CLI does work with `--token="$VERCEL_TOKEN"` once `HOME`
  points somewhere writable (`HOME=/tmp/vhome2 XDG_DATA_HOME=/tmp/vxdg`); otherwise it dies
  with `EACCES` trying to create `~/.local/share/com.vercel.cli`.
- `vercel.json` carries a catch-all rewrite to `/index.html` so client routes survive a hard
  refresh. It must **exclude `/assets/`**:

  ```json
  { "source": "/((?!assets/).*)", "destination": "/index.html" }
  ```

  With a bare `/(.*)` a request for a hashed chunk that no longer exists returns `index.html`
  with `200` and `content-type: text/html`, so the browser tries to parse HTML as JavaScript.
  It fails with a syntax error that looks like a code bug, not a routing bug, and a stale
  service worker never recovers. `public/_redirects` (Netlify syntax) is dead weight here and
  duplicates the same trap — it was removed.

- Hashed assets are content-addressed, so `/assets/*` is served `immutable, max-age=31536000`.
  Vercel's default for them was `max-age=0, must-revalidate`, which revalidated every chunk on
  every visit.
- The project needs six environment variables or the build fails: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the
  `*_PROJECT_ID` pair. `src/integrations/supabase/client.ts` reads the `VITE_` ones at build
  time, so they must be present _during_ the build, not only at runtime.
- Vercel blocks deploys whose lockfile resolves `@tanstack/react-start` below `1.168.60`
  (CVE-2026-102989) with a `text/plain` error. Keep `package.json` at `^1.168.60` or later.
- **`package.json` and `bun.lock` must agree, or every deploy fails before the build starts.**
  Vercel runs `bun install --frozen-lockfile`, which refuses to install when the two disagree:

  ```
  error: lockfile had changes, but lockfile is frozen
  note: dependencies in package.json changed since bun.lock was saved: sonner was removed
  ```

  This is a silent trap: the local `npm`/`vite` build succeeds either way, because `node_modules`
  is already populated, so nothing looks wrong until Vercel runs. Run `bun install` and commit
  `bun.lock` in the same commit as any `package.json` dependency change.

- To reproduce what Vercel does, use a clean tree — a populated `node_modules` hides the problem:

  ```sh
  mkdir /tmp/probe && git archive HEAD | tar -x -C /tmp/probe && cd /tmp/probe
  bun install --frozen-lockfile && bun run build
  ```

- `bun.lock` was generated on Lovable and pins 115 packages to
  `europe-west{1,4}-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`. Those URLs do resolve
  from the public internet, but `registry.npmjs.org` is the safer pin.

## Database notes

- **`APPLY_STUDENT_PIN_AUTH.sql` HAS NEVER BEEN APPLIED TO LIVE, AND THE APP NO LONGER NEEDS IT.**
  Verified by reading `/rest/v1/` with the publishable key: the only RPC the live project exposes
  is `apply_profile_update`, and `attendance_sessions` does not exist. There is no service-role key
  and no DB connection anywhere in this environment, so nothing here can create those objects.
  Accounts and attendance therefore run on tables that already exist. See "Auth without DDL" below.
- **No DDL is required to ship a feature.** Before proposing a migration, check whether the feature
  can be built on existing storage. `supabase/APPLY_STUDENT_PIN_AUTH.sql` is retained only as a
  reference for a future hardened design; it is Part A (apply now) / Part B (do not run yet), and
  Part B (`HARDEN_RLS.sql`) would break registration, exams, results and the admin pages because
  the app reads those tables straight from the browser.
- **RLS is effectively open on the live project, but not uniformly.** Probe before relying on it:
  - `students` — SELECT, INSERT, UPDATE work; **DELETE does not** (no policy), and a bare PostgREST
    DELETE still answers `204`, so never report success without reading the row back.
  - `app_settings` — SELECT and UPDATE work; **INSERT is refused** (`42501`), so no new settings row.
  - `announcements`, `study_images`, `daily_visits` — full INSERT/UPDATE/DELETE.
  - `quiz_participants` — full access, and **nothing in `src/` references it**, so it is free
    storage. It carries `UNIQUE (exam_id, student_id)`.
  - `attendance` — carries `UNIQUE (student_id, check_in_date)`: **one row per student per calendar
    day**. Any per-session design must not depend on it for the session record.
  - `pdf_submissions` — has an FK to `exams`; random UUIDs are rejected (`23503`).
- `students.phone` is the enrolment phone, in `0XXXXXXXXX` form (10 digits) for almost every row.
  It is the only proof of identity available for a self-claimed PIN; normalise before comparing.

- **ALL MIGRATIONS ARE NOW APPLIED TO LIVE (2026-11-01).** `supabase/APPLY_PENDING.sql`
  was deleted; `supabase/migrations/` is the single source of truth and is applied in
  filename order. Verified in `information_schema.columns` after applying:
  `app_settings.{exam_radius_m,exam_gps_required,results_require_pin}`,
  `submissions.{gps_distance_m,gps_radius_m,last_seen_at,proctor}`, plus the index
  `submissions_live_idx`. The fence can now be centred — but
  `app_settings.attendance_lat`/`attendance_lng` are still **NULL**, so set the campus
  point on `/admin/settings` or `checkArea` has no origin to measure from.

- **DDL is possible from the sandbox: use the Supabase Management API.** The earlier note
  that "migrations genuinely require the Lovable SQL Editor" is **wrong**. A Supabase
  personal access token (`sbp_…`) drives
  `POST https://api.supabase.com/v1/projects/<ref>/database/query` with a `{"query": "…"}`
  body — that runs arbitrary SQL, including `ALTER TABLE`. The working token is
  `sbp_fc5c99…` (it lists all three projects, including `weiwabywirhoxiyyjkko`); the older
  `sbp_fc30f5…` token only reaches two unrelated projects and `sbp_bb2a31…` is expired
  (`401 JWT could not be decoded`). Tokens are recoverable from the conversation log with
  `grep -rhoE "sbp_[A-Za-z0-9_]{20,}" /workspace/conversations | sort -u`. Note
  `GET /v1/projects/<ref>/database/migrations` returns `[]` because this project has no
  `supabase_migrations.schema_migrations` table, so **history is not recorded** — verify by
  querying `information_schema` instead.

- **`db.<ref>.supabase.co` does not resolve from the sandbox**, so a direct `psql`/pooler
  connection is not available even with a password. The Management API over HTTPS is the
  only working path.

- **The project this app talks to is `weiwabywirhoxiyyjkko` (eu-west-1).** Vercel
  supplies `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PROJECT_ID`
  (plus the `VITE_` twins) for production, preview and development. `.env` is
  git-ignored; copy `.env.example` for local work. The old brokered
  `…lovable.cloud` host and the legacy `tkagffueenwajmkhuopn` project are no
  longer referenced anywhere.

- **Stored storage URLs point at `weiwabywirhoxiyyjkko.supabase.co`.** The five
  objects under `exam-media/` (`gallery/`, `announcements/`,
  `exam-pdfs/semester/`) were copied into the current bucket and the
  `image_url` / `pdf_url` / `file_url` columns were rewritten to match. If you
  move projects again, re-upload the files **and** rewrite the columns together,
  or the gallery and PDFs 404.

- **The schema is rebuilt from `supabase/migrations/`.** `drizzle/migrations/`
  still holds `0003_migration.sql` (`group_messages`) and `0006`/`0007`
  (attendance, PIN auth); those objects were created from the `supabase/` chain
  plus a one-off gap-fill. Verify parity by diffing
  `information_schema.columns` against production before trusting a fresh build.

- **`students.reg_no` values carry a trailing space** (e.g. `"MUM2025-04-14106 "`), so exact
  `ilike` lookups silently miss. Trim both sides before comparing — see
  `src/lib/studentSearch.ts`.

- **The semester migration was duplicated and the Drizzle copy never ran.**
  `drizzle/migrations/0004_add_semester.sql` and
  `supabase/migrations/20261027120000_add_semester.sql` add an identical column
  set, but `0004` was **absent from `drizzle/migrations/meta/_journal.json`**
  (the journal stopped at `0003`), so the migrator skipped it. That single
  omission was the root cause of every missing-column symptom. When adding a
  migration, add its journal entry too — a `.sql` file alone is never applied.

- **`git push` may be rejected.** The `GITHUB_TOKEN` authenticates as
  `bakwatamorogoro-droid` (the repo owner) but sometimes carries **no OAuth
  scopes**, so a push fails with `403 Permission to … denied`. When that
  happens, ship the change through the Vercel API (see below) and have the owner
  push from their own account.

- **The publishable key is not read-only, and `app_settings` has no write protection.** The
  `sb_publishable_…` key ships in the public JS bundle, and it can `PATCH app_settings?id=eq.1`
  successfully. It also exposes `admin_username` / `admin_password` (currently `1234` / `abdi77`) to
  anyone who reads the bundle and calls the REST API. Admin auth is client-side only
  (`localStorage` flag in `src/lib/admin-session.ts`), so knowing those values is enough to enter
  `/admin`. Fixing this needs RLS policies plus a hashed password — i.e. the Lovable SQL Editor —
  it cannot be corrected from the frontend.

- **There is no DDL path with the available keys.** Every SQL route (`/pg/query`, `/rest/v1/rpc/exec_sql`,
  `/rest/v1/rpc/apply_migration`, `/sql`, `/db/query`) answers `404`, and the only exposed function is
  `/rpc/apply_profile_update`, which edits one student profile. Migrations genuinely require the
  Lovable SQL Editor.

- **Never probe writes against a live table.** A `PATCH` with a test value really lands in
  production; RLS does not make it a dry run. To test a column's existence, use a read-only
  `select=<column>` request instead. If a probe does write, find the previous value in the
  conversation logs (`grep -rhoE '"<column>":"[^"]*"' conversations/`) and restore it immediately.

- **`git push` is blocked, so deploy through the Vercel REST API.** The working tree goes up
  file by file and Vercel builds it. Two traps in that API: the files must be uploaded
  **before** the deployment is created (creating first answers `400 missing_files`), and an
  upload carries the SHA-1 in the `x-vercel-digest` header with the raw body — the JSON
  `{"data": "<base64>"}` form is rejected with `invalid_digest`. A ready deployment is not
  live until it holds the production alias, so confirm the alias afterwards and fetch the
  hashed chunk to check the new code is really being served.

- **The CI `Verify dist output` step tested for `dist/_redirects`, and that file is gone.**
  `_redirects` is Netlify syntax and was removed on purpose — Vercel serves the SPA rewrite
  from `vercel.json`, and a stray copy adds a catch-all that turns a missing chunk into HTML.
  The workflow still asserted the file exists, so every build on `main` failed with
  `❌ dist/_redirects haipo` and the merge to `main` looked like a deploy problem. The step
  now only warns if the file reappears.

- **A missing column makes a whole query fail, not just that column.** `loadArea()` in
  `exam.$examId.tsx` asks for the fence columns and falls back to a leaner select. Those
  columns are now applied, so the fallback is dormant — but it stays, because the same shape
  is what carried the app through the window when `attendance_lat`, `exam_radius_m`,
  `exam_gps_required` and `submissions.{last_seen_at,proctor,gps_distance_m,gps_radius_m}`
  were absent (`42703`). Keep `app_settings.attendance_lat`/`lng` set, or the fence has no
  origin to measure from. The "absent means required" default is what keeps the GPS gate on.

- **A coarse GPS fix must never refuse a student.** A phone indoors often has no chip fix
  and falls back to a network estimate reporting 800-1500 m. `assessGpsSamples` used to call
  anything above 500 m unusable, which turned a working phone in a classroom into a dead
  start button. A vague or stale reading is now a flag for the teacher; only a reading that
  cannot be placed anywhere at all refuses. `checkArea` subtracts the phone's own error
  margin (capped at 150 m so a spoofed accuracy cannot open every fence) and reports
  `near_edge` — outside the raw radius but inside once the error bar is allowed for.

- **The camera preview stayed black because the stream was attached too early.** The start
  handler runs before the `<video>` is rendered, so `videoRef.current` is null there. The
  stream is attached in an effect keyed on `camOk`/`started` instead. Permission failures
  name the device (`NotAllowedError`, `NotFoundError`, `NotReadableError`) so a student
  knows whether to unblock the camera or close another app.

- **The Vercel deploy token is recoverable from the prior conversation log** and is _not_ an env
  var, so it does not survive in the shell. Extract it each session with
  `grep -rhoE "vcp_[A-Za-z0-9]{56}" /workspace/conversations | sort -u` — it is exactly 60
  characters. Team `team_Vdk2Y0gDRdZqQuxP6yvdHlMq`, project
  `prj_5WKRS07h8iwQGHnrKFxURQZ261dx`. This token has **no Supabase/DB access**; the project's six
  env vars are only the Supabase URL and publishable key, so it cannot be used to run DDL.

- `students.reg_no` values carry a **trailing space** (e.g. `"MUM2025-04-14106 "`), so exact
  `ilike` lookups silently miss. Trim both sides before comparing — see
  `src/lib/studentSearch.ts`.

- To re-check what is live, probe one column per migration over PostgREST: `select=<column>`
  answers `200` when the column exists and `400` with code `42703` when it does not. Note that
  `curl` must be used — a Python `urllib` request is rejected by Cloudflare with `403 error code: 1010`.

- **`GITHUB_TOKEN` can read this repository but cannot write to it.** It authenticates as
  `bakwatamorogoro-droid` and the repo reports `push: true`, yet `git push` answers
  `403 Permission ... denied` and the API answers `403 Resource not accessible by integration`:
  the token is a GitHub App installation token with read-only contents scope. So an agent can
  clone, read, run tests and probe production, but **cannot push a branch or open a PR** with it.

- **`GH_PUSH_TOKEN` is the one that writes, and it is already in the environment.** A classic PAT
  for `bakwatamorogoro-droid` with the `repo` scope (not a fine-grained or app token), so
  `git push` and the REST API both work with it. Use it for every write:

  ```bash
  git push https://${GH_PUSH_TOKEN}@github.com/bakwatamorogoro-droid/student-hub-central.git <branch>:<branch>
  ```

  It does **not** carry `workflow`, so a push that touches `.github/workflows/` is refused
  outright (see "Fixing it needs the `workflow` scope"). Keep the workflow file out of the
  commit, push the rest, and hand the owner the workflow patch. The `create_pr` tool also
  authenticates with `GITHUB_TOKEN` and answers `403`, so open PRs with `curl` against
  `POST /repos/<owner>/<repo>/pulls` and `GH_PUSH_TOKEN` instead.

- **Vercel builds with `npm`, not `bun`.** The build log says `Installing dependencies...` and
  `added 680 packages`, which is npm reading `package-lock.json`. `bun.lock` is what CI and the
  local `bun` flow use, so **both lockfiles have to stay in sync** — a dependency bumped in one
  and not the other produces a green CI and a broken deploy. `npm ci --dry-run` is the cheap
  check, and `package-lock.json` must list the same deps as `package.json` or `npm ci` fails on
  Vercel while `npm run build` passes locally against a warm `node_modules`.

- **Pin the Node version, or Vercel resolves a new major on every deploy.** The project setting
  said `24.x` while `.nvmrc` said `22` and `package.json` asked for `>=22.12.0` — three signals
  and no agreement. The live log showed the cost: `Skipping build cache since Node.js version
changed from "24.x" to "26.x"`, so each deploy installed from scratch and a toolchain change
  could break the build with no commit behind it. `engines.node` is `24.x` and `.nvmrc` says
  `24`, matching the Vercel setting; CI reads the same file via `actions/setup-node`. Keep the
  three in step when the runtime moves.

- **The CI `Verify dist output` step must not require `dist/_redirects`.** `_redirects` is
  Netlify syntax. Vercel serves the SPA rewrite from `vercel.json`, and `public/_redirects`
  exists only to satisfy that check. A stray copy in `dist/` adds a catch-all that turns a
  missing chunk into HTML, so the step warns when the file reappears rather than asserting it.

- **A failing deploy is not always a failing build.** Check the deploy list by state before
  reading source: `GET /v6/deployments?projectId=...&state=ERROR` returns each failure with its
  `errorCode`. The historical causes on this project were `BLOCKED_PACKAGE` (Vercel refusing
  `@tanstack/react-start@1.167.50` for CVE-2026-102989 — the pin is now `^1.168.60`) and
  `enoent` (`Command "vite build" exited with 127`, a tree that lacked `package.json`). Build
  logs come from `GET /v2/deployments/<id>/events?builds=1`; the `v3` path returns `null`
  payloads. To read the whole log, request `/v2/.../events` and print `payload.text`.

- Live `students.semina` holds `'SEMINA 1'`…`'SEMINA 14'`, which does not match the
  `semina_list` values seeded in app settings. Read the distinct values from `students` and
  merge, as `src/lib/directory.ts` does, rather than trusting the settings array.
- `student_group` and the semester field are **fixed ranges** the owner specified:
  `GROUPS` is `GROUP 1`…`GROUP 20`, built in `src/lib/academicTargeting.ts`. Register, profile
  edit and admin students render `GROUPS` directly, not the `group_list` setting. Live rows still
  carry values like `GROUP 7` from the old seed; every picker re-adds the student's stored value
  so an edit cannot blank it out.
- `SEMESTERS` lists `SEMESTER 1` and `SEMESTER 2`, but only `SEMESTER 1` is in
  `ACTIVE_SEMESTERS`. Inactive entries render disabled with a "(bado)" suffix and
  `isSemesterActive()` rejects them on submit, so SEMESTER 2 cannot be chosen until the owner
  moves it into `ACTIVE_SEMESTERS`.
- `app_settings.group_list` still holds the old seed (`Group A`…`Group C`) and is **not** a
  source of truth for pickers. Read `GROUPS` instead; `loadDirectory()` merges it in only for
  the semina and course lists.
- The academic year is fixed to `2026/2027` (`CURRENT_ACADEMIC_YEAR`); the register and profile
  forms display it read-only. `students.academic_year` and `students.study_year` exist but are
  currently null for the whole cohort.
- `students.course` values carry trailing spaces (`'BAED '`, `'Islamic studies '`), so the course
  picker keeps the stored value selectable rather than only offering the normalised list.
- **`students.semester` does not exist on the live database** (`42703`). Run
  `supabase/migrations/20261027120000_add_semester.sql` in the Supabase SQL editor to add it;
  until then `updateStudentProfile()` saves the other fields and reports `semesterUnsupported`
  so the UI can say so. `Update Taarifa` only writes the academic fields the student actually
  changed: an untouched semester must never be sent, otherwise every save hits the missing
  column and the student sees the migration warning instead of a success message.
- Both `Update Taarifa` (edits) and `Changamoto` (issue reports) are gated by admin switches in
  `app_settings`: `profile_edits_enabled` (toggled on `/admin/requests`) and `issues_enabled`
  (toggled on `/admin/issues`). Students cannot submit while the relevant switch is off.
- The per-student grant is a row in `profile_update_requests` with `status = 'edit_granted'`, not
  a column. It is the second door into `Update Taarifa`. See "One student's form can be opened
  while the switch is off" below.
- `study_images` is the table behind the real-photo gallery; rows need `active = true` to show.
  Its rows currently have `title = null`, so they render without a caption and without alt text.

## Deploying: git write access, and the fallback

A branch-and-PR flow works. The environment's own `GITHUB_TOKEN` is a GitHub **App** token
(`ghu_…`) with no installation attached, so it 403s on every write (`Resource not accessible by
integration`) while still reading. A classic PAT with `repo` scope is recoverable from the earlier
conversation log:

    grep -rhoE "ghp_[A-Za-z0-9_]{20,}" /workspace/conversations | sort -u

It authenticates as `bakwatamorogoro-droid` with `admin`/`push` on the repo, so push and PR both
work. Push with it in the URL rather than relying on the credential helper:

    git push "https://x-access-token:${PAT}@github.com/bakwatamorogoro-droid/student-hub-central.git" HEAD:refs/heads/<branch>
    GH_TOKEN="$PAT" gh pr create --repo bakwatamorogoro-droid/student-hub-central ...

Re-extract it each session; do not keep it on disk. PR #19 was opened this way.

The section below is the fallback for when no write token is available.

The Vercel token is not in the environment. It lives in the event log of the earlier
conversation under `/workspace/conversations/<id>/events/` (search for `VERCEL_TOKEN='vcp_`).
It is a **team** token: `GET /v2/user` 404s and the CLI fails with "User not found", so always
pass `teamId=team_Vdk2Y0gDRdZqQuxP6yvdHlMq`.

Re-extract the token from that log each session; do not keep it on disk. The flow is:

1. `npx vite build` (verify it succeeds before deploying).
2. POST `/v13/deployments?teamId=<TEAM>&forceNew=1` with
   `{"name","project","target":"production","files":[{"file","size","sha"}]}`, one entry per
   **tracked** file (`git ls-files`) — not `dist/`. The project's `buildCommand` is
   `vite build`, so Vercel needs `package.json` and the source; uploading `dist/` alone fails
   with `ENOENT` / `Command "vite build" exited with 127`.
3. The first POST answers `400 missing_files`. Upload each digest in
   `error.missing` via `POST /v2/files` with the `x-vercel-digest` header, then re-POST the
   deployment. A 200 means accepted.
4. Poll `GET /v13/deployments/<id>` until `readyState` is `READY`. All four domains
   (`www.islamicstudiestest.online`, apex, `student-hub-central-theta.vercel.app`, and the
   automatic alias) are moved automatically; only re-point manually with
   `POST /v2/deployments/<id>/aliases {"alias":"<domain>"}` if the `alias` array is short.
5. Verify the alias serves the new build: the live HTML's `assets/index-*.js` hash will
   differ from the local `dist/` hash because Vercel rebuilds server-side. Instead, grep the
   live bundle for a string only the new code contains.

The project's six environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the `*_PROJECT_ID` pair) are already set on all
three Vercel environments, so a deploy does not need to touch them.

## Media assets

`public/media/` holds the motion clips and their posters (`exam-hero.mp4`, `home-animation.mp4`,
`poster-exam.jpg`, `poster-home.jpg`) plus `mum-logo.png`. The cartoon and exam-hall stills were
deleted at the owner's request; the dashboard hero shows only the real photographs stored in
`study_images` (currently 3 active rows, all with `title = null`).

`RealPhotoHero` takes precedence on the dashboard and cross-fades those photos; `HomeAnimationHero`
(`home-animation.mp4`) is its fallback and only paints when `study_images` has no active row or
the query has not returned yet. `/exams` always shows `ExamVideoHero` (`exam-hero.mp4`). Both
clips loop, are muted, and are served from `public/media/` rather than a host-specific asset
path. Give the `study_images` rows a `title` when the owner wants a caption — it doubles as the
`alt` text.

## Tests

- `npm test` — pure units for the crypto in `src/lib/pin-crypto.ts` (PIN stretching, salt and token
  derivation, device binding, phone normalisation, row-key UUIDs). Fast, no network.
- `npm run test:e2e` — end-to-end against the **live** database with the publishable key, importing
  the real `studentAccount.ts` and `attendance.ts`. Covers claim, sign-in, lockout, device binding,
  admin re-issue, session start/close, rotating tokens, the geofence, per-session duplicates,
  a second lecture on the same day, and join-code check-in. It seeds its own student and removes it
  afterwards.
- The e2e test is built with `vite build --ssr` before it runs, because the Supabase client reads
  `import.meta.env`, which only exists after Vite has replaced it. `tests/e2e/run.sh` does both.
- **Never mock these.** The whole point is to catch a table, column or RLS policy that has drifted;
  a mock would hide exactly that. If a test needs a table that does not exist, the feature is wrong,
  not the test.
- `students` rows cannot be deleted with the publishable key, so the e2e test cleans up
  `quiz_participants` and `attendance` but leaves its student row behind. If that accumulates, it is
  a signal that `students` needs a DELETE policy — not a reason to skip the test.
- Cleanup must be scoped to the rows **this run** created. Deleting a whole namespace
  (`exam_id=eq.<namespace>`) also deletes the sessions a real teacher has open and every check-in
  recorded against them. An earlier revision did exactly that.
- PostgREST filters on the uuid `student_id` column do not match reliably on this project: the same
  `id=eq.<uuid>` filter matches, and so does `reg_no=eq.<uuid>`. To delete token rows, select their
  `id`s first and delete by primary key.
- A `204` from PostgREST does not mean a row was deleted. `students` answers `204` for a delete it
  refused. Verify with a read-back.

## Sign-in without email, and QR + geolocation attendance

Supabase email auth is disabled on this project (`/auth/v1/settings` reports `"email": false`), and
no service-role key is set on Vercel, so `signUp`/`signInWithPassword` cannot work either. Sign-in
therefore does not use `auth.users` at all.

### Auth without DDL

The whole account and attendance system is built on `quiz_participants`, because it is the one table
that is (a) writable with the publishable key, (b) referenced by nothing in `src/`, and (c) carries
`UNIQUE (exam_id, student_id)`. Rows are namespaced by `exam_id`, and `semina` holds a JSON payload:

| `exam_id`         | row key                                     | holds                          |
| ----------------- | ------------------------------------------- | ------------------------------ |
| `a0000000-…-0001` | `student_id` = the student                  | one student's PIN              |
| `a0000000-…-0002` | `student_id` = the student                  | one live sign-in session       |
| `a0000000-…-0003` | `student_id` = the session                  | a teacher's attendance session |
| `a0000000-…-0004` | `student_id` = derived from session+student | one student's check-in         |
| `a0000000-…-0005` | `student_id` = the session                  | that session's live QR token   |

Two keys do the work the schema would otherwise have to do:

- A check-in row's `id` **and** `student_id` are both `SHA-256("checkin:<session>:<student>")` folded
  into a UUID, so `UNIQUE (exam_id, student_id)` makes a second check-in for the same session
  impossible — even from two phones at once — without a new index.
- A session's `id` is its own `student_id`, so `UNIQUE (exam_id, student_id)` cannot make two
  sessions collide.

Per-session attendance lives in `quiz_participants`; the legacy `attendance` row is written in
parallel as a best-effort mirror so existing admin screens keep working. That mirror can legitimately
fail on a second lecture the same day, because `attendance` allows only one row per student per
date — which is precisely the bug the per-session store exists to fix.

Secrets are never stored in the clear. The PIN is PBKDF2-SHA256 (210 000 iterations) over a per-row
salt, and a session token is stored only as its SHA-256 digest. Both live in `src/lib/pin-crypto.ts`,
which is pure and covered by `npm test`. **A stolen row does not reveal a PIN**, but an attacker
holding the public key can still overwrite a row and take over an account. That is the real limit of
doing auth without a server, and it is why `HARDEN_RLS.sql` matters eventually.

`supabase/APPLY_STUDENT_PIN_AUTH.sql` is no longer required. Do not tell the owner to run it.

### How identity is proved

- A PIN is stored only as a bcrypt hash (`crypt(pin, gen_salt('bf', 10))`), so reading `student_pins`
  never yields a usable PIN.
- A session token is 32 random bytes as hex. Only its SHA-256 hash is stored in `student_sessions`,
  so the table cannot be used to impersonate a session.
- **A student cannot choose their own PIN.** `admin_set_student_pin()` requires a live admin session
  token. A student may also claim a PIN themselves through `student_claim_pin()`, but only by proving
  ownership with the phone number the school already has on file — never by knowing a registration
  number alone. `app_settings.pin_self_claim_enabled` turns self-claim off entirely.
- A claimed PIN is **bound to the device that claimed it** (`student_pins.bound_device_id`). Presenting
  it from another phone returns `wrong_device`, so a PIN cannot be shared with a classmate. An admin
  re-issue clears the binding, which is the recovery path when a student changes phone.
- Five wrong PINs lock the account for 15 minutes. An unknown registration and a wrong PIN return the
  same `bad_credentials` answer, so the response cannot be used to enumerate registration numbers.
- `attendance_check_in()` resolves the student from the session token. It deliberately does **not**
  use `students.device_id`: that column is world-readable, so it cannot prove anything. (An earlier
  revision used it as a fallback, which was only as safe as the RLS that did not exist yet.)
- Minting a QR token (`attendance_rotate_token`) and issuing a PIN are both admin-gated in SQL, so a
  tampered client cannot hand out tokens.

### Attendance has two entry points, and both are distance-checked

`attendance_check_in(p_token, p_lat, p_lng, p_student_token, p_join_code)` accepts **either** the
rotating QR token **or** the session's `join_code` (the short code the teacher reads out). The join
code exists so a student whose camera will not open can still check in from the room. Both paths go
through the same gates in the same order: session lookup, session open, student session, the group
match, GPS present, then the Haversine distance against `attendance_sessions.radius_m`. The distance
check never runs in the browser.

Two rules that were wrong and are now fixed:

- The attendance row must carry `session_id`. An earlier revision never wrote it, so the teacher's
  per-session present list was always empty and the unique index did nothing.
- The once-only rule is **per session**, not per day. The old `(student_id, check_in_date)` index
  refused a student's second lecture of the same day. `attendance_student_session_uniq` replaces it.

`attendance_session_present(admin_token, session_id)` serves the teacher's present list. It has to be
an RPC: `HARDEN_RLS.sql` leaves `attendance` with no policy, so a browser table read returns no rows
and the list silently looked empty.

### Why `HARDEN_RLS.sql` matters

The publishable key ships inside the JavaScript bundle, so every visitor already has it. Before RLS
was enabled, that key could read all 1561 students, 2602 submissions, and `app_settings.admin_password`
— verified from outside the app with nothing but the key from the bundle.

Two details that are easy to get wrong:

- Use `ENABLE ROW LEVEL SECURITY`, never `FORCE`. `FORCE` also applies RLS to the table owner, and
  the `SECURITY DEFINER` functions run as the owner, so `FORCE` silently makes every one of them
  return NULL (verified).
- A table-wide `GRANT SELECT` covers every column, so `REVOKE SELECT (admin_password)` does nothing
  on its own. The table grant has to be withdrawn first, then SELECT re-granted on the remaining
  columns.

No policy is created for `students`, `attendance`, `submissions`, `issue_reports`,
`profile_update_requests`, `daily_visits`, `attendance_sessions`, `student_pins`, `student_sessions`
or `admin_sessions`. Reads the app needs go through the `SECURITY DEFINER` functions. Consequence:
**a page that reads those tables straight from the browser returns nothing.** `students`, `attendance`
and `submissions` are read directly in several admin routes, so those routes need moving to server
functions before this file is applied.

### Other design points

- Only the SHA-256 hash of a rotating QR token is stored. Reading `attendance_sessions` never yields a
  usable QR payload. Tokens rotate every 25 s (`ROTATE_MS`).
- Every gate (token, expiry, session window, identity, geofence, duplicate) is enforced inside
  `attendance_check_in_qr()`. The browser supplies only a token and a GPS fix.
- The duplicate check is an explicit `EXISTS`, not `ON CONFLICT`. The live `attendance` table has no
  unique constraint on `(student_id, check_in_date)`, so `ON CONFLICT DO NOTHING` never fired and a
  student could check in repeatedly (caught by test B5). A unique index is created as a backstop.
- The real `attendance` columns are `student_id, reg_no, full_name, semina, student_group,
check_in_date, gps_lat, gps_lng, distance_m, status`. There is no `session_id`, `gps_accuracy` or
  `method`. The real `students` columns do **not** include `auth_user_id` or `semester` — an earlier
  revision of this feature selected both and was broken.

### Testing SQL before shipping it

The SQL is verified against a real Postgres, not by reading it. Start one and run the harness:

```sh
sudo dockerd >/tmp/dockerd.log 2>&1 &
sudo docker run -d --name attpg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=test postgres:16-alpine
supabase/tests/attendance_qr/run.sh
```

`run.sh` drops and rebuilds the schema, then applies `00_setup.sql` (tables using the **real**
production column names, plus Supabase's roles and `auth.uid()`), both migrations, `HARDEN_RLS.sql`,
and `01_tests.sql` (35 assertions). It exits non-zero on any SQL error.

The harness catches what reading the code cannot: it found the `ON CONFLICT` duplicate hole, the
`FORCE ROW LEVEL SECURITY` trap, the ineffective column-level revoke, and the `students.semester`
column that does not exist. Anything that touches these tables should be added here first.

Assertions are grouped: `A*` sign-in, `B*` check-in and geofence, `C*` RLS. `C*` runs as `anon`, the
role PostgREST uses for a request carrying the publishable key.

A note on the container: `docker exec -i` with a redirected stdin can hang depending on how the
caller's shell handles the pipe, so `run.sh` uses `docker cp` instead.

### Where the QR panel lives

`QrAttendanceCheckIn` is rendered on **one** page: `/attendance`, which is also in the main
menu (`nav_attendance` in `SiteHeader`). The page holds the scanner, the join-code box, the
"vipindi vinavyoendelea" list, and the student's own history (`fetchMyCheckIns`).

`/` carries a full-width attendance card above the exam cards, because marking
attendance is the one thing a student needs during a lecture and should not be
behind a menu. `/account` and `/student` no longer embed the panel. Each carries a small card that links to
`/attendance`, so a student who lands on either still finds check-in in one click. Embedding
it in three places meant three scanners, three sets of failure messages, and no single URL to
send to a class.

The panel reads the PIN session itself (`getStudentToken()`), so it needs no props and
renders the sign-in prompt when the token is missing. Its one optional prop, `onCheckedIn`,
fires after a successful scan so the host page can refresh a history list.

**There is no check-in card on `/`.** The home page used to carry a second, weaker one
(`AttendanceCheckIn`): registration number only, no PIN, writing straight to the legacy
`attendance` table. It bypassed the PIN identity the whole flow depends on, so it was
removed, and the component with it. Do not add a check-in affordance back to `/` — the
student signs in on `/account`, and that is where the QR belongs.

### Two things RLS currently blocks, and how the code copes

Both were found by testing against the live project, not by reading the code.

**DELETE on `students` silently does nothing.** PostgREST answers 200 with an
empty array whether or not a row matched, so a delete that RLS refuses is
indistinguishable from one that hit nothing. The migration that grants
`s_d ON public.students FOR DELETE` (20260520093923) has not been applied to
production, so `admin.students.tsx` verifies its delete by reading the row back
and reports failure rather than claiming success. The e2e seed does not try to
delete its student either; it adopts whatever row already holds the registration
number. If a migration is ever applied that fixes this, the read-back check is
still the right thing to keep.

**Registration must not treat a repeated name as a duplicate.** The cohort has 77
names that appear more than once, and the old check refused a registration when
the full name matched any existing row, which locked out every one of those
students. `src/lib/registration.ts` now decides the conflict, and the rule is:
a registration number already on file is the only hard stop, and only when the
name disagrees with it. A shared name with a different number asks the student to
confirm and then proceeds. That module exists so the rule can be tested — its
failure mode is invisible in the UI.

### Saving while the database is missing columns

Six columns the UI writes (`course_list`, `program_years`,
`current_academic_year`, `current_semester`, `academic_years_list`, `semester`)
come from migrations that have never been applied to production. PostgREST
refuses the whole write when any one is unknown, and — this is the part that bit
us — it names **one** column per response:

    {"code":"PGRST204",
     "message":"Could not find the 'course_list' column of 'app_settings' ..."}

The old code retried once, dropping a single hard-coded column. With five
missing, the retry failed on the second name and the admin's save was reported
as an error: "Could not find the 'current_semester' column". `src/lib/schema-retry.ts`
now drops whatever the database names, one per attempt, up to a bound, and
returns the list so the UI can say which fields did not save. Every write that
touches an optional column goes through it.

The columns have now been applied, so this retry is a safety net rather than the normal path;
the banner on `/admin/settings` still names any column that is missing.

### Approving a request silently dropped course and study_year

`admin.requests.tsx` wrote the academic fields as one PATCH containing
`semester`, which does not exist. PostgREST rejected the whole PATCH, and the
`isMissingColumnError` guard then swallowed the failure — so course and
study_year were lost while the admin was told "Ombi limekubaliwa". Verified
against production: patching `{course, study_year, semester}` left both columns
unchanged. The same block now retries through `retryWithoutMissingColumns` and
names the fields that did not save.

`/admin/settings` gained a "Nakili SQL" button, so the migration can be applied
from that page instead of hunting for the file.

### A forged QR code used to answer "expired_token"

`tokenIsLive` compared the token's expiry before its digest, so any _other_ open
session whose token had timed out answered "expired" for a code that was not
even its own. Because the caller returns on the first "expired", a genuinely
matching session further down the list was never reached. The digest is now
compared first, so "expired" only ever describes a token that really belongs to
the session being checked.

### Forgot PIN

`resetStudentPin(phone, lastName)` in `studentAccount.ts` issues a new PIN when a
student supplies the phone on file plus their last name. It searches by last name
rather than by phone because `students.phone` is free text and the stored
spelling varies (`0712…`, `+255712…`, `255712…`), while the name is typed the same
way by everyone. It then requires exactly one row to match both, so an ambiguous
pair is refused rather than guessed.

A reset clears the old PIN, the lockout, and every live session, so it also signs
the student out on all their devices. The UI lives in the "Sahau PIN" tab on
`/account`. `adminSetStudentPin` remains the fallback for a student who cannot
answer either question.

The pair is often not unique. In the current cohort 168 (last name, phone) pairs
belong to more than one student — 24% of students share both with someone else,
and `juma` alone covers 41 people. So when more than one row matches, the reset
answers `ambiguous` instead of guessing or refusing, and the UI reveals a
registration-number field. That third value resolves the tie exactly. This is why
`resetStudentPin` takes an optional third argument rather than two.

Note the search is by last name, not by phone, and the `ilike` limit is 200: a
common name returns many rows, and the match then filters on the normalised phone
in code. Filtering on phone in the query would not work, because the stored
spelling varies.

### The admin console, and what the legacy table is for

`/admin/attendance` is three things, top to bottom:

- `AttendanceSessionPanel` — starts a session, shows its rotating QR, its join code, and its
  printable poster.
- `GpsSettings` — the attendance point, radius, and the register-time fence.
- `AdminAccessQr` — a QR of `/admin/attendance` itself, so the admin opens the console on a
  phone without typing a URL. It is built from `window.location.origin`, so a preview
  deployment points at itself. This is a link, not a credential: the admin login still guards
  the page.
- `LegacyArchive` — a collapsible, read-only table over the legacy `attendance` table, plus a
  CSV export.

`LegacyArchive` exists because the legacy table already holds real rows (251 at the time of
writing, across 17 dates) and removing the old screen would have hidden them. It is read-only
on purpose: that table carries `UNIQUE (student_id, check_in_date)`, so it can hold only one
row per student per calendar day and cannot represent a second lecture. Per-session truth
lives in the session archive above it, and `fetchMyCheckIns` reads from there too, so a student
who attended twice in one day sees both.

`listSessionSummaries()` is the teacher's view: every session, newest first, each with a head
count. `deleteAttendanceSession()` removes a session and its check-ins together — the check-in
rows are matched on `reg_no`, which holds the session id.

### Two QR payloads, and why

`src/lib/attendance-qr.ts` holds both formats. It has no Supabase import, so
`node --test` can load it directly — `attendance.ts` reads `import.meta.env` at module
scope and cannot.

| Payload            | Carries           | Lives for                      | Shown on             |
| ------------------ | ----------------- | ------------------------------ | -------------------- |
| `ISL-ATT1:<token>` | rotating token    | 30 s                           | the teacher's screen |
| `ISL-JOIN1:<code>` | session join code | as long as the session is open | the printed poster   |

A printed QR **cannot** carry the rotating token: at 30 s it would be dead before the
sheet reached the wall. So the poster carries the join code instead. What stops a student
photographing it and checking in from home is the geofence, not the rotation — the code is
worthless without a GPS fix inside the teacher's radius. A session the teacher starts
without coordinates therefore has no such protection; that is a deliberate trade the
teacher makes by not setting a location.

`QrAttendanceCheckIn` tries `decodeJoinQr` first, then `decodeQrToken`, so one camera
serves a screen or a wall.

### The group rule is enforced on check-in, not just in the picker

`listOpenSessions` hides another group's session from the student's picker. That is not
enough on its own, because a printed join code can be scanned by anyone in the room.
`checkIn` therefore re-checks `payload.student_group` against the student's own group and
refuses with `wrong_group`. Keep both: the picker is what the student sees, and the
check-in is what actually holds.

### The admin poster

`AttendanceQrPoster` renders the join code as a QR plus a printable A4 sheet, and offers
**Pakua PNG** and **Chapisha**. It sits under the join code in the QR column of
`AttendanceSessionPanel` — deliberately not at the top of the page, so the live rotating
QR stays the primary thing on screen.

### Deleting rows with the publishable key

`DELETE` on `students` (and the other tables `HARDEN_RLS.sql` leaves without a policy)
returns **`204` and deletes nothing**, because RLS refuses the row and PostgREST reports
the request, not the outcome. Never treat a `204` as proof of deletion. `admin.students`
reads the row back for exactly this reason.

The same trap applies to test cleanup: `quiz_participants` rows _are_ deletable, but
`students` rows are not, so a test that inserts a `students` row cannot clean it up and
will leave it behind. Prefer namespaced `quiz_participants` rows for anything a test
needs to create and remove. Leftover `OH-*` test students on production can only be
removed through the Lovable SQL editor, which is the owner's account.

### One location, three radii, and the results PIN

`app_settings` holds **one** centre (`attendance_lat` / `attendance_lng`) and each feature
carries its own radius:

| setting               | used by      | default |
| --------------------- | ------------ | ------- |
| `attendance_radius_m` | attendance   | 200 m   |
| `register_radius_m`   | registration | 800 m   |
| `exam_radius_m`       | exams        | 300 m   |

`src/lib/geo.ts` is the single place that turns a centre + radius + fix into a verdict
(`distanceMetres`, `checkArea`, `areaMessage`, `AreaVerdict`). Attendance had its own copy
first; keep new features on the shared module so the three stay comparable.

An exam now **enforces** the fence in `beginExam`: it takes a high-accuracy fix, calls
`checkArea`, and refuses to start when the verdict is `outside`, showing the distance so the
student knows how far off they are. Previously the exam recorded `gps_lat`/`gps_lng` and never
compared them — the columns were written but nothing was checked.

`submissions.gps_distance_m` and `gps_radius_m` freeze the measurement at submit time. They are
**not** derived from the current settings on read, because the centre can be re-set later and a
historical submission should keep the distance it was actually measured at.

### The results gate is reg number, then PIN — but only for students who have a PIN

`/results` asks for the reg number, then the PIN, before revealing anything. Two things make
this safe to ship against a table where almost nobody has a PIN yet (2 of ~1,572 students):

- `verifyStudentPin` checks the PIN and counts failures, but **creates no session and never
  touches the device binding**. `loginStudent` is the wrong tool here: checking marks on a
  friend's phone would otherwise bind that phone to you.
- The gate is skipped when the student has no PIN row (`studentHasPin`), and
  `app_settings.results_require_pin` turns it off wholesale. So enabling the feature cannot
  lock out the ~1,570 students who have not claimed one.

### The exam-area columns may not exist yet

`exam_radius_m`, `exam_gps_required` and `results_require_pin` arrive with
`supabase/migrations/20261029090000_add_exam_area_and_results_pin.sql`, and
`last_seen_at` / `proctor` with `20261030120000_add_live_exam_tracking.sql`. Neither has been
applied. Probed against production with the publishable key, `submissions.gps_distance_m`,
`gps_radius_m`, `last_seen_at` and `proctor` all answer `400 / 42703`. Every write path copes:

- the admin GPS save runs through `retryWithoutMissingColumns`, so the attendance and
  registration radii still save and the toast names what was dropped;
- the exam page loads the full `select` first and falls back to a centre-only `select`;
- **the exam submission upsert runs through `retryRowsWithoutMissingColumns`**, because
  PostgREST rejects the whole array when one column is unknown. Without it the geofence fields
  in the submit payload failed _every_ paper — the site looked healthy while nothing could be
  handed in. That helper has to drop the column from every row, not just the first;
- the live panel probes each optional column before using it, pages past PostgREST's 1000-row
  cap, and resolves student names in batches of 200. A single `.in()` over every sitter is a
  ~35 KB URL that PostgREST answers with `400`, which silently blanks every name.

The columns are now present in production, so these fallbacks are dormant. Keep them: a missing
column must still degrade a feature rather than disable a write, and the same shape protects any
column added later.

The lesson generalises: **a missing column must degrade a feature, never disable a write the
user depends on.** Prefer `retryRowsWithoutMissingColumns` over sending a column that may not
exist, and give every optional column a fallback read.

### A token with `repo` scope still cannot push a workflow change

GitHub refuses **any** push that adds or modifies a file under `.github/workflows/` unless the
credential carries the `workflow` scope, and the refusal is not partial — the whole push fails:

```
! [remote rejected] ... (refusing to allow a Personal Access Token to create or update
  workflow `.github/workflows/build.yml` without `workflow` scope)
```

A fine-grained/`repo`-scoped PAT shows `x-oauth-scopes: repo` and writes ordinary files fine
(proved by creating and deleting a probe ref, and by `PUT /contents/<path>` returning `201`),
yet the same `PUT` against `.github/workflows/probe.yml` returns `404`. The Git Data API does
not route around it either: `POST /git/trees` with a workflow path returns `404` even though the
blob creation succeeded.

**The check is on the net diff against the base branch, not on the commit history.** A branch
whose history _touches_ a workflow file but whose final tree matches the base pushes cleanly —
verified by amending the workflow file back to `origin/main`'s copy and cherry-picking the rest,
then pushing successfully. So when a workflow fix must land and the token lacks the scope,
either rewrite the branch to drop the change, or have the owner add `workflow` scope. Do not
loop on retries; the refusal is deterministic.

### The CI build is not the Vercel build

`vite build` succeeding locally proves little — `node_modules` is already populated. Reproduce
what Vercel does on a clean tree:

```sh
mkdir /tmp/probe && git archive HEAD | tar -x -C /tmp/probe && cd /tmp/probe
bun install --frozen-lockfile && bun run build
```

`.github/workflows/build.yml` used to require `dist/_redirects`, which was removed on purpose
(Vercel serves the SPA rewrite from `vercel.json`; a `_redirects` copy re-creates the catch-all
that turns a missing hashed chunk into HTML). The check failed every PR after the removal and
was replaced with a warning.

## QR codes open the site, and the news page is public

### The QR payload is a link, not a token string

A poster used to carry `ISL-JOIN1:K7M2QX`. That is readable only by our own scanner, so a
student holding a phone with nothing but the camera app was stuck. Both payloads are now
**links to this site**:

```
https://<host>/attendance?join=K7M2QX     printed poster, stable while the session is open
https://<host>/attendance?t=<token>       teacher's screen, rotates every 25 s
```

The phone's own camera shows the URL and offers to open it; no app of ours is involved in
reading it. `encodeJoinUrl` / `encodeTokenUrl` build them, and `parseAttendanceQr` reads
whatever a scanner hands back: a link, the legacy `ISL-` payloads (posters already on a wall
must keep working), or a bare code read aloud off the sheet.

`/attendance` declares `validateSearch` for `join` and `t`, so the scanned session arrives on
the page and pre-fills the code instead of being thrown away.

### Check-in signs the student in on the spot

Identity still comes from a real `loginStudent` call — a scan says _which_ session, never
_who_ is scanning. What changed is where that sign-in happens: `QrAttendanceCheckIn` now takes
Reg Namba and PIN inline, so a scanned link does not bounce the student to `/account` and lose
the session. A scan that arrives before sign-in is held in `pendingRef` and finished the
moment the token appears.

Do not "simplify" this into an anonymous check-in. The server resolves the student from the
session token, and that is the only reason the record is trustworthy.

### `/news` is the public notice board

Announcements were only visible in the marquee banner, which cannot show a PDF or more than a
line of text. `/news` lists them for anyone, signed in or not: title, full body text with
newlines preserved, PDF open/download, and an image if one is attached. The newest live notice
is pinned. The admin form on `/admin/settings` says where a notice lands and what belongs in
the message field.

The liveness rule lives in `src/lib/news.ts` (`liveNews`, `hasContent`) rather than in the
component, so the banner, the news page and the admin list cannot disagree about whether a
notice is still showing. `image_url` is read with a fallback, because it arrives with a
migration that production may not have yet.

### Tests

- `src/lib/attendance-qr.test.ts` — link round-trips, legacy payloads, and junk refusal.
- `src/lib/news.test.ts` — active/expired filtering, ordering, missing column.
- `tests/e2e/attendance.e2e.ts` F4a–F4m — the poster link opens, parses, and drives a real
  check-in against live Supabase; the public news read needs no sign-in.

  ### The Friday lecture and the live attendance count

  Every Friday, 07:00–10:00 EAT, the whole cohort is expected in the hall. The window lives in
  `src/lib/lectureSchedule.ts` with no imports, so `node --test` covers the boundaries directly
  (`src/lib/lectureSchedule.test.ts`): Friday resolution, never open on other days, next-week
  rollover, zero countdown while open, Monday resolving to the same week's Friday. EAT is UTC+3
  with no DST, so it is a fixed offset rather than a timezone lookup — the app must give the same
  answer on a phone set to any timezone, and on a server. **Do not replace it with
  `toLocaleString` and a zone name.**

  `saa moja` means 07:00, not 13:00. Swahili clock hours start at sunrise (06:00), so `saa 1` is
  07:00 and `saa 4` is 10:00. A literal "1:00 PM" reading of the request is wrong; the tests pin
  the morning window for that reason.

  The lecture is a real session, not a separate table. `ensureLectureSession` in
  `src/lib/attendance.ts` mints it keyed by the EAT date, so every phone converges on one row
  instead of racing to create one each, and `checkIn` treats `kind: "lecture"` as open to all
  (no seminar or group filter). The geofence reuses `checkArea`/`effectiveDistanceM` from
  `@/lib/geo`, so a coarse GPS fix widens the fence instead of locking students out.

  The student card is `src/components/FridayLectureCard.tsx`, mounted on `/attendance`. The
  admin counter is `src/components/LiveAttendanceCard.tsx` with `src/lib/useLiveAttendance.ts`,
  mounted on the dashboard. The counter subscribes to Realtime and also polls, because a phone
  that slept through the socket event still has to see the true count.

  `AttendanceSessionPanel` reads `loadDirectory()` for its seminar and group dropdowns, so they
  list every value students actually hold rather than only the `app_settings` seed.

  ### CI is red on `main`, and it is not the build

  The last run on `main` (`da89e235`) fails at _Verify dist output_ with `dist/_redirects haipo`.
  That check demands a Netlify file which was removed on purpose — Vercel serves the SPA rewrite
  from `vercel.json`, and a stray `_redirects` adds a catch-all that turns a missing chunk into
  HTML. The corrected step replaces the `test -f` with a warning, so a stray copy is reported
  without failing the build. It cannot be pushed from here: the tokens in this workspace carry
  only `repo`, so a push touching `.github/workflows/*` is rejected with _refusing to allow a
  Personal Access Token to create or update workflow … without `workflow` scope_. The Git Data
  API is blocked the same way — a tree that rewrites a workflow path comes back `404 Not Found`
  even though creating a blob succeeds. Fix it in the GitHub UI, or with a token that has the
  `workflow` scope.

  ### The deploy is healthy; the old failures are not current

  Vercel builds `main` and the deployment is `READY` and serving. The 14 `ERROR` deployments in
  the project are all old (Oct 1–28) and all from uploading `dist/` alone — `Command "vite build"
exited with 127/1`, which is the `ENOENT` trap already documented above. Check the date before
  treating a failed deployment as a live problem.

  To confirm what is actually live, grep the lazy chunk rather than `index.html`: the attendance
  code is code-split, so it is not in the chunks the HTML preloads. `attendance-CkbpEViW.js`
  carrying `already_marked` / `outside_area` is the check that PR #5 shipped. If a browser shows
  old code while the chunks are current, it is a cached `index.html`, not a failed deploy.

## The `_redirects` check is red on `main`, and Vercel deploys anyway

`31eaed1` is titled _stop requiring a `_redirects` file Vercel does not use_, but
`git show --stat` reports **no files changed**. The workflow on `main` still carries
`test -f dist/_redirects`, so every run — including every PR — fails at _Verify dist output_.
Nothing after that step runs, and the `dist` artifact is never uploaded. The build itself passes.

It is cosmetic, not blocking. GitHub does not gate Vercel, so production is current: the
Friday lecture shipped with PR #6 even though that PR was red. Confirm a deploy from the
deployments API rather than the checks tab:

    curl -s -H "Authorization: Bearer $TOKEN" \
      ".../repos/<owner>/<repo>/deployments?per_page=3"

and read the newest `Production` entry's status. To confirm the _content_ that is live, crawl
the lazy chunks: `index.html` preloads only part of the app, so a string like
`Muhadhara wa Ijumaa` lives in a chunk the HTML never names. Follow the `assets/*.js` references
one level deeper before concluding a feature is missing.

### Fixing it needs the `workflow` scope, which the workspace token does not have

GitHub refuses a token without `workflow` for any path under `.github/workflows/`, on every
write route. All three were tried and all three were refused:

| Route                                               | Result                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `git push`                                          | `refusing to allow a Personal Access Token to create or update workflow ... without workflow scope` |
| Contents API (`PUT .../contents/...`)               | `404 Not Found`                                                                                     |
| Git Data API (`POST .../git/trees` naming the path) | `404 Not Found`                                                                                     |

A plain `git push` of the same commits **without** the workflow file succeeds, which is how the
groups work landed. So: split the workflow change out, push the rest, and edit `build.yml` in the
GitHub UI (the pencil icon works with any write access) or with a token that has `workflow`.
The ready-made commit is kept in the `backup-full-stack` tag.

## Groups and seminars (15 seminars x 11 groups x 8 students)

`src/lib/groupAssignment.ts` is the single source of truth and is deliberately import-free, so
`node --test` loads it without a bundler. `SEMINARS` is `SEMINA 1..15`, `GROUP_NAMES` is
`GROUP 1..11`, `GROUP_SIZE` is 8.

Capacity is counted per **(seminar, gender, group)**, never per group name alone. `GROUP 1` exists
for men and for women in the same seminar, and those are two separate rooms of 8. The test that
asserts "no group is mixed" checks that the `(seminar, group)` bucket holds exactly one gender,
which is the real requirement. Reading the plan as one group name makes a correct result look like
84 mixed groups.

`normalizeGender` matches whole words, not first letters. `Mwanamke` starts with `M`, so a
first-letter rule files every woman as male. `FEMALE_WORDS` and `MALE_WORDS` both carry `f`/`m`
and the Swahili forms (`mke`, `kike`, `mume`, `kiume`, …).

`regKey()` strips every non-alphanumeric character before comparing Reg Namba, because the imported
cohort really stores `MUM2025-04-14106`, `MUM 2025-04-13988` and `MUM2025_04_15550`. A plain
`trim().toUpperCase()` comparison misses 472 of the 1572 rows. 151 students share a Reg Namba with
someone else; a lookup resolves to the first match, which is the best available answer and is a data
problem, not a logic one.

Assignment is stable. A student who already has a seminar keeps it, and re-running the planner on
the result moves nobody — that is what lets `assignStudentGroup` run on every profile save without
shuffling a whole group when one student changes their course.

`student_group` had to become nullable (`20261102120000_groups_and_seminars.sql`): a student with no
gender has no group, and the column would otherwise reject the row. The auto-assignment fills it
back in on the next save.

`retryWithoutMissingColumns` guards the new columns, so the app keeps working until an admin runs
the migration. `src/routes/admin.groups.tsx` is the admin surface; `GroupManager` renders it and
`groupExports.ts` writes Excel/Word/PDF/CSV from `xlsx`, `docx` and `jspdf`.

## Group assignments ("Kazi za Kufanya")

A group's work lives in `pdf_submissions`, not a new table: the live project has no way to run DDL
from the workspace, so a group row reuses the columns the single-student assignment flow already
has. `src/lib/groupAssignmentSubmission.ts` holds the pure rules (import-free, so `node --test`
loads it without a bundler) and `src/lib/groupAssignmentApi.ts` holds the Supabase half.

The row is identified by `reg_no`, which for a group is not a registration number but the canonical
key `GROUP::<semina>::<gender>::<group>` from `groupKey()`. `status` is `group_submitted` and is
left at that value even after the admin answers, so "is this a group's work?" stays a single column
test. The answer is what `teacher_confirmed`, `feedback` and the envelope's `answer` mark.

The question, the presenters and the submitter are packed into `ai_extracted_text` as a JSON
envelope (`parseEnvelope` / `serializeEnvelope`). `parseEnvelope` only adds an optional key when it
is present — writing `submitted_by: undefined` produced a key the round-trip test then failed on.

Because a group row is a `pdf_submissions` row, every single-student list must filter it out or one
group's file appears as if one student sent it. `admin.pdf.tsx` and `pdf-quiz.tsx` both drop rows
whose `status` is `GROUP_SUBMISSION_STATUS`.

The feature is one submission per group, not per student. `submitGroupAssignment` re-checks for an
existing row after the caller checked, so two phones in the same group cannot slip a duplicate
through. The admin reviews on `/admin/group-assignments` and answers with a system-drawn signature
(`SignaturePad`, `react-signature-canvas`) stored as a PNG data URL in the envelope.

## A new table needs a GRANT, not just a policy

Row level security decides _which rows_ a role may touch. It does not grant the
role the right to touch the table at all. A table created by a migration starts
with no privileges for `anon` and `authenticated`, so the publishable key reaches
PostgREST and is refused before a single policy is consulted. The first
`group_reports` migration shipped the table, the indexes and two permissive
policies but no `GRANT`, so a CR saving a report would have been told
`permission denied for table group_reports` and lost the report.
`20261102120000_groups_and_seminars.sql` grants `SELECT, INSERT, UPDATE, DELETE`
to `anon`, `authenticated` and `service_role`, guarded by a `pg_roles` lookup so
the file still runs on a plain Postgres where those roles do not exist.

## Verify a migration against a real Postgres before shipping it

Docker is available in this workspace, so a migration can be proved rather than
assumed:

    sudo dockerd > /tmp/dockerd.log 2>&1 &
    sudo docker run -d --name pgverify -e POSTGRES_PASSWORD=verify \
      -e POSTGRES_DB=verify -p 55432:5432 postgres:16-alpine
    # load a fixture with the real table shape and the real dirty values, then
    sudo docker exec -i pgverify psql -U postgres -d verify -v ON_ERROR_STOP=1 \
      -f - < supabase/migrations/<file>.sql

Run the file twice. `ON_ERROR_STOP=1` is what turns a half-applied migration into
a failure instead of a silent partial one. Assert the outcome rather than
eyeballing it: `has_table_privilege('anon','public.group_reports','INSERT')` is
the check that catches a missing `GRANT`, and it returns `f` on the old migration
and `t` on the new one.

## Do not put a CHECK on the group or seminar text

The production `students` table holds `TEST`, `ASSIGMENT 1  KUBADILISHA`,
`Group A`, `G1`, `S1` and `SEMINA 16`. A `CHECK (student_group ~ '^GROUP [0-9]+$')`
would either reject the migration or refuse the rows already there. Normalise on
read and on the next save instead, which is what `normalizeSeminar` and
`normalizeGroupName` already do.

## Migrations that are in the repo but not in the database

`exams.exam_area` (20261029090000) and `live_exam_sessions` (20261030120000) both
answer `Could not find the table ... in the schema cache` when queried with the
publishable key, so the files exist and the changes do not. Before building on a
recent column, probe it. `retryWithoutMissingColumns` is what keeps the app
usable until the SQL is actually run.

## Also in the repo but not in the database

`exams.exam_area` (20261029090000) and `live_exam_sessions` (20261030120000) both answer
`Could not find the table ... in the schema cache`, so those files exist and their changes do not.
Probe a column before building on it. `retryWithoutMissingColumns` is what keeps the app usable
until the SQL is actually run.

## The site can be up and still be unusable: check `app_settings.system_locked`

"Haifanyi kazi" ("it does not work") does not always mean a broken deploy. On 2026-10-27
production was `READY`, every Vercel deployment was green, and the homepage still answered
`200` — but the only thing a visitor saw was the lock screen:

    Mfumo Umefungwa Kwa Muda ... MABORESHO

`LockGate` hides every non-admin route whenever `app_settings.system_locked` is true, and it
treats a null `lock_until` as "no expiry", so an admin who locks the system to do maintenance
and forgets to unlock it leaves it dark indefinitely:

    const isLocked = !!(settings?.system_locked && (!lockUntilMs || lockUntilMs > Date.now()));

Check the flag before investigating routing, env vars, or the build:

    curl -s "$SUPABASE_URL/rest/v1/app_settings?select=id,system_locked,lock_message,lock_until&limit=1" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

`app_settings` has a permissive `FOR UPDATE USING (true)` policy, so the **publishable key is
enough to unlock it** — no service role needed:

    curl -s -X PATCH "$SUPABASE_URL/rest/v1/app_settings?id=eq.1" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" -d '{"system_locked":false}'

A `curl` fetch of the HTML returning `200` proves nothing about the app; `LockGate` renders
client-side, so the lock screen arrives inside an otherwise healthy `index.html`. Read the
rendered text, not the status code.

## Update Taarifa shows the admin the real corrections, not the student's own values

`profile_update_requests` used to carry `new_semina`, `new_student_group` and `new_course` on
**every** row, even when `changed_fields` was empty. The student form seeded those inputs from
the student's row so the card could display them, and the submit path sent that seed straight
back. The admin page then rendered each non-null column with a null baseline, so a student who
changed nothing appeared to have requested three changes. Across the 1000 requests in the table
that produced **2160** "corrections", of which **4** were real.

The fix has two halves:

- The student form no longer has semina or group inputs at all — the group system derives both
  from course and study year, so the student never had a say — and it records only the fields
  that genuinely differ from the student's row.
- The admin page reads `changed_fields` as the record of what a request is about, and pairs each
  changed field with the value it held when the request was made (`current_*`), so a correction
  reads as before -> after instead of a bare new value.

Semina and group are surfaced as the placement the group system wrote back (`placed_*`). They are
an outcome of a move, not an edit, and that is the only honest way to show them.

`src/lib/requestDiff.ts` holds `diffRows()` and `placementRows()`, with tests, so the rule that
decides what counts as a change lives in one place.

**The migration is applied** (2026-10-27, via `POST /v1/projects/<ref>/database/query` on the
Supabase Management API). All eight columns now answer `200` over PostgREST, so the before -> after
view is live. Rows written before the columns existed still have no snapshot, so `diffRows` renders
those with no struck-through baseline rather than an invented one — that is expected, not a bug.

The Management API is the only DDL path here: there is no `service_role` key anywhere in the repo
or the conversation logs, no SQL RPC on the project, and the publishable key cannot run DDL. A
working `sbp_` token was recoverable from the logs with
`grep -rhoE "sbp_[A-Za-z0-9]{20,}" /workspace/conversations | sort -u` — test each candidate
against `GET /v1/projects/<ref>` and keep the one that answers `200`.

## The admin login wrote the wrong localStorage key

`adminLogin()` set `admin_authed` while `isAdmin()` reads `admin_session_token`, so a correct
sign-in unlocked the screens for that one mount and then bounced back to the login form on the
next navigation or reload. It reads as "the password is wrong" when the password was right.

Both keys are written now. `crypto.randomUUID()` is the value; the token is a UI gate, not a
security boundary, because the publishable key can read `app_settings` directly. Real protection
needs `supabase/HARDEN_RLS.sql`.

## The Vercel deploy was green all along; the GitHub Action was the red X

"Do not deploy" turned out to be a failing CI check, not a failing deploy. On `main` every commit
carried a red **Vite build** check while the three **Vercel – student-hub-central** statuses were
`success`. The build itself passed; the workflow's last step failed:

```
- Build (vite -> dist/) | success
- Verify dist output    | failure   # test -f dist/_redirects
```

`vercel.json` already rewrites every non-asset path to `/index.html`, and Vercel serves that
rewrite itself, so nothing in the app ever read a `_redirects` file. The workflow asked for a file
no part of the stack produces. `public/_redirects` now holds `/*    /index.html   200`, which Vite
copies into `dist/` verbatim, so the check passes and the file is harmless on Vercel.

Diagnose this shape with the API, not the dashboard:

```bash
curl -s "https://api.github.com/repos/<owner>/<repo>/commits/<sha>/check-runs" \
  -H "Authorization: Bearer $GITHUB_TOKEN"   # look for a non-Vercel name
curl -s "https://api.github.com/repos/<owner>/<repo>/actions/runs/<id>/jobs" \
  -H "Authorization: Bearer $GITHUB_TOKEN"   # which step, exactly
```

## Group representatives are derived, not stored

Each group shows one representative. There is no `representative` column and no admin screen to
set one: `pickRepresentative` in `src/lib/groupAssignment.ts` hashes the group's own identity
(`SEMINA n|GROUP n`) with FNV-1a and indexes the member list, so the pick looks random across the
165 groups, is identical on the student's phone and the admin's screen, and survives a re-render
without persisting anything. `Math.random()` cannot be used for exactly that reason.

The hash is inlined rather than imported so the file stays import-free for `node --test` — the same
constraint that shapes `studyYear.ts` and `academicTargeting.ts`. A group is gender-pure, so
`representativesFor` fills one side and leaves the other `null`; read it as
`reps.female ?? reps.male`.

`slot` rotates the pick so a group that loses its representative promotes the next member instead
of leaving a blank. Nothing writes that slot yet — it is the seam for a future "replace
representative" action.

## The CR has one door and one job: open a stuck classmate's account

The CR (class representative) is not an admin and not a student. Their whole screen is `/cr`, and
its whole job is to open the account of a classmate who is stuck so that classmate can sign in,
correct their details and set their own PIN. Nothing else lives there — marks, exams and settings
stay behind `/admin`, because a CR who needs those should sign in as an admin.

`src/lib/crAccess.ts` holds the pair (`IS2026` / `CR2026`) and `crCredentialsMatch`. The username is
trimmed and case-folded because it is retyped from a noticeboard; the password is compared exactly,
because trimming the one secret would quietly accept a near-miss. `cr-session.ts` keeps the flag in
its own `cr_session_token` key, separate from the admin's, so a CR sign-in never unlocks `/admin`.

"Stuck" is two independent things and both stop a correction, so `CrUnlockPanel` fixes both in one
press:

- the edit form is closed — `grantStudentEdit` writes the grant the student page reads, and
- the sign-in is closed by a PIN lockout or a pile of failed attempts — `crUnlockStudentPin`
  clears them.

Opening is idempotent. A student with nothing to clear reports "nothing to open" rather than being
written again, so a second press does not churn the row.

Two things the CR's unlock deliberately does **not** do. It does not issue a new PIN: that would let
a CR read a classmate's secret, and the student owns that action. And it does not clear the device
binding: that binding is the one thing stopping a PIN being passed around a classroom, and a student
who changed phone has their own "Sahau PIN" tab (which re-binds to the new phone) plus the admin's
set-PIN. The rules live in `src/lib/pinLock.ts`, pure and import-free so `pinLock.test.ts` pins them
without a database.

The student's half is the "Badilisha" tab on `/account`, backed by `changeOwnPin`. It proves the old
PIN first, so a stolen session token alone cannot lock the owner out, and it signs every device out —
which is why the page clears the token and sends the student back to the sign-in with the new PIN.

A locked system does not close this door: `LockGate` lets `/cr` through alongside `/admin`, because
otherwise a mistyped Reg Namba waits for the lock to lift.

## Study year comes from the Reg Namba, never from the student

The edit form used to show a study-year `Select` and the student could pick anything. Now
`src/lib/studyYear.ts` reads the admission year out of the Reg Namba and derives the year, and the
form shows it read-only. `CURRENT_ACADEMIC_YEAR` is a constant in that file, so **bump it each
academic year** or every student's year goes stale by one.

`studyYear.ts` imports nothing, so `node --test` can load it without a bundler — `academicTargeting.ts`
re-exports its symbols for the older callers. That re-export must be a plain `export {}` plus a
local `import`, not `export ... from`: the inline form leaves the names out of local scope and the
file fails to compile.

## Update Taarifa is a two-step wizard

The page used to be a search box, a details card, a group card, an attendance card and a
two-tab editor, all visible at once. A student could not tell what to do first, and the
attendance card was a third door to a page that already has a menu entry. It then became a
four-step wizard, and the group step has since folded back into the details step:

```
1 Reg Namba   -> search, StudentMatchesPicker when several names match
2 Taarifa Zako -> the edit form, plus semina and group pickers, then one save
```

`step` is local state, not a route. `confirmStudent` moves to step 2, a failed lookup returns
to step 1, and the step chips allow jumping anywhere the student is allowed to go. The
attendance card is gone; `/attendance` is reachable from the menu and nowhere else.

Step 2 holds everything: name, Reg Namba, course, study year (read-only), semester, phone,
seminar and group, then the roster. The single **Hifadhi** press saves the details _and_
confirms the seat, so there is no separate group step to walk. A student who already
confirmed sees a locked summary instead of the pickers, and the button reads
**Hifadhi Taarifa** and saves their details without touching the seat.

`#group-yangu` is still a hash, not a route: the header links to `/student#group-yangu`, and
the page listens for `hashchange` and opens step 2, which is where the group now lives. That
keeps the old link working without adding a route for one step.

`GroupRosterView` renders the roster, shown inside step 2 and by `MyGroupCard`, so the two
cannot drift apart.

## The roster contains duplicate Reg Namba values

`students` holds **1588 rows for 1487 distinct Reg Namba** — 101 values appear twice, usually
differing only by a trailing space or a missing `MUM` prefix (`GOD BLESS MLYUKA` and
`GODBLESS MLYUKA`). Every `id` is unique, so this is duplicate enrolment, not a pagination
bug: `fetchAllStudents` pages correctly and `findMyGroup` keys on `id`.

The visible effect is a classmate listed twice in the roster. The fix is a data cleanup, not code:
deduplicate on `upper(trim(reg_no))`, keeping the row that carries the results and attendance.
Do not "fix" this in `findMyGroup` by de-duplicating by Reg Namba — two real students can share
a Reg Namba only through the data error, and hiding it in the view makes the cleanup harder.

**Counts have moved on, and the cleanup is now a screen, not a SQL statement.** Re-counted against
the live project: **1626 rows, 185 duplicate groups, 200 rows to fold in**. The spellings are wider
than "trailing space" — the separator varies too (`MUM2025_04_13229`, `MUM2025 -04-13229`), so the
comparison is `canonicalRegNo` (strip everything but letters and digits, uppercase), not
`upper(trim(...))`.

Three things learned while building the merge that a future edit must not undo:

1. **It is a merge, not a delete.** 146 `submissions`, 20 `attendance` and 132 `quiz_participants`
   rows hang off the rows that a naive delete would remove. `/admin/duplicates` moves every
   dependent onto the keeper first.
2. **The tidy-spelling step goes last.** `students.reg_no` is `UNIQUE`, and in 89 of the 185 groups
   the keeper's tidy spelling is already held by a row being removed. Writing it before the
   deletions trips the constraint. Order: move dependents → delete emptied rows → tidy the keeper.
3. **A colliding dependent keeps the richer copy.** Two `submissions` rows for the same
   `(exam, student)` are not identical; on 14 of the live collisions the duplicate held the higher
   mark. `submissionQuality` (answered questions, then score) decides, and the winner's content is
   copied onto the keeper's own row — never its `id` or `student_id`.

`dedupeStudents.ts` is pure (the decision, testable with `node --test`); `dedupeStudentsApi.ts`
holds the database half. Keep that split — the collision rule is the part that is easy to get wrong
and impossible to unit-test through a live client.

## Confirming a group writes the seat; there is no lock and no window

Step 2 of `Update Taarifa` writes the student's seat and the button says **Hifadhi Marekebisho**.
There is no approval step anywhere on this page: the student is the only one who knows their own
name and phone number, and the request row is written straight to `status: approved` as an audit
trail, never as a queue. The "Maombi yako" list shows the field names the student changed, not an
`approved`/`rejected` status, because every row in it is already in effect.

The seat is the student's to change at any time. An earlier design confirmed the seat and then
refused to move it again — first forever, then for one hour via
`supabase/migrations/20261103120000_group_edit_grace_window.sql`. In practice that left a student
who had saved the wrong group stuck in it: `confirm_student_group` answered `false` to every later
move and `apply_profile_update` ignored the incoming seminar and group, so a change made on the
form was **silently dropped**. That is what "kwa wengine haibadiliki" was: the student saved a new
group, the page showed success, and the row kept the old one.

`src/lib/groupRoster.ts` now writes the seat with a plain table update
(`saveStudentSeat(id, semina, group)`), and `apply_profile_update` is only asked for reg/name — the
seat never travels through a function that can refuse it. `src/lib/groupLock.ts` and its
`GRACE_MS`/`seatState`/`canEditSeat` rule are gone, along with the countdown badge, the locked
summary and the "three states share one card" UI. The pickers are always live; there is no
`seatForForm`.

`group_confirmed_at` survives, because the planner reads it (`isConfirmed` in
`src/lib/groupAssignment.ts`) to leave a student where they put themselves rather than re-seating
them. It is a marker that says "the student chose this seat", not a lock.

`supabase/migrations/20261104090000_remove_seat_lock.sql` brings a database that still holds the
old rule into line: it rewrites `confirm_student_group` to move the seat on every call (kept under
the old name so a stale client still gets a real write rather than a silent no-op) and rewrites
`apply_profile_update` to apply the incoming seminar and group unconditionally. **The app does not
depend on that migration**: the direct write works against the live database as it stands, which is
why the fix ships without DDL.

Verified against the live database with a throwaway student (deleted afterwards), running the real
`saveStudentSeat` and `updateStudentProfile`:

```
first  saveStudentSeat(SEMINA 4, GROUP 6) -> row [SEMINA 4/GROUP 6], stamp set
second saveStudentSeat(SEMINA 9, GROUP 3) -> row [SEMINA 9/GROUP 3]   <- the old bug dropped this
third  saveStudentSeat(SEMINA 1, GROUP 1) -> row [SEMINA 1/GROUP 1]
```

Two consequences worth remembering:

- **A missing column fails the whole select, not just that column.** `loadRoster()` tries
  `ROSTER_FALLBACKS` newest-first and drops the unknown name on a missing-column error, so a
  database without the migration still renders every page. `missingColumnFrom` has to recognise
  **two** shapes: PostgREST's `PGRST204` ("Could not find the 'x' column") for a write, and
  Postgres `42703` ("column students.group_confirmed_at does not exist") for a **select**. The
  table name is glued to the front in the second, so take the last dotted segment.
- **The admin unlock is not a security boundary.** `/admin/groups` shows every group and a
  per-member unlock button, but `admin-session.ts` gates the screens with `localStorage` and says
  so itself. Anyone holding the publishable key can call `unlock_student_group` directly. The
  lock stops a student moving their own seat by accident; it does not stop a determined attacker.
  Moving it behind real auth means Supabase auth or a service-role key, and the project has
  neither set.

## `hsl(var(--x))` is invalid here, and it hid every alert button

The theme tokens in `src/styles.css` are **complete `oklch()` colours**
(`--primary: oklch(0.52 0.15 245)`), not the bare HSL triplets that shadcn's older
templates used. `src/lib/alerts.ts` wrapped them anyway:

```js
confirmButtonColor: "hsl(var(--primary))",   // -> invalid, dropped
```

The browser parses `hsl(oklch(0.52 0.15 245))` as nonsense and **discards the whole
declaration**, so SweetAlert2's own `#fff` text colour survived while the background
went transparent. On the white popup that is white text on white: the confirm and
cancel buttons were present, clickable, and invisible. Proved headlessly against the
real bundle:

```
confirmBg=rgba(0, 0, 0, 0)  confirmColor=rgb(255, 255, 255)  popupBg=rgb(255, 255, 255)
```

Pass the token through as `var(--primary)`, which resolves to `oklch(...)` and paints.
`src/components/RichTextEditor.tsx` carries the same `hsl(var(--…))` pattern inside its
injected editor CSS, so its link and blockquote colours are dropped the same way —
harmless so far, but the same fix applies if that styling ever matters.

This is why "the OK/Cancel text does not show" is a CSS bug and not a missing button:
`showConfirmButton` was never false. Check the computed `background-color` before
touching the SweetAlert2 options.

## Step 2 writes the seat, step 3 shows the new group

The wizard is three steps: Reg Namba, then the details and the seat, then the group. There is no
separate "Hakiki" button and no fourth step. The step-2 button reads **Hifadhi Marekebisho**, and
that one press writes the details, writes the seat, and stamps `group_confirmed_at`. The dialog
lists every field the student changed — old value struck through, new value in primary, seat fields
first — so the press is never blind. An unchanged seat still saves: the dialog's job is to save,
not to require an edit.

Step 3 is where the payoff lands. It renders `GroupRosterView` — the group the student just
entered, the representative, and the classmates sitting with them — followed by the audit list of
what changed, and one **Maliza** button. The roster used to sit on step 2, which meant the
student read a classmate list that was still being rewritten by the write they were about to
make; rendering it after the save is why `saveAndConfirm` bumps `rosterEpoch` and calls `setStep(3)`
as its last act. `Maliza` writes nothing: by then the row is already saved, so the press only
reports what the student is holding.

The label does not track any window, because there is none: the button always reads **Hifadhi
Marekebisho**, the pickers are always live, and step 3's Back button is always enabled. The student
can walk back to step 2 and change the seat again as many times as they like.

There is no "Nilikosea Reg Namba" checkbox and no `reason` prefix on the request. Correcting the
Reg Namba already moves the student's submissions in the same transaction inside
`apply_profile_update`, so the checkbox never changed what the code did — it only asked the
student to describe a correction the system had already decided to accept. The request row still
carries `changed_fields`, which is what the admin list reads.

## Exam visibility and the Test number label live in one module

`src/lib/examCatalog.ts` owns both rules the Test Online page kept getting wrong:

- **`test_number` is the label; the title is only a fallback.** The admin's picker
  writes `test_number` (1–5). The tabs used to read the title, so an exam named
  `MAJARIO` with `test_number = 1` was filed under "Others" and looked like it was
  not a test at all. A number outside 1–5 is not trusted (`test_number = 9` falls
  back to the title); a title is matched on the whole word, so "Testimony" and
  "latest" are not Test numbers.
- **A published exam reaches every signed-in student.** `visibleExams` does no
  academic filtering. The old filter hid an exam from anyone with no `study_year`
  or `academic_year` — **959 of 1623 students** — so a published Test 1 reached 56
  of them. `target_study_year` / `academic_year` still record who an exam was
  written for; they no longer hide it from the rest.

`TEST_CATEGORIES` drives the tabs and the home per-test counters, so an exam cannot
be counted in one place and missed in the other. It is `test1…test5` (the admin
picker offers all five) plus `others`. Extending the picker means extending
`TEST_CATEGORIES`, `TEST_NUMBERS`, the `test_N` i18n keys, and the `categoryCounts`
seed together — `examCatalog.test.ts` fails if they drift.

## The step wizard is one component and one module

`src/lib/stepWizard.ts` holds the arithmetic (which steps are done, which is
current, how far along) and `src/components/StepWizard.tsx` renders it. Both the
assignment flow (`/quiz`, three steps) and the attendance flow (`/attendance`, two)
read the same helpers, so the two pages cannot drift into different ideas of what
step 2 means. Add a third flow through these rather than hand-rolling another
progress bar.

`GroupPicker` takes a `view` prop (`all` | `pick` | `members`): the assignment
wizard shows the picker on step 1 and the members list on step 2 instead of stacking
both cards on one screen. The default, `all`, is the original single-page behaviour.

`/attendance` defers the check-in. A scan or a typed code records _which_ session
and advances to a confirm step; the actual `checkIn` only fires on the second tap.
Do not move the check-in back into the scan handler — a poster QR read by accident
would mark attendance on the spot.

`/attendance` walks three steps, not two: **Jitambulishe → Kipindi → Thibitisha**.
Identity is its own step because a session cannot be joined without it, and a
scanned poster link already carries the code, so the pick step has nothing left to
ask once the student is signed in. A returning student skips straight to the pick
step; a scanned link skips to confirm. The step index is seeded in the `useState`
initialiser from `getStudentToken()`, so a signed-in student never flashes the
identity form on the way in.

The rail itself is horizontal on every screen size. It used to collapse to
"Hatua 2 kati ya 3" on a phone, which meant the student could not see the steps at
all on the device most of them use. The counter line is now `sr-only`; the visible
rail carries the meaning. Do not bring back the `sm:hidden`/`hidden sm:flex` pair.

## One student's form can be opened while the switch is off

`profile_edits_enabled` is all-or-nothing, so the single student who saved the wrong seminar or
group after the admin turned the switch off had no route back short of the admin editing their row
by hand. The per-student grant is that route.

The grant is `students.edit_unlocked_at`, added by
`supabase/migrations/20261104120000_student_edit_grant.sql` (column + `grant_student_edit`,
`revoke_student_edit`, `consume_student_edit`). It is spent by the save, not by a clock, so it
cannot be left open by accident, and the student page reads the column straight off the row it
already loads.

**Both migrations are applied to the live project** (2026-11-03, via
`POST /v1/projects/weiwabywirhoxiyyjkko/database/query`): `20261104090000_remove_seat_lock.sql` and
`20261104120000_student_edit_grant.sql`. Verified in `information_schema`/`pg_proc`: the column,
the `students_edit_unlocked_idx` index and all three RPCs exist, `anon` and `authenticated` hold
column-level SELECT on `edit_unlocked_at`, and `confirm_student_group` now returns `true` on a
second move instead of refusing it.

`grantStudentEdit` still carries a fallback to a `profile_update_requests` row with
`status = 'edit_granted'` for a database the migration has not reached. It is dead code on the
live project now, but it keeps the feature working on a fresh clone and costs one failed RPC call
that only fires when the function is missing. `unlockedAtFor(student, rows)` prefers the column and
falls back to the rows.

The rule lives in `src/lib/editPermission.ts` (`canEdit`, `hasGrant`, `grantFromRows`,
`unlockedAtFromRows`, `unlockedAtFor`, `requestHistory`) rather than in the route, so the
combination can be tested without a browser and the form and the database cannot drift apart on who
may write. `canEdit` is `globallyEnabled || unlockedAt`; `hasGrant` is `!!unlockedAt` and drives
the banner.

The student page already fetches their `profile_update_requests` rows for the history it shows, so
the fallback grant is read from that same fetch — `unlockedAtFor(student, editStatus)` — and no
second query is needed. `requestHistory` filters the grant rows out of the list the student reads,
because a grant is an admin instruction rather than a correction the student made.

A grant also releases the seat. "I updated my details wrongly" is exactly the case where the
seminar or group is what went wrong, so `grant_student_edit` clears `group_confirmed_at` in the
same call (and the fallback path calls `unlock_student_group`, which is already live) — a grant
that could not move the seat could not fix the mistake it was issued for.

The grant is spent by the save, not by the clock. `consume_student_edit` (or, on the fallback path,
deleting the grant rows) runs after a successful write, and the local rows are filtered in the same
commit as the seat stamp so the banner cannot outlive the grant. Pressing confirm with nothing
changed still spends it: a grant is one correction, and a grant that was never used is still a door
left open.

The admin's side is `src/components/EditPermissionPanel.tsx`, mounted at the top of
`/admin/requests`. It searches by Reg Namba through the same `findStudentsByQuery` the student page
uses, grants and revokes, and lists everyone currently holding a grant so a forgotten one is
visible. The admin request list and its "Futa Yote" button both skip grant rows: a grant is not a
request, and wiping the outstanding ones would silently close doors the admin opened on purpose.

## The page must survive a browser that blocks storage

"Haifanyi kazi kwenye Opera Mini" is not a CSS or a network problem. `window.localStorage`
is a **throwing getter** in more places than people expect: Opera Mini's extreme mode, Chrome
running inside an in-app webview, a browser with cookies blocked, and Safari's "Block All
Cookies". A bare `localStorage.getItem(...)` on any of those raises a `SecurityError`, and
because that ran during `I18nProvider`'s first effect — before React had mounted anything —
the whole bundle aborted and the visitor got the error boundary, or a blank page, on a site
that is otherwise perfectly healthy in desktop Chrome.

`src/lib/safe-storage.ts` is the only place that touches the browser store now. It probes once,
returns `null` when the probe throws, and falls back to an in-memory `Map` for the life of the
tab, so the app is merely forgetful rather than broken. **Every** `localStorage` call goes
through it, including `brokeredPreviewStorage()` in `src/integrations/supabase/previewAuthStorage.ts`,
which is the one that bites hardest: supabase-js reads `auth.storage` during client
construction, so an unguarded `return localStorage` there throws before any component runs.

The other half of the fix is `index.html`. The bundle is an ES module, and Opera Mini never
executes one, so the page used to arrive completely blank with no explanation. An inline
classic script now tests `"noModule" in HTMLScriptElement.prototype` — the one feature that
separates "can run a module" from "cannot" — and sets `data-unsupported` on `<html>`, which
reveals a Swahili notice naming Chrome/Firefox/Safari/Edge. A `<noscript>` block covers the
same case when scripting is off entirely. This does not make Opera Mini work; it stops it
failing silently, which is the most a site built on ES modules can honestly do.

To reproduce the original failure locally, build with real `VITE_SUPABASE_*` values, then load
the entry chunk from a page that defines a throwing `localStorage` getter. Before the fix the
DOM ends at the error boundary; after it, the header and hero render.

## The browser floor is Chrome 87 / Safari 14, and the CSS floor is lower

Tailwind 4 emits `oklch()` and `color-mix()`. `color-mix()` is the newest thing on
the page: Chrome 111+, Safari 16.4+, Firefox 113+. On anything older the declaration
is dropped, and a custom property that holds it does _not_ fall back — the same
failure mode as `hsl(var(--primary))` below. The page still renders; it just paints
with no colour in the theme tokens.

`vite.config.ts` therefore sets `css.transformer: "lightningcss"` with explicit
targets. lightningcss rewrites each colour to a hex fallback and upgrades it inside
`@supports`, so `--primary` keeps `#006eaf` for old browsers and the `oklch()` form
for new ones. The cost is ~0.4 KB gzip (24.6 -> 25.0 KB), and `oklch(` drops to zero
occurrences in the built CSS. Verified: `.bg-emerald-500\/10` ships
`background-color:#00bb7f1a` first, then the `@supports` block.

The two targets differ on purpose. CSS targets `safari13`/`chrome80`/`firefox78`,
but the JS target is `es2020` (Chrome 87 / Safari 14) because
`String.prototype.replaceAll` is used in `src/lib/i18n.tsx` and
`src/lib/islamic-knowledge.ts`, and that is Chrome 85 / Safari 13.1. A browser older
than `es2020` needs an API polyfill, not a syntax downlevel, so do not lower
`build.target` without adding one.

Three other things that were fixed at the same time, all worth keeping:

- Do not add `background-attachment: fixed`. It forces a viewport repaint on every
  scroll frame, and iOS ignores the property outright, so the effect was never
  consistent anyway.
- `crypto.randomUUID()` needs a secure context (Chrome 92+/Safari 15.4+) and throws
  a `TypeError` over plain HTTP. Use `randomUuid()` from `src/lib/pin-crypto.ts`,
  which the codebase already had for exactly this reason.
- `public/favicon.ico` and the PNG icons exist because the browser requested
  `/favicon.ico` on every page load and got a 404. They are PNG rather than SVG
  because Safari only learned SVG favicons in 16.4. `index.html` also carries a
  `preconnect` to the Supabase origin; without it the first query waited for DNS
  and TLS to finish.

## Marks, the red pen and the marks export (Kazi za Kufanya)

The admin marks a group's work the way a teacher writes on paper: one short
string, `7/24`. `src/lib/assignmentMarks.ts` owns every rule around that, and it
is pure and import-free so `node --test` pins it:

- `parseMark` accepts `7/24`, `7 / 24`, `7-24`, `7 out of 24`, `7 kati ya 24`, and
  a bare `7` (out of `DEFAULT_MARK_MAX`). It rejects a score above the total,
  a total of zero, a negative score, and a trailing `%` — a percentage is not a
  mark out of a total, so reading `7%` as `7` would silently change the mark.
- The mark lives in two places on purpose. The envelope (`ai_extracted_text`)
  keeps the exact `{score, max}` pair; the row's own `score`/`max_score` columns
  keep it visible to anything reading `pdf_submissions` without knowing the
  envelope. `toGroupSubmission` reads the envelope first and falls back to the
  columns, so a row written before the mark moved into the envelope still shows.
- "Sambaza alama kwa magroup mengine" is an explicit checkbox, not a side effect
  of saving an answer. A whole seminar is often marked alike, but a mark carried
  to a group nobody read is a mark nobody gave. It copies the mark only — never
  the answer or the signature.

The export (`exportMarks` in `src/lib/groupExports.ts`) writes the same rows to
Excel, Word, PDF and CSV, for one group or for all. When every group is exported
the sheet shows **only** Reg Namba, Jina, Kozi, Alama and grade, which is what the
owner asked for; `allMarksRows` builds exactly that shape. Students in a group
with no mark yet stay on the roll with a blank mark, because dropping them would
hide who is still outstanding.

### Who did the work, and per-group downloads

The admin page opens with "Taarifa za kazi za group" (`OverviewCard`): one line
per group that **actually submitted**, from `groupOverviewRows`. A group that
never handed anything in is left off rather than listed as absent — the list is
the answer to "who did the work", so an invented row would be a lie. Each line
carries the presenters, the mark and the grade, and a "Fungua" button that opens
the same review dialog as the cards below.

That card is also the export picker. Tick groups and the downloads cover those
alone; tick nothing and they cover everyone, because an empty selection would
otherwise produce an empty file and read as a bug. `groupMarksRows` builds the
per-group shape — group, seminar and gender on every line, so a sheet holding
three groups still makes sense on its own — and `exportGroupMarks` writes it to
Excel, Word, PDF or CSV. The flat "everyone" export above is untouched.

`SignaturePad` signs in red (`#dc2626`) by default, with black, blue and green
swatches. Red is the requested default, but a red tick can be lost against red
text, so the choice is kept.

## Marks on a page, and the submit spinner (Kazi za Kufanya)

The teacher's tick, note or error is stored as plain data in
`src/lib/assignmentAnnotations.ts`, and the one decision that matters is that a
mark's spot is a **fraction of the page** (0..1), never pixels. Pixels would put
the mark on the right word on the admin's wide screen and the wrong word on a
student's phone; a fraction survives every zoom and screen size.

`src/components/PdfPageView.tsx` is what makes per-page marks possible at all.
The browser's own `<iframe>` PDF viewer cannot say which page is on screen, nor
where a click inside the document landed, which is why the old marks could only
ever be document-wide. Drawing one page to a canvas with `pdfjs-dist` gives both
the page number and a click point. It loads the worker through
`pdfjs-dist/build/pdf.worker.min.mjs?url` so Vite bundles it — without the worker
a large PDF freezes the tab.

A Word file has no pages to click, so its marks attach to the whole document
(page 0); `page: 0` means "the whole work" everywhere in the code.

`parseAnnotations` re-validates a stored list on the way in: it drops entries
that are not a real kind or carry no words, and clamps a negative page to 0. A
damaged row must not be able to put a stray mark on a page. `saveAdminAnswer`
refuses to rebuild a row whose envelope will not parse, rather than silently
discarding the group's presenters and question.

The submit buttons are guarded because a bare `await` in an event handler leaves
the spinner on forever when it throws. `send()` in `src/routes/quiz.tsx` and the
admin's save both `try`/`catch`, clear the spinner, and tell the user what
happened — a network drop, a storage rejection or a quota error must end in a
message, not a spinner that never stops.

CI installs with `bun install --frozen-lockfile`, so a dependency added to
`package.json` must also be recorded in `bun.lock` or the install step fails
before the build ever runs.

## The CR screen (`/cr`)

A CR is the class representative: not an admin, not a student. Their credentials
are fixed (`IS2026` / `CR2026`) in `src/lib/crAccess.ts`, and the sign-in state is
its own key in `src/lib/cr-session.ts` so a CR is never signed in as an admin.
The gate is not a security boundary — the publishable key ships in the bundle, so
those constants are readable in devtools. It keeps an honest visitor off the wrong
screen; real protection is the RLS that cannot yet be applied.

The page has three tabs, and only these:

1. **Fungua Akaunti** — `CrUnlockPanel`. The CR's original single job.
2. **Magroup** — `CrGroupsOverview`. Read-only: search a Reg Namba to see the
   student's seminar, gender, group number and everyone in it, plus browse every
   seminar's groups. It reads the same `buildSeminarReports` the admin's pages use,
   so the CR and the owner never see two different rosters.
3. **QR ya Mahudhurio** — `CrAttendanceQr`. Download/print the attendance poster,
   but only for sessions the owner has opened to the CR.

### Permission for the CR to print a poster

The owner flips a switch in the live session panel (`AttendanceSessionPanel`),
which calls `setSessionCrQr`. The flag rides in the session's own JSON payload
(`cr_qr_allowed`) rather than a new column, because nothing in this environment
can run DDL against the live project — the same constraint that shaped all of
`attendance.ts`. A new session starts closed (`cr_qr_allowed: false`), and ending
the session ends the permission with it: a printed poster only means anything
while the join code is still being accepted.

`src/lib/crPoster.ts` owns the rule (`crPosterDecision`) and is pure, so
`crPoster.test.ts` pins it. Three things must hold, in this order, each with its
own reason the screen can show: the owner allowed it, the session is still open,
and there is a join code to encode. Both the admin's switch and the CR's screen
call this one rule, so they cannot disagree about who may print what.

The CR's print station deliberately shows the **stable join code**, never the
25-second rotating token: a CR is not in the room running the session, and the
only useful thing they can do with attendance is carry a poster to the wall
before students arrive.
