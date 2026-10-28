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
would build stale code. Deploy the working tree directly instead:

1. `npx vite build`
2. Upload every **tracked** file (`git ls-files`), not just `dist/`. The project's
   `buildCommand` is `vite build`, so Vercel needs `package.json` and the source; uploading
   `dist/` alone fails with `ENOENT` / `Command "vite build" exited with 127`.
3. `POST /v13/deployments` with `{"project", "target":"production", "files":[...]}` where each
   entry is `{file, size, sha}` (sha1). Vercel answers `400 missing_files` until every digest
   is uploaded via `POST /v2/files` with the `x-vercel-digest` header; then re-POST the
   deployment.
4. The live domains are `www.islamicstudiestest.online` (apex 308-redirects to `www`) and
   `student-hub-central-theta.vercel.app`. Recent deployments moved all of them automatically,
   so check `GET /v13/deployments/<id>` for the `alias` array before assuming a manual
   re-point is needed; if one is, use
   `POST /v2/deployments/<id>/aliases {"alias":"<domain>"}`.
5. Verify the alias really serves the new build: compare the `assets/index-*.js` hash in the
   live HTML against `dist/assets/index-*.js` locally. The Vercel build is a fresh `vite build`
   server-side, so its hash legitimately differs from a local build of the same source.

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
