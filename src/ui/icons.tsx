import type { TLUiIconJsx } from 'tldraw'

/**
 * A tldraw-style icon (the image is a mask over currentColor). tldraw puts string icon URLs into
 * an unquoted CSS `url()`, which silently fails for Vite's inlined SVG data URIs (they contain
 * quotes), so we render the same mask with a quoted URL.
 */
export function maskIcon(url: string): TLUiIconJsx {
	return <div className="tlui-icon" style={{ mask: `url("${url}") center / 100% no-repeat` }} />
}

/** A mask icon from inline SVG markup drawn on a 30x30 grid in black. */
export function svgIcon(body: string): TLUiIconJsx {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" fill="none" stroke="black" stroke-width="2" stroke-linejoin="round">${body}</svg>`
	return maskIcon(`data:image/svg+xml,${encodeURIComponent(svg)}`)
}
