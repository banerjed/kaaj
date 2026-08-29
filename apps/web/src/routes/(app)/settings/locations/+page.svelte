<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"

  let { data } = $props()

  // Intl bound to the TENANT's locale, not the browser's: two people in
  // different countries must read the same schedule the same way.
  const locale = $derived(data.tenant?.default_locale ?? "en-US")

  const currentTimeAt = (timezone: string) => {
    try {
      return new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: timezone,
      }).format(new Date())
    } catch {
      return timezone // unknown IANA zone: show it rather than hide it
    }
  }

  const regionName = (code: string) => {
    try {
      return (
        new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code
      )
    } catch {
      return code
    }
  }

  const addressLines = (l: (typeof data.locations)[number]) =>
    [
      l.address_line1,
      l.address_line2,
      [l.city, l.state, l.postal_code].filter(Boolean).join(", "),
      regionName(l.country),
    ].filter(Boolean) as string[]
</script>

<svelte:head>
  <title>Locations · Kaaj</title>
</svelte:head>

<div class="p-4 lg:p-6">
  <PageTitle
    title="Locations"
    items={[
      { label: "Settings", path: "/settings/locations" },
      { label: "Locations", active: true },
    ]}
  />

  <div class="mt-4 flex items-center justify-between gap-3">
    <p class="text-base-content/70 text-sm">
      {data.locations.length}
      {data.locations.length === 1 ? "location" : "locations"}
    </p>
    <button class="btn btn-primary btn-sm gap-2" disabled>
      <span class="iconify lucide--plus size-4"></span>
      New Location
    </button>
  </div>

  {#if data.locations.length === 0}
    <!-- Empty state per doc 02: what is missing, why it matters, what next. -->
    <div class="card bg-base-100 mt-4 shadow">
      <div class="card-body items-center py-16 text-center">
        <span class="iconify lucide--map-pin text-base-content/30 size-10"
        ></span>
        <p class="mt-3 font-medium">No locations yet</p>
        <p class="text-base-content/70 max-w-md text-sm">
          Locations anchor holidays, payroll policies and each employee's
          working hours. Add your headquarters first.
        </p>
      </div>
    </div>
  {:else}
    <!-- Same rows, two shapes: daisyUI `list` below md, table above (doc 04).
         `md:hidden` is on the wrapper, not on `.list`, which sets display (L10). -->
    <div class="mt-4 md:hidden">
      <ul class="list bg-base-100 rounded-box shadow">
        {#each data.locations as location (location.id)}
          <!-- Exactly two grid children; the badge goes inside the first (L11). -->
          <li class="list-row">
            <div class="list-col-grow">
              <div class="flex items-center gap-2">
                <p class="font-medium">{location.name}</p>
                {#if location.is_headquarters}
                  <div class="badge badge-primary badge-sm">HQ</div>
                {/if}
              </div>
              {#if location.location_code}
                <p class="text-base-content/70 font-mono text-xs">
                  {location.location_code}
                </p>
              {/if}
            </div>

            <p class="list-col-wrap text-base-content/70 text-sm">
              {addressLines(location).join(" · ")}
              <span class="text-base-content/70 block pt-1 text-xs">
                {currentTimeAt(location.timezone)}
                {#if location.currency}· {location.currency}{/if}
              </span>
            </p>
          </li>
        {/each}
      </ul>
    </div>

    <!-- Table: md and up -->
    <div class="card bg-base-100 mt-4 shadow max-md:hidden">
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Timezone</th>
              <th>Local time</th>
              <th>Currency</th>
              <th class="w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each data.locations as location (location.id)}
              <!-- daisyUI 5 dropped the v4 `hover` table modifier; this is
                   Nexus's own string. -->
              <tr class="hover:bg-base-200/40">
                <td>
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{location.name}</span>
                    {#if location.is_headquarters}
                      <div class="badge badge-primary badge-sm">HQ</div>
                    {/if}
                  </div>
                  {#if location.location_code}
                    <p class="text-base-content/70 font-mono text-xs">
                      {location.location_code}
                    </p>
                  {/if}
                </td>
                <td class="text-base-content/70 text-sm">
                  {addressLines(location).join(", ")}
                </td>
                <td class="text-sm">{location.timezone}</td>
                <td class="text-sm tabular-nums">
                  {currentTimeAt(location.timezone)}
                </td>
                <td class="text-sm">
                  {location.currency ?? data.tenant?.default_currency ?? "—"}
                </td>
                <td>
                  <button
                    class="btn btn-ghost btn-sm btn-square"
                    aria-label={`Edit ${location.name}`}
                    disabled
                  >
                    <span class="iconify lucide--pencil size-4"></span>
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
