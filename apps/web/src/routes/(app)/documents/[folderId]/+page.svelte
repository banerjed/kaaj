<script lang="ts">
  import { enhance } from "$app/forms"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
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
  let renaming = $state(false)
  let sharing = $state(false)

  let shareTargetType = $state<"employee" | "role">("employee")

  const breadcrumbItems = $derived(
    data.breadcrumb.map((b, i) => ({
      label: b.name,
      path: i < data.breadcrumb.length - 1 ? `/documents/${b.id}` : undefined,
      active: i === data.breadcrumb.length - 1,
    })),
  )
</script>

<PageHead title={data.folder.name} />

<PageTitle title={data.folder.name} items={breadcrumbItems} />

<div class="mt-3 flex flex-wrap items-center gap-2">
  <StatusBadge tone={folderVisibilityTone(data.folder.visibility)} size="md">
    {data.folder.visibility}
  </StatusBadge>
  {#if data.canEdit}
    <button
      type="button"
      class="btn btn-sm btn-outline border-base-300"
      onclick={() => (creatingFolder = true)}
    >
      <span class="iconify lucide--folder-plus size-4"></span>
      New subfolder
    </button>
    <button
      type="button"
      class="btn btn-sm btn-primary"
      onclick={() => (uploading = true)}
    >
      <span class="iconify lucide--upload size-4"></span>
      Upload
    </button>
  {/if}
  {#if data.canManage}
    <button
      type="button"
      class="btn btn-sm btn-ghost border-base-300"
      onclick={() => (renaming = true)}
    >
      <span class="iconify lucide--pencil size-4"></span>
      Rename
    </button>
    <button
      type="button"
      class="btn btn-sm btn-ghost border-base-300"
      onclick={() => (sharing = true)}
    >
      <span class="iconify lucide--users size-4"></span>
      Share
    </button>
    <form method="POST" action="?/archive" use:enhance={keepValues}>
      <button type="submit" class="btn btn-sm btn-ghost border-base-300">
        <span class="iconify lucide--archive size-4"></span>
        Archive folder
      </button>
    </form>
  {/if}
</div>

{#if data.subfolders.length}
  <h2 class="mt-6 font-medium">Subfolders</h2>
  <div
    class="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
  >
    {#each data.subfolders as f (f.id)}
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
              >{f.document_count} files</span
            >
            <StatusBadge tone={folderVisibilityTone(f.visibility)}
              >{f.visibility}</StatusBadge
            >
          </div>
        </div>
      </a>
    {/each}
  </div>
{/if}

<h2 class="mt-6 font-medium">Files</h2>
{#if data.files.length === 0}
  <EmptyState icon="lucide--file" message="No files in this folder yet." />
{:else}
  <div class="card card-border bg-base-100 mt-3">
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
          {#each data.files as d (d.id)}
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
              <td><StatusBadge tone="neutral">{d.visibility}</StatusBadge></td>
              <td class="flex items-center gap-1">
                <a
                  href="/documents/download/{d.id}"
                  class="btn btn-ghost btn-square btn-sm"
                  aria-label="Download {d.file_name}"
                >
                  <span
                    class="iconify lucide--download text-base-content/80 size-4"
                  ></span>
                </a>
                {#if data.canEdit}
                  <form
                    method="POST"
                    action="?/archiveDocument"
                    use:enhance={keepValues}
                  >
                    <input type="hidden" name="document_id" value={d.id} />
                    <button
                      type="submit"
                      class="btn btn-ghost btn-square btn-sm"
                      aria-label="Archive {d.file_name}"
                    >
                      <span
                        class="iconify lucide--archive text-base-content/80 size-4"
                      ></span>
                    </button>
                  </form>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

{#if data.canManage}
  <h2 class="mt-8 font-medium">Shared with</h2>
  <div class="card card-border bg-base-100 mt-3">
    <div class="card-body gap-3 p-4">
      {#if data.folder.visibility !== "shared"}
        <p class="text-base-content/60 text-sm">
          Set visibility to "shared" to grant specific people or roles access.
        </p>
      {:else if data.shares.length === 0}
        <p class="text-base-content/60 text-sm">
          Nobody has been granted access yet.
        </p>
      {:else}
        <ul class="flex flex-col gap-2">
          {#each data.shares as s (s.id)}
            <li class="flex items-center justify-between gap-2">
              <span class="text-sm">
                {s.shared_with_name ?? `Role: ${s.shared_with_role}`}
                <span class="text-base-content/60">— {s.permission}</span>
              </span>
              <form method="POST" action="?/unshare" use:enhance={keepValues}>
                <input type="hidden" name="share_id" value={s.id} />
                <button type="submit" class="btn btn-ghost btn-xs"
                  >Remove</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

{#if creatingFolder}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">New subfolder</h3>
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

{#if renaming}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Rename folder</h3>
      <form
        method="POST"
        action="?/rename"
        use:enhance={closeOnSuccess(() => (renaming = false))}
        class="mt-4 flex flex-col gap-4"
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input
            name="name"
            required
            maxlength="255"
            value={data.folder.name}
            aria-invalid={err.aria("name")}
            class={`input w-full ${err.input("name")}`}
          />
        </fieldset>
        {#if form?.message}<p class="text-error text-sm">{form.message}</p>{/if}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (renaming = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
      <form
        method="POST"
        action="?/setVisibility"
        use:enhance={keepValues}
        class="border-base-300 mt-4 flex items-center gap-3 border-t pt-4"
      >
        <label class="text-sm" for="visibility-select">Visibility</label>
        <select
          id="visibility-select"
          name="visibility"
          class="select select-sm"
        >
          {#each data.visibilities as v (v)}
            <option value={v} selected={v === data.folder.visibility}
              >{v}</option
            >
          {/each}
        </select>
        <button type="submit" class="btn btn-sm">Update</button>
      </form>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (renaming = false)}
    ></button>
  </dialog>
{/if}

{#if sharing}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <h3 class="text-lg font-medium">Share "{data.folder.name}"</h3>
      <form
        method="POST"
        action="?/share"
        use:enhance={closeOnSuccess(() => (sharing = false))}
        class="mt-4 flex flex-col gap-4"
      >
        <div class="join">
          <button
            type="button"
            class="join-item btn btn-sm"
            class:btn-active={shareTargetType === "employee"}
            onclick={() => (shareTargetType = "employee")}
          >
            Person
          </button>
          <button
            type="button"
            class="join-item btn btn-sm"
            class:btn-active={shareTargetType === "role"}
            onclick={() => (shareTargetType = "role")}
          >
            Role
          </button>
        </div>
        <input type="hidden" name="target_type" value={shareTargetType} />
        {#if shareTargetType === "employee"}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Person</legend>
            <select
              name="target_employee_id"
              class="select w-full"
              aria-invalid={err.aria("target_employee_id")}
            >
              {#each data.people as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </fieldset>
        {:else}
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Role</legend>
            <select
              name="target_role"
              class="select w-full"
              aria-invalid={err.aria("target_role")}
            >
              {#each data.functionalRoles as r (r)}
                <option value={r}>{r}</option>
              {/each}
            </select>
          </fieldset>
        {/if}
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Permission</legend>
          <select name="permission" class="select w-full">
            {#each data.sharePermissions as p (p)}
              <option value={p}>{p}</option>
            {/each}
          </select>
        </fieldset>
        {#if form?.message}<p class="text-error text-sm">{form.message}</p>{/if}
        <div class="modal-action">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (sharing = false)}>Cancel</button
          >
          <button type="submit" class="btn btn-primary">Share</button>
        </div>
      </form>
    </div>
    <button
      type="button"
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (sharing = false)}
    ></button>
  </dialog>
{/if}
