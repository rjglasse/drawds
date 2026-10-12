import type { ReactNode } from 'react'
import { track } from 'tldraw'

/**
 * Renders `render()` with its signals tracked on their own: what the pointer hovers redraws the
 * buttons it shows (an x, a +, a connect grip), not the structure under them.
 */
export const Tracked = track(function Tracked({ render }: { render: () => ReactNode }) {
	return <>{render()}</>
})
