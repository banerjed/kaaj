<script lang="ts">
  import { enhance } from "$app/forms"
  import { closeOnSuccess } from "$lib/form-enhance"
  import { fieldErrors } from "$lib/form-errors"
  import { calendarDate } from "$lib/format"
  import PageHead from "$lib/components/PageHead.svelte"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import { folderVisibilityTone } from "$lib/components/status-tone"
  import { formatBytes } from "$lib/documents/format-bytes"

  let { data, form } = $props()
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
  const err = $derived(fieldErrors(form))

  let creatingFolder = $state(false)
  let uploading = $state(false)

  let q = $state("")
  let owner = $state("")
  $effect(() => {
    q = data.filters.q
    owner = data.filters.owner
  })

  const totalPages = $derived(Math.max(1, Math.ceil(data.total / 25)))

  function pageUrl(page: number): string {
    const params = new URLSearchParams({ q, owner })
    for (const [k, v] of [...params]) if (v === "") params.delete(k)
    if (page > 1) params.set("page", String(page))
    const qs = params.toString()
    return qs ? `?${qs}` : "?"
  }
</script>

<PageHead title="Documents" />

<div class="flex items-center justify-between gap-3">
  <PageTitle title="Documents" />
  <div class="inline-flex items-center gap-2">
    <a href="/documents/archived" class="btn btn-sm btn-ghost border-base-300">
      <span class="iconify lucide--archive size-4"></span>
      Archived
    </a>
    <button
      type="button"
      class="btn btn-sm btn-outline border-base-300"
      onclick={() => (creatingFolder = true)}
    >
      <span class="iconify lucide--folder-plus size-4"></span>
      New folder
    </button>
    <button
      type="button"
      class="btn btn-sm btn-primary"
      onclick={() => (uploading = true)}
    >
      <span class="iconify lucide--upload size-4"></span>
      Upload
    </button>
  </div>
</div>

<h2 class="mt-6 font-medium">Folders</h2>
<div
  class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
>
  {#each data.folders as f (f.id)}
    <a
      href="/documents/{f.id}"
      class="card card-border bg-base-100 hover:shadow-md"
    >
      <div class="card-body gap-2 p-4">
        <div class="flex items-center gap-2">
          <div
            class="rounded-box bg-primary/5 text-primary flex items-center p-1.5"
          >
            <span class="iconify lucide--folder size-5"></span>
          </div>
          <span class="truncate text-sm font-medium">{f.name}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-base-content/60 text-xs"
            >{f.document_count}
            {f.document_count === 1 ? "file" : "files"}</span
          >
          <StatusBadge tone={folderVisibilityTone(f.visibility)}
            >{f.visibility}</StatusBadge
          >
        </div>
      </div>
    </a>
  {:else}
    <div class="sm:col-span-2 lg:col-span-3 xl:col-span-4">
      <EmptyState
        icon="lucide--folder-open"
        message="No folders yet. Create one to get started."
      />
    </div>
  {/each}
</div>

<h2 class="mt-8 font-medium">Search files</h2>
<div class="card card-border bg-base-100 mt-3">
  <div class="card-body gap-4 p-4">
    <form method="GET" class="flex flex-wrap items-center gap-3">
      <label class="input input-sm">
        <span class="iconify lucide--search text-base-content/80 size-4"></span>
        <input
          type="search"
          name="q"
          bind:value={q}
          class="grow"
          placeholder="Search file names"
        />
      </label>
      <select name="owner" bind:value={owner} class="select select-sm w-48">
        <option value="">Any owner</option>
        {#each data.people as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
      <button type="submit" class="btn btn-sm">Search</button>
    </form>

    {#if !data.hasFilters}
      <p class="text-base-content/60 text-sm">
        Search across every file you can see, by name or owner.
      </p>
    {:else if data.results.length === 0}
      <EmptyState
        icon="lucide--file-search"
        message="No files match that search."
      />
    {:else}
      <div class="overflow-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Created</th>
              <th>Owner</th>
              <th>Visibility</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each data.results as d (d.id)}
              <tr class="hover:bg-base-200">
                <td class="flex items-center gap-3 truncate">
                  <div
                    class="bg-base-200 text-base-content/80 rounded-box flex items-center p-1.5"
                  >
                    <span class="iconify lucide--file size-5"></span>
                  </div>
                  <span class="text-sm font-medium">{d.file_name}</span>
                </td>
                <td>{formatBytes(d.file_size_bytes)}</td>
                <td>{calendarDate(d.created_at, tenantLocale)}</td>
                <td>{d.uploaded_by_name ?? "—"}</td>
                <td><StatusBadge tone="neutral">{d.visibility}</StatusBadge></td
                >
                <td>
                  <a
                    href="/documents/download/{d.id}"
                    class="btn btn-ghost btn-square btn-sm"
                    aria-label="Download {d.file_name}"
                  >
                    <span
                      class="iconify lucide--download text-base-content/80 size-4"
                    ></span>
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if totalPages > 1}
        <div class="join justify-center">
          {#each Array(totalPages) as _, i (i)}
            <a
              href={pageUrl(i + 1)}
              class="join-item btn btn-sm"
              class:btn-active={data.page === i + 1}
            >
              {i + 1}
            </a>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if creatingFolder}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New folder</h3>
      <form
        method="POST"
        action="?/createFolder"
        use:enhance={closeOnSuccess(() => (creatingFolder = false))}
        class="mt-4 flex flex-col gap-4"
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="name"
            required
            maxlength="255"
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Visibility</legend>
          <select name="visibility" class="select w-full">
            {#each data.visibilities as v (v)}
              <option value={v}>{v}</option>
            {/each}
          </select>
        </fieldset>
        {#if form?.message}<p class="text-error text-sm">{form.message}</p>{/if}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (creatingFolder = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (creatingFolder = false)}
    ></button>
  </dialog>
{/if}

{#if uploading}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Upload a file</h3>
      <form
        method="POST"
        action="?/upload"
        enctype="multipart/form-data"
        use:enhance={closeOnSuccess(() => (uploading = false))}
        class="mt-4 flex flex-col gap-4"
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Folder</legend>
          <select name="folder_id" class="select w-full">
            <option value="">My Files (default)</option>
            {#each data.folders as f (f.id)}
              <option value={f.id}>{f.name}</option>
            {/each}
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">File</legend>
          <input
            type="file"
            name="file"
            required
            aria-invalid={err.aria("file")}
            class={`file-input w-full ${err.input("file")}`}
          />
        </fieldset>
        {#if form?.message}<p class="text-error text-sm">{form.message}</p>{/if}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (uploading = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Upload</button>
        </div>
      </form>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (uploading = false)}
    ></button>
  </dialog>
{/if}
