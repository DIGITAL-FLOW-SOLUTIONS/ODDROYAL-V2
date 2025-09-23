# OddRoyal Design Guidelines

## Design Approach
**Reference-Based Approach** inspired by Playwin.top with modern betting site conventions. Focus on high-contrast, data-dense interface optimized for quick decision-making and mobile-first experience.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Deep Purple: `301 56% 22%` (#511D43) - Primary brand, headers, active states
- Wine Red: `346 65% 34%` (#901E3E) - Secondary actions, hover states  
- Bright Red: `0 79% 50%` (#DC2525) - CTAs, betting buttons, alerts
- Sage Green: `120 19% 69%` (#9BC09C) - Success states, winning odds

**Supporting Colors:**
- Dark backgrounds: `220 13% 9%` for main areas
- Card backgrounds: `220 13% 12%` 
- Text: `0 0% 95%` primary, `0 0% 70%` secondary
- Borders: `220 13% 20%`

### Typography
- **Primary Font:** Inter (Google Fonts) - clean, readable for odds/data
- **Display Font:** Poppins (Google Fonts) - headings, logo, CTAs
- **Sizes:** text-xs to text-2xl, emphasizing readability on mobile
- **Weights:** 400 (regular), 600 (semibold), 700 (bold)

### Layout System
**Spacing Units:** Tailwind spacing of 2, 4, 6, 8 units (p-2, m-4, h-6, gap-8)
- Consistent 4-unit gaps between major sections
- 2-unit padding for compact elements (odds buttons)
- 6-8 unit margins for section separation

## Component Library

### Navigation & Structure
- **Header:** Sticky dark header with logo left, nav center, user actions right
- **Sidebar:** Collapsible sports menu with icons, active sport highlighting
- **Main Layout:** Three-column responsive grid (sidebar, main content, bet slip)

### Betting Components
- **Match Cards:** Dark cards with team names, odds buttons in brand colors
- **Odds Buttons:** Rounded buttons with hover animations, green for favorites
- **Bet Slip:** Fixed right panel with three tabs, drag-to-reorder functionality
- **Live Indicators:** Pulsing red dots for live matches

### Data Display
- **Tables:** Zebra striping with subtle borders, sticky headers
- **SportMonks Widgets:** Embedded with custom CSS to match brand colors
- **Status Badges:** Rounded pills for match status (Live, FT, Postponed)

### Forms & Interactions
- **Input Fields:** Dark theme with bright red focus states
- **Buttons:** Primary (bright red), Secondary (wine red), Success (sage green)
- **Modals:** Centered overlays with backdrop blur

## Mobile-First Considerations
- **Sidebar:** Bottom sheet on mobile, slide-up animation
- **Bet Slip:** Collapsible floating panel, expandable on tap
- **Touch Targets:** Minimum 44px height for all interactive elements
- **Horizontal Scroll:** For odds tables on narrow screens

## Animations
**Framer Motion Implementation (Minimal):**
- Page transitions: Subtle fade-in (200ms)
- Bet slip additions: Scale animation (150ms)
- Live score updates: Gentle pulse effect
- Hover states: Transform scale(1.02) for odds buttons

## Images
No hero images required. This is a data-focused betting interface prioritizing information density over marketing visuals. All imagery comes from:
- Team logos (via SportMonks API)
- Small sport category icons in sidebar
- User avatars in header (when authenticated)

## Accessibility & Performance
- High contrast ratios maintained across all color combinations
- Focus indicators using bright red outline
- Screen reader support for live odds updates
- Lazy loading for SportMonks widgets
- Dark mode as primary theme (matches betting site conventions)

This design creates a professional, trustworthy betting environment that prioritizes quick access to odds and betting functionality while maintaining the modern aesthetic inspired by Playwin.