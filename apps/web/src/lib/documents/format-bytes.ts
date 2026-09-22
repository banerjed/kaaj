/** Binary units (KiB/MiB/GiB), matching what the Nexus file-manager reference shows — not a money or locale value, so $lib/format.ts's Intl rules don't apply here. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KiB", "MiB", "GiB", "TiB"]
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}
