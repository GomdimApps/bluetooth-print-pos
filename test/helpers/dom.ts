import { JSDOM } from 'jsdom'

const DOM_GLOBALS = ['document', 'window', 'Image', 'HTMLImageElement', 'HTMLCanvasElement', 'Blob', 'URL'] as const
type DomGlobalKey = (typeof DOM_GLOBALS)[number]

export interface DomFixtures {
  /**
   * Wraps `bytes` in a real `Blob` whose `URL.createObjectURL()` result
   * actually decodes to those bytes in this jsdom instance. jsdom doesn't
   * implement `createObjectURL()`/blob: URL decoding at all (by design), so
   * `withDom()` polyfills it — but only for blobs created through this
   * function, since only here are the bytes known synchronously (a real
   * `createObjectURL()` call is synchronous; reading a `Blob`'s bytes back
   * out isn't). Functionally equivalent for `loadImageFromSource()`'s Blob
   * branch, which only cares that `img.src = <the url>` decodes to the
   * right pixels.
   */
  createLoadableBlob(bytes: Uint8Array, type: string): Blob
}

/**
 * Installs a jsdom Window's DOM globals (document/Image/canvas/Blob/URL) for
 * the duration of `fn`, then restores whatever was there before (nothing, in
 * every test file that uses this) — so DOM-free test files never see a
 * leaked global from a DOM test that ran earlier in the same process.
 *
 * `resources: 'usable'` plus the `canvas` devDependency together are what
 * let jsdom's `Image`/`HTMLCanvasElement` decode and draw real pixels
 * instead of throwing/no-op'ing — jsdom's own image/canvas plumbing looks
 * for the `canvas` npm package specifically (confirmed against this
 * project's jsdom@27/canvas@3 versions; @napi-rs/canvas does NOT work here,
 * jsdom doesn't know how to talk to it).
 */
export async function withDom<T>(fn: (fixtures: DomFixtures) => T | Promise<T>): Promise<T> {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    pretendToBeVisual: true,
    resources: 'usable',
    url: 'http://localhost/',
  })
  const { window } = dom

  const previous = {} as Record<DomGlobalKey, unknown>
  const globalRecord = globalThis as unknown as Record<DomGlobalKey, unknown>
  for (const key of DOM_GLOBALS) previous[key] = globalRecord[key]
  for (const key of DOM_GLOBALS) globalRecord[key] = (window as unknown as Record<DomGlobalKey, unknown>)[key]

  const objectUrls = new WeakMap<Blob, string>()
  window.URL.createObjectURL = ((blob: Blob) => {
    const url = objectUrls.get(blob)
    if (!url) throw new Error('withDom(): blob not created via createLoadableBlob() — no data: URL registered for it')
    return url
  }) as typeof URL.createObjectURL
  window.URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL

  function createLoadableBlob(bytes: Uint8Array, type: string): Blob {
    // Buffer.from(), not `bytes` directly — a plain Uint8Array's `.buffer`
    // is typed as ArrayBufferLike (could be a SharedArrayBuffer), which
    // BlobPart's stricter ArrayBuffer-only typing rejects.
    const buffer = Buffer.from(bytes)
    const blob = new window.Blob([buffer], { type })
    objectUrls.set(blob, `data:${type};base64,${buffer.toString('base64')}`)
    return blob
  }

  try {
    return await fn({ createLoadableBlob })
  } finally {
    for (const key of DOM_GLOBALS) {
      if (previous[key] === undefined) delete globalRecord[key]
      else globalRecord[key] = previous[key]
    }
    window.close()
  }
}
