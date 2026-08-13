/** 1-based char codes of `text` — for building byte needles to search encoded output for. */
export function asciiBytes(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0))
}

/** Index of the first occurrence of `needle` inside `haystack`, or -1. Plain byte-array search — encoded receipts are small, no need for anything smarter. */
export function indexOfBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

export function containsBytes(haystack: Uint8Array, needle: number[]): boolean {
  return indexOfBytes(haystack, needle) !== -1
}
