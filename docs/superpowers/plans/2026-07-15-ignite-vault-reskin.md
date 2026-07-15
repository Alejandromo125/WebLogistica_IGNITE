# Ignite Vault Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the dashboard (renamed from "Stock Manifest" to "Ignite Vault") to the Nexus-led
visual direction — dark-default/light-toggle theme, Playfair Display + Poppins typography,
teal corner-bracket cards, ambient background particles — and drop the app's "course 26-27" framing
and its Google Sheet history from user-facing copy. Purely visual/copy; no functional changes.

**Architecture:** All CSS lives in `index.html`'s single `<style>` block (no separate stylesheets,
no bundler — unchanged constraint). A new token table on `:root` (dark values) with a
`:root[data-theme="light"]` override block drives every themed color; component CSS never branches
on theme. Two new small DI-friendly modules — `js/theme.js` (pure `getInitialTheme` + DOM
`applyTheme`) and `js/particles.js` (`mountParticles`) — are wired once in `js/main.js` alongside
the existing `auth`/`api`/`store`/`router` setup. Every existing class name (`.card`, `.chip`,
`.stamp`, `.tierbadge`, `.matchip`, `.modal`, etc.) keeps its name; only the CSS rules behind it and
a handful of inline `style="..."` strings in JS modules change. Corner brackets are drawn with a
single multi-layer `background-image` (8 gradient layers, 2 per corner) directly on `.card`,
`.stamp`, `.modal`, and `.tier-block` — no new markup, no pseudo-element limit issue.

**Tech Stack:** Plain CSS custom properties, `color-mix()` for tinted surfaces, Google Fonts
(Playfair Display + Poppins), vanilla DOM (`js/particles.js`), Node's built-in test runner for
`js/theme.js`'s pure function. No bundler, no new dependencies.

## Global Constraints

- No build step, no bundler, no new npm dependency — every new file is a plain ES module loaded
  directly by the browser, exactly like the existing ones.
- No functional/behavioral changes: no route changes, no new features, no edits to `js/api.js`,
  `js/auth.js`, `js/store.js`, `js/router.js`'s logic, or anything under `supabase/`.
- `js/theme.js` and `js/particles.js` must not import `js/supabaseClient.js` — they don't need
  Supabase at all, consistent with the DI rule for any module that doesn't need the client.
- Dark is the default theme (no `data-theme` attribute on `<html>`); light is reached only via
  `:root[data-theme="light"]` and the header toggle button.
- Amber (`--accent`, `#FBB03B` in both themes) appears **only** on the header logo-mark square —
  never on a button, chip, badge, or any other component.
- No monospace font anywhere in the reskinned UI. Poppins replaces IBM Plex Mono's role entirely;
  every `font-family:'IBM Plex Mono'` (or `'Space Grotesk'`/`'IBM Plex Sans'`) reference in CSS or
  inline JS styles is removed/retargeted.
- Playfair Display (italic, 700/800 weight) is used **only** for the three Overview hero-stat
  numbers (`.stamp .num`) and the login screen's heading (`.login-screen h2`) — nowhere else.
- User-entered free text must still go through `escapeHtml()` before being interpolated into
  `innerHTML` (unchanged rule, no template in this plan changes that).
- Every new/modified `.js` file must pass `node --check <path>` before it's considered done.
- Historical files under `docs/superpowers/specs/` and `docs/superpowers/plans/` are **not**
  edited by this plan — only living source (`index.html`, `CLAUDE.md`, `js/*`, `package.json`).

### Token table (implementation-complete — extends the spec's illustrative 6-token subset with
four tokens the spec's table didn't spell out: `--surface-muted`, `--on-primary`, `--danger`,
`--border`. These are derived to fit the same dark/light system and documented here as the
authoritative values):

| Token | Dark (default) | Light | Used for |
|---|---|---|---|
| `--bg-from` / `--bg-to` | `#161B27` / `#1F2637` | `#FEF3C6` / `#FEEFBD` | body gradient |
| `--surface` | `#242C3E` | `#FFFFFF` | cards, modal, inputs |
| `--surface-muted` | `rgba(255,255,255,0.06)` | `#F1EDE0` | bar tracks, tinted pill backgrounds, hover washes |
| `--primary` | `#4FC3E0` | `#2596BE` | teal — corner brackets, buttons, focus, active states |
| `--on-primary` | `#12161F` | `#FFFFFF` | text/icon color drawn on top of a solid `--primary` fill |
| `--accent` | `#FBB03B` | `#FBB03B` | amber — logo mark only |
| `--danger` | `#E2735B` | `#C0532D` | retire button, error status only |
| `--text` | `#F3F1E9` | `#2F3A4A` | primary text |
| `--text-muted` | `#9AA3B2` | `#707883` | secondary/muted text |
| `--border` | `rgba(243,241,233,0.14)` | `#E7E0CC` | hairline borders/dividers |

Tier badges/dots use `--primary` for Tier 1 and `--text-muted` for Tier 2 (intensity-based
differentiation, not a second hue) — this keeps the "single accent color" rule intact while still
distinguishing the two tiers.

---

## File Structure

**Create:**
- `js/theme.js` — `getInitialTheme(storedValue)` (pure) + `applyTheme(theme)` (DOM)
- `js/particles.js` — `mountParticles(container)`
- `tests/theme.test.js`

**Modify:**
- `index.html` — full replacement (style block + head + body shell)
- `js/main.js` — wire theme + particles, login heading copy
- `js/overview.js` — hero eyebrow copy, one inline style retarget
- `js/schools.js` — inline style retargets
- `js/schoolForm.js` — inline style retarget
- `js/items.js` — inline style retargets (×4)
- `js/transfers.js` — inline style retargets (×2)
- `js/requests.js` — inline style retargets (×4)
- `js/locationDetail.js` — inline style retargets (×2)
- `package.json` — `"name"` field
- `CLAUDE.md` — rename, drop course framing, update Architecture item 1's color/font description

**Unchanged:** `js/api.js`, `js/auth.js`, `js/store.js`, `js/router.js`, `js/history.js`,
`js/config.js`, `js/supabaseClient.js`, `supabase/*`, `tests/api.test.js`, `tests/auth.test.js`,
`tests/router.test.js`, `tests/store.test.js`, `tests/smoke.test.js`.

---

### Task 1: Theme module

**Files:**
- Create: `js/theme.js`
- Test: `tests/theme.test.js`

**Interfaces:**
- Produces: `getInitialTheme(storedValue: string | null) -> 'light' | 'dark'` and
  `applyTheme(theme: 'light' | 'dark') -> void`. `js/main.js` (Task 4) is the only consumer.

- [ ] **Step 1: Write the failing tests**

```js
// tests/theme.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitialTheme } from '../js/theme.js';

test('getInitialTheme returns light when stored value is exactly "light"', () => {
  assert.equal(getInitialTheme('light'), 'light');
});

test('getInitialTheme returns dark when stored value is "dark"', () => {
  assert.equal(getInitialTheme('dark'), 'dark');
});

test('getInitialTheme returns dark for null (no stored preference)', () => {
  assert.equal(getInitialTheme(null), 'dark');
});

test('getInitialTheme returns dark for an empty string', () => {
  assert.equal(getInitialTheme(''), 'dark');
});

test('getInitialTheme returns dark for garbage input', () => {
  assert.equal(getInitialTheme('sepia'), 'dark');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/theme.js'` (file doesn't exist yet).

- [ ] **Step 3: Write `js/theme.js`**

```js
// js/theme.js
export function getInitialTheme(storedValue) {
  return storedValue === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 5 `getInitialTheme` tests green, plus every existing suite still green.
(`applyTheme` touches `document` — untested here, verified manually in Task 7, same pattern as
`createRouter`.)

- [ ] **Step 5: Syntax-check**

Run: `node --check js/theme.js`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add js/theme.js tests/theme.test.js
git commit -m "feat: add theme module for dark/light toggle"
```

---

### Task 2: Ambient particles module

**Files:**
- Create: `js/particles.js`

**Interfaces:**
- Produces: `mountParticles(container: HTMLElement) -> void`, consumed by `js/main.js` (Task 4).
  Depends on CSS classes `.particle-layer`/`.particle` and the `@keyframes particle-drift` rule
  that Task 3 adds to `index.html` — until Task 3 lands, calling this function has no visible
  effect (the elements exist but are unstyled), which is expected mid-plan.

- [ ] **Step 1: Write `js/particles.js`**

```js
// js/particles.js
const COLORS = ['#4FC3E0', '#FBB03B', '#9AA3B2'];
const COUNT = 50;

export function mountParticles(container) {
  if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

  const layer = document.createElement('div');
  layer.className = 'particle-layer';
  layer.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < COUNT; i++) {
    const dot = document.createElement('div');
    dot.className = 'particle';
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.top = `${Math.random() * 100}%`;
    dot.style.background = COLORS[i % COLORS.length];
    dot.style.animationDelay = `${(Math.random() * 8).toFixed(2)}s`;
    dot.style.animationDuration = `${(8 + Math.random() * 6).toFixed(2)}s`;
    layer.appendChild(dot);
  }

  container.insertBefore(layer, container.firstChild);
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/particles.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add js/particles.js
git commit -m "feat: add ambient background particles module"
```

---

### Task 3: `index.html` full rewrite

**Files:**
- Modify: `index.html` (full replacement)

**Interfaces:**
- Produces every CSS token, class rule, and DOM anchor the rest of this plan depends on:
  `:root`/`:root[data-theme="light"]` tokens (table above), `.particle-layer`/`.particle`/
  `@keyframes particle-drift`, `#themeToggle` button, the restyled `.card`/`.stamp`/`.modal`/
  `.tier-block` corner-bracket rule, and the renamed `<title>`/header wordmark/footer copy.

- [ ] **Step 1: Replace `index.html` in full**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ignite Vault</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,700;1,800&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg-from:#161B27;
    --bg-to:#1F2637;
    --surface:#242C3E;
    --surface-muted:rgba(255,255,255,0.06);
    --primary:#4FC3E0;
    --on-primary:#12161F;
    --accent:#FBB03B;
    --danger:#E2735B;
    --text:#F3F1E9;
    --text-muted:#9AA3B2;
    --border:rgba(243,241,233,0.14);
  }
  :root[data-theme="light"]{
    --bg-from:#FEF3C6;
    --bg-to:#FEEFBD;
    --surface:#FFFFFF;
    --surface-muted:#F1EDE0;
    --primary:#2596BE;
    --on-primary:#FFFFFF;
    --accent:#FBB03B;
    --danger:#C0532D;
    --text:#2F3A4A;
    --text-muted:#707883;
    --border:#E7E0CC;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body{
    margin:0; min-height:100vh;
    background:linear-gradient(135deg, var(--bg-from) 0%, var(--bg-to) 100%) fixed;
    color:var(--text);
    font-family:'Poppins', sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  ::selection{ background:var(--primary); color:var(--on-primary); }
  a, button, input, select { font-family:inherit; }
  :focus-visible{ outline:3px solid var(--primary); outline-offset:2px; }

  /* ---------- Ambient particles ---------- */
  .particle-layer{ position:fixed; inset:0; pointer-events:none; z-index:0; overflow:hidden; }
  .particle{
    position:absolute; width:3px; height:3px; border-radius:50%;
    opacity:0.3; animation:particle-drift 10s ease-in-out infinite;
  }
  @keyframes particle-drift{
    0%,100%{ transform:translate(0,0); opacity:0.2; }
    50%{ transform:translate(6px,-14px); opacity:0.45; }
  }

  /* ---------- Header ---------- */
  header.topbar{
    position:sticky; top:0; z-index:50;
    background:color-mix(in srgb, var(--surface) 88%, transparent);
    backdrop-filter:blur(8px);
    color:var(--text);
    padding:14px 24px;
    display:flex; align-items:center; justify-content:space-between;
    gap:16px; flex-wrap:wrap;
    border-bottom:1px solid var(--border);
  }
  .brand{ display:flex; align-items:center; gap:10px; }
  .brand .mark{
    width:30px; height:30px;
    border:2px solid var(--accent);
    display:flex; align-items:center; justify-content:center;
    font-family:'Poppins', sans-serif;
    font-size:12px; font-weight:700;
    color:var(--accent);
    transform:rotate(-4deg);
    flex-shrink:0;
  }
  .brand-text{
    font-family:'Poppins', sans-serif;
    font-weight:700;
    font-size:18px;
    letter-spacing:0.02em;
    color:var(--text);
  }
  .brand-text span{ font-weight:400; font-style:italic; color:var(--primary); margin-left:4px; }

  /* ---------- Theme toggle ---------- */
  .theme-toggle{
    background:none; border:1px solid var(--border); border-radius:999px;
    width:34px; height:34px; display:flex; align-items:center; justify-content:center;
    cursor:pointer; font-size:15px; color:var(--text); flex-shrink:0;
  }
  .theme-toggle:hover{ background:var(--surface-muted); }

  /* ---------- Tab bar ---------- */
  .tabbar{ display:flex; gap:6px; flex-wrap:wrap; }
  .tabbar .tab{
    font-family:'Poppins', sans-serif;
    font-weight:600;
    font-size:12.5px;
    letter-spacing:0.02em;
    padding:8px 16px;
    border-radius:10px;
    border:1px solid var(--border);
    background:none;
    color:var(--text);
    cursor:pointer;
    transition:background .15s, color .15s, border-color .15s;
  }
  .tabbar .tab:hover{ background:var(--surface-muted); }
  .tabbar .tab.active{ background:var(--primary); border-color:var(--primary); color:var(--on-primary); }

  /* ---------- Account area ---------- */
  .account{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .account .who{ font-family:'Poppins', sans-serif; font-size:12.5px; color:var(--text-muted); }

  .live-status{
    font-family:'Poppins', sans-serif;
    font-weight:600;
    font-size:11.5px;
    padding:5px 12px;
    border-radius:999px;
    white-space:nowrap;
  }
  .live-status.idle{ background:var(--surface-muted); color:var(--text-muted); }
  .live-status.loading{ background:color-mix(in srgb, var(--text) 12%, var(--surface)); color:var(--text); }
  .live-status.live{ background:color-mix(in srgb, var(--primary) 16%, var(--surface)); color:var(--primary); }
  .live-status.error{ background:color-mix(in srgb, var(--danger) 16%, var(--surface)); color:var(--danger); }

  /* ---------- Login screen ---------- */
  .login-screen{
    max-width:420px; margin:80px auto; padding:32px;
    background:var(--surface); border-radius:20px;
    box-shadow:0 8px 32px rgba(0,0,0,0.25);
    position:relative; z-index:1;
  }
  .login-screen h2{
    font-family:'Playfair Display', serif; font-style:italic; font-weight:800;
    font-size:26px; margin:0 0 20px; color:var(--text);
  }
  .login-screen label{
    display:block; margin-bottom:14px;
    font-family:'Poppins', sans-serif; font-size:12px; font-weight:600;
    letter-spacing:0.04em; text-transform:uppercase; color:var(--text-muted);
  }
  .login-screen input{
    width:100%; border:none; background:var(--surface-muted);
    border-radius:10px; padding:10px 12px;
    font-family:'Poppins', sans-serif; font-size:13px; margin-top:5px; color:var(--text);
  }
  .login-screen input:focus{
    box-shadow:0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent); outline:none;
  }

  /* ---------- Back link ---------- */
  .back-link{
    display:inline-block;
    font-family:'Poppins', sans-serif;
    font-size:12.5px;
    color:var(--text-muted);
    margin-bottom:18px;
    text-decoration:none;
  }
  .back-link:hover{ color:var(--text); }

  /* ---------- Hero ---------- */
  .hero{ padding:56px 24px 36px; max-width:1180px; margin:0 auto; position:relative; z-index:1; }
  .hero-eyebrow{
    font-family:'Poppins', sans-serif;
    font-weight:700;
    font-size:11px; letter-spacing:0.14em; text-transform:uppercase;
    color:var(--primary);
    margin-bottom:10px;
  }
  .hero h1{
    font-family:'Poppins', sans-serif;
    font-weight:700;
    font-size:clamp(26px, 4vw, 42px);
    line-height:1.15;
    margin:0 0 28px;
    max-width:820px;
    color:var(--text);
  }
  .stamps{ display:flex; gap:18px; flex-wrap:wrap; }
  .stamp{ padding:18px 22px; min-width:150px; }
  .stamp .num{
    font-family:'Playfair Display', serif; font-style:italic; font-weight:800;
    font-size:34px; line-height:1; color:var(--text);
  }
  .stamp .lbl{
    font-family:'Poppins', sans-serif;
    font-weight:600;
    font-size:10.5px; letter-spacing:0.08em; text-transform:uppercase;
    color:var(--text-muted); margin-top:8px;
  }

  /* ---------- Section shell ---------- */
  section{ max-width:1180px; margin:0 auto; padding:36px 24px; position:relative; z-index:1; }
  .section-head{
    display:flex; align-items:baseline; justify-content:space-between;
    gap:16px; margin-bottom:22px; flex-wrap:wrap;
    border-bottom:1px solid var(--border);
    padding-bottom:12px;
  }
  .section-head h2{
    font-family:'Poppins', sans-serif; font-weight:700; font-size:21px; margin:0; color:var(--text);
  }
  .section-head .tag{ font-family:'Poppins', sans-serif; font-size:12px; color:var(--text-muted); }

  /* ---------- Material bar chart ---------- */
  .chart-row{
    display:grid; grid-template-columns:150px 1fr 46px;
    align-items:center; gap:12px; padding:7px 0;
  }
  .chart-row .mname{
    font-family:'Poppins', sans-serif; font-size:12.5px; color:var(--text);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .bar-track{ height:14px; border-radius:999px; background:var(--surface-muted); position:relative; overflow:hidden; }
  .bar-fill{ height:100%; border-radius:999px; background:var(--primary); transition:width .5s ease; }
  .chart-row .count{ font-family:'Poppins', sans-serif; font-size:12.5px; text-align:right; color:var(--text-muted); }

  /* ---------- Tier split ---------- */
  .tiersplit{ display:flex; gap:24px; flex-wrap:wrap; align-items:stretch; }
  .tier-block{ flex:1; min-width:220px; padding:20px 22px; }
  .tier-block .tt{
    display:flex; align-items:center; gap:8px; margin-bottom:10px;
    font-family:'Poppins', sans-serif; font-weight:600; color:var(--text);
  }
  .dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }
  .dot.t1{ background:var(--primary); }
  .dot.t2{ background:var(--text-muted); }
  .tier-block .big{ font-family:'Poppins', sans-serif; font-weight:700; font-size:28px; color:var(--text); }
  .tier-block .desc{ font-family:'Poppins', sans-serif; font-size:12px; color:var(--text-muted); margin-top:4px; }

  /* ---------- Filters / chips / buttons ---------- */
  .filterbar{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; }
  .chip{
    font-family:'Poppins', sans-serif;
    font-weight:700;
    font-size:12px; letter-spacing:0.02em;
    padding:9px 18px;
    border-radius:10px;
    border:1px solid transparent;
    background:color-mix(in srgb, var(--primary) 16%, var(--surface));
    color:var(--primary);
    cursor:pointer;
    transition:background .15s, color .15s, border-color .15s;
  }
  .chip:hover{ background:color-mix(in srgb, var(--primary) 26%, var(--surface)); }
  .chip.active{ background:var(--primary); border-color:var(--primary); color:var(--on-primary); }
  .chip .n{ opacity:0.75; margin-left:4px; }

  /* ---------- School / warehouse grid (cards) ---------- */
  .grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(250px, 1fr)); gap:18px; }
  .card, .stamp, .modal, .tier-block{
    position:relative;
    background-color:var(--surface);
    border-radius:18px;
    box-shadow:0 4px 24px rgba(0,0,0,0.25);
    background-repeat:no-repeat;
    background-image:
      linear-gradient(var(--primary), var(--primary)), linear-gradient(var(--primary), var(--primary)),
      linear-gradient(var(--primary), var(--primary)), linear-gradient(var(--primary), var(--primary)),
      linear-gradient(var(--primary), var(--primary)), linear-gradient(var(--primary), var(--primary)),
      linear-gradient(var(--primary), var(--primary)), linear-gradient(var(--primary), var(--primary));
    background-size:
      2px 14px, 14px 2px,
      2px 14px, 14px 2px,
      2px 14px, 14px 2px,
      2px 14px, 14px 2px;
    background-position:
      12px 12px, 12px 12px,
      calc(100% - 14px) 12px, calc(100% - 26px) 12px,
      12px calc(100% - 26px), 12px calc(100% - 14px),
      calc(100% - 14px) calc(100% - 26px), calc(100% - 26px) calc(100% - 14px);
  }
  .card{ cursor:pointer; padding:18px 18px 16px; transition:transform .15s ease, box-shadow .15s ease; }
  .card:hover{ transform:translateY(-4px); box-shadow:0 14px 34px rgba(0,0,0,0.3); }
  .card .punch{ display:none; }
  .card .cname{
    font-family:'Poppins', sans-serif; font-weight:600; font-size:17px;
    margin:6px 0 8px; padding-right:60px; color:var(--text);
  }
  .tierbadge{
    position:absolute; top:16px; right:16px;
    font-family:'Poppins', sans-serif; font-weight:700;
    font-size:10px; letter-spacing:0.06em; text-transform:uppercase;
    padding:4px 10px; border-radius:999px;
  }
  .tierbadge.t1{ background:color-mix(in srgb, var(--primary) 18%, var(--surface)); color:var(--primary); }
  .tierbadge.t2{ background:color-mix(in srgb, var(--text-muted) 18%, var(--surface)); color:var(--text-muted); }
  .card .metaline{ font-family:'Poppins', sans-serif; font-size:11.5px; color:var(--text-muted); margin-bottom:10px; }
  .chiprow{ display:flex; gap:6px; flex-wrap:wrap; }
  .matchip{
    font-family:'Poppins', sans-serif; font-size:10.5px; font-weight:600;
    background:var(--surface-muted); color:var(--text-muted);
    padding:4px 10px; border-radius:999px;
  }
  .matchip.more{ opacity:0.75; }

  .empty-note{
    font-family:'Poppins', sans-serif; font-size:13px; color:var(--text-muted);
    padding:30px 0; text-align:center;
  }

  /* ---------- Modal (schoolForm only) ---------- */
  .overlay{
    position:fixed; inset:0; background:rgba(10,12,20,0.6);
    display:none; align-items:flex-start; justify-content:center;
    padding:40px 20px; z-index:100; overflow-y:auto;
  }
  .overlay.open{ display:flex; }
  .modal{ max-width:640px; width:100%; padding:32px 32px 28px; margin-top:10px; }
  .modal-close{
    position:absolute; top:14px; right:14px;
    background:none; border:1px solid var(--border); border-radius:999px;
    width:32px; height:32px; font-size:15px; line-height:1; cursor:pointer;
    font-family:'Poppins', sans-serif; color:var(--text);
  }
  .modal-close:hover{ background:var(--primary); border-color:var(--primary); color:var(--on-primary); }

  /* ---------- Detail title / tier (modal AND full-page location detail) ---------- */
  .modal h3, .detail-title{
    font-family:'Poppins', sans-serif; font-weight:700; font-size:25px; margin:0 0 4px; color:var(--text);
  }
  .modal h3{ padding-right:40px; }
  .modal-tier{ font-family:'Poppins', sans-serif; font-weight:600; font-size:12px; margin-bottom:20px; }
  .modal-grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:22px; }
  .modal-stat{ border:1px solid var(--border); border-radius:12px; padding:12px 16px; }
  .modal-stat .l{
    font-family:'Poppins', sans-serif; font-size:10.5px; text-transform:uppercase;
    color:var(--text-muted); letter-spacing:0.06em;
  }
  .modal-stat .v{ font-family:'Poppins', sans-serif; font-weight:700; font-size:18px; margin-top:3px; color:var(--text); }
  .manifest-title{
    font-family:'Poppins', sans-serif; font-weight:700;
    font-size:11.5px; text-transform:uppercase; letter-spacing:0.1em;
    color:var(--text-muted); margin:22px 0 10px;
    border-bottom:1px solid var(--border); padding-bottom:6px;
  }
  .manifest-line{
    display:flex; justify-content:space-between; align-items:baseline;
    gap:10px; padding:8px 0; border-bottom:1px dotted var(--border);
    font-size:14px;
  }
  .manifest-line .mn{ font-weight:600; color:var(--text); }
  .manifest-line .ids{ font-family:'Poppins', sans-serif; font-size:12px; color:var(--text-muted); text-align:right; }
  .proposal-box{
    margin-top:18px; padding:14px 16px;
    background:var(--surface-muted); border-left:3px solid var(--primary);
    border-radius:0 12px 12px 0;
    font-size:13.5px; color:var(--text);
  }
  .proposal-box .l{
    font-family:'Poppins', sans-serif; font-size:10.5px;
    text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);
    margin-bottom:4px;
  }

  footer{
    position:relative; z-index:1;
    max-width:1180px; margin:0 auto; padding:30px 24px 60px;
    font-family:'Poppins', sans-serif;
    font-size:11.5px; color:var(--text-muted);
    border-top:1px solid var(--border);
  }

  main#viewport{ position:relative; z-index:1; }

  @media (max-width:640px){
    .modal-grid{ grid-template-columns:1fr; }
    .chart-row{ grid-template-columns:100px 1fr 36px; }
  }
  @media (prefers-reduced-motion: reduce){
    *{ transition:none !important; scroll-behavior:auto !important; }
    .particle-layer{ display:none; }
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="brand">
    <div class="mark">IV</div>
    <div class="brand-text">IGNITE<span>Vault</span></div>
  </div>
  <nav class="tabbar" id="tabBar" style="display:none;"></nav>
  <div style="display:flex; align-items:center; gap:12px;">
    <button id="themeToggle" class="theme-toggle" aria-label="Toggle color theme"></button>
    <div class="account" id="accountArea"></div>
  </div>
</header>

<main id="viewport"></main>

<footer>
  Live data from Supabase.
</footer>

<div class="overlay" id="overlay">
  <div class="modal" id="modalContent"></div>
</div>

<script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: reskin page shell to the Ignite Vault dark/light Nexus look"
```

(This step alone leaves the theme toggle and particles inert — `js/main.js` doesn't wire them up
yet. That's expected; fixed in Task 4. Manual verification is Task 7, once every task is in.)

---

### Task 4: `js/main.js` — wire theme, particles, and copy

**Files:**
- Modify: `js/main.js` (full replacement)

**Interfaces:**
- Consumes: `getInitialTheme`/`applyTheme` from `js/theme.js` (Task 1), `mountParticles` from
  `js/particles.js` (Task 2), and `#themeToggle` from `index.html` (Task 3).
- Produces: the fully wired theme toggle and particle layer; no other file consumes `main.js`.

- [ ] **Step 1: Replace `js/main.js` in full**

```js
// js/main.js
import { supabase } from './supabaseClient.js';
import { createAuthModule } from './auth.js';
import { createApi } from './api.js';
import { createStore } from './store.js';
import { createRouter } from './router.js';
import { renderOverview } from './overview.js';
import { renderSchools } from './schools.js';
import { renderLocationDetail } from './locationDetail.js';
import { renderRequests } from './requests.js';
import { getInitialTheme, applyTheme } from './theme.js';
import { mountParticles } from './particles.js';

const THEME_KEY = 'ignite-vault-theme';
let currentTheme = getInitialTheme(localStorage.getItem(THEME_KEY));
applyTheme(currentTheme);
mountParticles(document.body);

const themeToggleBtn = document.getElementById('themeToggle');
function updateThemeToggleButton() {
  themeToggleBtn.textContent = currentTheme === 'light' ? '🌙' : '☀️';
  themeToggleBtn.setAttribute(
    'aria-label',
    currentTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'
  );
}
updateThemeToggleButton();
themeToggleBtn.addEventListener('click', () => {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(currentTheme);
  localStorage.setItem(THEME_KEY, currentTheme);
  updateThemeToggleButton();
});

const auth = createAuthModule(supabase);
const api = createApi(supabase);
const store = createStore(api);

const viewport = document.getElementById('viewport');
const tabBar = document.getElementById('tabBar');
const accountArea = document.getElementById('accountArea');

const TABS = [
  { name: 'overview', label: 'Overview', hash: '#/overview' },
  { name: 'schools', label: 'Schools', hash: '#/schools' },
  { name: 'requests', label: 'Requests', hash: '#/requests', adminOnly: true },
];

let isAdmin = false;
let currentUserId = null;

function renderTabBar(activeName) {
  tabBar.innerHTML = '';
  TABS.filter(t => !t.adminOnly || isAdmin).forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.name === activeName ? ' active' : '');
    btn.textContent = t.label;
    btn.addEventListener('click', () => router.navigate(t.hash));
    tabBar.appendChild(btn);
  });
}

async function renderRoute(route) {
  if (!currentUserId) return;

  if (route.name === 'requests' && !isAdmin) {
    router.navigate('#/overview');
    return;
  }

  renderTabBar(route.name);
  const ctx = {
    api, store, isAdmin, currentUserId,
    navigate: router.navigate,
    rerender: () => renderRoute(router.current()),
  };

  if (route.name === 'overview') {
    renderOverview(viewport, ctx);
  } else if (route.name === 'schools') {
    renderSchools(viewport, ctx);
  } else if (route.name === 'location') {
    renderLocationDetail(viewport, { ...ctx, locationId: route.params.id });
  } else if (route.name === 'requests') {
    renderRequests(viewport, ctx);
  }
}

const router = createRouter({ onChange: renderRoute });

function renderLoginScreen(message) {
  tabBar.style.display = 'none';
  tabBar.innerHTML = '';
  viewport.innerHTML = `
    <div class="login-screen">
      <h2>Ignite Vault — Sign in</h2>
      <form id="loginForm">
        <label>Email<input name="email" type="email" required></label>
        <label>Password<input name="password" type="password" required></label>
        <div id="loginError" class="live-status error" style="display:none; margin-bottom:12px;"></div>
        <button type="submit" class="chip">Log in</button>
      </form>
    </div>
  `;
  if (message) {
    const el = document.getElementById('loginError');
    el.textContent = message;
    el.style.display = 'block';
  }
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await auth.signIn(form.email.value, form.password.value);
      await refreshAuthUI();
    } catch (err) {
      renderLoginScreen('Login failed: ' + err.message);
    }
  });
}

function renderAccountArea(profile) {
  accountArea.innerHTML = `
    <span class="who">Logged in as ${profile.role}</span>
    <button id="logoutBtn" class="chip">Log out</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await auth.signOut();
      await refreshAuthUI();
    } catch (err) {
      alert('Logout failed: ' + err.message);
    }
  });
}

async function refreshAuthUI() {
  let profile;
  try {
    profile = await auth.getCurrentProfile();
  } catch (err) {
    accountArea.innerHTML = '';
    renderLoginScreen('Could not check session: ' + err.message);
    return;
  }

  if (!profile) {
    isAdmin = false;
    currentUserId = null;
    store.clear();
    accountArea.innerHTML = '';
    renderLoginScreen();
    return;
  }

  isAdmin = profile.role === 'admin';
  currentUserId = profile.id;
  renderAccountArea(profile);

  try {
    await store.refresh();
  } catch (err) {
    // Data load failed, but the session itself is fine — show the error in the
    // viewport (tab bar stays hidden, account area stays put), not the login screen.
    viewport.innerHTML = '<section><div class="empty-note" id="loadErrorNote"></div></section>';
    document.getElementById('loadErrorNote').textContent = 'Could not load data: ' + err.message;
    return;
  }

  tabBar.style.display = '';
  if (!window.location.hash) window.location.hash = '#/overview';
  await renderRoute(router.current());
}

router.start();
refreshAuthUI();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/main.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green (api, auth, router, store, theme, harness sanity).

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "feat: wire theme toggle and ambient particles into main.js"
```

---

### Task 5: Retarget inline styles and drop course-year copy across rendering modules

**Files:**
- Modify: `js/overview.js`, `js/schools.js`, `js/schoolForm.js`, `js/items.js`,
  `js/transfers.js`, `js/requests.js`, `js/locationDetail.js`

**Interfaces:**
- No exported function signatures change in any of these files — only literal copy strings and
  inline `style="..."` attribute values. Every other task that already consumes these modules
  (`js/main.js`'s route dispatch, `js/locationDetail.js`'s calls into `renderItemsSection`/
  `renderRequestSection`/`renderHistorySection`) is unaffected.

- [ ] **Step 1: `js/overview.js` — drop course-year copy, retarget one inline style**

In `js/overview.js:26`, replace:
```js
      <div class="hero-eyebrow">Material deployment · Course 26–27 prep</div>
```
with:
```js
      <div class="hero-eyebrow">Material deployment</div>
```

In `js/overview.js:108`, replace:
```js
        <div class="tierbadge" style="color:var(--slate);">WAREHOUSE</div>
```
with:
```js
        <div class="tierbadge" style="background:var(--surface-muted); color:var(--text-muted);">WAREHOUSE</div>
```

- [ ] **Step 2: `js/schools.js` — retarget two inline styles**

In `js/schools.js:37`, replace:
```js
      <div style="max-width:340px; margin-bottom:16px; background:var(--card); border:1px solid var(--line);">
```
with:
```js
      <div style="max-width:340px; margin-bottom:16px; background:var(--surface); border-radius:10px;">
```

In `js/schools.js:39`, replace:
```js
          style="width:100%; border:none; background:none; padding:8px 12px; font-family:'IBM Plex Mono', monospace; font-size:14px; color:var(--ink);">
```
with:
```js
          style="width:100%; border:none; background:none; padding:10px 12px; font-family:'Poppins', sans-serif; font-size:14px; color:var(--text);">
```

- [ ] **Step 3: `js/schoolForm.js` — retarget the shared input style**

In `js/schoolForm.js:9`, replace:
```js
  const inputStyle = "width:100%; border:1px solid var(--line); background:var(--card); padding:8px 10px; font-family:'IBM Plex Mono', monospace; font-size:13px; margin-top:4px;";
```
with:
```js
  const inputStyle = "width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:9px 11px; font-family:'Poppins', sans-serif; font-size:13px; margin-top:4px; color:var(--text);";
```

- [ ] **Step 4: `js/items.js` — retarget four inline styles**

In `js/items.js:20`, replace:
```js
        ${isAdmin ? `<button type="button" class="transfer-material-btn" data-material="${escapeHtml(name)}" style="margin-left:8px; border:1px solid var(--line); background:none; cursor:pointer; font-family:inherit; font-size:11px; padding:1px 6px;">Transfer</button>` : ''}
```
with:
```js
        ${isAdmin ? `<button type="button" class="transfer-material-btn" data-material="${escapeHtml(name)}" style="margin-left:8px; border:1px solid var(--border); border-radius:6px; background:none; cursor:pointer; font-family:inherit; font-size:11px; padding:2px 8px; color:var(--text-muted);">Transfer</button>` : ''}
```

In `js/items.js:25`, replace:
```js
          return `<span>${idEsc}${isAdmin ? ` <button type="button" class="retire-item-btn" data-item="${idEsc}" style="border:none; background:none; color:var(--rust); cursor:pointer; font-family:inherit;" title="Retire ${idEsc}">✕</button>` : ''}</span>`;
```
with:
```js
          return `<span>${idEsc}${isAdmin ? ` <button type="button" class="retire-item-btn" data-item="${idEsc}" style="border:none; background:none; color:var(--danger); cursor:pointer; font-family:inherit;" title="Retire ${idEsc}">✕</button>` : ''}</span>`;
```

In `js/items.js:37`, replace:
```js
          <input name="itemId" required style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
          <input name="itemId" required style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

In `js/items.js:40`, replace:
```js
          <input name="materialName" required list="materialOptions" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
          <input name="materialName" required list="materialOptions" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

- [ ] **Step 5: `js/transfers.js` — retarget two inline styles**

In `js/transfers.js:19`, replace:
```js
      <select name="destination" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
      <select name="destination" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

In `js/transfers.js:24`, replace:
```js
      <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
      <input name="note" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

- [ ] **Step 6: `js/requests.js` — retarget four inline styles**

In `js/requests.js:18`, replace:
```js
        <input name="materialName" required list="requestMaterialOptions" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
        <input name="materialName" required list="requestMaterialOptions" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

In `js/requests.js:24`, replace:
```js
        <input name="quantity" type="number" min="1" required style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
        <input name="quantity" type="number" min="1" required style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

In `js/requests.js:27`, replace:
```js
        <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
        <input name="note" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

In `js/requests.js:101`, replace:
```js
      <input name="note" style="width:100%; border:1px solid var(--line); background:var(--card); padding:7px 9px; font-family:'IBM Plex Mono', monospace; font-size:12.5px; margin-top:4px;">
```
with:
```js
      <input name="note" style="width:100%; border:none; background:var(--surface-muted); border-radius:8px; padding:8px 10px; font-family:'Poppins', sans-serif; font-size:12.5px; margin-top:4px; color:var(--text);">
```

- [ ] **Step 7: `js/locationDetail.js` — retarget two inline styles**

In `js/locationDetail.js:34`, replace:
```js
        ? '<div class="modal-tier" style="color:var(--slate)">Warehouse</div>'
```
with:
```js
        ? '<div class="modal-tier" style="color:var(--text-muted)">Warehouse</div>'
```

In `js/locationDetail.js:35`, replace:
```js
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'rust' : 'teal'})">${loc.tier || 'Tier not recorded'}</div>`
```
with:
```js
        : `<div class="modal-tier" style="color:var(--${tierClass === 't1' ? 'primary' : 'text-muted'})">${loc.tier || 'Tier not recorded'}</div>`
```

- [ ] **Step 8: Verify no retired tokens or monospace references remain**

Run (PowerShell, since this environment's Bash tool doesn't work):
```powershell
Get-ChildItem -Recurse js\*.js | Select-String -Pattern "var\(--(ink|paper|amber|teal|rust|slate|line|card)\b|IBM Plex|Space Grotesk"
```
Expected: no output (no matches) — confirms every retired token name and every monospace/old-display
font reference is gone from every JS file.

- [ ] **Step 9: Syntax-check all seven files**

Run:
```powershell
node --check js/overview.js
node --check js/schools.js
node --check js/schoolForm.js
node --check js/items.js
node --check js/transfers.js
node --check js/requests.js
node --check js/locationDetail.js
```
Expected: no output, exit code 0 for each.

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS — no regression (these are copy/style-only changes; none of the tested pure logic in
`api.js`/`auth.js`/`router.js`/`store.js`/`theme.js` is touched).

- [ ] **Step 11: Commit**

```bash
git add js/overview.js js/schools.js js/schoolForm.js js/items.js js/transfers.js js/requests.js js/locationDetail.js
git commit -m "refactor: retarget inline styles to new tokens, drop course-year copy and mono font"
```

---

### Task 6: Rename to Ignite Vault in `package.json` and `CLAUDE.md`

**Files:**
- Modify: `package.json:2`
- Modify: `CLAUDE.md` (the `## What this is` paragraph and Architecture item 1)

- [ ] **Step 1: `package.json` — rename the package**

In `package.json:2`, replace:
```json
  "name": "weblogistica-ignite",
```
with:
```json
  "name": "ignite-vault",
```

- [ ] **Step 2: `CLAUDE.md` — rename and drop course-year framing in "What this is"**

Replace:
```markdown
"Stock Manifest" — a dashboard for tracking material/equipment deployment (robotics kits, boxes,
etc.) across schools for course 26-27, plus admin CRUD, a viewer request/approval workflow, and
movement history. It is deployed via GitHub Pages directly from `index.html` at the repo root
```
with:
```markdown
"Ignite Vault" — a dashboard for tracking material/equipment deployment (robotics kits, boxes,
etc.) across schools, plus admin CRUD, a viewer request/approval workflow, and movement history.
It is deployed via GitHub Pages directly from `index.html` at the repo root
```

- [ ] **Step 3: `CLAUDE.md` — update Architecture item 1's color/font/theming description**

Replace:
```markdown
1. **`index.html`**: the `<style>` block (all styling, using CSS custom properties on `:root` —
   `--ink`, `--paper`, `--amber`, `--teal`, `--rust`, `--slate`, `--line`, `--card` — as the color
   system; fonts are Space Grotesk for headings/display, IBM Plex Mono for labels/numbers/mono UI,
   and IBM Plex Sans for body, loaded from Google Fonts) and a persistent page shell rather than a
```
with:
```markdown
1. **`index.html`**: the `<style>` block (all styling, using CSS custom properties on `:root` —
   `--bg-from`/`--bg-to`, `--surface`, `--surface-muted`, `--primary`, `--on-primary`, `--accent`,
   `--danger`, `--text`, `--text-muted`, `--border` — as the color system, with dark values on
   `:root` as the default theme and a `:root[data-theme="light"]` block overriding them for the
   light theme reached via the header's toggle button; fonts are Playfair Display, bold italic,
   used only for the Overview hero-stat numbers and the login screen's heading, and Poppins for
   everything else — there is no monospace font anywhere — loaded from Google Fonts) and a
   persistent page shell rather than a
```

- [ ] **Step 4: Syntax-check**

Run: `node --check package.json` — not applicable (not JS); instead confirm it's still valid JSON:
```powershell
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('OK')"
```
Expected: prints `OK`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — `package.json`'s `"name"` field doesn't affect `npm test`'s behavior (the `test`
script is unchanged), so this is a no-regression check.

- [ ] **Step 6: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "docs: rename Stock Manifest to Ignite Vault in package.json and CLAUDE.md"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Serve the site locally**

Run: `npx http-server -p 8080 .` (background/separate terminal)

- [ ] **Step 2: Open `http://localhost:8080` and verify the logged-out state**

Expected: dark theme by default (deep ink gradient, no cream). Only the brand ("IGNITE" bold +
"Vault" italic teal) + the theme toggle + a centered dark login card are visible. Page title reads
"Ignite Vault". Ambient particles are faintly visible drifting behind the login card (skip this
check if your OS/browser has "reduce motion" enabled).

- [ ] **Step 3: Toggle to light theme and back, and verify persistence**

Click the theme toggle. Expected: background switches to the cream gradient, login card turns
white, particle colors are still visible but the overall mood is warm/light. Reload the page (full
browser reload, not just navigation) — expected: light theme persists (read from `localStorage`).
Toggle back to dark, reload again — expected: dark persists.

- [ ] **Step 4: Log in as admin and verify Overview**

Expected: tab bar appears with the new pill-style tabs. Overview shows hero stats in the italic
Playfair numerals, the material chart with rounded teal bars, tier split, and warehouse cards — all
with the four-corner teal bracket treatment and rounded surfaces. No "Course 26-27" text anywhere.

- [ ] **Step 5: Verify Schools tab, drill-down, and the modal**

Click the Schools tab — search box and tier filter chips render as rounded tinted pills. Click a
school card — location-detail page shows the corner-bracket manifest/history sections, "Edit
school" button. Click "Edit school" — the modal opens with corner brackets, rounded inputs, and
Escape/backdrop-close still work (unchanged from the nav-restructure branch). Close it via the ✕,
via Escape, and via clicking the backdrop — all three must work.

- [ ] **Step 6: Verify Requests tab and a viewer account**

Click Requests (admin) — pending/resolved cards render with the new corner-bracket card style.
Log out, log in as a viewer — no Requests tab; a school's detail page shows the request-materials
form instead of an edit button, styled consistently with the rest of the reskin.

- [ ] **Step 7: Verify `prefers-reduced-motion`**

In Chrome DevTools, enable "Emulate CSS media feature prefers-reduced-motion: reduce" (Rendering
tab), then reload. Expected: no particle layer is mounted at all (check via DevTools Elements panel
that `.particle-layer` is absent from the DOM), and no other transition/animation plays.

- [ ] **Step 8: Verify footer and page title one more time**

Expected footer text: "Live data from Supabase." — no course-year mention, no Google Sheet mention.
Browser tab title: "Ignite Vault".

- [ ] **Step 9: Run the full test suite one last time**

Run: `npm test`
Expected: PASS, all suites green (including the new `tests/theme.test.js`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-ignite-vault-reskin.md`. Two
execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks,
   fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution
   with checkpoints.
