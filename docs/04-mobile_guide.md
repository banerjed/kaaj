# Mobile-First Development Guide for SvelteKit

A comprehensive guide to building mobile-responsive, touch-friendly web applications that work beautifully on all devices.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Viewport & Meta Tags](#viewport--meta-tags)
3. [Responsive Layout Patterns](#responsive-layout-patterns)
4. [Touch Interactions](#touch-interactions)
5. [Typography & Readability](#typography--readability)
6. [Navigation Patterns](#navigation-patterns)
7. [Forms & Input](#forms--input)
8. [Images & Media](#images--media)
9. [Performance on Mobile](#performance-on-mobile)
10. [Testing](#testing)
11. [Progressive Web App (PWA)](#progressive-web-app-pwa)
12. [Accessibility](#accessibility)

---

## Core Principles

### 1. **Mobile-First Approach**

Design for mobile first, then progressively enhance for larger screens.

✅ **Correct Order:**
```css
/* Mobile (default) */
.container {
  padding: 1rem;
}

/* Tablet and up */
@media (min-width: 768px) {
  .container {
    padding: 2rem;
  }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .container {
    padding: 3rem;
  }
}
```

**With Tailwind:**
```svelte
<div class="p-4 md:p-6 lg:p-8">
  <!-- Mobile gets p-4, tablet gets p-6, desktop gets p-8 -->
</div>
```

### 2. **Component-Based Responsive Design**

In 2026, responsive design has evolved to be component-based rather than page-based. Each UI element should be independently responsive.

```svelte
<!-- Card component responds to its container, not viewport -->
<div class="@container">
  <div class="grid @md:grid-cols-2 @lg:grid-cols-3 gap-4">
    <!-- Cards adjust based on container width -->
  </div>
</div>
```

### 3. **Content First**

Prioritize essential content on mobile. Progressive disclosure for secondary features.

❌ **Don't hide critical features on mobile**
✅ **Reorganize, simplify, or use collapsible sections**

---

## Viewport & Meta Tags

### Essential Meta Tags

Your `src/app.html` should include:

```html
<head>
  <meta charset="utf-8" />

  <!-- ✅ ESSENTIAL: Viewport configuration -->
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- ✅ RECOMMENDED: Disable automatic phone number detection -->
  <meta name="format-detection" content="telephone=no" />

  <!-- ✅ RECOMMENDED: Theme color for mobile browsers -->
  <meta name="theme-color" content="#3b82f6" />

  <!-- ✅ RECOMMENDED: Apple mobile web app capable -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Clinic" />

  <!-- SEO -->
  <meta name="description" content="Your clinic description" />

  <!-- Icons for mobile -->
  <link rel="icon" href="/favicon.svg" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/manifest.json" />
</head>
```

### Prevent Zoom Locks (Accessibility Issue)

❌ **NEVER do this:**
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
```

This prevents users from zooming, which is a **major accessibility violation**.

---

## Responsive Layout Patterns

### 1. **Flexbox for Navigation & Toolbars**

Best for one-dimensional layouts (navigation bars, button groups).

```svelte
<nav class="flex flex-wrap items-center gap-2 p-4">
  <button>Action 1</button>
  <button>Action 2</button>
  <button>Action 3</button>
</nav>
```

With `flex-wrap`, items automatically move to the next line on smaller screens.

### 2. **CSS Grid for Complex Layouts**

Best for two-dimensional layouts (dashboards, card grids).

```svelte
<!-- Mobile: 1 column, Tablet: 2 columns, Desktop: 3 columns -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
</div>
```

### 3. **Intrinsic Layouts (No Breakpoints)**

For content that adapts naturally:

```css
/* Auto-fit grid - no media queries needed */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}
```

```svelte
<div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
  <!-- Cards auto-adjust without media queries -->
</div>
```

### 4. **Fluid Typography with clamp()**

Scale font sizes smoothly without breakpoints:

```css
h1 {
  /* min: 1.5rem, preferred: 4vw, max: 2.5rem */
  font-size: clamp(1.5rem, 4vw, 2.5rem);
}

p {
  font-size: clamp(0.875rem, 2vw, 1rem);
}
```

With Tailwind (in config):

```js
// tailwind.config.js
theme: {
  extend: {
    fontSize: {
      'fluid-lg': 'clamp(1.5rem, 4vw, 2.5rem)',
      'fluid-base': 'clamp(0.875rem, 2vw, 1rem)',
    }
  }
}
```

### 5. **Container Queries (Modern Approach)**

Components respond to their container size, not viewport:

```svelte
<div class="@container">
  <div class="@md:flex @md:items-center gap-4">
    <img class="@md:w-32" src="..." alt="..." />
    <div class="flex-1">
      <h3 class="text-lg @md:text-xl">Title</h3>
      <p class="text-sm @md:text-base">Description</p>
    </div>
  </div>
</div>
```

Enable in Tailwind:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ],
}
```

---

## Touch Interactions

### 1. **Touch Target Sizes**

**Minimum touch target:** 48×48 pixels (Material Design) or 44×44 pixels (Apple HIG).

❌ **Too small:**
```svelte
<button class="px-2 py-1 text-xs">
  Delete <!-- Only ~24px tall -->
</button>
```

✅ **Proper size:**
```svelte
<button class="px-4 py-3 min-h-[48px] min-w-[48px]">
  Delete
</button>
```

**Use padding to extend tap area without changing visual size:**

```svelte
<!-- Looks like compact text, behaves like proper touch target -->
<a href="/profile" class="inline-block p-3">
  <span class="text-sm">Profile</span>
</a>
```

### 2. **Spacing Between Touch Targets**

Minimum 8px gap between interactive elements to prevent mis-taps.

```svelte
<div class="flex gap-2"> <!-- gap-2 = 8px -->
  <button>Cancel</button>
  <button>Save</button>
</div>
```

### 3. **Avoid Hover-Dependent UI**

Don't require hover to reveal critical functionality.

❌ **Requires hover:**
```svelte
<style>
  .card .actions {
    display: none;
  }
  .card:hover .actions {
    display: block; /* Mobile users can't hover! */
  }
</style>
```

✅ **Always visible on mobile:**
```svelte
<div class="card">
  <div class="md:opacity-0 md:group-hover:opacity-100 transition-opacity">
    <!-- Hidden on desktop until hover, always visible on mobile -->
    <button>Edit</button>
  </div>
</div>
```

### 4. **Touch-Friendly Gestures**

Support swipe gestures for common actions:

```svelte
<script>
  let touchStartX = 0;
  let touchEndX = 0;

  function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].clientX;
    handleSwipe();
  }

  function handleSwipe() {
    const swipeDistance = touchEndX - touchStartX;
    if (swipeDistance > 100) {
      // Swipe right
      navigateBack();
    } else if (swipeDistance < -100) {
      // Swipe left
      navigateForward();
    }
  }
</script>

<div
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  class="swipeable-content"
>
  <!-- Content -->
</div>
```

### 5. **Prevent Accidental Clicks**

Add confirmation for destructive actions:

```svelte
<script>
  let confirmDelete = $state(false);

  function handleDelete() {
    if (!confirmDelete) {
      confirmDelete = true;
      setTimeout(() => confirmDelete = false, 3000);
      return;
    }
    // Actually delete
    deleteItem();
  }
</script>

<button
  onclick={handleDelete}
  class:bg-danger={confirmDelete}
>
  {confirmDelete ? 'Tap again to confirm' : 'Delete'}
</button>
```

---

## Typography & Readability

### 1. **Minimum Font Size**

**Never use fonts smaller than 16px for body text on mobile.**

```css
body {
  font-size: 16px; /* Prevents iOS zoom-in on input focus */
}

/* Mobile */
.text-small {
  font-size: 14px; /* Use sparingly */
}

.text-tiny {
  font-size: 12px; /* Only for labels, avoid for body text */
}
```

With Tailwind:
```svelte
<p class="text-base"> <!-- 16px, perfect for mobile -->
  Body text that's easy to read
</p>
```

### 2. **Line Height & Line Length**

```css
p {
  line-height: 1.6; /* 1.5-1.8 recommended */
  max-width: 65ch; /* ~65 characters per line */
}
```

### 3. **Contrast Ratios**

**Minimum contrast:**
- Normal text: 4.5:1
- Large text (18px+): 3:1

Use tools like [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).

### 4. **Responsive Text Scaling**

Allow users to scale text (don't use `user-scalable=no`):

```css
/* Use relative units */
html {
  font-size: 16px; /* Base size */
}

h1 {
  font-size: 2rem; /* 32px, scales with user's browser settings */
}

/* Avoid fixed pixel sizes for text */
```

---

## Navigation Patterns

### 1. **Mobile Navigation Menu**

**Pattern: Hamburger Menu → Drawer**

```svelte
<script>
  let mobileMenuOpen = $state(false);

  function toggleMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }
</script>

<!-- Mobile: Hamburger button -->
<button
  class="md:hidden p-2 min-h-[48px] min-w-[48px]"
  onclick={toggleMenu}
  aria-label="Toggle menu"
>
  <Icon name={mobileMenuOpen ? 'x' : 'menu'} />
</button>

<!-- Mobile: Drawer overlay -->
{#if mobileMenuOpen}
  <div
    class="fixed inset-0 z-50 md:hidden"
    onclick={toggleMenu}
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50"></div>

    <!-- Drawer -->
    <nav
      class="absolute top-0 left-0 h-full w-64 bg-white shadow-xl p-4 overflow-y-auto"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Navigation items -->
      <a href="/dashboard" class="block py-3 px-4">Dashboard</a>
      <a href="/patients" class="block py-3 px-4">Patients</a>
      <!-- ... -->
    </nav>
  </div>
{/if}

<!-- Desktop: Always visible sidebar -->
<nav class="hidden md:block">
  <!-- Sidebar content -->
</nav>
```

### 2. **Bottom Navigation (Thumb Zone)**

For frequently used actions, use bottom navigation on mobile:

```svelte
<!-- Fixed bottom navigation (mobile only) -->
<nav class="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-40">
  <div class="flex justify-around">
    <a href="/dashboard" class="flex flex-col items-center py-2 px-4 min-w-[64px]">
      <Icon name="home" class="w-6 h-6" />
      <span class="text-xs mt-1">Home</span>
    </a>
    <a href="/patients" class="flex flex-col items-center py-2 px-4 min-w-[64px]">
      <Icon name="users" class="w-6 h-6" />
      <span class="text-xs mt-1">Patients</span>
    </a>
    <a href="/reports" class="flex flex-col items-center py-2 px-4 min-w-[64px]">
      <Icon name="chart" class="w-6 h-6" />
      <span class="text-xs mt-1">Reports</span>
    </a>
  </div>
</nav>

<!-- Add padding to main content to prevent bottom nav overlap -->
<main class="pb-16 md:pb-0">
  <!-- Content -->
</main>
```

**Thumb-Reachable Zones:**
- Bottom 1/3 of screen: Easy to reach
- Middle 1/3: Moderate effort
- Top 1/3: Difficult to reach (one-handed)

Place primary actions in the bottom zone.

### 3. **Sticky Headers**

Keep navigation accessible while scrolling:

```svelte
<header class="sticky top-0 z-50 bg-white border-b shadow">
  <div class="flex items-center justify-between h-16 px-4">
    <!-- Header content -->
  </div>
</header>
```

---

## Forms & Input

### 1. **Input Types for Mobile Keyboards**

Use correct input types to trigger appropriate mobile keyboards:

```svelte
<!-- Numeric keypad for phone numbers -->
<input type="tel" placeholder="Phone number" />

<!-- Email keyboard with @ and . -->
<input type="email" placeholder="Email" />

<!-- Numeric keypad -->
<input type="number" placeholder="Age" />

<!-- Date picker -->
<input type="date" />

<!-- URL keyboard -->
<input type="url" placeholder="Website" />
```

### 2. **Prevent iOS Zoom on Input Focus**

iOS zooms in on inputs with font-size < 16px:

```css
/* Prevent zoom */
input, select, textarea {
  font-size: 16px; /* Minimum to prevent iOS zoom */
}
```

With Tailwind:
```svelte
<input class="text-base" /> <!-- text-base = 16px -->
```

### 3. **Label and Input Sizing**

```svelte
<div class="space-y-2">
  <label for="name" class="block text-sm font-medium">
    Name
  </label>
  <input
    id="name"
    type="text"
    class="w-full px-4 py-3 min-h-[48px] border rounded"
  />
</div>
```

### 4. **Autocomplete Attributes**

Help mobile browsers autofill forms:

```svelte
<input
  type="text"
  autocomplete="name"
  placeholder="Full name"
/>

<input
  type="tel"
  autocomplete="tel"
  placeholder="Phone"
/>

<input
  type="email"
  autocomplete="email"
  placeholder="Email"
/>
```

[Full autocomplete reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete)

### 5. **Form Validation Feedback**

Make error messages visible and clear:

```svelte
<script>
  let phoneError = $state('');

  function validatePhone(value) {
    if (!value.match(/^\d{10}$/)) {
      phoneError = 'Please enter a valid 10-digit phone number';
    } else {
      phoneError = '';
    }
  }
</script>

<div>
  <label for="phone" class="block text-sm font-medium mb-2">
    Phone Number
  </label>
  <input
    id="phone"
    type="tel"
    class="w-full px-4 py-3 border rounded"
    class:border-danger={phoneError}
    onblur={(e) => validatePhone(e.target.value)}
  />
  {#if phoneError}
    <p class="text-danger text-sm mt-1" role="alert">
      {phoneError}
    </p>
  {/if}
</div>
```

### 6. **Large Submit Buttons**

```svelte
<button
  type="submit"
  class="w-full py-4 px-6 bg-primary text-white rounded-lg text-lg font-medium min-h-[56px]"
>
  Submit Form
</button>
```

---

## Images & Media

### 1. **Responsive Images**

Use `srcset` for different screen sizes and densities:

```svelte
<img
  src="/images/hero-800.jpg"
  srcset="
    /images/hero-400.jpg 400w,
    /images/hero-800.jpg 800w,
    /images/hero-1200.jpg 1200w
  "
  sizes="(max-width: 640px) 400px, (max-width: 1024px) 800px, 1200px"
  alt="Hero image"
  loading="lazy"
/>
```

### 2. **Modern Image Formats**

Use WebP or AVIF with fallbacks:

```svelte
<picture>
  <source srcset="/images/hero.avif" type="image/avif" />
  <source srcset="/images/hero.webp" type="image/webp" />
  <img src="/images/hero.jpg" alt="Hero image" />
</picture>
```

### 3. **Lazy Loading**

```svelte
<!-- Load images as they enter viewport -->
<img src="image.jpg" loading="lazy" alt="..." />

<!-- Except for above-the-fold images -->
<img src="hero.jpg" loading="eager" fetchpriority="high" alt="..." />
```

### 4. **Prevent Layout Shift**

Always specify width and height:

```svelte
<img
  src="image.jpg"
  width="800"
  height="600"
  alt="..."
  class="w-full h-auto"
/>
```

### 5. **Video Optimization**

```svelte
<video
  controls
  preload="none" <!-- Don't preload on mobile -->
  poster="thumbnail.jpg"
  playsinline <!-- Prevent fullscreen on iOS -->
>
  <source src="video.webm" type="video/webm" />
  <source src="video.mp4" type="video/mp4" />
</video>
```

---

## Performance on Mobile

### 1. **Reduce JavaScript**

Mobile devices have less processing power:

```js
// Lazy load heavy components
const HeavyChart = () => import('./HeavyChart.svelte');
```

### 2. **Optimize Critical Rendering Path**

```html
<!-- Inline critical CSS -->
<style>
  /* Critical above-the-fold styles */
</style>

<!-- Defer non-critical CSS -->
<link rel="stylesheet" href="non-critical.css" media="print" onload="this.media='all'" />
```

### 3. **Use Service Workers for Offline**

Cache assets for offline use and faster repeat visits (see PWA section).

### 4. **Minimize Network Requests**

On slow mobile connections, every request matters:

- Bundle and minify CSS/JS
- Use HTTP/2 for multiplexing
- Implement resource preloading
- Use CDN for static assets

### 5. **Optimize Fonts**

```css
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap; /* Show fallback font while loading */
  unicode-range: U+0-10FFFF; /* Only load characters you need */
}
```

---

## Testing

### 1. **Browser DevTools**

**Chrome/Edge DevTools:**
- Open DevTools (F12)
- Click "Toggle device toolbar" (Ctrl+Shift+M)
- Select device presets (iPhone, Galaxy, etc.)
- Test different screen sizes and pixel densities

**Simulate slow connections:**
- DevTools → Network tab → Throttling → "Slow 3G"

### 2. **Real Device Testing**

**Essential devices to test:**
- iPhone (Safari) - different from desktop Safari
- Android phone (Chrome)
- Tablet (iPad or Android)

**Remote debugging:**
```bash
# Chrome DevTools for Android
# Enable USB debugging on Android, connect via USB
chrome://inspect

# Safari Web Inspector for iOS
# Enable Web Inspector on iOS device
# Safari → Develop → [Device Name]
```

### 3. **Testing Checklist**

- [ ] All text is readable (min 16px body text)
- [ ] All interactive elements are at least 48×48px
- [ ] No horizontal scrolling (unless intentional carousel)
- [ ] Forms are easy to fill on mobile keyboard
- [ ] Images load appropriately for screen size
- [ ] Navigation is accessible (hamburger menu works)
- [ ] Buttons and links are easy to tap
- [ ] Content is readable in portrait and landscape
- [ ] No content hidden by viewport issues
- [ ] Fast performance on slow 3G connection

### 4. **Automated Testing Tools**

```bash
# Lighthouse CI
npm install -g @lhci/cli

# Run Lighthouse mobile test
lhci autorun --collect.settings.preset=mobile

# Test mobile performance
npm run build
npm run preview
# Open Chrome DevTools → Lighthouse → Mobile
```

### 5. **Cross-Browser Testing Services**

- [BrowserStack](https://www.browserstack.com/) - Real device testing
- [Sauce Labs](https://saucelabs.com/) - Automated testing
- [LambdaTest](https://www.lambdatest.com/) - Cross-browser testing

---

## Progressive Web App (PWA)

### 1. **Web App Manifest**

Create `static/manifest.json`:

```json
{
  "name": "Clinic Management System",
  "short_name": "Clinic",
  "description": "Healthcare management system",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

Link in `app.html`:
```html
<link rel="manifest" href="/manifest.json" />
```

### 2. **Service Worker for Offline Support**

Create `src/service-worker.js`:

```js
/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

// Install service worker and cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate and clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      for (const key of keys) {
        if (key !== CACHE) await caches.delete(key);
      }
    })
  );
});

// Serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
```

### 3. **Install Prompt**

```svelte
<script>
  let deferredPrompt = $state(null);
  let showInstallButton = $state(false);

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallButton = true;
    });
  }

  async function handleInstall() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      showInstallButton = false;
    }

    deferredPrompt = null;
  }
</script>

{#if showInstallButton}
  <button
    onclick={handleInstall}
    class="fixed bottom-20 right-4 bg-primary text-white px-6 py-3 rounded-lg shadow-lg"
  >
    Install App
  </button>
{/if}
```

### 4. **PWA Requirements**

- [x] HTTPS (required except localhost)
- [x] Web app manifest with icons
- [x] Service worker registered
- [x] Works offline (at least shows cached pages)
- [x] Responsive design
- [x] Fast load time (< 3s on 3G)

---

## Accessibility

### 1. **Semantic HTML**

```svelte
<!-- Use proper landmarks -->
<header>
  <nav aria-label="Main navigation">
    <!-- Navigation -->
  </nav>
</header>

<main>
  <article>
    <h1>Page Title</h1>
    <!-- Content -->
  </article>
</main>

<footer>
  <!-- Footer content -->
</footer>
```

### 2. **ARIA Labels**

```svelte
<!-- Button with icon only -->
<button aria-label="Close menu">
  <Icon name="x" aria-hidden="true" />
</button>

<!-- Skip to main content link -->
<a href="#main-content" class="sr-only focus:not-sr-only">
  Skip to main content
</a>

<main id="main-content">
  <!-- Content -->
</main>
```

### 3. **Keyboard Navigation**

Ensure all interactive elements are keyboard accessible:

```svelte
<button
  onclick={handleClick}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Action
</button>
```

### 4. **Focus Management**

```css
/* Visible focus indicator */
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Remove default outline only when using :focus-visible */
:focus:not(:focus-visible) {
  outline: none;
}
```

### 5. **Screen Reader Support**

```svelte
<!-- Announce dynamic content changes -->
<div role="status" aria-live="polite" aria-atomic="true">
  {#if loading}
    Loading patients...
  {:else}
    {patients.length} patients found
  {/if}
</div>

<!-- Hide decorative elements -->
<Icon name="arrow-right" aria-hidden="true" />

<!-- Loading states -->
<button disabled={loading} aria-busy={loading}>
  {#if loading}
    <span class="sr-only">Loading...</span>
    <LoadingSpinner />
  {:else}
    Submit
  {/if}
</button>
```

---

## Tailwind-Specific Patterns

### Mobile-First Utilities

```svelte
<!-- Default (mobile), then override for larger screens -->
<div class="
  flex-col        <!-- Mobile: stack vertically -->
  md:flex-row     <!-- Tablet+: horizontal -->
  gap-2           <!-- Mobile: 8px gap -->
  md:gap-4        <!-- Tablet+: 16px gap -->
  p-4             <!-- Mobile: 16px padding -->
  md:p-6          <!-- Tablet+: 24px padding -->
  lg:p-8          <!-- Desktop: 32px padding -->
">
  <!-- Content -->
</div>
```

### Hide/Show on Breakpoints

```svelte
<!-- Hide on mobile, show on desktop -->
<div class="hidden md:block">
  Desktop sidebar
</div>

<!-- Show on mobile, hide on desktop -->
<div class="md:hidden">
  Mobile menu
</div>

<!-- Different content for different screens -->
<h1 class="text-2xl md:text-3xl lg:text-4xl">
  Responsive heading
</h1>
```

### Screen Reader Utilities

```svelte
<!-- Visually hidden but accessible to screen readers -->
<span class="sr-only">Loading...</span>

<!-- Hidden for screen readers but visible -->
<Icon aria-hidden="true" name="menu" />
```

---

## Common Mobile Issues & Fixes

### Issue 1: Text Too Small
```svelte
<!-- ❌ Problem -->
<p class="text-xs">Hard to read on mobile</p>

<!-- ✅ Solution -->
<p class="text-base md:text-sm">Readable on all devices</p>
```

### Issue 2: Buttons Too Small
```svelte
<!-- ❌ Problem -->
<button class="px-2 py-1">Tap</button>

<!-- ✅ Solution -->
<button class="px-4 py-3 min-h-[48px]">Tap</button>
```

### Issue 3: Horizontal Scrolling
```svelte
<!-- ❌ Problem -->
<div class="w-[1200px]">Fixed width content</div>

<!-- ✅ Solution -->
<div class="w-full max-w-7xl mx-auto px-4">Responsive width</div>
```

### Issue 4: Table Overflow
```svelte
<!-- ✅ Solution: Horizontal scroll for tables -->
<div class="overflow-x-auto">
  <table class="min-w-[640px]">
    <!-- Table content -->
  </table>
</div>

<!-- Or: Responsive table with cards on mobile -->
<div class="hidden md:block">
  <table><!-- Desktop table --></table>
</div>
<div class="md:hidden space-y-4">
  {#each items as item}
    <div class="card"><!-- Mobile card layout --></div>
  {/each}
</div>
```

### Issue 5: Fixed Positioning Issues
```svelte
<!-- ❌ Problem: Covers content -->
<div class="fixed bottom-0 left-0 right-0 h-16 bg-white">
  Bottom nav
</div>
<main><!-- Content gets hidden --></main>

<!-- ✅ Solution: Add padding -->
<div class="fixed bottom-0 left-0 right-0 h-16 bg-white z-50">
  Bottom nav
</div>
<main class="pb-16"><!-- Safe padding --></main>
```

---

## Quick Reference Checklist

### Viewport & Meta
- [ ] Viewport meta tag with `width=device-width, initial-scale=1`
- [ ] Theme color meta tag
- [ ] Apple web app meta tags
- [ ] Web app manifest linked

### Layout
- [ ] Mobile-first CSS (default styles, then md:, lg:)
- [ ] Flexbox/Grid for responsive layouts
- [ ] No fixed widths in pixels (use %, vw, or max-width)
- [ ] Content fits in viewport (no horizontal scroll)

### Touch & Interaction
- [ ] Touch targets minimum 48×48px
- [ ] 8px spacing between interactive elements
- [ ] No hover-dependent functionality
- [ ] Large, easy-to-tap buttons

### Typography
- [ ] Body text minimum 16px
- [ ] Line height 1.5-1.8
- [ ] Sufficient color contrast (4.5:1 minimum)
- [ ] Fluid typography with clamp() or responsive classes

### Forms
- [ ] Correct input types (tel, email, number)
- [ ] 16px font size to prevent iOS zoom
- [ ] Autocomplete attributes
- [ ] Clear error messages
- [ ] Large submit buttons

### Images & Media
- [ ] Responsive images with srcset
- [ ] Modern formats (WebP/AVIF) with fallbacks
- [ ] Lazy loading for below-fold images
- [ ] Width and height to prevent layout shift

### Performance
- [ ] Lighthouse mobile score > 90
- [ ] Fast load on slow 3G (< 3s)
- [ ] Service worker for offline support
- [ ] Optimized images and fonts
- [ ] Code splitting for large components

### Navigation
- [ ] Mobile hamburger menu or bottom nav
- [ ] Easy-to-reach primary actions (thumb zone)
- [ ] Sticky header (optional)
- [ ] Breadcrumbs or back button for navigation

### Testing
- [ ] Tested on real iPhone (Safari)
- [ ] Tested on real Android (Chrome)
- [ ] Tested in portrait and landscape
- [ ] Tested with slow network (3G throttling)
- [ ] Lighthouse mobile audit passed

### Accessibility
- [ ] Semantic HTML elements
- [ ] ARIA labels where needed
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Screen reader compatible
- [ ] Zoom enabled (no user-scalable=no)

---

## Resources & Tools

### Documentation
- [Responsive Web Design Guide](https://www.simpalm.com/blog/best-practices-for-responsive-website-design)
- [UX Pin Responsive Design Best Practices](https://www.uxpin.com/studio/blog/best-practices-examples-of-excellent-responsive-design/)
- [MDN Responsive Design](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)
- [Web.dev Mobile Best Practices](https://web.dev/articles/responsive-web-design-basics)

### Testing Tools
- Chrome DevTools Device Mode
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/)
- [BrowserStack](https://www.browserstack.com/)
- [WebPageTest](https://www.webpagetest.org/)
- [WAVE Accessibility Checker](https://wave.webaim.org/)

### PWA Resources
- [Building a PWA with SvelteKit](https://www.engborg.dev/blog/building-a-pwa-with-sveltekit)
- [PWA Responsive Design Best Practices](https://appinstitute.com/pwa-responsive-design-best-practices/)
- [SvelteKit PWA Guide](https://dev.to/askrodney/sveltekit-pwa-installable-app-with-offline-access-5a8n)

### Design Tools
- [Material Design Touch Targets](https://m3.material.io/foundations/accessible-design/accessibility-basics#28032e45-c598-450c-b355-f9fe737b1cd8)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

**Remember:** Mobile users are often:
- On slower connections
- Using one hand
- In bright sunlight (affecting screen visibility)
- Distracted or multitasking
- On the move

Design with empathy for these constraints, and your app will excel on mobile devices.
