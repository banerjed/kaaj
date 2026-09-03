<script lang="ts">
  // Nexus's byline and daisyUI store link removed; attribution lives in
  // docs/07-app-provenance.md. Uses daisyUI `footer` (L9).
  import { WebsiteName } from "../../../config"

  const year = new Date().getFullYear()
</script>

<footer class="footer footer-horizontal text-base-content/70 px-6 pb-4">
  <aside>
    <p>© {year} {WebsiteName}</p>
  </aside>
</footer>
