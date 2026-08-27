# High-Performance SvelteKit Application Guide

This guide compiles best practices for building fast, efficient SvelteKit applications based on official documentation and industry standards.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [SvelteKit Built-in Optimizations](#sveltekit-built-in-optimizations)
3. [Database Performance](#database-performance)
4. [Data Loading Patterns](#data-loading-patterns)
5. [State Management](#state-management)
6. [Frontend Optimizations](#frontend-optimizations)
7. [Asset Optimization](#asset-optimization)
8. [Build & Deployment](#build--deployment)
9. [Monitoring & Debugging](#monitoring--debugging)

---

## Core Principles

### 1. **Avoid Shared State on the Server**
Servers are stateless and shared by multiple users. Never store user data in module-level variables.

❌ **NEVER DO THIS:**
```js
// +page.server.js
let user; // ❌ SHARED BY ALL USERS!

export async function load() {
  return { user };
}

export const actions = {
  default: async ({ request }) => {
    user = await request.formData(); // ❌ LEAKS TO OTHER USERS
  }
};
```

✅ **DO THIS:**
```js
// +page.server.js
export async function load({ cookies }) {
  const sessionId = cookies.get('sessionid');
  return {
    user: await db.getUser(sessionId) // ✅ Per-request data
  };
}
```

### 2. **No Side Effects in Load Functions**
Load functions should be pure. Don't write to stores or global state.

❌ **WRONG:**
```js
import { user } from '$lib/user';

export async function load({ fetch }) {
  const response = await fetch('/api/user');
  user.set(await response.json()); // ❌ Side effect!
}
```

✅ **CORRECT:**
```js
export async function load({ fetch }) {
  const response = await fetch('/api/user');
  return {
    user: await response.json() // ✅ Return data
  };
}
```

### 3. **Understand Component Lifecycle**
Components are reused during navigation. Use `$derived` for reactive values.

❌ **BUGGY:**
```svelte
<script>
  let { data } = $props();
  const wordCount = data.content.split(' ').length; // ❌ Only runs once
</script>
```

✅ **CORRECT:**
```svelte
<script>
  let { data } = $props();
  let wordCount = $derived(data.content.split(' ').length); // ✅ Reactive
</script>
```

---

## SvelteKit Built-in Optimizations

SvelteKit provides these optimizations out of the box:

1. **Code-splitting** - Only load code needed for current page
2. **Asset preloading** - Prevent request waterfalls
3. **File hashing** - Forever-cacheable assets
4. **Request coalescing** - Group multiple server loads into one HTTP request
5. **Parallel loading** - Concurrent load functions
6. **Data inlining** - SSR fetch responses replayed in browser
7. **Conservative invalidation** - Only rerun load when dependencies change
8. **Prerendering** - Static generation for eligible routes
9. **Link preloading** - Eager anticipation of navigation needs

---

## Database Performance

### 1. **Always Add Indexes**
Index frequently queried columns to avoid full table scans.

```typescript
// schema.ts
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  phone: text('phone'),
  centerId: uuid('center_id').references(() => centers.id),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => ({
  // Add indexes for search columns
  patientIdIdx: index('patients_patient_id_idx').on(table.patientId),
  phoneIdx: index('patients_phone_idx').on(table.phone),
  centerIdIdx: index('patients_center_id_idx').on(table.centerId),
  createdAtIdx: index('patients_created_at_idx').on(table.createdAt)
}));
```

**Impact:** Queries on 10,000+ rows go from seconds → milliseconds

### 2. **Use Database Transactions**
Ensure data consistency and enable atomic operations.

```js
const result = await db.transaction(async (tx) => {
  const [sale] = await tx.insert(sales).values({...}).returning();

  // Update inventory atomically
  await tx.update(batches)
    .set({ quantity: sql`${batches.quantity} - ${soldQty}` })
    .where(eq(batches.id, batchId));

  return sale;
});
```

### 3. **Prevent N+1 Queries**
Use joins instead of sequential queries.

❌ **N+1 Problem:**
```js
const users = await db.select().from(users);
for (const user of users) {
  // Separate query per user! ❌
  user.posts = await db.select().from(posts).where(eq(posts.userId, user.id));
}
```

✅ **Use Joins:**
```js
const usersWithPosts = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId));
```

### 4. **Optimize Count Queries**
Use `count()` instead of selecting all rows.

❌ **WRONG:**
```js
const countResult = await db.select({ count: patients.id }).from(patients);
const total = countResult.length; // ❌ Wrong! Only counts returned rows
```

✅ **CORRECT:**
```js
import { count } from 'drizzle-orm';

const [{ count: total }] = await db
  .select({ count: count() })
  .from(patients)
  .where(conditions);
```

---

## Data Loading Patterns

### 1. **Prevent Waterfalls**
Waterfalls are sequential requests that kill performance.

❌ **WATERFALL:**
```js
export async function load({ fetch }) {
  const user = await fetch('/api/user');           // Wait...
  const items = await fetch(`/api/items/${user.id}`); // Then wait...
  const details = await fetch(`/api/details/${items[0].id}`); // Then wait...
}
```

✅ **PARALLEL:**
```js
export async function load({ fetch, parent }) {
  const [user, items] = await Promise.all([
    fetch('/api/user'),
    fetch('/api/items')
  ]);
}
```

### 2. **Use Server Load for Backend Calls**
Server loads avoid client→server→backend round trips.

```
Client → Server → Database  ✅ Fast (server-side)
Client → Server             ❌ Slow (extra hop)
       ↓
    Database
```

```js
// +page.server.js - Runs on server, close to DB
export async function load() {
  return {
    data: await db.query() // ✅ Direct database access
  };
}
```

### 3. **Stream Slow Data**
Don't block page render on slow data.

```js
// +page.server.js
export async function load({ params }) {
  return {
    // Fast data - await it
    post: await loadPost(params.slug),

    // Slow data - stream it
    comments: loadComments(params.slug) // Don't await!
  };
}
```

```svelte
<!-- +page.svelte -->
<h1>{data.post.title}</h1>

{#await data.comments}
  Loading comments...
{:then comments}
  {#each comments as comment}
    <p>{comment.content}</p>
  {/each}
{/await}
```

### 4. **Call `parent()` Last**
Avoid creating artificial dependencies.

❌ **CREATES WATERFALL:**
```js
export async function load({ params, parent }) {
  const parentData = await parent(); // ❌ Blocks getData
  const data = await getData(params);
  return { ...parentData, ...data };
}
```

✅ **PARALLEL:**
```js
export async function load({ params, parent }) {
  const data = await getData(params);     // Start immediately
  const parentData = await parent();      // Runs in parallel
  return { ...parentData, ...data };
}
```

### 5. **Universal vs Server Load**

**Use Server Load (`+page.server.js`) when:**
- Accessing database directly
- Using private env variables
- Need access to cookies/headers
- Calling internal APIs

**Use Universal Load (`+page.js`) when:**
- Fetching from public APIs
- Need to return non-serializable data (class instances, component constructors)
- Want same code on server and client

---

## State Management

### 1. **Use Context for Shared State**
Avoid global stores; use Svelte's context API.

```svelte
<!-- +layout.svelte -->
<script>
  import { setContext } from 'svelte';
  let { data } = $props();

  // Pass function to preserve reactivity
  setContext('user', () => data.user);
</script>
```

```svelte
<!-- +page.svelte -->
<script>
  import { getContext } from 'svelte';
  const user = getContext('user');
</script>

<p>Welcome {user().name}</p>
```

### 2. **Store Ephemeral State in URL**
Use search params for state that should survive reload.

```js
// Filter state persists across reloads
goto(`?sort=price&order=asc`);

// Access in load functions
export async function load({ url }) {
  const sort = url.searchParams.get('sort');
  return { data: await db.query().orderBy(sort) };
}
```

### 3. **Avoid Effect Loops**
Multiple `$effect` blocks can trigger infinite loops.

❌ **INFINITE LOOP:**
```js
$effect(() => {
  if (search) currentPage = 1; // Modifies currentPage
  loadData();
});

$effect(() => {
  currentPage; // Reads currentPage
  loadData(); // Both call loadData!
});
```

✅ **SINGLE EFFECT:**
```js
$effect(() => {
  if (searchDebounce) clearTimeout(searchDebounce);

  searchDebounce = setTimeout(() => {
    loadData();
  }, search ? 300 : 0);

  return () => clearTimeout(searchDebounce);
});
```

### 4. **Use `onMount` for One-Time Setup**
Don't use `$effect` for code that should only run once.

❌ **RUNS MULTIPLE TIMES:**
```js
$effect.pre(() => {
  loadDashboard(); // ❌ May run multiple times
});
```

✅ **RUNS ONCE:**
```js
import { onMount } from 'svelte';

onMount(() => {
  loadDashboard(); // ✅ Runs once on mount
});
```

---

## Frontend Optimizations

### 1. **Minimize Re-renders**
Track only necessary dependencies in effects.

❌ **RERUNS ON ANY STATE CHANGE:**
```js
$effect(() => {
  loadStock(); // ❌ Runs on every reactive change
});
```

✅ **SPECIFIC DEPENDENCIES:**
```js
$effect(() => {
  void activeTab; // Only track activeTab
  loadStock();
});
```

### 2. **Debounce User Input**
Don't fire API calls on every keystroke.

```js
let searchDebounce;

$effect(() => {
  if (searchDebounce) clearTimeout(searchDebounce);

  searchDebounce = setTimeout(() => {
    loadPatients(search);
  }, 300); // Wait 300ms after typing stops

  return () => clearTimeout(searchDebounce);
});
```

### 3. **Paginate API Responses**
Don't fetch all data when you only display 10 items.

❌ **FETCHES EVERYTHING:**
```js
const results = await api.get('/patients?search=john'); // Returns 1000s
const displayed = results.slice(0, 10); // Only show 10 ❌
```

✅ **PAGINATE:**
```js
const results = await api.get('/patients?search=john&pageSize=10&page=1');
```

### 4. **Update Charts, Don't Recreate**
Reuse Chart.js instances instead of destroying and recreating.

❌ **RECREATES CHART:**
```js
$effect(() => {
  if (!canvas) return;
  chart?.destroy();
  chart = new Chart(canvas, config); // ❌ Full recreation
});
```

✅ **UPDATE DATA:**
```js
let initialized = $state(false);

$effect(() => {
  if (!canvas || initialized) return;
  chart = new Chart(canvas, config);
  initialized = true;
});

$effect(() => {
  if (!chart) return;
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update('none'); // ✅ No animation, faster
});
```

---

## Asset Optimization

### 1. **Images**

**Use `@sveltejs/enhanced-img`:**
```svelte
<enhanced:img
  src="./hero.jpg"
  sizes="min(1280px, 100vw)"
  alt="Hero image"
/>
```

Benefits:
- Generates `.webp` and `.avif` formats
- Creates multiple sizes for different devices
- Adds `width`/`height` to prevent layout shift
- Strips EXIF data

**Best Practices:**
- Provide 2x resolution images for retina displays
- Use `sizes` attribute for large images
- Set `fetchpriority="high"` for LCP images
- Avoid `loading="lazy"` for above-fold images

### 2. **Fonts**

**Preload critical fonts:**
```js
// hooks.server.js
export async function handle({ event, resolve }) {
  return await resolve(event, {
    preload: ({ type, path }) =>
      type === 'font' && path.includes('/fonts/Inter')
  });
}
```

**Subset fonts:**
Use tools to include only characters you need.

### 3. **Videos**

- Compress with Handbrake or FFmpeg
- Convert to `.webm` or `.mp4`
- Use `preload="none"` for below-fold videos
- Strip audio from muted videos

### 4. **Code Splitting**

**Lazy load components:**
```js
// Only load when needed
const HeavyComponent = () => import('./HeavyComponent.svelte');
```

**Analyze bundle:**
```bash
npm i -D rollup-plugin-visualizer
```

```js
// vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({ open: true })
  ]
};
```

---

## Build & Deployment

### 1. **Prerendering**

**Enable for static content:**
```js
// +page.js
export const prerender = true;
```

**Benefits:**
- Instant page loads
- Better SEO
- Reduced server load
- Works without JavaScript

**When NOT to prerender:**
- Personalized content per user
- Content changes frequently
- Depends on request headers/cookies
- Has form actions

### 2. **Edge Deployment**

Deploy to edge for reduced latency:
```js
// +page.js
export const config = {
  runtime: 'edge'
};
```

**Adapters supporting edge:**
- Cloudflare Pages
- Vercel Edge Functions
- Netlify Edge Functions

### 3. **HTTP/2**
Ensure your host uses HTTP/2+ for optimal code-splitting performance.

### 4. **Caching Headers**

**Set cache headers in load:**
```js
export async function load({ fetch, setHeaders }) {
  const response = await fetch('https://api.example.com/data.json');

  setHeaders({
    'cache-control': response.headers.get('cache-control')
  });

  return response.json();
}
```

---

## Monitoring & Debugging

### 1. **Performance Testing**

**Tools:**
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [WebPageTest](https://www.webpagetest.org/)
- Chrome DevTools (Lighthouse, Network, Performance)

**Test in preview mode:**
```bash
npm run build
npm run preview
```

Dev mode is NOT representative of production performance.

### 2. **Core Web Vitals**

Monitor these metrics:
- **LCP** (Largest Contentful Paint) - < 2.5s
- **FID** (First Input Delay) - < 100ms
- **CLS** (Cumulative Layout Shift) - < 0.1

### 3. **OpenTelemetry Tracing**

**Enable in `svelte.config.js`:**
```js
export default {
  kit: {
    experimental: {
      tracing: { server: true },
      instrumentation: { server: true }
    }
  }
};
```

**Track custom spans:**
```js
import { getRequestEvent } from '$app/server';

export async function load() {
  const event = getRequestEvent();
  event.tracing.root.setAttribute('customMetric', value);
}
```

### 4. **Backend Instrumentation**

Use Server-Timing headers:
```js
export async function load({ setHeaders }) {
  const start = Date.now();
  const data = await slowQuery();
  const duration = Date.now() - start;

  setHeaders({
    'Server-Timing': `db;dur=${duration}`
  });

  return { data };
}
```

---

## Checklist

### Database
- [ ] Indexes on all filtered/searched columns
- [ ] Pagination on all list endpoints
- [ ] Proper count queries using `count()`
- [ ] Transactions for multi-step operations
- [ ] Database joins instead of N+1 queries

### Data Loading
- [ ] Server loads for backend calls
- [ ] Parallel loading (no waterfalls)
- [ ] Stream slow data with promises
- [ ] `await parent()` called last
- [ ] Conservative `$effect` dependencies

### State Management
- [ ] No shared state on server
- [ ] Pure load functions (no side effects)
- [ ] Context API for shared client state
- [ ] URL params for shareable state
- [ ] `$derived` for reactive computed values

### Frontend
- [ ] Debounced search inputs
- [ ] Paginated API requests
- [ ] Chart updates instead of recreation
- [ ] Single effects (no infinite loops)
- [ ] `onMount` for one-time setup

### Assets
- [ ] Images use `@sveltejs/enhanced-img`
- [ ] 2x resolution source images
- [ ] `sizes` attribute on large images
- [ ] Fonts preloaded via `handle` hook
- [ ] Videos compressed and lazy-loaded

### Build & Deploy
- [ ] Prerendering enabled where possible
- [ ] Edge deployment for global apps
- [ ] HTTP/2+ on hosting
- [ ] Cache headers set appropriately
- [ ] Bundle analyzed with visualizer

### Monitoring
- [ ] Tested in preview mode
- [ ] Lighthouse score > 90
- [ ] Core Web Vitals in green
- [ ] Server-Timing headers for slow endpoints
- [ ] Error tracking configured

---

## Common Anti-Patterns to Avoid

1. ❌ Module-level state on server
2. ❌ Side effects in load functions
3. ❌ Missing database indexes
4. ❌ Fetching all rows when paginating
5. ❌ N+1 query problems
6. ❌ Sequential load waterfalls
7. ❌ `$effect` without dependencies
8. ❌ Multiple effects calling same function
9. ❌ Non-reactive derived values
10. ❌ Recreating charts/components unnecessarily
11. ❌ Loading all images at full resolution
12. ❌ Not using code splitting
13. ❌ Testing only in dev mode
14. ❌ Prerendering personalized content
15. ❌ Calling `parent()` before other async work

---

## Resources

- [SvelteKit Performance Docs](https://svelte.dev/docs/kit/performance)
- [Web.dev Performance](https://web.dev/explore/learn-core-web-vitals)
- [MDN Web Performance](https://developer.mozilla.org/en-US/docs/Web/Performance)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse/)
- [Database Indexing Guide](https://use-the-index-luke.com/)

---

**Remember:** Performance is not just about speed—it's about user experience. A fast app is useless if it's buggy or loses data. Always prioritize correctness, then optimize.
