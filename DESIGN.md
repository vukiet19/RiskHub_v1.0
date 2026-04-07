# RiskHub Dashboard UI/UX Specification

> **Strict Rule for Future Implementation:**
> When implementing these designs into React components, developers MUST PRESERVE all existing data fetching, WebSockets (`useRiskWebSocket`), and state logic. Only Tailwind CSS classes and HTML structures are to be updated.

This document serves as the strict design specification for the "RiskHub Dashboard" based on the "The Sentinel Aesthetic" design system, optimized for a high-density Web3 command center.

---

## 1. Global Theme & Color Palette

The interface eschews retail DeFi styles for an authoritative "Sovereign Intelligence" look, focusing on tonal depth and high-contrast numerical displays. 

### Core Backgrounds & Surfaces (The "No-Line" Rule)
Boundaries must be defined via background color shifts, not 1px solid borders.
- **Main Background (The Void):** `#0b1326` (closest Tailwind: `bg-slate-950` / custom configuration)
- **Panel Background Low (Recessed):** `#131b2e` (Secondary layout sections)
- **Panel Background High (Interactive):** `#222a3d` (Primary widgets and cards)
- **Panel Background Highest (Gauges/Inputs):** `#2d3449`

### Typography & Text Colors
- **Font Families:** `Inter` (neutral, Swiss-inspired legibility) for body/labels, `Monospace` (e.g., JetBrains Mono/Roboto Mono) for all financial values, timestamps, and wallet addresses to prevent jumping.
- **Primary Text / Headings:** `#dae2fd` (Bright icy blue-white, ideal for dark mode contrast)
- **Secondary Text / Labels:** `#c3c5d7` (Muted steel blue)

### Semantic & Accent Colors
- **Primary Accent (Discipline Score Ring & Buttons):** Gradient or transition from `#b5c4ff` to `#1a56db`
- **Success:** Only use high-contrast success tokens (e.g., `#a8efb4` or custom green) for "Action Resolved" states. General growth should use Primary accent colors.
- **Danger/Alerts (Red):** `#ffb4ab` (Text/Accent) and `#93000a` (Error Container / Background)
- **Warning/Contagion:** `#ffb59a` (Warning Text) and `#ad3b00` (Warning Container)
- **Contagion Graph Nodes:** Nodes background use `#31394d`, critical risk paths glow with `#ffb4ab` with a `4px` outer blur.

---

## 2. Layout Architecture

The overall layout avoids simple grids and standard template structures, leaning into intentional asymmetry and high-density widget layouts.

- **App Container:** Fixed 100vh height and 100vw width. Overflow managed within individual module containers. Flexbox layout.
- **Sidebar Width:** Fixed width, approximately `w-64` or `w-72` (256px - 288px), defined via background color (`#131b2e` or `#060e20`) shifting against the main body (`#0b1326`). No horizontal border dividing it.
- **Top Header Height:** Approximately `h-16` or `h-20` (64px - 80px), sitting flush. It should utilize Flexbox to separate module titles/breadcrumbs on the left and global wallet/settings context on the right.
- **Main Content Grid:** Uses CSS Grid (`grid-cols-12`). Large modules (like Portfolio or Contagion Graph) span 8-9 columns, while vertical lists (Recent Alerts, Open Positions) span 3-4 columns to create visual asymmetry.

---

## 3. Component UI Specifications

### Sidebar & Top Header
- **Styling:** Sidebar uses a recessed darker color (`#060e20` or `#131b2e`) to inset naturally. Active states should have a `2px` left-accent bar (color: `#1a56db`) without any rounded container highlight. 
- **Header:** Transparent or matching main background (``#0b1326``), with large, negative-spaced headlines pushed to extreme edges.

### Portfolio & PnL Card
- **Background:** `surface-container-high` (`#222a3d`).
- **Structure:** `rounded-md` (`0.375rem`) for a sharp, tactical feel.
- **Depth:** Hover actions shift the background subtly lighter (`surface-container-highest`) to denote interactivity without relying on `border` changes.
- **Values:** All portfolio balances and PnL percentages MUST use `font-mono`.

### Discipline Score Chart (Circular UI)
- **Track & Empty State:** The base circular track uses `#2d3449` for an empty/background state.
- **Fill/Ring:** The active score uses the Primary blue accent (`#b5c4ff` or gradient up to `#1a56db`). 
- **Typography:** The central score value must be a large `Display` size with tightened letter spacing (`tracking-tight` or `-0.02em`) in `font-mono`.

### Asset Contagion Graph Container
- **Background:** Inset layout using `surface-container-lowest` on top of a `surface-container-low` parent area. No inner padding border.
- **Nodes:** Base circular nodes are `bg-[#31394d]` with text `#dae2fd`. 
- **Highlighting:** Critical Contagion/Risk paths use a distinct red glow (`drop-shadow(0 0 4px #ffb4ab)` and node stroke/fill to match `#ffb4ab`).

### Open Positions List
- **Layout:** High-density list. `16px` vertical white space or subtle hover background shifts separate list items—*never* standard 1px lines/HRs.
- **Long/Short Badges:** 
    - *Long:* Subtle primary container background (`#d4dcff` with low opacity) and primary distinct text.
    - *Short:* Subtle tertiary container background with tertiary distinct text.
- **Values:** `font-mono` exclusively.

### Recent Alerts Panel
- **Card Backgrounds:** Alerts use standard surface colors. High-severity alerts use an error container (`#93000a`). 
- **Severity Accent:** Apply a `2px` solid left border (`#ffb4ab` for danger, `#ffb59a` for warning) instead of a fully solid colorful box, to maintain the dark aesthetic while clearly denoting status.

### Toast Notification (Solid Red Critical Alert)
- **Position:** Bottom-right corner (`fixed bottom-4 right-4`).
- **Styling:** Glassmorphism overlay for normal alerts: `bg-[#0b1326]/70 backdrop-blur-xl`. 
- **Critical Form:** Solid heavy base (`#93000a`) with glowing red accents (`#ffb4ab`) and a tinted shadow of `rgba(105, 0, 5, 0.4)` (deep layered red/black, blur: 48px). All text inside must be strictly legible, bright white or iced-blue.
