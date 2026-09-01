import adapter from "@sveltejs/adapter-node"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    // Emits .br and .gz beside every static asset at build time, which
    // adapter-node's server then serves by Accept-Encoding.
    //
    // Cloudflare sits in front and compresses at the edge, so this is not the
    // thing that makes compression work — it is insurance. It shrinks
    // origin->edge transfer on a cache miss, uses Brotli quality 11 rather
    // than the lower quality an edge compressor picks for speed, and keeps
    // assets compressed anywhere Cloudflare is not in the path: a direct
    // origin hit, a staging box, a local `node build`.
    //
    // It covers STATIC ASSETS ONLY. SSR HTML is generated per request and
    // adapter-node does not compress it — that is Cloudflare's job, and the
    // reason the edge matters more than this flag.
    adapter: adapter({ precompress: true }),
    // allow up to 150kb of style to be inlined with the HTML
    // Faster FCP (First Contentful Paint) by reducing the number of requests
    inlineStyleThreshold: 150000,
  },
  preprocess: vitePreprocess(),
}

export default config
