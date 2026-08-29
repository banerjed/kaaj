<script lang="ts">
  import { page } from "$app/state"
  import {
    getBrowserSupabase,
    type BrowserSupabaseClient,
  } from "$lib/supabase/browser"
  import { onMount } from "svelte"
  import SettingsModule from "../settings_module.svelte"

  let { data } = $props()
  let user = $derived(data.user)
  let supabase: BrowserSupabaseClient | null = $state(null)

  // True if definitely has a password, but can be false if they
  // logged in with oAuth or email link
  // Supabase does not maintain an AMR typedef so we cast through any
  let amr: { method: string }[] | undefined = $derived(data.amr ?? undefined)
  let hasPassword = $derived(
    amr?.find((x) => x.method === "password") ? true : false,
  )
  let usingOAuth = $derived(
    amr?.find((x) => x.method === "oauth") ? true : false,
  )

  let sendBtnDisabled = $state(false)
  let sendBtnText = $state("Send Set Password Email")
  let sentEmail = $state(false)

  onMount(() => {
    supabase = getBrowserSupabase()
  })

  let sendForgotPassword = () => {
    sendBtnDisabled = true
    sendBtnText = "Sending..."

    let email = user?.email
    if (!email || !supabase) {
      sendBtnDisabled = false
      sendBtnText = "Send Forgot Password Email"
      return
    }

    supabase.auth
      .resetPasswordForEmail(email, {
        redirectTo: `${page.url.origin}/auth/callback?next=%2Faccount%2Fsettings%2Freset_password`,
      })
      .then((d) => {
        sentEmail = d.error ? false : true
        sendBtnDisabled = false
        sendBtnText = "Send Forgot Password Email"
      })
  }
</script>

<svelte:head>
  <title>Change Password</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Change Password</h1>

{#if hasPassword}
  <SettingsModule
    title="Change Password"
    editable={true}
    saveButtonTitle="Change Password"
    successTitle="Password Changed"
    successBody="On next sign in, use your new password."
    formTarget="/account/api?/updatePassword"
    fields={[
      {
        id: "newPassword1",
        label: "New Password",
        initialValue: "",
        inputType: "password",
      },
      {
        id: "newPassword2",
        label: "Confirm New Password",
        initialValue: "",
        inputType: "password",
      },
      {
        id: "currentPassword",
        label: "Current Password",
        initialValue: "",
        inputType: "password",
      },
    ]}
  />
{:else}
  <div
    class="card p-6 pb-7 mt-8 max-w-xl flex flex-col md:flex-row shadow-sm max-w-md"
  >
    <div class="flex flex-col gap-y-4">
      {#if usingOAuth}
        <div class="font-bold">Set Password By Email</div>
        <div>
          You use oAuth to sign in ("Sign in with Github" or similar). You can
          continue to access your account using only oAuth if you like!
        </div>
      {:else}
        <div class="font-bold">Change Password By Email</div>
      {/if}
      <div>
        The button below will send you an email at {user?.email} which will allow
        you to set your password.
      </div>
      <button
        class="btn btn-outline btn-wide {sentEmail ? 'hidden' : ''}"
        disabled={sendBtnDisabled}
        onclick={sendForgotPassword}
      >
        {sendBtnText}
      </button>
      <div class="success alert alert-success {sentEmail ? '' : 'hidden'}">
        Sent email! Please check your inbox and use the link to set your
        password.
      </div>
    </div>
  </div>
{/if}
