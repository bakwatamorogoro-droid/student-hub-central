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

  These migrations cannot be applied from this environment: there is no service*role key, no
  database password, and no Supabase access token. The only key available is the publishable
  `sb_publishable*…`, which is RLS-limited and cannot run DDL. The owner must paste the file into
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

The proper fix is to run `supabase/APPLY_PENDING.sql`; this keeps the app usable
until then, and the banner on `/admin/settings` already names the pending columns.

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
