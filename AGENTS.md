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
  time, so they must be present *during* the build, not only at runtime.
- Vercel blocks deploys whose lockfile resolves `@tanstack/react-start` below `1.168.60`
  (CVE-2026-102989) with a `text/plain` error. Keep `package.json` at `^1.168.60` or later.
- `bun.lock` was generated on Lovable and pins 115 packages to
  `europe-west{1,4}-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache`. Those URLs do resolve
  from the public internet, but `registry.npmjs.org` is the safer pin.

## Database notes

- `students.reg_no` values carry a **trailing space** (e.g. `"MUM2025-04-14106 "`), so exact
  `ilike` lookups silently miss. Trim both sides before comparing — see
  `src/lib/studentSearch.ts`.
- Live `students.semina` holds `'SEMINA 1'`…`'SEMINA 14'` and `student_group` holds
  `'GROUP 1'`…`'GROUP 27'`, which do not match the `semina_list` / `group_list` values seeded
  in app settings. Read the distinct values from `students` and merge, as `src/lib/directory.ts`
  does, rather than trusting the settings arrays.
- `study_images` is the table behind the real-photo gallery; rows need `active = true` to show.
  Its rows currently have `title = null`, so they render without a caption and without alt text.
