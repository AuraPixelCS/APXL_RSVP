@AGENTS.md

## Versioning & Deployment Workflow

### Version source of truth
- Version lives in `package.json` → `"version"` field
- `next.config.ts` reads it and exposes it as `NEXT_PUBLIC_APP_VERSION` at build time
- UI reads from `process.env.NEXT_PUBLIC_APP_VERSION` — no other source needed

### Every production deploy (`npx vercel --prod`)

After deploying, always update `CHANGELOG.md`:

1. **If version was bumped** — add a new `## [x.y.z] — YYYY-MM-DD` section at the top (below the header) with bullet points for what changed
2. **If version was NOT bumped** — append the new changes under the existing version's section

### Version bump rules
- **Patch** (1.0.x) — bug fixes, small UI changes, copy changes
- **Minor** (1.x.0) — new features, new pages, significant new functionality  
- **Major** (x.0.0) — breaking changes, full rewrites, major architecture shifts

### How to bump
1. Edit `package.json` → `"version"` field
2. Deploy: `npx vercel --prod` from `/Users/Mandy/Developer/Projects/AuraPixel/rsvp`
3. Update `CHANGELOG.md` with the new version section and changes

# RSVP — AuraPixel Event Platform

## Project Overview
Event RSVP web application for **AuraPixel** — dual-facing: guests RSVP via a public page, admins manage events and view responses.

## Tech Stack
- **Framework:** Next.js (Pages Router — NOT App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **UI Components:** HeroUI (`@heroui/react`) + Framer Motion
- **Backend:** Firebase (Firestore, Auth, Storage)

## Brand Colors
| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background | `#000000` | `--background` / `bg-background` |
| Foreground | `#ffffff` | `--foreground` / `text-foreground` |
| Accent / Brand Blue | `#3d9bf5` | `--accent` / `text-accent`, `bg-accent` |
| Surface | `#0d0d0d` | `--surface` |
| Surface 2 | `#141414` | `--surface-2` |
| Border | `#1f1f1f` | `--border` |
| Muted | `#6b7280` | `--muted` |

## Firebase
Config lives in `lib/firebase.ts`. Credentials go in `.env.local` (see `.env.local.example`).

Services used:
- **Firestore** — RSVP submissions (`db`), event details
- **Auth** — Admin authentication (`auth`)
- **Storage** — Optional file uploads (`storage`)

## Folder Structure
```
pages/
  index.tsx           — Public RSVP page (guest-facing)
  admin/
    index.tsx         — Admin dashboard (protected)
    login.tsx         — Admin login
components/
  layout/             — Navbar, footer, layout wrappers
  sections/           — Page-level sections
  ui/                 — Reusable atoms (buttons, cards, etc.)
lib/
  firebase.ts         — Firebase app, auth, db, storage exports
types/
  index.ts            — RSVP, Event, AdminUser interfaces
styles/
  globals.css         — Tailwind v4 + CSS custom properties
```

## Planned Pages
| Route | Audience | Purpose |
|-------|----------|---------|
| `/` | Guest | RSVP form — fill in details and submit |
| `/admin` | Admin | Dashboard — view RSVPs, export, manage event |
| `/admin/login` | Admin | Firebase email/password sign-in |

## Dev Commands
```bash
npm run dev       # localhost:3000
npm run build     # production build
npm run lint      # ESLint
```

## Notes
- Firebase is initialized with `getApps().length` guard to prevent re-init on hot reload
- Admin routes will be protected via `onAuthStateChanged` + redirect
- HeroUI v3 is headless (no global provider) — styles imported via `@heroui/react/styles` in `_app.tsx`
- Dark-mode only — no light theme toggle needed
