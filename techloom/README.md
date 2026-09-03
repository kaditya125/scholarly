# TechLoom Innovations — corporate website

The public site for **TechLoom Innovations**, the parent company. Sadhya
(`sadhya.app`) is presented here as its flagship product, not as the company.

```
TechLoom Innovations          ← this site
├── Consulting & engineering   /capabilities
└── Product studio             /products
    └── Sadhya                 /products/sadhya → sadhya.app
```

---

## Why this is a separate app

It sits beside `frontend/` (the Sadhya product SPA) rather than inside it, for two
reasons:

1. **Brand.** TechLoom reads neutral and corporate; Sadhya has its own, more
   expressive identity. Sharing a bundle would mean sharing a design system, a
   theme root and a favicon — and the whole point of the Sadhya section on the home
   page is that you can see it is a different brand.
2. **Weight.** The Sadhya app ships auth, Firebase, KaTeX, charts and ~90 lazy
   routes. This one has three runtime dependencies: `react`, `react-dom`,
   `react-router-dom`. Production build is ~95 kB gzipped in total, of which ~74 kB
   is React and the router.

The stack matches the rest of the monorepo — React 19, TypeScript, Vite 6,
Tailwind v4 — so nothing new has to be learned to work on it.

## Running it

```bash
npm install
npm run dev        # http://localhost:4300
```

Other scripts:

| Script              | Does                                                        |
| ------------------- | ----------------------------------------------------------- |
| `npm run build`     | Production build into `dist/`, then writes SEO files         |
| `npm run preview`   | Serves the built `dist/`                                     |
| `npm run typecheck` | `tsc --noEmit` (also aliased as `npm run lint`)              |
| `npm run og`        | Regenerates `public/og.png` and the app icons from SVG       |

`.claude/launch.json` has a `techloom` entry, so the browser preview can start it
by name.

## Deploying

The build is a static SPA — any static host works, with one requirement: **unknown
paths must fall back to `index.html`**, or a deep link like `/products/sadhya` will
404 at the server before React ever sees it.

```bash
SITE_URL=https://your-domain npm run build
```

`SITE_URL` is not optional for a production build. It is the origin used for:

- the canonical link and `og:url` in `index.html`
- `og:image` / `twitter:image` (`/og.png`)
- the Organization JSON-LD
- `dist/sitemap.xml` and `dist/robots.txt`

Without it the build still succeeds, but those are **omitted rather than guessed**
and the build prints a warning saying so. A canonical tag pointing at a domain the
site is not served from is worse than no canonical tag at all.

Optional: `VITE_CONTACT_ENDPOINT` — a URL that accepts a JSON `POST` from the
contact form. With it unset, submitting the form opens the visitor's own mail
client with the message pre-filled, which needs no backend. See `.env.example`.

## Content and configuration

**`src/site.config.ts` is the single source of truth** for everything factual the
site says about the company. Nothing in a component hard-codes a company detail.

Two rules apply to that file, and they are the reason the site is credible:

- **Verified only.** Every value must be checkable against a real record. Where a
  fact does not exist, the value is an empty string and the UI omits the row rather
  than inventing one — which is why there are no client counts, revenue figures,
  headcounts, logos, testimonials, awards or partnerships anywhere on this site.
- **Nothing sensitive.** This repository is public. The Udyam registration number
  and the enterprise classification are public information (they are printed on the
  certificate and already appear in the Sadhya footer). The proprietor's PAN, bank
  details, personal contact details, residential address and social category are
  not, and must never be added here. `/company` says as much, on the page.

Copy that is longer than a line lives in `src/content/`.

### Before launch

- [ ] `SITE_URL` set in the deploy environment.
- [ ] `COMPANY.email` in `src/site.config.ts` — currently the entity's existing
      monitored inbox (`support@sadhya.app`). Replace it with a TechLoom-domain
      address once mail is configured for one, or set it to `''` to hide the email
      row site-wide.
- [ ] `COMPANY.social` is an empty array. Add entries only for profiles that exist;
      every entry renders a link, so an invented one is a dead link.

## Structure

```
src/
├── site.config.ts          Company facts. Edit here, not in components.
├── styles.css              The whole design system: tokens, type scale, motion.
├── App.tsx                 Routes, scroll management, shell.
├── content/                Capabilities, approach, principles.
├── lib/                    useSeo, theme, scroll-reveal.
├── components/
│   ├── LoomField.tsx       The brand motif (hero visual + section rule).
│   ├── Logo.tsx            Woven mark + wordmark.
│   ├── Navbar / Footer / PageHeader / SectionHeading / TextSection
│   └── sections/           The home page, one file per section.
└── pages/                  One file per route.
```

### Design system notes

- **Colours are semantic tokens only** (`--color-ink`, `--color-paper`, …). The dark
  theme redefines the same tokens, so a component written once is correct in both.
  There are no `dark:` variants in the JSX. The one deliberate exception is the
  Sadhya panel, which hard-codes Sadhya's own colours because it is another brand's
  surface.
- **Theme** resolves before first paint via an inline script in `index.html`;
  visitors who have not chosen follow `prefers-color-scheme`.
- **Motion** is one shared `IntersectionObserver` that sets `data-revealed`, plus
  CSS keyframes for the loom. No animation library. `prefers-reduced-motion`
  disables all of it and leaves the layout intact.
- **Type** is one variable family (Manrope) plus the system mono for labels and
  index numerals — one font request for the whole site.
