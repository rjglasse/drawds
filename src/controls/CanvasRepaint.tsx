import { useLayoutEffect, useRef } from 'react'
import { react, useEditor } from 'tldraw'

// Ghosts (dds-55z.37): in Chrome on the teacher's Mac, a fast zoom can leave copies of a shape's text
// behind, one for each frame of the zoom (an array's last value, a graph's rightmost label), until
// something is drawn over them or the page reloads. Not seen in automated Chrome, and not from
// anything drawn outside a shape's box (controls are in front of the canvas, see InFront.tsx). Since
// drawing over them clears them, the canvas is repainted whole as the camera moves and when it stops:
// tldraw's background, which is painted with the shapes, gets a practically invisible fill that flips
// on and off, and Chrome repaints everything over it. `localStorage['drawds:repaint'] = 'off'` turns it off,
// to compare.

const FILL = 'rgba(127, 127, 127, 0.004)'

/** tldraw's canvas background (its `Background` component), repainting the canvas as the camera moves. */
export function RepaintingBackground() {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		let off = false
		try {
			off = window.localStorage.getItem('drawds:repaint') === 'off'
		} catch {
			// Storage can be unavailable (private windows): repaint.
		}
		if (off) return
		let lit = false
		let frame = 0
		const flip = () => {
			lit = !lit
			el.style.backgroundColor = lit ? FILL : 'transparent'
		}
		// At most once a frame while the camera moves, and once when it stops.
		const moving = react('repaint the canvas as the camera moves', () => {
			editor.getCamera()
			if (!frame)
				frame = requestAnimationFrame(() => {
					frame = 0
					flip()
				})
		})
		const stopped = react('repaint the canvas when the camera stops', () => {
			if (editor.getCameraState() === 'idle') flip()
		})
		return () => {
			moving()
			stopped()
			cancelAnimationFrame(frame)
		}
	}, [editor])
	return (
		<div className="tl-background">
			<div ref={ref} aria-hidden="true" style={{ width: '100%', height: '100%' }} />
		</div>
	)
}
