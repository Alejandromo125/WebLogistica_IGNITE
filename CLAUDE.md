# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained static HTML page (`index.html`) — "Stock Manifest" — a dashboard for tracking
material/equipment deployment (robotics kits, boxes, etc.) across schools for course 26-27. It is deployed
via GitHub Pages directly from `index.html` at the repo root (no build step, no bundler, no package.json).

## Running / testing

There is no build, lint, or test tooling in this repo. To view changes, just open `index.html` in a browser
(or serve the directory with any static file server). There is no CI.

## Architecture

Everything — CSS, JS, and markup — lives in the one file, `index.html`. It has three parts:

1. **`<style>` block**: all styling, using CSS custom properties defined on `:root` (`--ink`, `--paper`,
   `--amber`, `--teal`, `--rust`, `--slate`, `--line`, `--card`) as the color system. Fonts are Space Grotesk
   (headings/display), IBM Plex Mono (labels/numbers/mono UI), and IBM Plex Sans (body), loaded from Google Fonts.

2. **Markup**: static shell (header/search bar, live-data bar, hero stats, chart/tier/manifest sections,
   modal overlay). All dynamic content (stats, chart bars, tier cards, school grid, modal detail) is rendered
   into empty containers (`#chartArea`, `#tierSplit`, `#schoolGrid`, etc.) entirely by JS — there's no
   server-rendered content to keep in sync with markup edits.

3. **`<script>` block** (vanilla JS, no framework/dependencies):
   - **Data source**: a published Google Sheet (`SHEET_CSV_URL`), fetched as CSV on demand via the "Fetch
     latest data" button (`connectSheet`) — the page loads with zero data until the user triggers a fetch.
     Once live, it auto-refreshes every 5 minutes.
   - **CSV parsing** (`parseCSV`): hand-rolled RFC4180-ish parser (handles quoted fields, embedded commas/newlines).
   - **Sheet shape assumption** (`schoolsFromCSV`): scans all cells for a header literally equal to
     `"school list"` (case-insensitive) to locate the header row/column, then reads 4 fixed columns
     immediately to its right, in order: materials, students, tier, proposal. If the sheet's column layout
     changes, update the offsets here.
   - **Materials field format** (`parseMaterialsField`): each school's materials cell is a single string of
     the form `MaterialName(id1, id2, ...) OtherMaterial(id3, ...)`, parsed via regex into
     `{name, ids, count}` objects. Unit counts are derived from `ids.length`, not a separate quantity field.
   - **Render pipeline**: a single mutable `state` object (`{tier, material, query}`) drives filtering.
     `renderAll()` fans out to `renderStats/renderChart/renderTierSplit/renderTierFilterBar/renderGrid`,
     each of which fully re-renders its target container from `SCHOOLS` + `state` (no diffing/virtual DOM).
     Any state change (tier chip, material bar click, search input) mutates `state` then re-renders only the
     containers that could have changed.
   - Tier values are expected to be exactly `"Tier1"` / `"Tier2"` strings (from the sheet); anything else
     falls into an "Unclassified" bucket.

## Working in this file

- Keep everything inline — this project intentionally has no build step. Don't introduce a bundler,
  npm dependency, or split files unless asked.
- When editing rendering logic, remember containers are fully cleared and rebuilt on each render call
  (`innerHTML = ''` then repopulated) — there's no partial-update path to preserve.
- The live data contract (header name `"School List"`, column order, and the `Name(id, id, ...)` materials
  syntax) is defined by the linked Google Sheet, not by this code — if parsing changes are needed, confirm
  the actual sheet layout rather than guessing.
