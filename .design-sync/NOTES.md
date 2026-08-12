# design-sync notes — Meeting Room Booking UI

## Repo shape

`frontend/` is a Next.js **app**, not a standalone design-system package: no `dist/`
build, no `main`/`module`/`exports` in `package.json`, no Storybook. The converter runs in
**synth-entry mode** — `cfg.entry` is a deliberate placeholder (`./frontend/dist/index.js`,
never built) that exists only to walk `package-build.mjs` up to `frontend/package.json` so
`PKG_DIR` resolves correctly. Every build logs `[NO_DIST]` for this — expected, not a bug.

`cfg.srcDir: "components/ui"` scopes discovery to the 4 shadcn primitive files
(`button.tsx`, `input.tsx`, `label.tsx`, `table.tsx`); it deliberately excludes
`frontend/components/nav.tsx` and `employee-picker.tsx`, which need live app data/routing
and would only produce broken cards.

## Tailwind v4 CSS — must be recompiled before every build

`app/globals.css` is a Tailwind v4 **source** file (`@import "tailwindcss"`, no
`tailwind.config`, `components.json` has `"config": ""`). It is NOT what `cfg.cssEntry`
points at — pointing there ships raw `@theme`/`@import` directives and every preview
renders unstyled. Instead `cfg.cssEntry` = `.ds-tailwind-compiled.css`, a **compiled**
stylesheet generated with the Tailwind v4 CLI, run from `frontend/` so its auto
content-detection sees `components/ui/`:

```sh
cd frontend
npx --yes @tailwindcss/cli -i app/globals.css -o .ds-tailwind-compiled.css
```

This output file is gitignored (regenerable, not durable) — **re-run this command before
every rebuild** (`package-build.mjs` / `resync.mjs`) or the sync will bundle a stale/missing
stylesheet. `cssEntry` is bounded to `PKG_DIR` (`frontend/`), so the compiled file must live
inside `frontend/`, not under `.design-sync/`.

## Blue theme

`app/globals.css` `--primary`/`--primary-foreground`/`--ring` were recolored to blue
(oklch, both `:root` and `.dark`) at the user's request — this is a real change to the
live app's theme, not just the synced copy. If the app's theme changes again, re-run the
Tailwind compile step above before re-syncing, or the design system will drift from the
app.

## Playwright

No Chromium was cached on this machine before this sync; `.ds-sync/` has its own
`playwright` devDependency (installed via `npm i -D playwright` + `npx playwright install
chromium`) separate from the app's own tooling.

## Re-sync risks

- **Stale `.ds-tailwind-compiled.css`** is the single biggest risk — if a re-sync skips
  the recompile step, previews silently ship the previous theme/utility set. Always
  recompile first.
- The 11 synced components are all shadcn/ui `base-nova` primitives plus this repo's own
  blue-theme token override — if the app is later re-themed via `shadcn` CLI (which can
  overwrite `app/globals.css`), check the token values still match before re-syncing.
- `srcDir` scoping means any NEW file added to `frontend/components/ui/` is picked up
  automatically on next sync; a file added elsewhere under `components/` is not.
- No Storybook and no reference render exist for this repo — all preview grading is
  absolute (per the non-storybook skill), authored by Claude from real app usage
  (`app/admin/rooms/page.tsx`, `app/book/page.tsx`). If those pages' UI patterns change
  significantly, the previews may no longer reflect real usage.
