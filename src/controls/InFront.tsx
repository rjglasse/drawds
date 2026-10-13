import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { atom, react, toDomPrecision, useEditor, useValue, type Atom, type Editor, type TLShapeId } from 'tldraw'

// A shape's on-canvas controls (x and + buttons, grips, prompts, the previews a drag draws) are drawn
// in a layer of their own in front of the canvas, not in the shape. They reach outside its box, and
// what a shape draws outside its box Chrome may leave behind as ghosts when the camera moves or the
// controls come and go (dds-55z.29, .37): tldraw lays each shape out as a box of its own size
// (`contain: size layout`). The layer moves with the camera exactly as tldraw's shape layer does, and
// each shape's controls are placed in its space, so they are written as before, in shape space.

const layers = new WeakMap<Editor, Atom<HTMLDivElement | null>>()

function layerOf(editor: Editor) {
	let layer = layers.get(editor)
	if (!layer) layers.set(editor, (layer = atom<HTMLDivElement | null>('drawds controls layer', null)))
	return layer
}

const modulate = (v: number, [a, b]: [number, number], [c, d]: [number, number]) => {
	const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
	return c + (d - c) * t
}

/** The camera as tldraw's shape layer has it (its sub-pixel nudge too), so the two line up exactly. */
function cameraTransform(editor: Editor) {
	const { x, y, z } = editor.getCamera()
	const offset = z >= 1 ? modulate(z, [1, 8], [0.125, 0.5]) : modulate(z, [0.1, 1], [-2, 0.125])
	return `scale(${toDomPrecision(z)}) translate(${toDomPrecision(x + offset)}px,${toDomPrecision(y + offset)}px)`
}

/** The layer, in front of the canvas (tldraw's InFrontOfTheCanvas), under the play bar. */
export function ControlsLayer() {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const layer = layerOf(editor)
		layer.set(el)
		// Set straight on the element as the camera moves, as tldraw does: no React render a frame.
		const stop = react('drawds controls follow the camera', () => {
			el.style.transform = cameraTransform(editor)
		})
		return () => {
			stop()
			if (layer.get() === el) layer.set(null)
		}
	}, [editor])
	return (
		<div
			ref={ref}
			className="drawds-controls-layer"
			style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, transformOrigin: 'top left', pointerEvents: 'none' }}
		/>
	)
}

/**
 * `children` drawn in the controls layer, in shape `id`'s space (shape space, as the shape draws), or
 * where they are if there is no layer. `svg`: they are SVG elements (grips, a drag's preview line).
 */
export function InFront({ id, svg = false, children }: { id: TLShapeId; svg?: boolean; children: ReactNode }) {
	const editor = useEditor()
	const layer = useValue('controls layer', () => layerOf(editor).get(), [editor])
	const transform = useValue('shape transform', () => editor.getShapePageTransform(id)?.toCssString(), [editor, id])
	if (!layer) return <>{children}</>
	const content = svg ? (
		// As tldraw's own SVG container for shapes draws strokes.
		<svg
			width={1}
			height={1}
			style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }}
		>
			{children}
		</svg>
	) : (
		children
	)
	return createPortal(
		<div style={{ position: 'absolute', top: 0, left: 0, transformOrigin: 'top left', transform }}>
			{content}
		</div>,
		layer
	)
}
