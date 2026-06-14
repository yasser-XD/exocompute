---
name: ExoCompute Professional
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#c0c9c0'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#8a938b'
  outline-variant: '#404942'
  surface-tint: '#95d4ac'
  primary: '#95d4ac'
  on-primary: '#003920'
  primary-container: '#609d78'
  on-primary-container: '#00311b'
  inverse-primary: '#2c6a48'
  secondary: '#b7c8df'
  on-secondary: '#223243'
  secondary-container: '#38485b'
  on-secondary-container: '#a6b7cd'
  tertiary: '#c1c7cf'
  on-tertiary: '#2b3137'
  tertiary-container: '#8b9199'
  on-tertiary-container: '#242a30'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#b0f1c7'
  primary-fixed-dim: '#95d4ac'
  on-primary-fixed: '#002111'
  on-primary-fixed-variant: '#0f5132'
  secondary-fixed: '#d3e4fb'
  secondary-fixed-dim: '#b7c8df'
  on-secondary-fixed: '#0b1d2d'
  on-secondary-fixed-variant: '#38485b'
  tertiary-fixed: '#dde3eb'
  tertiary-fixed-dim: '#c1c7cf'
  on-tertiary-fixed: '#161c22'
  on-tertiary-fixed-variant: '#41474e'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.1em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-desktop: 32px
  margin-mobile: 16px
  container-max: 1440px
---

## Brand & Style
The design system is engineered for high-performance infrastructure monitoring and cloud computing orchestration. It targets DevOps engineers and system architects who require long-duration focus without visual fatigue. 

The aesthetic is a **Sophisticated Industrialism**—a blend of technical "terminal" density with refined corporate polish. It moves away from high-vibrancy "hacker" tropes toward a more mature, reliable, and trustworthy interface. The UI should evoke the feeling of high-end server hardware: precise, cool-to-the-touch, and impeccably organized. It utilizes a "Dark Mode First" philosophy to reduce eye strain, prioritizing information density and structural clarity over decorative elements.

## Colors
The palette is rooted in a deep charcoal base (`#0F1115`) to provide a stable, low-glare environment. The primary signature color is a **Muted Sage Emerald** (`#508D69`), replacing high-vibrancy greens for a more professional and calming "Active" state. 

- **Primary:** Sage Emerald for success states, active connections, and primary actions.
- **Secondary:** Slate Blue-Grey for secondary UI controls and structural accents.
- **Status Indicators:** 
    - `ACTIVE`: Sage Emerald.
    - `COMPUTING`: Pulsing Slate Grey or Soft Blue.
    - `OFFLINE`: Deep Crimson (used sparingly).
- **Surface Tones:** Layers are defined by subtle shifts in charcoal and slate, rather than harsh borders or shadows, maintaining a unified "monolithic" look.

## Typography
Typography is the primary vehicle for data hierarchy in this design system. It utilizes a trio of typefaces to balance readability and technical aesthetics:

1.  **Hanken Grotesk (Headlines):** A sharp, contemporary sans-serif for high-level navigation and section headers.
2.  **Geist (Body):** A technical, highly legible typeface designed for developer-centric tools, used for descriptions and settings.
3.  **JetBrains Mono (Data/Labels):** Used for all log entries, status indicators, and metrics. The monospaced nature ensures that columns of numbers and timestamps align perfectly for quick scanning.

All labels use uppercase or "small caps" styling with increased letter spacing to denote metadata and system status.

## Layout & Spacing
The layout follows a **Fixed-Grid System** within a fluid container. It uses a 4px baseline grid to ensure mathematical precision in high-density dashboards.

- **Grid:** 12-column layout for desktop; 4-column for mobile.
- **Density:** High density is preferred. Information is packed tightly but separated by clear architectural lines (borders) rather than whitespace.
- **Breakpoints:**
    - Mobile: < 600px (Single column data cards).
    - Tablet: 600px - 1024px (2-column grid for metrics).
    - Desktop: 1024px+ (Multi-pane "Control Center" layout).
- **Alignment:** All data points must align to the left-edge of their respective grid columns to maintain a vertical "scan line."

## Elevation & Depth
Depth in the design system is conveyed through **Tonal Layering** and **Low-Contrast Outlines**. 

- **Surfaces:** The background is the lowest layer. Surface containers (cards/modules) use a slightly lighter charcoal (`#1A1D23`).
- **Outlines:** Instead of shadows, use 1px borders in a muted Slate (`#2D3748`). This reinforces the "industrial" feel of physical server racks.
- **Interactive States:** Hovering over a component should increase the border brightness or add a very subtle inner-glow in Sage Emerald, rather than lifting the element with a shadow.
- **Glassmorphism:** Use sparingly for floating command palettes or overlays to maintain context of the background data, with a heavy background blur (20px+) and low opacity (10%).

## Shapes
The shape language is **Technical and Precise**. We use a "Soft" roundedness level (`0.25rem`) to take the edge off the industrial aesthetic without making it feel consumer-grade or "friendly."

- **Standard Elements:** 4px (0.25rem) radius for buttons, input fields, and small cards.
- **Large Containers:** 8px (0.5rem) radius for main dashboard panels.
- **Status Dots:** Perfect circles for IDLE/ACTIVE indicators.
- **Data Tags:** No more than 2px radius or completely sharp to maintain a "tab" or "label" feel.

## Components
- **Buttons:** Primary buttons use a solid Sage Emerald background with dark text. Secondary buttons use a ghost style with a slate border and Geist typography.
- **Status Chips:** Rectangular with a 2px radius. Use JetBrains Mono. They feature a small leading dot for visual reinforcement (e.g., • ACTIVE).
- **Log Views:** A dedicated component with a near-black background, 12px JetBrains Mono text, and alternating row highlights for readability.
- **Input Fields:** Inset appearance with a 1px slate border. Focus state changes the border to Sage Emerald with a subtle outer glow.
- **Metric Cards:** Large "Headline-LG" numbers with small "Label-SM" units (e.g., 42ms). Use a sparkline (mini-chart) in the background to show 24h trends.
- **Navigation:** Vertical sidebar using iconography and labels, utilizing a "high-contrast" active state where the active menu item has a leading 3px vertical line in Sage Emerald.