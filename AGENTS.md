# Agent notes

## Layout

- `src/routes/` — file-based routes. See `src/routes/README.md` for conventions.
  `routeTree.gen.ts` is generated; never edit it by hand.
- `src/components/docs/` — the editor: ribbon primitives, the editor shell, and
  the image tooling (selection overlay + picture ribbon tab).
- `src/components/ui/` — shadcn/ui primitives. Prefer extending these over
  hand-rolling new base components.
- `src/lib/` — framework-free helpers (document storage, image DOM helpers,
  error reporting).

## Conventions

- Path alias `@/` maps to `src/`.
- TypeScript is strict, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` — indexing returns `T | undefined`, and optional
  properties cannot be assigned an explicit `undefined`.
- Document content is plain HTML held in a `contenteditable` element and
  persisted to local storage; all image state lives in inline styles and
  `data-*` attributes on the element so it survives export and reload.
- Run `npx tsc --noEmit` and `npm run build` before considering a change done.
