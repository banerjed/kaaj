import { describe, expect, it } from "vitest"
import { isSsoSatisfied } from "./sso-enforcement"

const noAuth = { amr: null, identityProvider: null }

describe("isSsoSatisfied", () => {
  it("always passes when the tenant has no SSO requirement", () => {
    expect(
      isSsoSatisfied(
        { ssoRequired: false, ssoProviderType: null, ssoProviderRef: null },
        noAuth,
      ),
    ).toBe(true)
  })

  it("SAML: passes when amr shows an SSO sign-in", () => {
    const tenant = {
      ssoRequired: true,
      ssoProviderType: "saml" as const,
      ssoProviderRef: "11111111-1111-1111-1111-111111111111",
    }
    expect(
      isSsoSatisfied(tenant, {
        amr: [{ method: "sso/saml", timestamp: 0 }],
        identityProvider: null,
      }),
    ).toBe(true)
  })

  it("SAML: refuses a password sign-in when SSO is required", () => {
    const tenant = {
      ssoRequired: true,
      ssoProviderType: "saml" as const,
      ssoProviderRef: "11111111-1111-1111-1111-111111111111",
    }
    expect(
      isSsoSatisfied(tenant, {
        amr: [{ method: "password", timestamp: 0 }],
        identityProvider: null,
      }),
    ).toBe(false)
  })

  it("SAML: refuses a session with no amr at all", () => {
    const tenant = {
      ssoRequired: true,
      ssoProviderType: "saml" as const,
      ssoProviderRef: "11111111-1111-1111-1111-111111111111",
    }
    expect(isSsoSatisfied(tenant, noAuth)).toBe(false)
  })

  it("OIDC: passes when the session's identity provider matches the configured one", () => {
    const tenant = {
      ssoRequired: true,
      ssoProviderType: "oidc" as const,
      ssoProviderRef: "custom:acme",
    }
    expect(
      isSsoSatisfied(tenant, { amr: null, identityProvider: "custom:acme" }),
    ).toBe(true)
  })

  it("OIDC: refuses a different provider (e.g. GitHub OAuth) even though amr looks the same shape", () => {
    const tenant = {
      ssoRequired: true,
      ssoProviderType: "oidc" as const,
      ssoProviderRef: "custom:acme",
    }
    expect(
      isSsoSatisfied(tenant, { amr: null, identityProvider: "github" }),
    ).toBe(false)
  })

  it("passes rather than locks everyone out on a malformed config (type set, ref missing)", () => {
    expect(
      isSsoSatisfied(
        { ssoRequired: true, ssoProviderType: "saml", ssoProviderRef: null },
        noAuth,
      ),
    ).toBe(true)
  })
})
