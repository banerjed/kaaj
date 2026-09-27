<script lang="ts">
  import { page } from "$app/state"

  let { data } = $props()
</script>

<svelte:head>
  <title>Log In</title>
</svelte:head>

<div>
  <h1 class="text-xl font-bold">Get Started</h1>
  <a href={`/login/sign_up${page.url.search}`}
    ><button class="btn btn-primary mt-3 btn-wide">Sign Up</button></a
  >

  <h1 class="text-xl mt-6">Already have an account?</h1>
  <a href={`/login/sign_in${page.url.search}`}
    ><button class="btn btn-outline btn-primary mt-3 btn-wide">Sign In</button
    ></a
  >

  {#if data.sso}
    <h1 class="text-xl mt-6">Sign in through your organization</h1>
    <a href={data.sso.redirectUrl}
      ><button class="btn btn-outline mt-3 btn-wide"
        >Continue with company sign-in</button
      ></a
    >
  {/if}
</div>
