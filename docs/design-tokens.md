# Design Tokens

The single source of truth for Legible Novelty's UI styling. **Every UI session
must read from and use these tokens** — do not introduce new colors, font sizes,
spacing steps, or timings ad hoc. That inconsistency (one screen's `mt-3` vs.
another's `mt-4`, two slightly different teals) is exactly what this file exists
to prevent.

- **Tokens live in** [`app/globals.css`](../app/globals.css) as a Tailwind v4
  `@theme` block. There is no `tailwind.config.ts` — Tailwind v4 is CSS-first,
  and this stack (Next 16) follows that convention. The `@theme` block generates
  the utility classes (`bg-primary`, `text-teal-700`, `font-module`, …).
- **Proof page:** [`app/style-guide/page.tsx`](../app/style-guide/page.tsx)
  renders the whole system. Run the app and visit `/style-guide` to see it.
- **Design direction:** clarity, intuitiveness, simplicity over visual flair.
  Build like a well-made tool. There is no "signature element" here on purpose.

> **Brand colors are placeholders.** The four brand seeds (teal, gold, sage)
> were chosen from the owner's *named* palette, **not sampled from the logo** —
> the logo file is not in the repo. When it is available, sample it and replace
> the seed hexes in `@theme`; the scales, semantic aliases, contrast structure,
> and everything downstream are built to absorb that swap without other changes.

---

## 1. Color

White is the base — pure `#ffffff`, owner-confirmed (not off-white or cream).

Each brand hue is a full **10-step scale**, not a single raw value, so hover /
active / disabled states and tint backgrounds all come from one ramp. Contrast
ratios below are measured against white; **every token used for text meets WCAG
AA (≥4.5:1)**. Tokens that "fail" as text are for fills/borders/disabled only and
have an accessible text sibling. (This is the owner's "reasonable AA baseline,
don't gold-plate" standard — AA, not AAA-everywhere.)

### Primary — deep teal
The main interactive color: primary buttons, links, active states, focus ring.

| Token | Hex | On white | Role |
|---|---|---|---|
| `teal-600` | `#0f6360` | 7.06:1 (AAA) | **Primary base** — also carries white text on it (7.06:1) |
| `teal-700` | `#0c4f4d` | 9.37:1 | Primary **hover** |
| `teal-800` | `#0a403e` | 11.56:1 | Primary **active/pressed** |
| `teal-300` | `#6fb3af` | 2.40:1 | **Disabled** primary (non-text; exempt from AA) |
| `teal-50…200`, `400/500/900` | — | — | Tint backgrounds, borders, decorative |

### Accent — warm gold / mustard
**Used sparingly**, by design — this is not a general UI color. Reach for it only
where the brief calls for it: search-discoverability indicators and key
calls-to-action. Gold is low-contrast on white, so it splits by use:

| Token | Hex | On white | Role |
|---|---|---|---|
| `gold-400` | `#ce9a2c` | 2.54:1 | Accent **fill / indicator** (NOT text) |
| `gold-600` | `#916413` | 5.20:1 (AA) | Accent **text** on white |
| `gold-700` | `#6f4e0e` | 7.58:1 (AAA) | Accent text, stronger |
| dark text on `gold-400` | — | 7.01:1 | e.g. a gold chip with `gray-900` label |

### Secondary — sage / muted teal
For **less prominent** UI: quiet surfaces, secondary buttons, supporting chrome.

| Token | Hex | On white | Role |
|---|---|---|---|
| `sage-100` | `#dee8e4` | — | Quiet secondary **surface** (`--color-secondary`) |
| `sage-400` | `#7c9b90` | 3.02:1 | Secondary **fill** (non-text / large) |
| `sage-600` | `#495f55` | 6.88:1 (AA) | Secondary **text** |

### Neutral gray
Not from the logo — chosen to hit AA on white, with a faint cool undertone so it
sits with the teal rather than fighting it. Body text, borders, surfaces.

| Token | Hex | On white | Role |
|---|---|---|---|
| `gray-900` | `#141918` | 17.77:1 | Headings |
| `gray-700` | `#333b39` | 11.50:1 | **Body text** (default `--color-foreground`) |
| `gray-600` | `#4c5754` | 7.50:1 | Secondary text |
| `gray-500` | `#63706d` | 5.16:1 (AA) | Muted text (`--color-muted-foreground`) |
| `gray-300` | `#cbd0cf` | — | Input border (`--color-input`) |
| `gray-200` | `#e1e4e3` | — | Default border (`--color-border`) |
| `gray-100` | `#eef0ef` | — | Muted surface (`--color-muted`) |
| `gray-50` | `#f7f8f8` | — | Subtle surface |
| `gray-400` | `#9aa3a1` | 2.58:1 | Disabled / decorative (non-text) |

### Danger (functional)
Not in the brief's named palette, but forms need validation states, and inventing
a red per-session is the exact drift this file prevents — so the **smallest useful
set** is included: `danger-500` (`#c62e29`, fill), `danger-600` (`#b4231f`, 6.56:1
AA, error text), plus `50/100/700` for surfaces/hover. Success and warning are
deliberately **not** defined yet — add them here (not ad hoc) when first needed;
success can derive from teal, warning from gold.

### Semantic aliases (shadcn/ui-compatible)
Components should reference these role names, which point at the scale above, so a
future `shadcn/ui` install consumes our tokens instead of its own defaults:
`background`, `foreground`, `heading`, `primary` / `primary-hover` /
`primary-active` / `primary-foreground` / `primary-disabled`, `secondary` /
`secondary-foreground`, `accent` / `accent-foreground` / `accent-text`, `muted` /
`muted-foreground`, `card` / `card-foreground`, `border`, `input`, `ring`,
`danger` / `danger-foreground` / `danger-text`.

**On shadcn/ui:** it is a reasonable fit for this stack — it officially supports
Tailwind v4 and React 19 (Next 16 uses React 19), and its theming is
CSS-variable based, which is exactly the shape above. This pass sets up the
*token contract* it expects but installs **no components** (tokens-only pass). The
first component session should run `shadcn init` against these variables; nothing
here blocks it. No friction found.

---

## 2. Typography

Two families, used in genuinely different contexts — never blended in one region.

- **Atkinson Hyperlegible** — *all interface text*: navigation, buttons, forms,
  labels, everything that is not module content. It is the default sans
  (`--font-sans`), so plain text gets it automatically. Chosen because the
  audience includes readers for whom letter-shape disambiguation matters; it is
  free/open (Braille Institute license). **Self-hosted** from
  `app/fonts/` via `next/font/local` — no Google Fonts CDN call, consistent with
  the platform's data-minimization stance.
- **Lora** — *module content only* (the authored/read module text itself, not the
  editor chrome). Applied via the `font-module` utility or the `.module-content`
  wrapper class — **never app-wide**. A warm, readable serif that signals "this is
  the content" distinctly from the tool around it. Free/open (SIL OFL),
  self-hosted variable font.

### Type scale
A restrained modular scale (~1.2 minor third) that favors **generous line-height
and legibility over density**:

| Utility | Size | Line-height | Use |
|---|---|---|---|
| `text-4xl` | 36px | 1.2 | h1 |
| `text-3xl` | 30px | 1.25 | h2 |
| `text-2xl` | 24px | 1.35 | h3 |
| `text-xl` | 20px | 1.5 | small headings |
| `text-lg` | 18px | 1.6 | lead / large body |
| `text-base` | 16px | 1.6 | **default UI body** |
| `text-sm` | 14px | 1.5 | labels, secondary |
| `text-xs` | 12px | 1.5 | meta, fine print |
| `text-module` | 18px | 1.75 | **module reading text (Lora)** — roomier leading for long-form |

Weights: Atkinson 400/700 (regular + bold, each with italic); Lora 400–700
variable (regular through bold, plus italic).

---

## 3. Spacing

**Tailwind's default spacing scale is adopted unchanged**, on purpose — the goal
is one agreed scale everyone uses, not a bespoke one. The base step is
`--spacing: 0.25rem` (declared explicitly in `@theme` so it reads as a reviewed
decision, not an unnoticed default): `p-1` = 4px, `p-2` = 8px, `p-4` = 16px,
`p-6` = 24px, `p-8` = 32px, and so on. Use these steps for all margin, padding,
and gap — do not hand-roll arbitrary pixel values.

### Radius
Modest, tool-like (not playful): `rounded-sm` 4px, `rounded-md` 6px,
`rounded-lg` 8px.

---

## 4. Motion

Restrained and minimal by default. Three durations and three easings — reach for
these, not arbitrary values.

**Durations** (CSS variables in `:root`; nearest Tailwind utility in parens):
- `--duration-fast` — **120ms** — hover, focus, tiny state changes (`duration-100`)
- `--duration-base` — **200ms** — the standard transition, default (`duration-200`)
- `--duration-slow` — **320ms** — larger surfaces: panels, disclosure (`duration-300`)

**Easings** (`@theme`, generate `ease-*` utilities):
- `ease-standard` — `cubic-bezier(0.2, 0, 0, 1)` — the default UI transition
- `ease-out` — `cubic-bezier(0, 0, 0.2, 1)` — enter / reveal
- `ease-in-out` — `cubic-bezier(0.4, 0, 0.2, 1)` — symmetric movement

Typical hover: `transition-colors duration-200 ease-standard`.

### Reduced motion — a baseline, not an afterthought
`app/globals.css` has a **global** `@media (prefers-reduced-motion: reduce)` rule
that collapses all animations and transitions to ~0 across the whole app. Anyone
who asks their OS for reduced motion gets it everywhere automatically; individual
components do not need to re-implement it.

> The loading animation (dots resolving into a connected graph) is **not** built
> in this pass — it is a separately scoped component. When built, it draws from
> the duration/easing tokens above and must honor the reduced-motion rule.

---

## How to extend this system

1. Need a color/size/timing that exists? Use the token. Don't re-derive it.
2. Need one that doesn't exist yet? Add it **here and in `@theme`**, with a one-line
   rationale, so the next session inherits it. Don't inline a one-off value.
3. Replacing the placeholder brand hexes with sampled logo values? Edit only the
   `teal-*` / `gold-*` / `sage-*` seed hexes in `@theme`; everything else follows.
