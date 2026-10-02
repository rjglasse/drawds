import type { TLDefaultSizeStyle } from 'tldraw'

/** Base cell / node size in page pixels for each size style, shared by every structure. */
export const CELL_SIZES: Record<TLDefaultSizeStyle, number> = { s: 32, m: 48, l: 64, xl: 88 }
