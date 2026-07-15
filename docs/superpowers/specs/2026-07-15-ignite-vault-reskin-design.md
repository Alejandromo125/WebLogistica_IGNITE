# Ignite Vault reskin — design spec

**Status:** approved for planning
**Scope:** a visual-only reskin of the dashboard (previously "Stock Manifest," renamed to "Ignite
Vault") to the "Ignite Nexus" look — warm/dark editorial palette, bold italic serif accents,
corner-bracket cards — plus a dark/light theme toggle, ambient background particles, and a copy
pass that drops the app's original "course 26-27" framing and its Google Sheet history. No
functional, routing, data-model, or RLS changes. Everything shipped by the nav-restructure project
(routes, store, admin/viewer flows) stays exactly as-is; only markup styling, fonts, copy, and two
small new helper modules change.

## 1. Origin and how the two "Ignite" names relate

`ignite-nexus-design-system.md` (repo root, untracked) is a design-system brief reverse-engineered
from a screenshot of an unrelated attendance app called "Ignite Nexus" — it has no connection to
Ignite Serious Play (the real company this dashboard is built for, and this project's actual
brand) beyond a coincidental shared word. Ignite Serious Play's real branding (confirmed live from
igniteseriousplay.com) is a playful, multi-color STEAM-camp identity (vibrant blue, gold, pink,
green, rounded shapes) — a different mood entirely from the moody cream/dark-and-teal "Nexus" look.

After comparing mockups (Nexus-led vs. a brand-color hybrid vs. a fully brand-forward direction),
the **Nexus-led direction is the one to build**: the cream/dark gradient, single teal accent, bold
italic serif, and corner-bracket cards, almost unchanged from the source doc. Ignite Serious Play's
actual brand shows up only in the wordmark treatment ("IGNITE" bold + "Vault" lighter/italic,
mirroring the source doc's own logo-weighting convention) — no literal reuse of the real company's
logo mark or its blue/gold/pink palette.

## 2. Design tokens & typography

Dark is the default theme; light is a secondary theme reachable via a toggle (Section 3). Every
token below is a CSS custom property on `:root` (dark values); a `:root[data-theme="light"]` block
overrides them for the light theme. Component CSS never branches on theme — it only ever reads the
current variable.

| Token | Dark (default) | Light |
|---|---|---|
| `--bg-from` / `--bg-to` (viewport gradient) | `#161B27` / `#1F2637` | `#FEF3C6` / `#FEEFBD` |
| `--surface` (cards, modal) | `#242C3E` | `#FFFFFF` |
| `--primary` (teal — accent, corner brackets, buttons, focus) | `#4FC3E0` | `#2596BE` |
| `--accent` (amber — logo mark only, never a button) | `#FBB03B` | `#FBB03B` |
| `--text` | `#F3F1E9` | `#2F3A4A` |
| `--text-muted` | `#9AA3B2` | `#707883` |

Teal is intentionally brighter in dark mode for contrast against the dark gradient; amber is
identical and rare (logo mark only) in both themes — never a button color, per the source doc's
own rule.

Two type families, replacing all three of the current fonts (Space Grotesk, IBM Plex Mono, IBM
Plex Sans) entirely:
- **Display** — Playfair Display, bold italic, 700–900 weight. Used *only* for hero stat numbers
  (e.g. "142 units deployed") and the login screen's app-name treatment. Tabular figures where the
  number is live/changing.
- **Body/UI** — Poppins. Everything else: headings, body copy, and every micro-label (tags, tier
  badges, section eyebrows, button text, table/column headers) as **uppercase, letter-spaced
  Poppins** — this replaces IBM Plex Mono as the app's "manifest" motif entirely. There is no
  monospace font anywhere in the reskinned app.

Both load from Google Fonts the same way the current fonts do (`<link>` tags in `index.html`'s
`<head>`, no bundler).

The current token set (`--ink`, `--paper`, `--paper-2`, `--amber`, `--teal`, `--rust`, `--slate`,
`--line`, `--card`) is retired entirely in favor of the table above. Every `var(--old-name)`
reference — in `index.html`'s `<style>` block and in inline `style="..."` strings inside JS modules
(e.g. `js/schoolForm.js`'s `formStyle`/`inputStyle` constants) — needs retargeting to the new
tokens; the implementation plan should audit for these rather than leaving any old variable name
partially in place.

## 3. Theming mechanism

New module **`js/theme.js`**, following the same dependency-injection-friendly, unit-testable
pattern as `js/router.js`/`js/store.js`:
- `getInitialTheme(storedValue)` — pure function. Returns `'light'` only if `storedValue ===
  'light'`; returns `'dark'` for anything else (including `null`/`undefined`/garbage). Unit-tested
  with no DOM, same style as `parseRoute`.
- `applyTheme(theme)` — sets `document.documentElement.dataset.theme = 'light'` for light, deletes
  the attribute entirely for dark (dark has no attribute — it's the CSS default, so a first-ever
  visitor with no stored preference renders correctly with zero flash before JS runs, as long as
  the `<html>` tag has no attribute by default in the markup).
- `js/main.js` reads `localStorage.getItem('ignite-vault-theme')` once at startup, calls
  `getInitialTheme` then `applyTheme`, and wires a toggle control (placed in the header, next to
  `#accountArea`) that flips the theme, calls `applyTheme` again, and writes the new value back to
  `localStorage`.

`tests/theme.test.js` covers `getInitialTheme` (stored `'light'` → `'light'`; stored `'dark'`,
`null`, `''`, garbage → `'dark'`), consistent with how `tests/router.test.js` covers `parseRoute`.
`applyTheme` touches the DOM and is verified manually in the browser, same as `createRouter`.

## 4. Component treatments

No DOM structure or class-name contracts change where avoidable — this is a CSS/copy pass, not a
markup rewrite. Existing class names (`.card`, `.chip`, `.stamp`, `.tierbadge`, `.matchip`,
`.section-head`, `.modal`, etc.) keep their names; their CSS rules change.

- **Cards** (school/warehouse cards in `js/overview.js`/`js/schools.js`, manifest lines, the modal
  in `js/schoolForm.js`): `var(--surface)` background, ~16-20px rounded corners, soft shadow. Add
  **four small teal corner brackets** (L-shaped marks, ~16px arms/2px stroke, `var(--primary)`,
  inset ~12px from each corner, built as `::before`/`::after` pseudo-elements or a small inline
  SVG) — the signature detail from the source doc. This replaces the current dashed-top-edge,
  rotated-stamp punch-card look entirely.
- **Buttons**: solid `var(--primary)`, 8-10px rounded corners (not full pill), uppercase
  letter-spaced Poppins label, `color:#fff` on dark-mode teal / dark ink text on light-mode teal as
  needed for contrast. Amber never appears as a button background.
- **Chips/badges/pills** (tier badges, material-count tags, status labels in
  `js/overview.js`/`js/schools.js`/`js/items.js`/`js/requests.js`): fully rounded pill shape, small
  uppercase Poppins text, tinted translucent background (e.g. a teal-tinted pill for Tier badges)
  instead of today's flat bordered rectangles.
- **Hero stats** (the three stat tiles in `js/overview.js`): become plain corner-bracket cards
  with the italic-serif Playfair number, dropping the current rotated "stamp" / dashed-border
  treatment.
- **Chart & tier split** (`js/overview.js`): bars keep their existing data mapping and DOM
  structure, restyled to rounded teal bars on `var(--surface)`; tier-split blocks become the same
  corner-bracket card as everything else.
- **Login screen** (`js/main.js`'s `renderLoginScreen`): same centered single card, `var(--surface)`
  background, with the app name set in italic Playfair as a one-time "greeting" moment — the only
  other place besides hero numbers that uses the display font.
- **Tab bar** (`js/main.js`'s `renderTabBar`, `index.html`'s `#tabBar`): same 3-tab structure;
  active tab gets a teal underline or filled pill instead of the current solid-amber block-fill.
- **Modal** (`js/schoolForm.js`): same corner-bracket card treatment as other cards; the
  Escape-key/backdrop-close behavior already restored in the nav-restructure branch is unchanged.

## 5. Ambient particles

New module **`js/particles.js`**: generates a fixed set of ~40-60 small (2-4px) absolutely
positioned `<div>`s scattered across the viewport behind all content, in teal/amber/muted-grey at
low opacity, each with a slow CSS `@keyframes` drift-and-opacity-pulse. Plain DOM, no canvas, no
dependency — consistent with the "no build step, no bundler" constraint. The entire layer is
skipped — not rendered at all, zero JS/CSS cost — unless `@media (prefers-reduced-motion:
no-preference)` matches; reduced-motion users get no particle layer.

## 6. Rename & copy changes

"Stock Manifest" → **"Ignite Vault"** everywhere, and all "26-27"/course-specific framing dropped
(the app is now an ongoing tool, not a single-course-cycle prep dashboard). Exact locations:

- `index.html:6` — `<title>Stock Manifest — Material Deployment 26-27</title>` →
  `<title>Ignite Vault</title>`
- `index.html:425` — footer `Live data from Supabase · Preparación curso 26-27 · the Google Sheet
  this app used to read from is retired.` → drops the course-year clause and the Google Sheet
  clause entirely, keeps a Supabase credit, e.g. `Live data from Supabase.`
- `js/overview.js:26` — hero eyebrow `Material deployment · Course 26–27 prep` → drops the
  course-year clause, e.g. `Material deployment`
- `js/main.js:73` — login heading `Stock Manifest — Sign in` → `Ignite Vault — Sign in`
- Header wordmark (`index.html`'s `.brand-text`, currently `STOCK·MANIFEST`) → "IGNITE" bold +
  "Vault" lighter/italic, per Section 1's logo convention
- `package.json:2` — `"name": "weblogistica-ignite"` → `"name": "ignite-vault"`
- `CLAUDE.md:7-8` — `"Stock Manifest" — a dashboard for tracking material/equipment deployment
  (robotics kits, boxes, etc.) across schools for course 26-27, ...` → renamed to "Ignite Vault,"
  course-26-27 framing dropped
- `CLAUDE.md:12` (`there is no Google Sheet involved anymore (it was retired when the dashboard was
  cut over to Supabase)`) is **left as-is** — this is engineering/historical documentation, not
  user-facing copy, and the instruction to drop Google Sheet mentions applies to the interface
  only.
- Historical files under `docs/superpowers/specs/` and `docs/superpowers/plans/` (e.g. the
  nav-restructure plan's embedded `index.html` snapshot) are **not edited** — they're a record of
  past plans, not living documentation, same treatment as git history.

## 7. Testing

- **Unit tests** (Node's built-in test runner, no dependencies, consistent with existing suites):
  `tests/theme.test.js` covers `getInitialTheme` exactly as described in Section 3.
- **Everything else** (corner-bracket cards, particles, dark/light toggle's visual correctness,
  font loading, every restyled component) has no automated tests and is verified manually in a
  browser — consistent with every other DOM-rendering concern in this app. Manual verification
  must explicitly check both themes (toggle works, persists across reload via `localStorage`,
  correct default for a first-time visitor) and `prefers-reduced-motion` (particles absent when
  reduced motion is requested).

## Non-goals

- No new features, no route/navigation changes, no change to `js/api.js`, `js/auth.js`,
  `js/store.js`, `js/router.js`'s logic, or anything under `supabase/` (schema, RLS, migrations) —
  everything shipped by the nav-restructure project stays exactly as-is.
- No literal reuse of Ignite Serious Play's real logo mark or its blue/gold/pink/green palette —
  the tie-in to the real company is the wordmark convention only (Section 1).
- No monospace font anywhere in the reskinned UI — Poppins replaces IBM Plex Mono's role entirely.
- No editing of historical plan/spec documents under `docs/superpowers/` — only living source
  (`index.html`, `CLAUDE.md`, `js/*`, `package.json`) is renamed/restyled.
