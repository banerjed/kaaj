<script lang="ts">
  import { calendarDate } from "$lib/format"
  import PageHead from "$lib/components/PageHead.svelte"
  import PageTitle from "$lib/components/PageTitle.svelte"
  import RowActions from "$lib/components/RowActions.svelte"
  import EmptyState from "$lib/components/EmptyState.svelte"
  import { formatBytes } from "$lib/documents/format-bytes"

  let { data } = $props()
  const tenantLocale = $derived(data.tenant?.default_locale ?? "en-US")
</script>

<PageHead title="Archived documents" />
<PageTitle
  title="Archived"
  items={[
    { label: "Documents", path: "/documents" },
    { label: "Archived", active: true },
  ]}
/>

<h2 class="mt-6 font-medium">Folders</h2>
{#if data.folders.length === 0}
  <EmptyState icon="lucide--archive" message="No archived folders." />
{:else}
  <div class="card card-border bg-base-100 mt-3">
    <div class="overflow-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Archived</th>
            <th class="w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.folders as f (f.id)}
            <tr class="hover:bg-base-200">
              <td class="text-sm font-medium">{f.name}</td>
              <td>{f.owner_name}</td>
              <td
                >{f.archived_at
                  ? calendarDate(f.archived_at, tenantLocale)
                  : "—"}</td
              >
              <td>
                <RowActions
                  actions={[
                    {
                      kind: "restore",
                      post: {
                        action: "?/restoreFolder",
                        fields: { folder_id: f.id },
                      },
                      label: `Restore ${f.name}`,
                      title: "Restore",
                    },
                  ]}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<h2 class="mt-8 font-medium">Files</h2>
{#if data.documents.length === 0}
  <EmptyState icon="lucide--file-x" message="No archived files." />
{:else}
  <div class="card card-border bg-base-100 mt-3">
    <div class="overflow-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Owner</th>
            <th>Archived</th>
            <th class="w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.documents as d (d.id)}
            <tr class="hover:bg-base-200">
              <td class="text-sm font-medium">{d.file_name}</td>
              <td>{formatBytes(d.file_size_bytes)}</td>
              <td>{d.uploaded_by_name ?? "—"}</td>
              <td
                >{d.archived_at
                  ? calendarDate(d.archived_at, tenantLocale)
                  : "—"}</td
              >
              <td>
                {#if d.folder_id}
                  <RowActions
                    actions={[
                      {
                        kind: "restore",
                        post: {
                          action: "?/restoreDocument",
                          fields: {
                            document_id: d.id,
                            folder_id: d.folder_id,
                          },
                        },
                        label: `Restore ${d.file_name}`,
                        title: "Restore",
                      },
                    ]}
                  />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/if}
