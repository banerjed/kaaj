import sanitizeHtml from "sanitize-html"

/**
 * The only markup a `RichTextEditor` (`$lib/components/RichTextEditor.svelte`)
 * can ever produce: five formatting tags, plus a `span` carrying nothing but
 * a `color` or `font-size` inline style, both from fixed, machine-generated
 * value sets (a six-swatch palette and a four-value `<select>`) — a user
 * never free-types a style value. Applied on write (`FormReader.html()`) AND
 * on read (`ticketing.repo.ts`), the same split as `sealField`/`openField`.
 *
 * Keep in sync with `RichTextEditor.svelte`'s `COLORS` — a swatch this list
 * doesn't recognize gets silently stripped on save, not rejected up front.
 */
const COLORS = [
  "#2563eb", // blue
  "#000000", // black
  "#dc2626", // red
  "#92400e", // brown
  "#7e22ce", // purple
  "#ea580c", // orange
]
const FONT_SIZES = ["0.85em", "1em", "1.25em", "1.75em"]

/** `execCommand('foreColor', ...)` with `styleWithCSS` on renders as `rgb(r, g, b)`, not the hex it was called with — whitespace is browser-dependent. */
function hexToRgbPattern(hex: string): RegExp {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return new RegExp(`^rgb\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\s*\\)$`)
}

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "b",
    "strong",
    "i",
    "em",
    "s",
    "strike",
    "del",
    "ul",
    "ol",
    "li",
    "br",
    "p",
    "span",
  ],
  allowedAttributes: {
    span: ["style"],
  },
  allowedStyles: {
    span: {
      color: COLORS.flatMap((hex) => [
        new RegExp(`^${hex}$`, "i"),
        hexToRgbPattern(hex),
      ]),
      "font-size": FONT_SIZES.map(
        (s) => new RegExp(`^${s.replace(".", "\\.")}$`),
      ),
    },
  },
  disallowedTagsMode: "discard",
}

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS)
}
