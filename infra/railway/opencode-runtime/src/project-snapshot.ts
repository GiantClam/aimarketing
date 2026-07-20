import { isValidRuntimeProjectSnapshot, type RuntimeProjectSnapshot } from "../../../../lib/ai-runtime/contracts.js"

export function parseRuntimeProjectSnapshot(raw: string): RuntimeProjectSnapshot | null {
  try {
    const value = JSON.parse(raw)
    return isValidRuntimeProjectSnapshot(value) ? value : null
  } catch {
    return null
  }
}
