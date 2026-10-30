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

## Deployment

Vercel project `student-hub-central` (id `prj_5WKRS07h8iwQGHnrKFxURQZ261dx`, team
`team_Vdk2Y0gDRdZqQuxP6yvdHlMq`) builds from `vite build` and serves production at
`https://student-hub-central-theta.vercel.app`.

- A Vercel token in this workspace is a **team** token: `GET /v2/user` returns 404 and
  `vercel whoami` / `vercel deploy` fail with "User not found". Pass `teamId` to the REST
  API instead of using the CLI.
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

- **TWO MIGRATIONS ARE PENDING ON LIVE.** `supabase/APPLY_PENDING.sql` is the ready-to-paste
  combination of both. Checked by probing PostgREST per column, the live project has neither:
  - `20261027120000_add_semester.sql` — `students.semester`, `exams.target_semester`,
    `app_settings.{course_list,program_years,current_academic_year,current_semester,academic_years_list}`,
    `announcements.image_url`.
  - `20261028090000_add_stats_switches_and_request_fields.sql` — `exam_pdfs.target_semester`,
    `profile_update_requests.{new_course,new_study_year,new_semester,new_academic_year,changed_fields}`,
    `app_settings.{show_submissions_stat,show_test1_stat,stats_hidden_at}`.

  **Impact is limited to the newer features, not the core app.** Confirmed by probing the live
  REST API: 1561 students, 2 exams, 2602 submissions and 13 announcements all read fine, and the
  home page renders its real stats. `exams.tsx` never sends `target_semester`, and `admin.pdf.tsx`
  retries without it on `isMissingColumnError`, so exam creation and uploads still work. What stays
  inert until the SQL runs: the admin stat-visibility switches (they read `app_settings` with these
  columns and swallow the error, so the page still renders), the semester filter on
  `semester-questions`, and `students.semester` targeting.

  These migrations cannot be applied from this environment: there is no service_role key, no
  database password, and no Supabase access token. The only key available is the publishable
  `sb_publishable_…`, which is RLS-limited and cannot run DDL. The owner must paste the file into
  Supabase → SQL Editor.

- **`students.reg_no` values carry a trailing space** (e.g. `"MUM2025-04-14106 "`), so exact
  `ilike` lookups silently miss. Trim both sides before comparing — see
  `src/lib/studentSearch.ts`.

- **The legacy project host `tkagffueenwajmkhuopn.supabase.co` is still live** and still serves the
  gallery images in `study_images.image_url`. The newer project host
  `owztbeotrhzzdfbnwu.supabase.co` does **not** resolve (DNS failure), so only the brokered
  `…lovable.cloud` URL works for API and storage calls. Do not rewrite stored `image_url` values to
  the new project without re-uploading the files, or the gallery images will 404.

- **The database is a Lovable Cloud project, not a plain Supabase one.** The REST URL is a
  brokered `https://c--<uuid>-prod.lovable.cloud` host; the direct host
  `owztbeotrhzzdfzhbnwu.supabase.co` does not resolve at all. `supabase/config.toml` points at that
  unreachable host, so the Supabase CLI cannot be used. The SQL Editor lives in the **Lovable**
  project, not at supabase.com:
  <https://lovable.dev/projects/5ea8369e-0d0b-402b-aa5f-3a1e8becd478> (private; owner login required).
  The owner's own Lovable account is the only place with DDL rights.

- **The semester migration exists twice and never ran.** `drizzle/migrations/0004_add_semester.sql`
  and `supabase/migrations/20261027120000_add_semester.sql` add an identical column set, but `0004`
  was **absent from `drizzle/migrations/meta/_journal.json`** (the journal stopped at `0003`), so the
  migrator skipped it. That single omission is the root cause of every missing-column symptom. The
  journal now lists `0004` and `0005`, so a normal migration run creates both column sets. When
  adding a migration, always add its journal entry too — a `.sql` file alone is never applied.

- **`git push` cannot deliver that fix.** The `GITHUB_TOKEN` authenticates as
  `bakwatamorogoro-droid` (the repo owner) but carries **no OAuth scopes**, so every push is
  rejected with `403 Permission to … denied to bakwatamorogoro-droid`. Deploys therefore go through
  the Vercel API (see below), and the Lovable project never sees the change. To make the journal fix
  take effect, the owner must commit and push it from their own account (or paste it into Lovable),
  then run the migration.

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

- **The Vercel deploy token is recoverable from the prior conversation log** and is *not* an env
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
- `study_images` is the table behind the real-photo gallery; rows need `active = true` to show.
  Its rows currently have `title = null`, so they render without a caption and without alt text.

## Deploying without git write access

The GitHub token in this environment cannot create or update refs (`403 Resource not accessible
by integration`), so a branch pushed locally never reaches GitHub and a `gitSource` deploy
would build stale code. Deploy the working tree directly instead.

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

## Sign-in without email, and QR + geolocation attendance

Supabase email auth is disabled on this project (`/auth/v1/settings` reports `"email": false`), and
no service-role key is set on Vercel. Sign-in therefore does not use `auth.users` at all. Students
sign in with a registration number and a PIN an admin issued, and the PIN is exchanged for a session
token. Everything is enforced in SQL, so the browser is never trusted for identity.

Apply `supabase/APPLY_STUDENT_PIN_AUTH.sql` in the SQL Editor. It is the four files below
concatenated in the order they must run, and it is written to be safe to run more than once:

1. `drizzle/migrations/0006_attendance_qr.sql` — `attendance_sessions`, the distance helper, and
   `attendance_check_in_qr()`
2. `drizzle/migrations/0007_student_pin_auth.sql` — `student_pins`, `student_sessions`,
   `admin_sessions`, and the sign-in functions
3. `supabase/HARDEN_ADMIN_PASSWORD.sql` — `admin_login()`, so the app never reads the password
4. `supabase/HARDEN_RLS.sql` — turns RLS on and revokes the admin password column

Until the owner applies it, the UI renders and every action returns `not_ready` with a Swahili
explanation. The owner is the only account with DDL rights, so this cannot be applied from the agent
environment.

### How identity is proved

* A PIN is stored only as a bcrypt hash (`crypt(pin, gen_salt('bf', 10))`), so reading `student_pins`
  never yields a usable PIN.
* A session token is 32 random bytes as hex. Only its SHA-256 hash is stored in `student_sessions`,
  so the table cannot be used to impersonate a session.
* **A student cannot choose their own PIN.** `admin_set_student_pin()` requires a live admin session
  token. Without that rule, anyone who knew a registration number could claim the account. This is
  the single most important property of the design.
* Five wrong PINs lock the account for 15 minutes. An unknown registration and a wrong PIN return the
  same `bad_credentials` answer, so the response cannot be used to enumerate registration numbers.
* `attendance_check_in_qr()` resolves the student from the session token. It deliberately does **not**
  use `students.device_id`: that column is world-readable, so it cannot prove anything. (An earlier
  revision used it as a fallback, which was only as safe as the RLS that did not exist yet.)
* Minting a QR token (`attendance_rotate_token`) and issuing a PIN are both admin-gated in SQL, so a
  tampered client cannot hand out tokens.

### Why `HARDEN_RLS.sql` matters

The publishable key ships inside the JavaScript bundle, so every visitor already has it. Before RLS
was enabled, that key could read all 1561 students, 2602 submissions, and `app_settings.admin_password`
— verified from outside the app with nothing but the key from the bundle.

Two details that are easy to get wrong:

* Use `ENABLE ROW LEVEL SECURITY`, never `FORCE`. `FORCE` also applies RLS to the table owner, and
  the `SECURITY DEFINER` functions run as the owner, so `FORCE` silently makes every one of them
  return NULL (verified).
* A table-wide `GRANT SELECT` covers every column, so `REVOKE SELECT (admin_password)` does nothing
  on its own. The table grant has to be withdrawn first, then SELECT re-granted on the remaining
  columns.

No policy is created for `students`, `attendance`, `submissions`, `issue_reports`,
`profile_update_requests`, `daily_visits`, `attendance_sessions`, `student_pins`, `student_sessions`
or `admin_sessions`. Reads the app needs go through the `SECURITY DEFINER` functions. Consequence:
**a page that reads those tables straight from the browser returns nothing.** `students`, `attendance`
and `submissions` are read directly in several admin routes, so those routes need moving to server
functions before this file is applied.

### Other design points

* Only the SHA-256 hash of a rotating QR token is stored. Reading `attendance_sessions` never yields a
  usable QR payload. Tokens rotate every 25 s (`ROTATE_MS`).
* Every gate (token, expiry, session window, identity, geofence, duplicate) is enforced inside
  `attendance_check_in_qr()`. The browser supplies only a token and a GPS fix.
* The duplicate check is an explicit `EXISTS`, not `ON CONFLICT`. The live `attendance` table has no
  unique constraint on `(student_id, check_in_date)`, so `ON CONFLICT DO NOTHING` never fired and a
  student could check in repeatedly (caught by test B5). A unique index is created as a backstop.
* The real `attendance` columns are `student_id, reg_no, full_name, semina, student_group,
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
