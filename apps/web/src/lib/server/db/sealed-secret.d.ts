export const SEALED_PREFIX: string
export class SealedSecretError extends Error {
  reason: "malformed" | "unknown_key_version" | "not_authentic"
  constructor(reason: "malformed" | "unknown_key_version" | "not_authentic")
}
export function isSealedRef(ref: unknown): ref is string
export function sealConnectionUrl(
  url: string,
  tenantId: string,
  keyVersion: number,
  key: Buffer,
): string
export function openConnectionUrl(
  ref: string,
  tenantId: string,
  keyFor: (version: number) => Buffer | undefined,
): string
export function parseKeyRing(raw: string | undefined): Map<number, Buffer>
export function newestKey(byVersion: Map<number, Buffer>): {
  version: number
  key: Buffer
}
