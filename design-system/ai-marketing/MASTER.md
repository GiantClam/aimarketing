# AI Marketing Design System

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AI Marketing  
**Generated:** 2026-03-02 15:53:02  
**Updated:** 2026-06-23  
**Category:** Sharp SaaS command center

---

## Design Positioning

Core direction:

```text
Sharp SaaS + Editorial Typography + Yellow/Black Command Center + Modular Workspace Cards
```

The product should feel like an enterprise AI control plane, not a soft generic SaaS page. Use bold condensed typography, black headlines, yellow action accents, white modular dashboard cards, light grid backgrounds, clipped-corner details, and product-like metric modules.

Best for:

```text
AI Marketing Site
AI Workspace
Agent Control Panel
Workspace Hub
Prompt / Workflow / Asset Management
Multi-model AI Platform
```

## Color Palette

| Role | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| Brand Yellow | `#F4F254` | `--color-primary` | CTA, active details, icon blocks, key highlights |
| Brand Yellow Alt | `#F5EE39` / `#FFE500` | n/a | Marketing art direction and campaign graphics |
| Core Black | `#111111` / `#161616` / `#1A1A1A` | `--color-foreground`, `--color-accent` | Hero titles, active sidebar, important numbers |
| Background White | `#FFFFFF` | `--color-card` | Cards, panels, inputs |
| Soft Background | `#FAFAF7` / `#F7F7F2` | `--color-background` | App canvas |
| Border Gray | `#E5E5E0` / `#EFEFEA` | `--color-border` | Cards, dividers, inputs |
| Muted Text | `#777777` / `#8A8A8A` | `--color-muted-foreground` | Descriptions, metadata |
| Success Green | `#22A35A` / `#28A745` | `--color-secondary` | Positive growth only |

Rules:

- Yellow is for action and memory points, not full-page fills.
- Black carries brand impact and active state.
- Green is only for positive growth data.
- Avoid purple/blue AI gradients and soft pastel SaaS palettes.

## Background

Use a white or off-white base with a low-opacity grid:

```css
background-color: #fafaf7;
background-image:
  linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px);
background-size: 48px 48px;
```

The grid should imply control-room / engineering structure without competing with cards.

## Typography

### Display Font

Use strong condensed editorial typography:

```text
Barlow Condensed
Anton
Bebas Neue
Oswald ExtraBold
Archivo Black
Teko
```

Current app implementation uses `Barlow Condensed` through `--font-display`.

### Body Font

Use a neutral product sans:

```text
IBM Plex Sans
Geist
Inter
DM Sans
```

Current app implementation uses `IBM Plex Sans` through `--font-body`.

### Scale

| Token | Size / Treatment |
|-------|------------------|
| Hero Title | `64-88px`, condensed, `800-900`, uppercase |
| Page Title | `44-56px`, condensed, `800-900`, uppercase |
| Card Title | `22-28px`, condensed, `800`, uppercase |
| Section Label | `10-12px`, uppercase, `letter-spacing: 0.16-0.18em` |
| Body | `15-17px`, `400-500` |
| Small Text | `12-13px` |
| Button | `13-14px`, `700-800`, uppercase |

Large headlines should use `letter-spacing: 0`, not negative viewport-scaled type.

## Shell

Shared workspace shell:

```text
Left Sidebar
Top / Page Header
Main Canvas
Card Grid
Floating Utility
User Profile Area
```

Sidebar:

- Width: `240px-280px`.
- Background: `#FFFFFF` or `#FAFAF7`.
- Right border: `1px solid #E5E5E0`.
- Default nav item: white card, light gray border, black text, line icon, optional chevron.
- Active nav item: black background, yellow text/icon/dot.

Recommended nav item shape:

```css
.sidebar-item {
  height: 44px;
  border: 1px solid #e8e8e3;
  border-radius: 8px;
  padding: 0 14px;
}

.sidebar-item.active {
  background: #111;
  color: #f4f254;
  border-color: #111;
}
```

## Workspace Header

Structure:

```text
Small label: WORKSPACE HUB
Hero title: ENTERPRISE WORKSPACE FRONT DOOR /
Subtitle: one short product sentence
Right side: compact status cards or Customize action
```

Keep the title left-aligned, heavy, black, and editorial. Add a yellow slash or clipped accent at the end.

## Workspace Cards

Cards are business workbench entries, not plain text feature cards.

Recommended grid:

```text
3 columns desktop
Card width: 380-430px
Card height: 240-280px
Gap: 24px
```

Required card anatomy:

```text
1. Yellow icon block
2. Uppercase label
3. Bold condensed title
4. Short two-line description
5. One or two chips
6. Yellow clipped CTA base + black CTA button
7. Metric / mini chart / preview module
8. Pin or bookmark affordance when useful
```

Card CSS direction:

```css
.workspace-card {
  background: #fff;
  border: 1px solid #e9e9e3;
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(0,0,0,0.06);
  padding: 24px;
  position: relative;
}
```

### Yellow Icon Block

```css
.icon-block {
  width: 64px;
  height: 64px;
  background: #f4f254;
  color: #111;
  border-radius: 8px;
  clip-path: polygon(0 0, 88% 0, 100% 14%, 100% 100%, 0 100%);
}
```

Use one consistent linear icon set, currently Lucide at `2px` stroke.

### CTA

Use a yellow clipped base with a black button:

```css
.cta-base {
  background: #f4f254;
  clip-path: polygon(0 0, 78% 0, 100% 100%, 0 100%);
}

.cta-button {
  background: #111;
  color: #fff;
  border-radius: 7px;
  font-weight: 800;
}
```

Primary labels:

```text
START FREE ->
OPEN VIEW ->
SEE EXAMPLE WORKSPACE
```

## Card Content

Use short, strong titles:

```text
CONTENT GROWTH
BRAND CREATIVE
LEAD CONVERSION
SALES CLOSE
ENTERPRISE OPERATIONS
KNOWLEDGE AND ASSETS
COMPLIANCE AND RISK
TRAINING ENABLEMENT
TALENT AND RECRUITING
```

Descriptions must fit in two lines. Prefer result-oriented copy:

```text
Connect AI chat, SEO, and workflows into one content engine.
```

Chips:

- 1-2 chips per card.
- Border `#E6E6E0`.
- Background `#FAFAFA`.
- Radius `7px`.
- Height about `34-36px`.

## Data Modules

Every major card should include one concrete product-data signal:

```text
mini bar chart
sparkline
progress ring
avatar stack
asset thumbnails
metric number
growth percentage
status badge
```

Examples:

```text
Content pieces 128 +24%
Assets created 342 +31%
Leads qualified 76 +17%
Deals in progress 23 +15%
Active tasks 183 +9%
Assets total 1,248 +22%
```

Use yellow for chart marks and green only for positive percentages.

## Landing Hero

Landing pages should use:

```text
Top Nav
Hero Section
Product Mockup
Trust Row
3 Value Cards
Capability Cards
Workflow Section
Pricing / BYOK / Private Deploy
Final CTA
```

Hero left:

```text
Pill label
Huge headline
One short subtitle
Two CTAs
Three trust hints
```

Hero right must show a realistic product mockup, not a pure text list:

```text
Campaign Workspace
Model Tabs: ChatGPT / Claude / Gemini
Brand Brief
Task
Output Preview
Performance Snapshot
Workflow Steps
```

## Trust Modules

If customer logos are not real, do not write "Trusted by". Use:

```text
Works with tools modern marketing teams already use
```

Trust hints:

```text
No credit card required
BYOK supported
Private workspace ready
```

Use small yellow dots or check icons with muted text.

## Layout Principles

```text
Less explanation, more product surface
Fewer lists, more modules
Less plain text, more dashboard evidence
Fewer generic cards, more business entries
Fewer decorative illustrations, more realistic UI
```

Each card should feel enterable. Each module should carry real product data. Yellow serves focus and action; black provides impact; white provides trust; the grid provides system feeling; clipped corners provide brand recognition.

## Anti-Patterns

- Soft pastel SaaS with rounded pill overload.
- Purple/blue AI gradients.
- Large yellow page fills.
- Cards with only title, paragraph, and generic CTA.
- More than two chips per card.
- Decorative illustrations that do not show product value.
- Fake perfect data such as `99.99%`.
- Missing hover, focus, or active states.

## Pre-Delivery Checklist

- [ ] Workspace uses white/off-white grid background.
- [ ] Primary actions use yellow/black clipped-corner styling.
- [ ] Major cards include yellow icon blocks.
- [ ] Cards include one or two chips only.
- [ ] Cards include metric/preview modules with concrete numbers.
- [ ] Sidebar active state is black with yellow text/icon.
- [ ] Icons are linear and consistent.
- [ ] Text fits at 375px, 768px, 1024px, and 1440px.
- [ ] Contrast is WCAG AA for normal text.
- [ ] Focus states remain visible.
