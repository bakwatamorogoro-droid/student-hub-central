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
- `bun.lock` was generated on Lovable and pins 115 packages to
  `europe-west{1,4}-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`. Those URLs do resolve
  from the public internet, but `registry.npmjs.org` is the safer pin.

## Database notes

- **PENDING MIGRATION.** `supabase/migrations/20261028090000_add_stats_switches_and_request_fields.sql`
  is written but has **not** been applied to the live database. It adds
  `app_settings.{show_submissions_stat,show_test1_stat,stats_hidden_at}`,
  `profile_update_requests.{new_course,new_study_year,new_semester,new_academic_year,changed_fields}`,
  `exam_pdfs.target_semester` and `exams.target_semester`. Until the owner runs it in the
  Supabase SQL editor, the admin stat switches and the semester-targeted filters are inert;
  every affected write/read falls back to the pre-migration column set so nothing errors
  (see `isMissingColumnError` in `src/lib/studentProfile.ts`). Verified live: all four new
  columns answer `42703 column does not exist`.

- `students.reg_no` values carry a **trailing space** (e.g. `"MUM2025-04-14106 "`), so exact
  `ilike` lookups silently miss. Trim both sides before comparing — see
  `src/lib/studentSearch.ts`.
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

A ready-made script is at `/tmp/deploy2.py`. The flow is:

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
