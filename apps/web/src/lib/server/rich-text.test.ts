import { describe, expect, it } from "vitest"
import { sanitizeRichText } from "./rich-text"

/**
 * TESTPLAN.md ADV-01/ADV-09 — this is the sanitizer both `FormReader.html()`
 * (write) and `ticketing.repo.ts` (read) depend on for every rich-text
 * field (ticket descriptions and comments today). It had no test of its own
 * before this — a guard never observed failing is not evidence (L48).
 */
describe("sanitizeRichText", () => {
  it("strips a script tag entirely", () => {
    expect(sanitizeRichText("<script>alert(1)</script>")).toBe("")
  })

  it("strips an event handler attribute, keeping the tag if allowed", () => {
    expect(sanitizeRichText('<p onclick="alert(1)">hi</p>')).toBe("<p>hi</p>")
  })

  it("strips an img tag, including an onerror payload", () => {
    expect(sanitizeRichText('<img src=x onerror="alert(1)">')).toBe("")
  })

  it("strips a javascript: URI on an anchor", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe("x")
  })

  it("keeps the allowed formatting tags", () => {
    expect(
      sanitizeRichText("<b>bold</b> <i>italic</i> <ul><li>x</li></ul>"),
    ).toBe("<b>bold</b> <i>italic</i> <ul><li>x</li></ul>")
  })

  it("keeps a span with an allowed color from the fixed palette", () => {
    const html = '<span style="color:#2563eb">blue</span>'
    expect(sanitizeRichText(html)).toBe(html)
  })

  it("strips a color outside the fixed palette", () => {
    expect(sanitizeRichText('<span style="color:#ff00ff">x</span>')).toBe(
      "<span>x</span>",
    )
  })

  it("strips a style property outside color/font-size", () => {
    expect(
      sanitizeRichText(
        '<span style="position:fixed;top:0;color:#000000">x</span>',
      ),
    ).toBe('<span style="color:#000000">x</span>')
  })

  it("strips an allowed tag's disallowed attribute", () => {
    expect(sanitizeRichText('<p style="color:#2563eb">x</p>')).toBe("<p>x</p>")
  })
})
