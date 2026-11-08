# AI-13 Module Notes

A modern, static, zero-backend course notes portal for multiple AI-13 course modules. Each module contains daily summaries, transcripts, important links, class board work photos, Q&A sections, labs, and visual notes.

> 📖 **Complete Content & Setup Guide**: For full step-by-step instructions on setting up Cloudflare Pages (zero card needed), uploading course documents, daily checklists, and command reference, read [HOW_TO_USE.md](file:///d:/ai13_module/HOW_TO_USE.md).

## Architecture

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│     Your Computer      │      │      Git / GitHub      │      │   Cloudflare Pages     │
│  (python ingest.py)    │ ───► │  (public/content/)     │ ───► │  (Fast Web Frontend)   │
│ Ingests 1 item at time │      │ Holds docs & manifests │      │ Readers browse portal  │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

The site is a fully static SPA deployed on Cloudflare Pages with zero card required. Content lives directly in `public/content/` (served at `/content` in dev and bundled into `dist/content` on build), published via `python ingest.py publish`. External Cloudflare R2 object storage is supported as an optional upgrade for massive archives.

## Tech Stack

- **Framework**: Vite + React 19 + TypeScript (strict mode)
- **Routing**: react-router-dom v7 with lazy route-level code splitting
- **Styling**: Tailwind CSS v4 with CSS-first `@theme` config (no `tailwind.config.js`)
- **UI Primitives**: Radix UI (accordion, tabs, dialog, tooltip, scroll-area)
- **Animations**: motion (Framer Motion)
- **Icons**: lucide-react
- **State**: zustand (for progress tracking)
- **Fonts**: Inter Variable + JetBrains Mono Variable (self-hosted via @fontsource)

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and set your R2 URL
cp .env.example .env

# Start dev server
npm run dev

# Type-check
npm run typecheck

# Production build
npm run build

# Preview production build
npm run preview
```

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `VITE_CONTENT_BASE_URL` | Base URL of the R2 bucket serving content manifests and files | `https://your-bucket.r2.dev` |

## Routes

| Path | Page | Description |
|---|---|---|
| `/` | HomePage | Module grid overview |
| `/m/:moduleSlug` | ModulePage | Module overview with day list |
| `/m/:moduleSlug/day/:dayNumber` | DayPage | Day detail (summary, transcripts, Q&A, etc.) |
| `/m/:moduleSlug/labs` | LabsPage | Lab notebooks and doodles |
| `/m/:moduleSlug/visual-notes` | VisualNotesPage | Visual / handwritten notes |
| `*` | NotFoundPage | 404 page |

## Content Folder Layout

The following is the local source structure that the ingest CLI will process and upload to R2. These folders are gitignored when containing large binary files.

```
content/
  modules/
    <module-slug>/
      module.json                         # Module metadata (title, description, day count, etc.)
      days/
        day-NN/
          meta.json                       # Day metadata (title, date, topics)
          summary.docx                    # Day summary document
          transcripts/
            transcript-N.docx            # Lecture transcript(s)
          links.json                      # Important links for the day
          questions.json                  # Q&A items (10+ per day)
          boards/
            *.webp                        # Class board work photos
      labs/
        <lab-id>/
          meta.json                       # Lab metadata
          notes.docx                      # Lab notebook
          doodle.webp                     # Lab visual/doodle
```

## Project Structure

```
src/
  main.tsx                                # Entry point
  App.tsx                                 # Router + providers
  index.css                              # Tailwind v4 @theme design system
  config/site.ts                         # Site configuration
  lib/cn.ts                              # clsx + tailwind-merge helper
  components/
    ui/                                  # Reusable UI primitives (Button, Card, Badge, etc.)
    layout/                              # Shell, Header, Sidebar (Prompt 3)
    ThemeProvider.tsx                     # Theme context + system preference tracking
    ThemeToggle.tsx                       # Light / Dark / System toggle
    Logo.tsx                             # Logo or text wordmark
  pages/                                 # Route-level page components (lazy-loaded)
  features/
    content/                             # Content loading & manifests (future)
    progress/                            # Progress tracking store (future)
    search/                              # Search feature (future)
  types/                                 # Shared TypeScript types (future)
```

## License

Private — not for redistribution.

