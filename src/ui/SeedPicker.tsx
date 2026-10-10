import { useState } from 'react'
import { StylePanelSection, TldrawUiButton, TldrawUiButtonIcon, useEditor, useValue, type Editor, type TLShape } from 'tldraw'
import { newSeed } from '../data/random'
import { parseSeed, pinSeed, pinnedSeed } from '../data/seed'
import { TRACER_TYPE } from '../shapes/recursion/tracer-shape-types'

/** A structure whose values come from its seed (the tracer has one, unused). */
const seedOf = (shape: TLShape) => {
	const seed = (shape.props as { seed?: unknown }).seed
	return shape.type !== TRACER_TYPE && typeof seed === 'number' ? seed : undefined
}

/**
 * What the row shows: with a structure's tool out, the seed new sketches get, to type in (as tldraw's
 * panel then shows the next shape's styles); else the one selected structure's seed, to read or pin
 * (several selected: the next one's again).
 */
function seedView(editor: Editor): { seed: number } | 'next' | null {
	const tool = editor.getCurrentTool()
	if (!editor.isIn('select')) {
		const type = (tool as { shapeType?: TLShape['type'] }).shapeType
		if (!type || type === TRACER_TYPE || !editor.hasShapeUtil(type)) return null
		return 'seed' in (editor.getShapeUtil(type).getDefaultProps() as object) ? 'next' : null
	}
	const selected = editor.getSelectedShapes()
	if (selected.length === 1) {
		const seed = seedOf(selected[0])
		return seed === undefined ? null : { seed }
	}
	return selected.some((s) => seedOf(s) !== undefined) ? 'next' : null
}

const inputStyle = {
	width: 58,
	minWidth: 0,
	height: 26,
	boxSizing: 'border-box',
	padding: '0 4px',
	fontSize: 12,
	fontFamily: 'inherit',
	fontVariantNumeric: 'tabular-nums',
	border: '1px solid var(--tl-color-muted-2)',
	borderRadius: 4,
	background: 'var(--tl-color-panel)',
	color: 'var(--tl-color-text-0)',
} as const

/**
 * Seed in the style panel. Every structure's values come from its seed, so pinning one makes every
 * new sketch (any structure) get it: draw the same length again and the values are the same.
 * Select a structure to read its seed and pin it; with a tool out, type one (or lock whatever the
 * next would be). Unpinned, each sketch is random.
 */
export function SeedPicker() {
	const editor = useEditor()
	const view = useValue('seed view', () => seedView(editor), [editor])
	const pinned = useValue('pinned seed', pinnedSeed, [])
	// What is being typed, while the field has focus (it may not be a seed yet).
	const [draft, setDraft] = useState<string | null>(null)
	if (!view) return null
	const shown = view === 'next' ? pinned : view.seed
	const isPinned = shown !== null && pinned === shown
	const toggle = () => {
		if (isPinned) pinSeed(null)
		else pinSeed(shown ?? newSeed())
	}
	return (
		<StylePanelSection>
			<div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 0 0 10px' }}>
				<span style={{ fontSize: 12, flex: 1, color: 'var(--tl-color-text-1)' }}>Seed</span>
				<input
					data-testid="seed-input"
					aria-label={view === 'next' ? 'Seed for new sketches' : 'This structure’s seed'}
					title={view === 'next' ? 'New sketches get this seed (empty: random)' : 'This structure’s seed: pin it to draw it again'}
					inputMode="numeric"
					spellCheck={false}
					autoComplete="off"
					readOnly={view !== 'next'}
					placeholder="random"
					value={view === 'next' ? (draft ?? (pinned === null ? '' : String(pinned))) : String(view.seed)}
					onFocus={(e) => (view === 'next' ? setDraft(e.currentTarget.value) : e.currentTarget.select())}
					onBlur={() => setDraft(null)}
					onChange={(e) => {
						if (view !== 'next') return
						const text = e.currentTarget.value.replace(/\D/g, '')
						setDraft(text)
						if (!text) pinSeed(null)
						else {
							const seed = parseSeed(text)
							if (seed !== undefined) pinSeed(seed)
						}
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
					}}
					// Pinned shows: it outlasts a reload, and every new sketch takes it.
					style={isPinned ? { ...inputStyle, borderColor: 'var(--tl-color-selected)', boxShadow: 'inset 0 0 0 1px var(--tl-color-selected)' } : inputStyle}
				/>
				<TldrawUiButton
					type="icon"
					data-testid="seed-pin"
					data-pinned={isPinned || undefined}
					title={isPinned ? 'Unpin: new sketches are random again' : 'Pin: every new sketch gets this seed'}
					onClick={toggle}
				>
					<TldrawUiButtonIcon icon={isPinned ? 'lock' : 'unlock'} small />
				</TldrawUiButton>
			</div>
			{view !== 'next' && pinned !== null && pinned !== view.seed && (
				<div data-testid="seed-pinned-note" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 0 4px 10px', fontSize: 11, color: 'var(--tl-color-text-3)' }}>
					<span style={{ flex: 1 }} title="New sketches get this seed">
						Pinned: {pinned}
					</span>
					<TldrawUiButton type="icon" data-testid="seed-unpin" title="Unpin: new sketches are random again" onClick={() => pinSeed(null)}>
						<TldrawUiButtonIcon icon="cross-2" small />
					</TldrawUiButton>
				</div>
			)}
		</StylePanelSection>
	)
}
