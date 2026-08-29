# Quill Office

A browser-based document editor with a Word-style ribbon: rich text formatting,
tables, PowerPoint-style image tools, real page layout, find & replace, and
export to Word, HTML, plain text or PDF. Documents are stored in the browser's
local storage — nothing leaves the machine.

## Development

You need Node.js 20+ (or Bun).

```sh
npm install
npm run dev
```

The dev server listens on http://localhost:8080.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `.output/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## Built with

- TanStack Start (file-based routing, SSR)
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Vite
