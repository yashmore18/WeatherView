## WeatherView 2.0 Design System: Implementation-Ready Specification

This document extends the initial Product Design Specification, transforming it into a comprehensive Design System for WeatherView 2.0. It provides granular detail for frontend engineers, ensuring a consistent, performant, and delightful user experience.

## 1. Brand Identity

**Why does WeatherView exist?**

WeatherView exists to elevate the daily act of checking the weather from a utilitarian task to an emotionally resonant experience. In a world saturated with generic weather apps, WeatherView offers a sanctuary of calm, elegance, and spatial immersion. It's for users who appreciate beauty, seek a deeper connection with their environment, and demand a premium digital experience that reflects the complexity and wonder of nature.

**What emotional experience makes it different from Apple Weather, Google Weather, and other weather apps?**

Unlike other weather apps that prioritize data density or playful animations, WeatherView prioritizes a sense of *being there*. It's about feeling the atmosphere, witnessing the subtle shifts of light, and experiencing the weather as if you were gazing through a perfectly clear, responsive window. The emotional difference lies in its ability to evoke tranquility, wonder, and a sophisticated connection to the outside world, rather than just delivering information. It's less about facts and more about feeling.

**What should users remember after using it?**

Users should remember the feeling of **serenity** and **awe**. They should recall the app as their personal, beautiful window to the world, a moment of peaceful contemplation in their day. They should remember its **elegance**, its **fluidity**, and its ability to make them *feel* the weather, not just read about it.

**Brand Personality:**

*   **Elegant & Sophisticated:** Refined, tasteful, and polished.
*   **Calm & Serene:** Soothing, tranquil, and free from clutter.
*   **Immersive & Evocative:** Drawing users into the experience, stimulating senses.
*   **Intuitive & Seamless:** Easy to understand, flows naturally.
*   **Premium & Polished:** High-quality, attention to detail.
*   **Authentic & Responsive:** Reflecting real-world phenomena truthfully.

**Brand Values:**

*   **Connection to Nature:** Fostering appreciation for the environment.
*   **Craftsmanship:** Dedication to meticulous design and engineering.
*   **Emotional Resonance:** Creating memorable and meaningful user experiences.
*   **Simplicity & Clarity:** Prioritizing essential information with minimal distraction.
*   **Performance & Accessibility:** Ensuring a flawless experience for all, on all devices.

**Design Principles (Refined):**

1.  **Immersive Transparency:** The UI is a dynamic, translucent layer, revealing and enhancing the living weather world beneath.
2.  **Harmonious Adaptability:** The interface adapts seamlessly and gracefully to weather conditions, time of day, and user input, ensuring deep environmental immersion.
3.  **Subtle Delight:** Every interaction, animation, and visual detail is intentionally crafted to evoke positive emotion and enrich the user's experience without ever feeling gratuitous.
4.  **Effortless Clarity:** Information is presented with absolute precision, intuitive hierarchy, and exceptional legibility, minimizing cognitive load.
5.  **Refined Performance:** The application delivers an impeccably fluid, responsive, and performant experience, upholding a truly premium standard.

**UX Principles:**

1.  **Anticipatory Design:** The interface subtly anticipates user needs and environmental changes, providing relevant information and transitions before explicit user action.
2.  **Sensory Immersion:** Utilizing visual, motion, and (future) haptic/auditory cues to create a multi-sensory experience of the weather.
3.  **Direct & Tactile Feedback:** Every interaction provides immediate, clear, and satisfying feedback, making the digital experience feel tangible.
4.  **Spatial Awareness:** Transitions and layout maintain a clear sense of space and depth, helping users orient themselves within the application.
5.  **Progressive Disclosure:** Presenting core information first, with detailed insights progressively revealed upon user interest, preventing overwhelm.

## 2. Component Library

This section defines the core UI components, detailing their purpose, visual properties, interaction behaviors, and accessibility considerations for direct implementation.

**General Component Attributes:**

*   **Border Radius:** `12px` (consistent across all major cards and interactive elements)
*   **Glass Behavior:** `backdrop-filter: blur(8px) saturate(180%); background-color: rgba(255, 255, 255, 0.15);` (for light mode) / `rgba(0, 0, 0, 0.25);` (for dark mode). Opacity will dynamically adjust slightly based on background brightness.
*   **Shadows:** `0px 4px 16px rgba(0, 0, 0, 0.1), 0px 8px 32px rgba(0, 0, 0, 0.05);` (soft, diffuse, for elevated cards) / `0px 1px 2px rgba(0, 0, 0, 0.05);` (subtle for interactive elements).
*   **Spacing:** All internal padding and external margins will adhere to the 8pt grid system (e.g., `padding: 16px 24px; margin-bottom: 24px;`).

--- 

### Navigation (Left Sidebar)

*   **Purpose:** Provides primary global navigation and persistent access to main sections of the app.
*   **Visual Hierarchy:** Fixed position, spanning full height. Prominent icons and clear text labels. Active state clearly indicated by a subtle fill and elevated shadow.
*   **Interaction States:**
    *   **Default:** Translucent frosted glass background.
    *   **Hover:** Subtle background highlight, slight icon scale `(1.05x)`, gentle lift via shadow expansion.
    *   **Active:** `Background-color: rgba(255, 255, 255, 0.2);` (light mode) / `rgba(255, 255, 255, 0.1);` (dark mode), with a more pronounced, but still soft, shadow. Text and icon color becomes primary accent.
    *   **Pressed:** Quick, slight compression animation, immediate color change.
*   **Spacing:** `padding: 16px 24px` for each nav item. `margin-bottom: 16px` between items.
*   **Elevation:** `Sticky-glass` effect, slightly elevated from the main background, but less than active cards. Default shadow `0px 2px 8px rgba(0,0,0,0.08)`.
*   **Animation Behavior:** Smooth `ease-out` transitions (`200ms`) for hover/active states. Icon scale on hover is a `150ms ease-out`.
*   **Accessibility:** ARIA attributes for navigation (`role="navigation"`), clearly labeled links. Keyboard navigation (`tabIndex`, `onKeyDown`) for focus management.

### Search Bar

*   **Purpose:** Allows users to find weather for specific locations.
*   **Visual Hierarchy:** Central and prominent at the top of the main content. Large input field, clear placeholder text.
*   **Interaction States:**
    *   **Default:** Frosted glass background, subtle outline. Placeholder text `(color: --secondary-text-color)`. Magnifying glass icon `(color: --icon-color)`.
    *   **Hover:** Subtle border highlight, very slight background opacity increase.
    *   **Focus (Expanded):** Input field expands horizontally (if on larger screens), background becomes less transparent, subtle inner shadow appears to suggest depth. Placeholder text animates out or fades to a label. Clear "X" icon appears for clearing search. Suggestions appear below.
    *   **Typing:** Text color `(--primary-text-color)`. Suggestion list dynamically updates.
*   **Spacing:** `padding: 12px 20px;`. `margin-bottom: 32px` from Hero Card.
*   **Elevation:** Slightly elevated when in default state. On focus, a more pronounced shadow to indicate active state.
*   **Animation Behavior:** Expansion on focus `(300ms ease-in-out)`. Placeholder text animation `(250ms ease-out)`. Suggestion list entrance `(fade-in, slide-up 200ms ease-out)`. Clear button `(fade-in 150ms)`. 
*   **Accessibility:** ARIA attributes for search input (`role="searchbox"`), live region for search results (`aria-live="polite"`), clear labels. Keyboard support for suggestions.

### Hero Weather Card

*   **Purpose:** Displays the most critical current weather information for the selected location in an immersive way.
*   **Visual Hierarchy:** The largest and most visually dominant card. Large typography for temperature, prominent weather icon. Clear information grouping.
*   **Interaction States:** Static, primarily visual. Weather icon animates dynamically. Subtle background shift based on time of day/weather.
*   **Spacing:** `padding: 40px`. `margin-bottom: 32px` to next section.
*   **Elevation:** Most elevated card, with the most pronounced, soft shadow to signify its primary status. Dynamic `z-index` if needed for transitions.
*   **Animation Behavior:** Weather icon animates continuously, reflecting current conditions (e.g., subtle rain drops, cloud movement). Background (sky) behind the glass will animate based on weather/time.
*   **Accessibility:** Semantic headings for main temperature (`<h1>`), clear text contrast. Dynamic weather descriptions for screen readers.

### Hourly Forecast Card (Individual Item)

*   **Purpose:** Presents concise weather forecasts for the upcoming hours.
*   **Visual Hierarchy:** Compact, horizontal items within a scrollable container. Time, icon, and temperature are key. Precipitation chance is secondary.
*   **Interaction States:**
    *   **Default:** Frosted glass background, minimal shadow.
    *   **Hover:** Subtle background highlight, slight scale `(1.02x)`, gentle lift.
    *   **Active/Selected:** More pronounced highlight, subtle border, slightly more elevation.
*   **Spacing:** `padding: 16px 20px;`. `margin-right: 12px` between cards. Container `padding-bottom: 24px`.
*   **Elevation:** Subtle elevation, slightly less than Hero Card. Enhanced on hover.
*   **Animation Behavior:** Slight `ease-out` scale and shadow change on hover (`150ms`). Icon animation consistent with weather illustration system.
*   **Accessibility:** Semantic list (`<ul><li>`), clear text, touch targets large enough for easy tapping.

### Daily Forecast Card (Individual Item)

*   **Purpose:** Provides a multi-day weather outlook.
*   **Visual Hierarchy:** Vertical list items. Day, icon, min/max temp, and precipitation chance. Clear temperature range visualization.
*   **Interaction States:**
    *   **Default:** Frosted glass background.
    *   **Hover:** Subtle background highlight, gentle lift.
*   **Spacing:** `padding: 16px 24px;`. `margin-bottom: 8px` between cards.
*   **Elevation:** Similar to hourly cards, subtle elevation.
*   **Animation Behavior:** Subtle `ease-out` background change on hover (`150ms`). Icon animation consistent with weather illustration system.
*   **Accessibility:** Semantic list, clear text contrast, `aria-label` for temperature range.

### Weather Details Card (e.g., Sunrise & Sunset, Humidity)

*   **Purpose:** Displays specific, supplementary weather metrics in an organized manner.
*   **Visual Hierarchy:** Smaller, modular frosted glass cards, grouped logically. Clear label and value.
*   **Interaction States:** Mostly static. Some may have subtle internal animations (e.g., sun path for sunrise/sunset).
*   **Spacing:** `padding: 20px;`. Arranged in a responsive grid with `gap: 16px`.
*   **Elevation:** Consistent with hourly/daily cards, subtle base elevation.
*   **Animation Behavior:** Internal animations (e.g., progress bar for UV index, sun moving on path) `(300-500ms ease-in-out)`. No external card animations.
*   **Accessibility:** Clear labels (`aria-labelledby`), semantic structure, consistent text sizing.

### Air Quality Card

*   **Purpose:** Informs users about current air quality conditions and risks.
*   **Visual Hierarchy:** Prominent AQI number, concise status description, and a clear call to action for details. Circular progress indicator for visual emphasis.
*   **Interaction States:**
    *   **Default:** Frosted glass background.
    *   **Hover:** Subtle background highlight, gentle lift.
    *   **"View Details" Button:** Standard button interactions.
*   **Spacing:** `padding: 24px;`. Part of a grid layout with other detail cards.
*   **Elevation:** Consistent with other detail cards.
*   **Animation Behavior:** AQI number might animate on load (e.g., count-up animation `(600ms ease-out)`) and the progress circle fills. Hover effects on the card and button.
*   **Accessibility:** Clear text, contrast for number and description, `aria-label` for AQI status, button accessible.

### Favorites Card (or Favorite City Item)

*   **Purpose:** Allows users to quickly access weather for their saved locations.
*   **Visual Hierarchy:** List item with city name, temperature, and small weather icon. Clear delete/manage options.
*   **Interaction States:**
    *   **Default:** Frosted glass background.
    *   **Hover:** Subtle background highlight, gentle lift.
    *   **Swipe to Delete (mobile):** Reveals a red delete button with a spring animation.
*   **Spacing:** `padding: 16px 24px;`. `margin-bottom: 8px`.
*   **Elevation:** Subtle elevation.
*   **Animation Behavior:** `ease-out` highlight on hover. Swipe animation `(300ms spring-easing)`. Add/remove animations (fade-in/out, slide-in/out `250ms ease-out`).
*   **Accessibility:** Semantic list, clear text, swipe actions have alternative (e.g., edit button for deleting).

### Buttons (Primary, Secondary, Tertiary)

*   **Purpose:** Trigger actions or navigate.
*   **Visual Hierarchy:** Clearly defined by color and size. Primary buttons (`--accent-color` fill) for main actions, secondary (`--primary-text-color` outline) for less critical actions, tertiary (text only) for subtle interactions.
*   **Interaction States:**
    *   **Default:** Defined background/border/text color.
    *   **Hover:** Slight scale `(1.03x)`, background/text color subtle shift, subtle shadow expansion.
    *   **Pressed:** Quick compression animation, immediate deeper background/text color change, haptic feedback (if available).
    *   **Disabled:** Opacity `(50%)`, no interactions.
*   **Spacing:** `min-width: 48px`, `height: 40px`, `padding: 8px 16px` (adjust based on content).
*   **Elevation:** Primary buttons have a small shadow. All gain slight elevation on hover.
*   **Glass behavior:** Not typically applied directly, but some background buttons may have a very subtle frosted effect.
*   **Animation Behavior:** `150ms ease-out` for hover scale/color. `80ms ease-in` for press compression.
*   **Accessibility:** `aria-label` for descriptive actions, keyboard focus, sufficient contrast.

### Icon Buttons

*   **Purpose:** Trigger actions with a minimal footprint, often used for settings, notifications, or simple toggles.
*   **Visual Hierarchy:** Clean, single icon. Smallest interactive elements.
*   **Interaction States:**
    *   **Default:** Icon color `(--icon-color)`. May have a subtle circular frosted glass background.
    *   **Hover:** Slight scale `(1.08x)`, background subtle highlight, icon color slight shift.
    *   **Pressed:** Quick compression, immediate deeper icon color change, haptic feedback.
    *   **Active/Toggled:** Icon color changes to accent, or subtle background fill.
*   **Spacing:** `min-width: 32px`, `height: 32px`, `padding: 4px` (for touch target).
*   **Elevation:** Minimal. Slight elevation on hover.
*   **Animation Behavior:** `150ms ease-out` for hover scale/color. `80ms ease-in` for press compression. Toggle animations (`200ms ease-out`).
*   **Accessibility:** `aria-label` for icon meaning, keyboard focus, large enough touch target.

### Charts (e.g., Temperature, Precipitation Chance)

*   **Purpose:** Visually represent trends and data over time.
*   **Visual Hierarchy:** Clear axes, data points, and lines/bars. Interactive elements for detail on hover.
*   **Interaction States:**
    *   **Default:** Frosted glass background for the chart container. Clean, minimal lines.
    *   **Hover (Data Point):** Tooltip appears with specific data, corresponding data point/line highlights. Subtle crosshair may appear.
*   **Spacing:** `padding: 24px` within card. `margin-bottom: 24px` from other cards.
*   **Elevation:** Contained within a Frosted Glass card, consistent elevation.
*   **Animation Behavior:** Entrance animation for data on load (e.g., lines drawing in `800ms ease-out`, bars growing `600ms staggered ease-out`). Hover highlights `(100ms ease-out)`. Tooltip fade-in `(150ms)`. 
*   **Accessibility:** ARIA charts, provide data tables as an alternative, clear labels, keyboard navigation for data points.

### Dialogs (Modals)

*   **Purpose:** Interrupt the user flow to present critical information or require input.
*   **Visual Hierarchy:** Centered, elevated above all content. Clear title, message, and action buttons.
*   **Interaction States:** Appears on top of a semi-transparent, blurred overlay.
*   **Spacing:** `padding: 32px;` internal. Fixed width, responsive height.
*   **Elevation:** Highest `z-index`, very pronounced shadow to separate from background.
*   **Glass Behavior:** The dialog itself is a frosted glass card. The background overlay is a stronger blur `(16-20px)` and darker tint `(rgba(0,0,0,0.6))`.
*   **Animation Behavior:** Fade-in `(250ms ease-out)` and scale-up `(0.95 to 1, 250ms ease-out)` from center. Dismiss on fade-out and scale-down. 
*   **Accessibility:** Modal focus trap, ARIA `role="dialog"`, `aria-modal="true"`, clear labeling.

### Toast Notifications

*   **Purpose:** Provide brief, non-intrusive feedback or information to the user.
*   **Visual Hierarchy:** Appears at the top or bottom of the screen, disappears automatically. Concise text, optional icon.
*   **Interaction States:** Transient.
*   **Spacing:** `padding: 12px 20px;`. Fixed width. `margin: 20px` from screen edge.
*   **Elevation:** High `z-index`, but less than dialogs. Subtle shadow.
*   **Glass behavior:** Small frosted glass rectangle.
*   **Animation Behavior:** Slide-in from top/bottom `(200ms ease-out)`, fade-in `(200ms)`. Auto-dismiss `(fade-out 250ms)` after 3-5 seconds.
*   **Accessibility:** ARIA `role="status"` or `aria-live="polite"` to announce content to screen readers. Focus not stolen.

### Bottom Sheets (Mobile)

*   **Purpose:** Present contextual information or actions from the bottom of the screen, common on mobile.
*   **Visual Hierarchy:** Slides up from the bottom, overlays content. Clear title/handle, scrollable content.
*   **Interaction States:** Appears on top of a semi-transparent, blurred overlay. Draggable handle for dismissal.
*   **Spacing:** `padding: 24px` top/sides. Full width. Max height 80% screen height.
*   **Elevation:** High `z-index`, pronounced shadow.
*   **Glass behavior:** Frosted glass panel. Background overlay similar to dialogs.
*   **Animation Behavior:** Slide-up `(300ms ease-out)` from bottom. Dismiss by sliding down. Dragging interaction with spring physics.
*   **Accessibility:** Focus trap, ARIA `role="dialog"`, `aria-modal="true"`, clear labeling, draggable handle accessible.

### Empty State

*   **Purpose:** Inform the user when there is no content to display (e.g., no favorites saved).
*   **Visual Hierarchy:** Central illustration or icon, clear title, concise message, optional call-to-action button.
*   **Interaction States:** Static.
*   **Spacing:** `padding: 48px` around content. Centered within its container.
*   **Elevation:** No explicit elevation (part of the background, or within a standard card).
*   **Animation Behavior:** Subtle fade-in `(200ms)` if appearing dynamically.
*   **Accessibility:** Clear message for screen readers, button accessible if present.

### Loading State

*   **Purpose:** Inform the user that content is being fetched or processed.
*   **Visual Hierarchy:** Subtle, animated spinner or shimmer effect over the relevant content area. Should feel lightweight and not jarring.
*   **Interaction States:** Transient.
*   **Spacing:** Adapts to the loading content area.
*   **Elevation:** Overlays content, so higher `z-index` for the overlay/spinner.
*   **Glass behavior:** Shimmering content areas may have a subtle frosted overlay or a `skeleton-glass` effect.
*   **Animation Behavior:** Small, elegant, continuous loading spinner `(linear infinite rotation 1s)`. Shimmer effects `(gradient animation 1.5s linear infinite)`. Fade-in/out `(150ms)` for loading overlay.
*   **Accessibility:** ARIA `aria-live="assertive"` or `role="status"` to announce loading. Visible indication of progress.

### Error State

*   **Purpose:** Communicate an issue to the user (e.g., network error, location not found).
*   **Visual Hierarchy:** Clear error message, often an icon (e.g., alert symbol), and a prominent retry or dismiss button.
*   **Interaction States:** Static or dismissable.
*   **Spacing:** `padding: 24px` within card. Similar to Empty State.
*   **Elevation:** Within a card, similar to Empty State.
*   **Glass behavior:** Standard frosted glass card.
*   **Animation Behavior:** Fade-in `(200ms)`. Error icon might have a subtle, soft pulsation or color shift `(500ms ease-in-out alternate infinite)`.
*   **Accessibility:** ARIA `role="alert"` for critical errors. Clear, actionable error messages. Focus on retry button.

### Offline State

*   **Purpose:** Informs the user they are currently offline and provides options.
*   **Visual Hierarchy:** Prominent, often a full-screen or banner-style message with a clear icon (e.g., cloud with slash) and explanation. May include a "Retry" button.
*   **Interaction States:** Persistent until online or retried.
*   **Spacing:** Full width banner or full screen with generous padding `(48px)`.
*   **Elevation:** Typically acts as a top-level overlay or banner.
*   **Glass behavior:** May be a distinct banner with a darker, more opaque frosted glass effect to emphasize the issue.
*   **Animation Behavior:** Slide-down/fade-in from top `(300ms ease-out)` for a banner. Full screen version might be a cross-fade `(250ms)`. Icon might subtly pulse.
*   **Accessibility:** ARIA `role="alert"` or `status` for persistent messages. Clear explanation and actionable buttons.

### Install PWA Prompt

*   **Purpose:** Encourages users to install WeatherView as a Progressive Web App for a native-like experience.
*   **Visual Hierarchy:** Subtle, non-intrusive banner or card, often at the bottom or as a small, dismissible prompt. Clear call to action.
*   **Interaction States:** Dismissable. Persistent until action taken or dismissed permanently.
*   **Spacing:** `padding: 16px 20px;`. Fixed width, or full width banner. `margin-bottom: 24px`.
*   **Elevation:** Low elevation, less prominent than core content. Subtle shadow.
*   **Glass behavior:** Standard frosted glass card or banner.
*   **Animation Behavior:** Slide-up from bottom `(250ms ease-out)` or fade-in `(200ms)`. Dismiss animation (slide-down/fade-out).
*   **Accessibility:** Clear explanation, accessible button, dismiss button with `aria-label="Dismiss"`.

### Settings Screen

*   **Purpose:** Allows users to configure application preferences (units, notifications, etc.).
*   **Visual Hierarchy:** Hierarchical list of settings categories and individual toggles/options. Clear headings.
*   **Interaction States:** Standard interactive elements (toggles, radio buttons, text inputs).
*   **Spacing:** Consistent `padding: 24px` for sections, `margin-bottom: 16px` for list items.
*   **Elevation:** The main settings panel (if a distinct view) would be a large frosted glass card, consistent with other primary views. Internal elements have minimal elevation.
*   **Glass behavior:** Main settings container is a frosted glass surface. Individual preference items (e.g., toggles) may have subtle frosted backgrounds.
*   **Animation Behavior:** Transitions between settings sections (e.g., `slide-left/right 300ms ease-in-out`). Toggle animations (`200ms ease-in-out`).
*   **Accessibility:** Semantic forms, clear labels for all settings, keyboard navigation.

## 3. Weather Illustration System

WeatherView's visual identity goes beyond mere color changes; the entire environment animates and transforms to convey the essence of the weather.

**General Principles:**

*   **Dynamic Background:** The primary canvas is a full-screen, high-quality, dynamically rendered scene that changes with weather and time. This is *not* a static image background.
*   **Subtle Animation:** All animations are subtle, organic, and contribute to the atmosphere. No distracting or flashy effects.
*   **Layered Depth:** Utilize parallax and subtle scaling to create a sense of depth between background elements (sky, clouds, distant scenery).
*   **Atmospheric Effects:** Focus on light, particles, and volumetric effects to create realistic and immersive moods.
*   **Glass Interaction:** The frosted glass UI elements subtly react to the background through tinting and reflection intensity.

--- 

### ☀ Clear

*   **Sky:** Vibrant, expansive blue (day) / deep indigo with twinkling stars (night). Smooth, subtle gradient from horizon to zenith.
*   **Lighting:** Crisp, direct sunlight (day), casting soft, defined shadows. Gentle, even moonlight with star glow (night).
*   **Glass appearance:** Bright, slightly reflective (day) / deep, subtly reflective (night), with background colors influencing its tint.
*   **Reflection intensity:** Moderate, clean reflections on glass during the day. Subtle, star-like glints at night.
*   **Cloud behavior:** Sparse, high-altitude cirrus clouds, drifting very slowly and almost imperceptibly. At night, virtually no clouds, enhancing star visibility.
*   **Rain behavior:** N/A.
*   **Snow behavior:** N/A.
*   **Wind movement:** Very subtle, almost imperceptible air movement. Perhaps a gentle sway of distant foliage.
*   **Particle effects:** Very rare, perhaps a single distant bird or a wisp of vapor. At night, subtle starlight shimmer. 
*   **Background gradients:** Smooth, subtle radial and linear gradients for the sky, enhancing depth and celestial feel.
*   **Shadow behavior:** Sharp, defined shadows during the day. Very soft, almost imperceptible shadows at night.
*   **Icon behavior:** Crisp, bright icons (day) / slightly desaturated with a subtle glow (night).
*   **Animation intensity:** Very low, focused on subtlety and vastness.
*   **Visual mood:** Pristine, endless, pure.
*   **Emotional mood:** Peaceful, inspiring, free.

### ☁ Cloudy

*   **Sky:** Overcast, diffused light. Soft, muted grays and cool blues, uniform across the sky.
*   **Lighting:** Even, indirect light. Shadows are very soft, almost nonexistent.
*   **Glass appearance:** Slightly more opaque due to diffused light, subtle cool tint from the sky.
*   **Reflection intensity:** Very low, reflections are soft and indistinct.
*   **Cloud behavior:** Continuous, slow, undulating movement of a thick, uniform cloud layer. No distinct cloud shapes, more of an atmospheric density.
*   **Rain behavior:** N/A.
*   **Snow behavior:** N/A.
*   **Wind movement:** Gentle, constant visual flow of the cloud mass. Distant elements might sway very subtly.
*   **Particle effects:** Minimal, perhaps a distant, barely visible wisp of mist if humidity is high.
*   **Background gradients:** Subtle, monochromatic gradients to suggest depth within the cloud cover.
*   **Shadow behavior:** Extremely soft, almost imperceptible ambient occlusion rather than directional shadows.
*   **Icon behavior:** Slightly desaturated, softer edges to blend with the muted atmosphere.
*   **Animation intensity:** Low, emphasizing continuity and a sense of stillness within the movement.
*   **Visual mood:** Subdued, vast, enveloping.
*   **Emotional mood:** Calm, introspective, reflective.

### 🌤 Partly Cloudy

*   **Sky:** Dynamic interplay of clear blue and soft cloud cover. Patches of brighter blue intermingled with soft grays.
*   **Lighting:** Varied. Areas of direct sunlight with soft shadows, alternating with diffused light where clouds obscure the sun.
*   **Glass appearance:** Varies slightly with the shifting light; brighter and more reflective in sunlit patches, softer in shadowed areas.
*   **Reflection intensity:** Moderate, dynamic reflections that change as light shifts.
*   **Cloud behavior:** Individual, soft-edged cumulus or stratocumulus clouds drifting slowly, casting subtle moving shadows on the landscape below. Clouds have internal movement and slight volumetric effects.
*   **Rain behavior:** N/A, unless transitioning to light rain.
*   **Snow behavior:** N/A.
*   **Wind movement:** Visible, gentle drift of clouds. A subtle rustle of distant trees.
*   **Particle effects:** Occasional, very sparse distant elements like leaves or dust motes, gently swaying.
*   **Background gradients:** Dynamic gradients shifting between clear sky colors and soft cloud grays.
*   **Shadow behavior:** Soft, but distinct, moving shadows on the ground below as clouds pass.
*   **Icon behavior:** Crisp in sunlit areas, slightly softer in shaded parts, reflecting ambient light.
*   **Animation intensity:** Medium-low, emphasizing the gentle, dynamic interplay of light and shadow.
*   **Visual mood:** Varied, gentle, evolving.
*   **Emotional mood:** Balanced, tranquil, hopeful.

### 🌧 Rain

*   **Sky:** Dark, heavy grays and deep blues, completely overcast. A strong sense of atmospheric density.
*   **Lighting:** Extremely diffused, dark, and often cool-toned. Reflections from wet surfaces are prominent, creating secondary light sources.
*   **Glass appearance:** Most pronounced "wet glass" effect. Streaks of rain, subtle water droplets accumulating and running down the surface. The entire glass element feels slightly misted and cool.
*   **Reflection intensity:** High, especially on wet ground surfaces. Reflections are distorted and shimmering due to falling rain.
*   **Cloud behavior:** Heavy, dark nimbostratus clouds, moving at a moderate, continuous pace. Volumetric rain shafts visible in the distance.
*   **Rain behavior:** Continuous, fine to moderate rain streaks that are clearly visible but not overwhelming. Rain hits surfaces with subtle ripple effects. Puddles form and reflect light.
*   **Snow behavior:** N/A.
*   **Wind movement:** Visible wind driving rain at a slight angle. Gusts are indicated by temporary increases in rain intensity or subtle swaying of foreground elements.
*   **Particle effects:** Visible raindrops, mist, and fog forming over wet areas.
*   **Background gradients:** Deep, desaturated gradients blending dark grays, blues, and hints of cool purple.
*   **Shadow behavior:** Very soft, almost ambient occlusion. Emphasis on reflections rather than distinct shadows.
*   **Icon behavior:** Icons appear with a subtle "wet sheen" or slightly muted to integrate with the rainy atmosphere. Rain icons animate with visible, falling droplets.
*   **Animation intensity:** Medium, with constant, organic motion of rain and reflections.
*   **Visual mood:** Misted, reflective, cozy, encompassing.
*   **Emotional mood:** Serene, contemplative, calm.

### ⛈ Thunderstorm

*   **Sky:** Extremely dark, menacing, chaotic mix of deep grays, blacks, and bruised purples. Turbulent, swirling cloud formations.
*   **Lighting:** Dramatic, low, and highly contrasted. Brief, intense flashes of lightning that momentarily illuminate the entire scene and UI. Strong, dynamic reflections immediately after lightning.
*   **Glass appearance:** Wet glass effect (as in rain), but with added intensity and dynamic flashes of light that reflect off the surface during lightning strikes.
*   **Reflection intensity:** Very high, sharp, and fleeting reflections during lightning. Otherwise, strong but diffuse reflections from heavy rain.
*   **Cloud behavior:** Fast-moving, towering cumulonimbus clouds with clear internal motion. Dark, heavy cloud bases. Visual evidence of strong updrafts and downdrafts.
*   **Rain behavior:** Heavy, torrential rain with visible sheets of water. Violent splashes on impact.
*   **Snow behavior:** N/A.
*   **Wind movement:** Strong, turbulent wind indicated by rapidly swaying trees, driving rain, and swift cloud movement. Occasional visible gusts.
*   **Particle effects:** Heavy rain, mist, and the occasional subtle lightning sprites or energy arcs within the cloud mass. 
*   **Background gradients:** Extreme, dark, and turbulent gradients. Rapid shifts in color and intensity during lightning.
*   **Shadow behavior:** Harsh, fleeting shadows during lightning. Otherwise, deep ambient occlusion.
*   **Icon behavior:** High contrast, sharp icons. Lightning icon animates with a bright, rapid flash.
*   **Animation intensity:** High, emphasizing powerful, chaotic energy. But still contained within the elegant framework.
*   **Visual mood:** Dramatic, intense, raw power.
*   **Emotional mood:** Awe-inspiring, thrilling, humble.

### ❄ Snow

*   **Sky:** Soft, muted grays and whites, heavy overcast. A gentle, diffused glow.
*   **Lighting:** Very soft, even, and low contrast. Ambient light reflects off snow-covered surfaces, creating a subtle internal luminescence.
*   **Glass appearance:** Delicate, frost-like accumulation on edges. Subtle, fine snow particles clinging to the surface. Misted effect, but softer than rain.
*   **Reflection intensity:** Low, but uniform. Reflections are soft and blurred.
*   **Cloud behavior:** Heavy, low-hanging stratiform clouds, moving slowly and continuously. Subtle internal texture to suggest density.
*   **Rain behavior:** N/A.
*   **Snow behavior:** Continuous, gentle fall of varied snowflake sizes and speeds. Snow accumulates subtly on distant surfaces. Ground covered in a soft, even layer of snow.
*   **Wind movement:** Very gentle, almost imperceptible air currents influencing snowflake drift.
*   **Particle effects:** Visible, individual snowflakes that gently swirl and fall. Subtle 