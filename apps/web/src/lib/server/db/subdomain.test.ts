import { describe, expect, it } from "vitest"
import { extractSubdomain } from "./subdomain"

describe("extractSubdomain", () => {
  it("returns null for a bare root domain", () => {
    expect(extractSubdomain("platform.com")).toBeNull()
  })

  it("returns the first label of a real tenant subdomain", () => {
    expect(extractSubdomain("acme.platform.com")).toBe("acme")
  })

  it("strips a port before resolving", () => {
    expect(extractSubdomain("acme.platform.com:5173")).toBe("acme")
  })

  it("returns null for plain localhost", () => {
    expect(extractSubdomain("localhost")).toBeNull()
    expect(extractSubdomain("localhost:5173")).toBeNull()
  })

  it("treats a .localhost subdomain as a tenant, per RFC 6761", () => {
    expect(extractSubdomain("acme.localhost")).toBe("acme")
    expect(extractSubdomain("acme.localhost:5173")).toBe("acme")
  })

  it("returns null for a loopback IP address, not a fake subdomain", () => {
    expect(extractSubdomain("127.0.0.1")).toBeNull()
    expect(extractSubdomain("127.0.0.1:54322")).toBeNull()
    expect(extractSubdomain("::1")).toBeNull()
  })

  it("returns null for a nested .localhost hostname (unsupported, not a security gap)", () => {
    expect(extractSubdomain("sub.acme.localhost")).toBeNull()
  })
})
