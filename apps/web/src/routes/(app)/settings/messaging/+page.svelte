<script lang="ts">
  import PageTitle from "$lib/components/PageTitle.svelte"
  import PageHead from "$lib/components/PageHead.svelte"
  import StatusBadge from "$lib/components/StatusBadge.svelte"
  import ModalActions from "$lib/components/ModalActions.svelte"
  import RowActions from "$lib/components/RowActions.svelte"
  import type { RowAction } from "$lib/components/row-actions"
  import { fieldErrors } from "$lib/form-errors"
  import { closeOnSuccess, keepValues } from "$lib/form-enhance"
  import { instant } from "$lib/format"
  import { enhance } from "$app/forms"

  let { data, form } = $props()

  const err = $derived(fieldErrors(form))
  const fmt = $derived({
    locale: data.tenant?.default_locale ?? "en-US",
    currency: "",
    timezone: data.timezone,
  })

  let addingEmail = $state(false)
  let registering = $state(false)
  let buying = $state(false)
  let addingOptOut = $state(false)

  const endpointActions = (e: (typeof data.endpoints)[number]): RowAction[] =>
    data.mayManageEndpoints && e.is_active
      ? [
          {
            kind: "archive",
            post: { action: "?/archiveEndpoint", fields: { id: e.id } },
            label: `Retire ${e.address}`,
            title: "Retire",
          },
        ]
      : []

  const optOutActions = (o: (typeof data.optOuts)[number]): RowAction[] =>
    data.mayManageOptOuts && !o.revoked_at
      ? [
          {
            kind: "archive",
            post: { action: "?/revokeOptOut", fields: { id: o.id } },
            label: `Lift the opt-out for ${o.address}`,
            title: "Lift",
          },
        ]
      : []

  const registrationTone = (s: string) =>
    s === "verified" ? "positive" : s === "pending" ? "caution" : "neutral"
</script>

<PageHead title="Messaging settings" />

<div class="p-4 lg:p-6">
  <PageTitle
    title="Messaging"
    items={[
      { label: "Settings", path: "/settings/company" },
      { label: "Messaging", active: true },
    ]}
  />
  <p class="text-base-content/70 mt-1 text-sm">
    The numbers and inbound addresses this firm sends from and receives on,
    carried by Bird, and the people who asked not to be contacted.
  </p>

  {#if form?.created}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Added {form.created}.</span>
    </div>
  {:else if form?.archived}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Retired. Messages to it are no longer delivered here.</span>
    </div>
  {:else if form?.optedOut}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>{form.optedOut} will not be contacted on that channel.</span>
    </div>
  {:else if form?.revoked}
    <div role="status" class="alert alert-success mt-4">
      <span class="iconify lucide--check size-5"></span>
      <span>Opt-out lifted.</span>
    </div>
  {:else if form?.message}
    <div role="alert" class="alert alert-error mt-4">
      <span class="iconify lucide--circle-alert size-5"></span>
      <span>{form.message}</span>
    </div>
  {/if}

  <!-- Endpoints ---------------------------------------------------------- -->
  <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
    <h2 class="font-display text-lg">Numbers and addresses</h2>
    {#if data.mayManageEndpoints}
      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-sm gap-2"
          onclick={() => (addingEmail = true)}
          disabled={!data.inboundDomain}
          title={data.inboundDomain
            ? undefined
            : "No inbound email domain is configured on this server"}
        >
          <span class="iconify lucide--mail-plus size-4"></span>
          Add email address
        </button>
        <button class="btn btn-sm gap-2" onclick={() => (registering = true)}>
          <span class="iconify lucide--phone-incoming size-4"></span>
          Register a number
        </button>
        <button
          class="btn btn-primary btn-sm gap-2"
          onclick={() => (buying = true)}
          disabled={!data.providerConfigured}
          title={data.providerConfigured
            ? undefined
            : "Bird is not configured on this server"}
        >
          <span class="iconify lucide--shopping-cart size-4"></span>
          Buy a number
        </button>
      </div>
    {/if}
  </div>

  <div class="card bg-base-100 mt-3 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th class="w-20">Channel</th>
            <th>Address</th>
            <th>Label</th>
            <th>Registration</th>
            <th>Since</th>
            <th class="w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.endpoints as e (e.id)}
            <tr
              class="hover:bg-base-200/40"
              class:text-base-content={!e.is_active}
              class:opacity-60={!e.is_active}
            >
              <td
                ><StatusBadge tone="neutral" capitalize={false}
                  >{e.channel === "sms" ? "SMS" : "Email"}</StatusBadge
                ></td
              >
              <td class="font-mono text-sm">
                {e.address}
                {#if !e.is_active}
                  <span class="text-base-content/70 text-xs">(retired)</span>
                {/if}
              </td>
              <td>{e.label}</td>
              <td>
                {#if e.channel === "sms"}
                  <StatusBadge tone={registrationTone(e.registration_status)}
                    >{e.registration_status}</StatusBadge
                  >
                  {#if e.country_code}
                    <span class="text-base-content/70 ml-1 text-xs"
                      >{e.country_code}</span
                    >
                  {/if}
                {:else}
                  <span class="text-base-content/70 text-xs">catch-all</span>
                {/if}
              </td>
              <td class="text-sm">{instant(e.created_at, fmt)}</td>
              <td><RowActions actions={endpointActions(e)} /></td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="text-base-content/70 text-center text-sm">
                Nothing yet. Add an inbound email address or a number to start
                receiving.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Opt-outs ------------------------------------------------------------ -->
  <div class="mt-8 flex flex-wrap items-center justify-between gap-3">
    <h2 class="font-display text-lg">Do not contact</h2>
    {#if data.mayManageOptOuts}
      <button class="btn btn-sm gap-2" onclick={() => (addingOptOut = true)}>
        <span class="iconify lucide--user-x size-4"></span>
        Add opt-out
      </button>
    {/if}
  </div>
  <p class="text-base-content/70 mt-1 text-sm">
    A STOP reply, an unsubscribe, or a note by staff. Every send checks this
    list first. Showing the most recent 100.
  </p>

  <div class="card bg-base-100 mt-3 shadow">
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th class="w-20">Channel</th>
            <th>Address</th>
            <th>Reason</th>
            <th>Noted by</th>
            <th>When</th>
            <th class="w-24">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.optOuts as o (o.id)}
            <tr class="hover:bg-base-200/40" class:opacity-60={!!o.revoked_at}>
              <td
                ><StatusBadge tone="neutral" capitalize={false}
                  >{o.channel === "sms" ? "SMS" : "Email"}</StatusBadge
                ></td
              >
              <td class="font-mono text-sm">{o.address}</td>
              <td>
                {o.reason}
                {#if o.revoked_at}
                  <span class="text-base-content/70 text-xs">
                    (lifted {instant(o.revoked_at, fmt)})
                  </span>
                {/if}
              </td>
              <td class="text-sm">{o.noted_by_name ?? "Automatic"}</td>
              <td class="text-sm">{instant(o.created_at, fmt)}</td>
              <td><RowActions actions={optOutActions(o)} /></td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="text-base-content/70 text-center text-sm">
                Nobody has opted out.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

{#if addingEmail}
  <div class="modal modal-open" role="dialog" aria-label="Add email address">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Add an inbound email address</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        A random address at <code>{data.inboundDomain}</code>. Mail sent to it
        files here; give it out, or forward an existing inbox to it.
      </p>
      <form
        method="POST"
        action="?/addEmailAddress"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (addingEmail = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Label</legend>
          <input
            name="label"
            aria-invalid={err.aria("label")}
            class={`input w-full ${err.input("label")}`}
            placeholder="e.g. Support inbox"
            maxlength="120"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Address prefix (optional)</legend>
          <input
            name="prefix"
            aria-invalid={err.aria("prefix")}
            class={`input w-full ${err.input("prefix")}`}
            placeholder={data.companyName}
            maxlength="24"
          />
          <p class="label">
            The readable part before the random token, e.g. <code
              >support-k7m2…@{data.inboundDomain}</code
            >.
          </p>
        </fieldset>
        <ModalActions
          onCancel={() => (addingEmail = false)}
          submitLabel="Add"
        />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (addingEmail = false)}
    ></button>
  </div>
{/if}

{#if registering}
  <div class="modal modal-open" role="dialog" aria-label="Register a number">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Register a number you already own</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        A number already in the Bird workspace — bought in Bird's dashboard, or
        ported in. SMS to it will file here.
      </p>
      <form
        method="POST"
        action="?/registerNumber"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (registering = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Number (+country code)</legend>
          <input
            name="address"
            inputmode="tel"
            aria-invalid={err.aria("address")}
            class={`input w-full ${err.input("address")}`}
            placeholder="+1 212 555 0100"
            required
          />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Label</legend>
          <input
            name="label"
            aria-invalid={err.aria("label")}
            class={`input w-full ${err.input("label")}`}
            placeholder="e.g. Main line"
            maxlength="120"
            required
          />
        </fieldset>
        <div class="grid gap-4 sm:grid-cols-2">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Country (ISO code)</legend>
            <input
              name="country_code"
              aria-invalid={err.aria("country_code")}
              class={`input w-full ${err.input("country_code")}`}
              placeholder="US"
              maxlength="2"
            />
          </fieldset>
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Registration</legend>
            <select
              name="registration_status"
              class={`select w-full ${err.select("registration_status")}`}
            >
              {#each data.registrationStatuses as s (s)}
                <option value={s}>{s}</option>
              {/each}
            </select>
          </fieldset>
        </div>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Bird number id (optional)</legend>
          <input
            name="provider_ref"
            aria-invalid={err.aria("provider_ref")}
            class={`input w-full font-mono ${err.input("provider_ref")}`}
            placeholder="nda_…"
            maxlength="80"
          />
        </fieldset>
        <ModalActions
          onCancel={() => (registering = false)}
          submitLabel="Register"
        />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (registering = false)}
    ></button>
  </div>
{/if}

{#if buying}
  <div class="modal modal-open" role="dialog" aria-label="Buy a number">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Buy a number from Bird</h3>
      <p class="text-base-content/70 mt-1 text-sm">
        A local number is about 1 USD a month, toll-free about 2 USD. In the US
        a local number also needs 10DLC registration before it can send.
      </p>

      <form
        method="POST"
        action="?/searchNumbers"
        class="mt-4 flex items-end gap-2"
        use:enhance={keepValues}
      >
        <fieldset class="fieldset flex-1">
          <legend class="fieldset-legend">Country (ISO code)</legend>
          <input
            name="country_code"
            aria-invalid={err.aria("country_code")}
            class={`input w-full ${err.input("country_code")}`}
            placeholder="US"
            maxlength="2"
            value={form?.searchedCountry ?? ""}
            required
          />
        </fieldset>
        <button type="submit" class="btn btn-sm">Search</button>
      </form>

      {#if form?.numbers}
        {#if form.numbers.length === 0}
          <p class="text-base-content/70 mt-4 text-sm">
            Bird has nothing on sale for {form.searchedCountry} right now.
          </p>
        {:else}
          <form
            method="POST"
            action="?/orderNumber"
            class="mt-4 grid gap-4"
            use:enhance={closeOnSuccess(() => (buying = false))}
          >
            <input
              type="hidden"
              name="country_code"
              value={form.searchedCountry}
            />
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Number</legend>
              <select
                name="number"
                class={`select w-full font-mono ${err.select("number")}`}
                required
              >
                {#each form.numbers as n (n.number)}
                  <option value={n.number}>{n.number} · {n.number_type}</option>
                {/each}
              </select>
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Label</legend>
              <input
                name="label"
                aria-invalid={err.aria("label")}
                class={`input w-full ${err.input("label")}`}
                placeholder="e.g. Main line"
                maxlength="120"
                required
              />
            </fieldset>
            <ModalActions onCancel={() => (buying = false)} submitLabel="Buy" />
          </form>
        {/if}
      {/if}
      {#if !form?.numbers}
        <div class="modal-action">
          <button type="button" class="btn" onclick={() => (buying = false)}
            >Cancel</button
          >
        </div>
      {/if}
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (buying = false)}
    ></button>
  </div>
{/if}

{#if addingOptOut}
  <div class="modal modal-open" role="dialog" aria-label="Add opt-out">
    <div class="modal-box max-w-lg">
      <h3 class="text-lg font-medium">Do not contact</h3>
      <form
        method="POST"
        action="?/addOptOut"
        class="mt-4 grid gap-4"
        use:enhance={closeOnSuccess(() => (addingOptOut = false))}
      >
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Channel</legend>
          <select
            name="channel"
            class={`select w-full ${err.select("channel")}`}
          >
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Number or email address</legend>
          <input
            name="address"
            aria-invalid={err.aria("address")}
            class={`input w-full ${err.input("address")}`}
            placeholder="+1 212 555 0100 or name@example.com"
            required
          />
        </fieldset>
        <ModalActions
          onCancel={() => (addingOptOut = false)}
          submitLabel="Add"
        />
      </form>
    </div>
    <button
      class="modal-backdrop"
      aria-label="Close"
      onclick={() => (addingOptOut = false)}
    ></button>
  </div>
{/if}
