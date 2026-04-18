# Design System Document: GANSID Congress 2026

## 1. Overview & Creative North Star: "The Viscous Flow"
This design system rejects the rigid, boxy constraints of traditional corporate interfaces in favor of **Organic Fluidity**. Our Creative North Star, **"The Viscous Flow,"** treats the digital canvas not as a flat screen, but as a high-viscosity environment where elements float, merge, and react with intentional grace. 

By leveraging high-end editorial layouts—characterized by generous negative space, dramatic typographic scales, and overlapping glass surfaces—we move beyond "standard UI." We create an experience that feels alive, premium, and inherently scientific yet human.

---

## 2. Color & Atmospheric Depth
Our palette is anchored by the GANSID heritage colors but elevated through Material Design 3 tonal layering.

### The Palette
- **Primary (GANSID Red):** `primary_container` (#E0243C) – Used for high-impact brand moments and critical calls to action.
- **Secondary (GANSID Blue):** `secondary` (#2260a1) – Used for navigational depth and interactive elements.
- **Neutral White:** `surface_container_lowest` (#FDFDFD) – The pure base of our glass layers.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to define sections. Boundaries must be established through:
1.  **Background Shifts:** Transitioning from `surface` (#f9f9f9) to `surface_container_low` (#f3f3f3).
2.  **Tonal Transitions:** Defining an area by a subtle change in luminance rather than a stroke.

### Surface Hierarchy & Glassmorphism
Treat the UI as a series of stacked, frosted layers.
- **Floating Glass:** Use `surface_container_lowest` at 70% opacity with a `backdrop-filter: blur(24px)`.
- **The Signature Gradient:** For hero sections and primary buttons, use a subtle linear gradient: `primary` (#ba0028) to `primary_container` (#E0243C) at a 135° angle. This adds "visual soul" and prevents the flat-color fatigue of lower-end systems.

---

## 3. Typography: Editorial Authority
We utilize a high-contrast scale to ensure a sophisticated, curated feel.

- **Display & Headlines (Outfit):** Use `display-lg` (3.5rem) for hero statements. The 'Outfit' typeface provides a geometric yet friendly warmth. Tracking should be set to -0.02em for headings to increase "tight" editorial impact.
- **Titles & Body (DM Sans):** Use `body-lg` (1rem) for long-form content. 'DM Sans' offers exceptional legibility in dense scientific contexts.
- **Typographic Hierarchy:** Always lead with a `display` or `headline` element that overlaps a glass container or an organic background shape to break the "grid-lock" and establish visual flow.

---

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering**, not structural shadows.

- **The Layering Principle:** Place `surface_container_highest` components on `surface_container_low` backgrounds to create a soft, natural lift.
- **Ambient Shadows:** For floating elements, use "The Invisible Lift":
    - Blur: 64px
    - Spread: -12px
    - Color: `on_surface` (#1a1c1c) at 6% opacity.
- **Ghost Borders:** If an edge needs definition for accessibility, use `outline_variant` (#e5bdbc) at 15% opacity. Never use 100% opaque lines.

---

## 5. Component Logic

### Branding
- **Logo:** The primary logo {{DATA:IMAGE:IMAGE_1}} must always sit on a `surface_container_lowest` glass layer or a clean `surface` background. It should never be crowded; maintain a minimum clear space equal to 2x the height of the logo.

### Buttons: Liquid Volume
- **Primary:** High-viscosity gradient from `primary` to `primary_container`. Border radius: `full` (9999px).
- **Secondary:** Glass-morphic base (`surface_container_lowest` at 40% opacity + blur) with `secondary` text.
- **Interaction:** On hover, the "volume" should appear to increase via a subtle 2px scale-up and an increase in backdrop-blur intensity.

### Tabbed Interfaces: "The Floating Toggle"
- **Structure:** Tabs should sit within a `surface_container_low` capsule.
- **Active State:** The active tab is a `surface_container_lowest` "pill" that appears to slide beneath the text with a viscous spring animation.
- **Constraint:** No vertical or horizontal dividers between tab items.

### Accordions: Organic Expansion
- **State:** Unexpanded accordions use `surface_container_low`.
- **Expansion:** When opened, the container morphs into a `surface_container_lowest` glass card with a `xl` (3rem) border radius.
- **Animation:** Use a "viscous" easing (cubic-bezier(0.8, 0, 0.2, 1)) to simulate a liquid-filled chamber expanding.

### Cards & Lists
- **Rule:** Forbid divider lines. 
- **Separation:** Use `md` spacing (1.5rem) and subtle background shifts to separate list items. Cards should use the `lg` (2rem/32px) border radius to maintain the organic theme.

---

## 6. Do’s and Don’ts

### Do:
- **Do** allow background "viscous liquid" animations to bleed through glass components.
- **Do** use intentional asymmetry (e.g., a headline offset to the left while the body text is tucked into a glass card on the right).
- **Do** prioritize white space. If the layout feels "busy," increase the spacing scale.

### Don't:
- **Don't** use pure black (#000000) for shadows or text; always use the `on_surface` or `on_background` tokens.
- **Don't** use sharp corners. Every interactive element must have at least a `md` (1.5rem) radius.
- **Don't** use standard 1px borders. If you feel the need for a line, use a background color shift instead.

---

## 7. Motion: The "Liquid" Signature
All transitions must feel heavy and smooth. 
- **Enter:** Elements should fade in while simultaneously scaling from 95% to 100% using a "viscous" curve.
- **Background:** The "Liquid" background animations should move at a sub-perceptual speed (30s+ loops) to provide a sense of life without distracting from the academic content of the Congress.