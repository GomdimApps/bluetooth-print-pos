/**
 * Single place diagnostic output is routed through, instead of scattering
 * raw `console.*` calls across transports.
 *
 * Deliberately not a real logging library (e.g. pino): pino's own browser
 * build has no file transports/workers/pretty-printing (those are
 * Node-only) — in a browser it's effectively `console.*` with formatting
 * on top, not worth a new runtime dependency in a package that's
 * "entirely in the browser, no Node at runtime" and whose bundle already
 * trips webpack's size-warning threshold (see AGENTS.md). If that
 * calculus ever changes, swap this file's implementation — no call site
 * elsewhere needs to change.
 */
export const logger = {
  warn(message: string): void {
    console.warn(message)
  },
}
