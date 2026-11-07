# PeningOrder Design System: "Soft UI" Dashboard

A spec for reproducing the PeningOrder dashboard look in another app. Everything here is taken from the live code: `tailwind.config.ts`, `src/index.css`, `src/components/ui/*` and `src/components/common/SoftUI.tsx`. Copy the tokens and recipes exactly and the result will match.

**The look in one sentence:** modern SaaS "soft UI". A light grey frame (sidebar and gutters) surrounds a white content panel. Corners are soft and rounded (12–16px), borders are thin light grey with very light shadows, and a blue→indigo brand gradient appears only on main buttons and icon tiles. Labels are small, uppercase and grey, and fields get a soft blue focus glow. Font is Inter.

---

## 1. Stack

| Piece | Choice |
|---|---|
| Framework | React 18 + Vite + TypeScript |
| Styling | **Tailwind CSS 3.4** + `tailwindcss-animate`, CSS variables (HSL) for every colour |
| Components | **shadcn/ui** (Radix primitives), style "default", baseColor "slate", `cssVariables: true` |
| Icons | **lucide-react**: 16px in buttons, 20px in icon tiles |
| Font | **Inter** 300/400/500/600/700 from Google Fonts, with `font-feature-settings: "cv11", "ss01"` |
| Toasts | `sonner` (plus the shadcn `use-toast`) |
| Confirm dialogs | `sweetalert2`, confirm button `#dc2626` for destructive actions |
| Class merge | `cn()` = `clsx` + `tailwind-merge` |

`index.html` loads the font without blocking first paint:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" />
```

---

## 2. Design tokens: `src/index.css` (copy as-is)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;          /* white content panel */
    --canvas: 220 20% 97%;            /* light grey frame around it (sidebar + gutters) */
    --foreground: 222 47% 11%;        /* near-black navy text */

    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;

    --primary: 216 85% 45%;           /* sapphire blue */
    --primary-foreground: 0 0% 100%;

    /* Brand gradient: main buttons + icon tiles ONLY. Sapphire → indigo. */
    --brand-from: 216 85% 47%;
    --brand-to: 248 80% 62%;

    --secondary: 220 16% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 220 16% 96%;
    --muted-foreground: 220 9% 46%;   /* grey secondary text */

    --accent: 216 90% 96%;            /* hover tint for menus / ghost buttons */
    --accent-foreground: 216 85% 32%;

    --coral: 6 93% 64%;               /* secondary brand accent */

    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    --border: 220 14% 90%;
    --input: 220 14% 87%;
    --ring: 216 85% 45%;

    --radius: 0.75rem;                /* 12px base radius */

    --sidebar-background: 220 20% 97%;
    --sidebar-foreground: 222 47% 11%;
    --sidebar-primary: 216 85% 45%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 0 0% 100%;
    --sidebar-accent-foreground: 222 47% 11%;
    --sidebar-border: 220 14% 90%;
    --sidebar-ring: 216 85% 45%;

    --success: 142 71% 40%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 100%;
    --info: 199 89% 48%;
    --info-foreground: 0 0% 100%;

    /* Soft, low-contrast shadows (navy-tinted, never pure black) */
    --shadow-xs: 0 1px 2px 0 rgb(16 24 40 / 0.04);
    --shadow-sm: 0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06);
    --shadow-md: 0 6px 16px -4px rgb(16 24 40 / 0.10), 0 2px 4px -2px rgb(16 24 40 / 0.05);
    --shadow-lg: 0 14px 28px -8px rgb(16 24 40 / 0.14), 0 4px 8px -4px rgb(16 24 40 / 0.05);
    --shadow-xl: 0 24px 48px -12px rgb(16 24 40 / 0.20);
  }

  .dark {
    --background: 224 40% 8%;
    --canvas: 224 45% 5%;
    --foreground: 0 0% 98%;
    --card: 224 40% 10%;
    --card-foreground: 0 0% 98%;
    --popover: 224 40% 10%;
    --popover-foreground: 0 0% 98%;
    --primary: 216 85% 58%;
    --primary-foreground: 0 0% 100%;
    --brand-from: 216 85% 55%;
    --brand-to: 248 80% 66%;
    --secondary: 224 35% 15%;
    --secondary-foreground: 0 0% 98%;
    --muted: 224 35% 15%;
    --muted-foreground: 220 9% 62%;
    --accent: 216 50% 18%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62% 45%;
    --destructive-foreground: 0 0% 98%;
    --border: 224 30% 18%;
    --input: 224 30% 20%;
    --ring: 216 85% 58%;
    --sidebar-background: 224 45% 5%;
    --sidebar-foreground: 0 0% 98%;
    --sidebar-primary: 216 85% 58%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 224 40% 10%;
    --sidebar-accent-foreground: 0 0% 98%;
    --sidebar-border: 224 30% 18%;
    --sidebar-ring: 216 85% 58%;
  }
}

@layer base {
  * { @apply border-border; }
  body {
    @apply bg-background text-foreground font-sans antialiased;
    font-family: 'Inter', sans-serif;
    font-feature-settings: "cv11", "ss01";
  }
  h1, h2, h3, h4, h5, h6 { @apply font-semibold tracking-tight; }

  /* Every table inside the dashboard: small uppercase grey column labels.
     :where() keeps specificity 0 so a colour utility on a <th> still wins. */
  :where(.dashboard-main) :where(thead th) {
    @apply text-[11px] font-semibold uppercase tracking-wider text-muted-foreground;
  }
  :where(.dashboard-main) :where(tbody tr) { @apply transition-colors; }
}

@layer components {
  /* Brand gradient: main buttons and icon tiles only. */
  .bg-brand { background-image: linear-gradient(135deg, hsl(var(--brand-from)), hsl(var(--brand-to))); }

  /* Coloured square behind an icon. Pair with a tone class. */
  .icon-tile    { @apply inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5; }
  .icon-tile-sm { @apply inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg [&_svg]:h-4 [&_svg]:w-4; }
  .icon-tile-brand  { @apply bg-brand text-white shadow-sm; }
  .icon-tile-blue   { @apply bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400; }
  .icon-tile-indigo { @apply bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400; }
  .icon-tile-purple { @apply bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400; }
  .icon-tile-pink   { @apply bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400; }
  .icon-tile-green  { @apply bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400; }
  .icon-tile-amber  { @apply bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400; }
  .icon-tile-orange { @apply bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400; }
  .icon-tile-red    { @apply bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400; }
  .icon-tile-cyan   { @apply bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400; }
  .icon-tile-slate  { @apply bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300; }

  /* Small uppercase grey label (field captions, section titles inside cards). */
  .section-label { @apply text-[11px] font-semibold uppercase tracking-wider text-muted-foreground; }

  /* Loading placeholder: grey block with a moving light sweep (used instead of spinners). */
  .shimmer { @apply relative overflow-hidden rounded-md bg-muted; }
  .shimmer::after {
    content: "";
    @apply absolute inset-0 -translate-x-full animate-shimmer;
    background-image: linear-gradient(90deg, transparent, hsl(0 0% 100% / 0.65), transparent);
  }

  .status-badge   { @apply inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium; }
  .status-success { @apply bg-success/10 text-success; }
  .status-warning { @apply bg-warning/10 text-warning; }
  .status-pending { @apply bg-info/10 text-info; }
  .status-error   { @apply bg-destructive/10 text-destructive; }

  /* Page titles: 24px on phones, 28px from 640px up. */
  .dashboard-main h1.text-3xl, .dashboard-main h1.text-2xl { font-size: 1.5rem; line-height: 2rem; letter-spacing: -0.02em; }
  @media (min-width: 640px) {
    .dashboard-main h1.text-3xl, .dashboard-main h1.text-2xl { font-size: 1.75rem; line-height: 2.25rem; }
  }
}

@layer utilities {
  .animate-fade-in { animation: fadeIn 0.3s ease-out; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
}
```

---

## 3. `tailwind.config.ts` (the `extend` part that matters)

```ts
darkMode: ["class"],
theme: {
  extend: {
    fontFamily: { sans: ['Inter', 'sans-serif'] },
    colors: {
      border: "hsl(var(--border))",
      canvas: "hsl(var(--canvas))",
      brand: { from: "hsl(var(--brand-from))", to: "hsl(var(--brand-to))" },
      input: "hsl(var(--input))",
      ring: "hsl(var(--ring))",
      background: "hsl(var(--background))",
      foreground: "hsl(var(--foreground))",
      primary:     { DEFAULT: "hsl(var(--primary))",     foreground: "hsl(var(--primary-foreground))" },
      secondary:   { DEFAULT: "hsl(var(--secondary))",   foreground: "hsl(var(--secondary-foreground))" },
      destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
      muted:       { DEFAULT: "hsl(var(--muted))",       foreground: "hsl(var(--muted-foreground))" },
      accent:      { DEFAULT: "hsl(var(--accent))",      foreground: "hsl(var(--accent-foreground))" },
      popover:     { DEFAULT: "hsl(var(--popover))",     foreground: "hsl(var(--popover-foreground))" },
      card:        { DEFAULT: "hsl(var(--card))",        foreground: "hsl(var(--card-foreground))" },
      success:     { DEFAULT: "hsl(var(--success))",     foreground: "hsl(var(--success-foreground))" },
      warning:     { DEFAULT: "hsl(var(--warning))",     foreground: "hsl(var(--warning-foreground))" },
      info:        { DEFAULT: "hsl(var(--info))",        foreground: "hsl(var(--info-foreground))" },
    },
    borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    boxShadow: { xs: "var(--shadow-xs)", sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)", xl: "var(--shadow-xl)" },
    keyframes: {
      // Page entrance. No fill-mode, so no transform lingers (it would trap position:fixed children).
      "fade-zoom": { from: { opacity: "0", transform: "scale(0.985)" }, to: { opacity: "1", transform: "scale(1)" } },
      shimmer: { "100%": { transform: "translateX(100%)" } },
    },
    animation: { "fade-zoom": "fade-zoom 0.25s ease-out", shimmer: "shimmer 1.6s infinite" },
  },
},
plugins: [require("tailwindcss-animate")],
```

---

## 4. Shape, spacing and type scale

| Thing | Value |
|---|---|
| Radius | Inputs, buttons, menu items: `rounded-lg` (12px). Cards, stat cards, icon tiles: `rounded-xl`. Main panel and dialogs: `rounded-2xl`. Pills and badges: `rounded-full`. |
| Border | Always thin and light: `border border-border/80` on cards, `border-border/70` on the main panel |
| Shadow | Resting `shadow-sm`, hover `shadow-md`, dialogs `shadow-xl`, inputs `shadow-xs` |
| Hover lift | Clickable cards: `transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md` |
| Focus | No outline. A soft glow instead: `focus-visible:ring-4 focus-visible:ring-primary/10` (fields) or `/20` (buttons), plus `focus-visible:border-primary/50` on fields |
| Press | Buttons `active:scale-[0.98]` |
| Page title | `text-2xl font-bold tracking-tight` (24px on phones, 28px from `sm`) |
| Card title | `text-base` or `text-lg font-semibold tracking-tight` |
| Body | `text-sm` (14px); secondary text `text-muted-foreground` |
| Labels and table headers | `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground` |
| Big numbers | `text-2xl font-bold tracking-tight` (`text-lg` on phones) |
| Page padding | `p-4 sm:p-6 lg:p-8` inside the white panel. Sections are spaced with `space-y-6`. |
| Grids | Stat cards `grid grid-cols-2 gap-3 lg:grid-cols-4`; forms `grid gap-4 sm:grid-cols-2/3` |

---

## 5. App shell (layout)

```
┌──────────── bg-canvas (light grey) ─────────────────────────────┐
│ Sidebar (w-64, grey)  │ ┌──── white panel, rounded-2xl ───────┐ │
│  logo                 │ │ PageHeader                          │ │
│  group ▸ items        │ │ Stat cards                          │ │
│  (active item = white │ │ Filter card                         │ │
│   tile + shadow)      │ │ Table card                          │ │
│  user card at bottom  │ └─────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

```tsx
<div className="flex min-h-screen bg-canvas">
  <Sidebar />
  <div className="flex min-w-0 flex-1 flex-col md:py-3 md:pr-3">
    {/* phones only: sticky top bar with a hamburger that opens the sidebar as a drawer */}
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md md:hidden">…</header>
    <main className="dashboard-main min-w-0 flex-1 overflow-x-auto bg-background md:rounded-2xl md:border md:border-border/70 md:shadow-sm">
      <div key={pathname} className="animate-fade-zoom p-4 sm:p-6 lg:p-8"><Outlet /></div>
    </main>
  </div>
</div>
```

- **Sidebar link:** `group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200`
  - idle: `text-muted-foreground hover:bg-card/70 hover:text-foreground`
  - **active:** `bg-card font-medium text-foreground shadow-sm ring-1 ring-border/70 [&_svg]:text-primary` (a white tile that "lifts" out of the grey; its icon turns brand blue)
- **Sidebar groups:** a collapsible header row with a chevron. Sub-items are indented under a thin left rule.
- **Footer:** a small user card (avatar circle in brand colour, email, ID), plus a compact row of icon shortcuts (Profile, Logout).

---

## 6. Component recipes

### Button (shadcn, customised)
```ts
base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0"
default (main action): "bg-brand text-primary-foreground shadow-sm hover:shadow-md hover:brightness-[1.06]"   // gradient
solid:       "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md"
outline:     "border border-border bg-card text-foreground shadow-xs hover:bg-muted"
secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/70"
ghost:       "hover:bg-muted hover:text-foreground"
destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
success:     "bg-success text-success-foreground shadow-sm hover:bg-success/90"
accent:      "bg-[hsl(var(--coral))] text-white shadow-sm hover:brightness-95"
sizes: default h-10 px-4 · sm h-9 px-3 · lg h-11 px-8 · xl h-12 rounded-xl px-10 text-base · icon h-10 w-10
```
Rule: if a page gives a default button its own `bg-*` colour (e.g. `bg-green-600` for Export), fall back to the `solid` variant. A `background-image` gradient would otherwise hide the colour.

### Input and Select trigger
```
"flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-base md:text-sm shadow-xs
 transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/70
 focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/10
 disabled:cursor-not-allowed disabled:opacity-50"
```
Use `text-base` on phones so iOS doesn't zoom in on focus, and `md:text-sm` on desktop.

### Card
```
Card:        "rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[box-shadow,transform,border-color] duration-200 hover:shadow-md"
CardHeader:  "flex flex-col space-y-1.5 p-5 sm:p-6"
CardTitle:   "text-lg font-semibold leading-tight tracking-tight"
CardContent: "p-6 pt-0"
```
A table card has a header bar `flex items-center gap-3 border-b border-border px-4 py-3` with an `IconTile size="sm"`, a title and a count pill (`ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs`).

### Dialog
- **Overlay:** `bg-slate-900/40 backdrop-blur-[2px]`
- **Content:** `w-[calc(100%-1.5rem)] max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-border/80 bg-background p-5 sm:p-6 shadow-xl`, with zoom-in-95 and fade-in
- **Close X:** `absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-muted`
- **Title:** an `IconTile size="sm"` plus the text: `flex items-center gap-2`

### Badge and pill
```
base:        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
default:     "border-transparent bg-primary/10 text-primary"
secondary:   "border-transparent bg-muted text-foreground/80"
destructive: "border-transparent bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400"
```
Status pills inside tables use the colour family at 100 shade with 700 text: `px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700` (dark: `bg-green-900/30 text-green-400`). Small tags under a name use `rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-800`.

### Icon tile (the signature element)
A coloured rounded square with an icon in the middle: 40px (`.icon-tile`) or 32px (`.icon-tile-sm`).
- **Light tones:** 50-shade background with 600-shade icon (`icon-tile-blue`, `-green`, `-amber`, …).
- **`icon-tile-brand`:** gradient background with a white icon. Use it for the page's main identity tile only.

```tsx
const TONE_CLASS = { brand:'icon-tile-brand', blue:'icon-tile-blue', indigo:'icon-tile-indigo', purple:'icon-tile-purple',
  pink:'icon-tile-pink', green:'icon-tile-green', amber:'icon-tile-amber', orange:'icon-tile-orange',
  red:'icon-tile-red', cyan:'icon-tile-cyan', slate:'icon-tile-slate' };   // write the classes out in full, see Rules
export function IconTile({ icon: Icon, tone='brand', size='md', className }) {
  return <span className={cn(size==='sm' ? 'icon-tile-sm' : 'icon-tile', TONE_CLASS[tone], className)}><Icon /></span>;
}
```

### PageHeader
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
  <div className="flex min-w-0 items-start gap-3">
    <IconTile icon={Icon} tone="brand" className="mt-0.5 hidden sm:inline-flex" />
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
  <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
</div>
```

### StatCard (KPI tile)
```tsx
<button className="flex w-full flex-col items-start gap-2 rounded-xl border border-border/80 bg-card p-3 text-left shadow-sm
  transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:gap-3 sm:p-4
  /* active filter: */ border-primary/40 ring-2 ring-primary/15">
  <IconTile icon={Icon} tone="green" className="h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4 sm:h-10 sm:w-10 sm:rounded-xl sm:[&_svg]:h-5 sm:[&_svg]:w-5" />
  <div className="min-w-0 w-full">
    <p className="break-words text-lg font-bold leading-tight tracking-tight sm:text-2xl">RM 12,792.00</p>
    <p className="mt-1 break-words text-xs font-medium text-muted-foreground">Total Sales</p>
    <p className="mt-0.5 break-words text-[11px] text-muted-foreground">optional hint</p>
  </div>
</button>
```
- **Clickable cards** act as filters; the `active` state adds the blue ring.
- **Phones:** the icon sits on top and the value gets the full width.
- **Danger state:** add `border-red-300 bg-red-50/60` and give the value `text-red-600`.

### Tables
- **Wrapper:** `overflow-x-auto` inside a card. Table is `w-full text-sm`.
- **`<thead>`:** `bg-muted/40`. Headers are styled automatically (11px uppercase grey). Cells use `p-3`, numbers go right-aligned with `tabular-nums whitespace-nowrap`.
- **Rows:** `border-t border-border hover:bg-muted/40`.
- **Totals row:** `<tfoot>` with `border-t-2 border-border bg-muted/40 font-semibold`.
- **Money colours:** sales/neutral in the default colour, return/spend `text-red-600`, collection `text-green-600`, gross profit `text-blue-600`, commission `font-bold text-primary`. Show a small secondary line under a number with `block text-[11px] text-muted-foreground` (e.g. "16.9% dari sales").

### Loading, empty and guidance states
- **Loading:** shimmer skeletons, never a bare spinner on a page. `TableSkeleton` is a row of `shimmer h-3` header bars plus `shimmer h-8 rounded-lg` cells; `CardsSkeleton` mimics stat cards with a `shimmer h-10 w-10 rounded-xl` tile.
- **Empty:** `flex flex-col items-center gap-2 px-4 py-12 text-center`, with a slate `IconTile`, `text-sm font-medium` title and `text-xs text-muted-foreground` description.
- **MissingHint (form guidance instead of error popups):** `rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800`. It lists required fields, done ones in `text-emerald-700` with a ✓ and missing ones with an amber dot.
- **Info strip:** `rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-xs text-muted-foreground`, with key words in `font-bold text-foreground`.
- **Tinted callout boxes** (e.g. "how this works"): `rounded-xl border p-3.5 border-emerald-200 bg-emerald-50/70` (any colour family at 200/50). The title is `text-sm font-semibold text-emerald-700`.

### Feedback
- **Toasts:** `sonner` (success or error), short and in the user's language.
- **Destructive confirmations:** SweetAlert2 with a red confirm button (`#dc2626`) and a "Batal" cancel button.

---

## 7. Colour usage rules (what makes it look "clean")

1. **Use the gradient sparingly.** `bg-brand` appears only on main action buttons, the page's identity icon tile, and "Popular"/featured badges. Never on large surfaces, card backgrounds or text.
2. **Surfaces are white on grey.** The content panel and cards are white (`bg-card`/`bg-background`); the frame behind them is `bg-canvas`. Cards are separated by thin borders and soft shadows, not by colour.
3. **Use a fixed set of light tones.** Status and category colours always come as pairs: 50-shade background + 600/700 text (or `/10` opacity of the semantic colour, e.g. `bg-success/10 text-success`). Never use saturated backgrounds behind text.
4. **Keep meanings consistent:** green = money in or success, red = return, loss or delete, amber = pending or warning, blue/primary = neutral highlight and links, purple/indigo = secondary metrics.
5. **Text hierarchy comes from colour, not size:** `text-foreground` for values, `text-muted-foreground` for labels, hints and captions.
6. **Dark mode:** every tone class has a `dark:` pair (`dark:bg-<c>-500/15 dark:text-<c>-400`). Toggle it with `class="dark"` on `<html>`.

---

## 8. Responsive rules

- Design for **360px wide first**. Check every page at 360px: nothing may overflow sideways except tables, which scroll inside their own `overflow-x-auto`.
- Page actions stack under the title on phones (`flex-col` to `sm:flex-row`).
- Stat grids use 2 columns on phones, then `lg:grid-cols-4` (or 3–5 depending on count).
- Filters stack full width on phones (`w-full sm:w-40`), then sit inline from `sm`.
- The sidebar becomes a drawer below `md`, opened from a sticky top bar.
- Dialogs keep a 12px margin (`w-[calc(100%-1.5rem)]`) and scroll internally.

---

## 9. Rules for implementers (AI agents)

- **Write Tailwind classes out in full.** Tailwind only keeps classes it can see literally: never build them as `icon-tile-${tone}` or `bg-${color}-50`; use a lookup map of full strings, as `TONE_CLASS` does.
- **Use `cn()`** (clsx + tailwind-merge) whenever classes are combined, so callers can override.
- **Don't leave a transform on page wrappers after an animation.** It breaks `position: fixed` children such as dialogs and toasts; the `fade-zoom` animation has no fill-mode for this reason.
- **Number formatting:** money as `RM 1,234.56` (`Intl.NumberFormat('en-MY', { minimumFractionDigits: 2 })`), dates as `DD/MM/YYYY` or `01-Oct-2026` in inputs.
- **Date filters:** the user picks dates, then presses an **Apply/Filter** button. Never refetch on every date click. Show a small "not applied yet" note while picked dates differ from the applied ones.

---

## 10. Public marketing pages (separate palette)

The landing and pricing pages use a fixed-hex palette prefixed `po-` so they never clash with the dashboard tokens:

```ts
po: { blue:'#1059c6', 'blue-hover':'#0e4fb0', 'blue-dark':'#0c3f8f', coral:'#f95f4e', 'coral-hover':'#e94b3a',
      ink:'#0a1224', 'ink-soft':'#3b4763', 'ink-muted':'#6b7590', surface:'#f7f9fc', 'surface-2':'#eef2f8',
      border:'#e3e8f0', 'border-strong':'#cbd4e2', amber:'#f59e0b', danger:'#ef4444', success:'#10b981' }
backgroundColor: { 'po-blue-tint':'rgba(16,89,198,0.06)', 'po-blue-soft':'rgba(16,89,198,0.12)', 'po-coral-soft':'rgba(249,95,78,0.10)' }
```

Marketing style:
- Sections alternate `bg-white` and `bg-po-surface`, with `py-20 sm:py-24` and `max-w-7xl`.
- Headings are `font-extrabold tracking-tight text-po-ink`.
- Pill eyebrow labels: `rounded-full border border-po-blue/30 bg-po-blue/10 text-xs font-bold uppercase text-po-blue-dark`.
- CTAs are `rounded-full bg-po-blue text-white font-bold`.
- Pricing cards are `rounded-2xl border p-6`; the featured one gets `border-po-blue shadow-2xl md:-translate-y-2`.
