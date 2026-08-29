<script lang="ts">
  import { browser } from "$app/environment"
  import { onMount } from "svelte"
  import Fuse from "fuse.js"
  import type { FuseResult } from "fuse.js"
  import { replaceState } from "$app/navigation"
  import { dev } from "$app/environment"
  import { page } from "$app/state"

  const fuseOptions = {
    keys: [
      { name: "title", weight: 3 },
      { name: "description", weight: 2 },
      { name: "body", weight: 1 },
    ],
    ignoreLocation: true,
    threshold: 0.3,
  }

  let fuse: Fuse<SearchDocument> | undefined = $state()
  let loadPromise: Promise<void> | undefined
  let searchInput: HTMLInputElement | undefined = $state()
  let resultLinks: HTMLAnchorElement[] = $state([])

  let loading = $state(false)
  let error = $state(false)
  function ensureSearchLoaded() {
    if (fuse || loadPromise) {
      return loadPromise
    }

    loading = true
    error = false
    loadPromise = fetch("/search/api.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const searchData = await response.json()
        if (searchData?.index && searchData.indexData) {
          const index = Fuse.parseIndex<SearchDocument>(searchData.index)
          fuse = new Fuse<SearchDocument>(
            searchData.indexData,
            fuseOptions,
            index,
          )
        }
      })
      .catch((e) => {
        console.error("Failed to load search data", e)
        error = true
      })
      .finally(() => {
        loading = false
        loadPromise = undefined
      })

    return loadPromise
  }

  onMount(() => {
    const syncFromHash = () => {
      const hashQuery = decodeURIComponent(window.location.hash.slice(1))
      if (hashQuery !== searchQuery) {
        searchQuery = hashQuery
      }
    }

    syncFromHash()
    searchInput?.focus()

    if (searchQuery.trim()) {
      void ensureSearchLoaded()
    }

    window.addEventListener("hashchange", syncFromHash)
    return () => window.removeEventListener("hashchange", syncFromHash)
  })

  // The shape of an indexed document, i.e. what /search/api.json contains.
  type SearchDocument = {
    title: string
    description: string
    body: string
    path: string
  }
  // fuse.search() returns the documents wrapped in FuseResult, which is where
  // `result.item` in the markup below comes from.
  let results: FuseResult<SearchDocument>[] = $state([])

  // searchQuery is the URL hash minus the "#" at the beginning if present.
  let searchQuery = $state(
    browser ? decodeURIComponent(window.location.hash.slice(1)) : "",
  )
  $effect(() => {
    const query = searchQuery.trim()
    focusItem = 0
    resultLinks = []

    if (!query) {
      results = []
      return
    }

    void ensureSearchLoaded()

    if (!fuse) {
      results = []
      return
    }

    const timeout = setTimeout(() => {
      results = fuse ? fuse.search(query, { limit: 20 }) : []
    }, 120)

    return () => clearTimeout(timeout)
  })
  // Update the URL hash when searchQuery changes so the browser can bookmark/share the search results
  $effect(() => {
    if (!browser) {
      return
    }

    const encodedQuery = encodeURIComponent(searchQuery)
    const nextHash = encodedQuery ? `#${encodedQuery}` : ""
    if (window.location.hash !== nextHash) {
      replaceState(
        `${page.url.pathname}${page.url.search}${nextHash}`,
        page.state,
      )
    }
  })

  let focusItem = $state(0)
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      searchQuery = ""
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      focusItem += event.key === "ArrowDown" ? 1 : -1
      if (focusItem < 0) {
        focusItem = 0
      } else if (focusItem > results.length) {
        focusItem = results.length
      }
      if (focusItem === 0) {
        searchInput?.focus()
      } else {
        resultLinks[focusItem - 1]?.focus()
      }
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<svelte:head>
  <title>Search</title>
  <meta name="description" content="Search our website." />
</svelte:head>

<div class="py-8 lg:py-12 px-6 max-w-lg mx-auto">
  <div
    class="text-3xl lg:text-5xl font-medium text-primary flex gap-3 items-baseline text-center place-content-center"
  >
    <div
      class="text-center leading-relaxed font-bold bg-clip-text text-transparent bg-linear-to-r from-primary to-accent"
    >
      Search
    </div>
  </div>
  <label class="input input-bordered flex items-center gap-2 mt-10 mb-5 w-full">
    <input
      id="search-input"
      type="text"
      class="grow w-full"
      placeholder="Search"
      bind:value={searchQuery}
      bind:this={searchInput}
      onfocus={() => {
        focusItem = 0
        void ensureSearchLoaded()
      }}
      aria-label="Search input"
    />
  </label>

  {#if loading && searchQuery.length > 0}
    <div class="text-center mt-10 text-accent text-xl">Loading...</div>
  {/if}

  {#if error}
    <div class="text-center mt-10 text-accent text-xl">
      Error connecting to search. Please try again later.
    </div>
  {/if}

  {#if !loading && searchQuery.length > 0 && results.length === 0 && !error}
    <div class="text-center mt-10 text-accent text-xl">No results found</div>
    {#if dev}
      <div class="text-center mt-4 font-mono">
        Development mode only message: if you're missing content, rebuild your
        local search index with `npm run build`
      </div>
    {/if}
  {/if}

  <div>
    {#each results as result, i (result.item.path)}
      <a
        href={result.item.path || "/"}
        id="search-result-{i + 1}"
        bind:this={resultLinks[i]}
        class="card my-6 bg-white shadow-xl flex-row overflow-hidden focus:mx-[-10px] focus:my-[-5px] focus:border-4 focus:border-secondary"
      >
        <div class="flex-none w-6 md:w-32 bg-secondary"></div>
        <div class="py-6 px-6">
          <div class="text-xl">{result.item.title}</div>
          <div class="text-sm text-accent">
            {result.item.path}
          </div>
          <div class="text-slate-500">{result.item.description}</div>
        </div>
      </a>
    {/each}
  </div>

  <div></div>
</div>
