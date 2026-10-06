import {
	StylePanelSection,
	TldrawUiButton,
	TldrawUiButtonIcon,
	TldrawUiButtonLabel,
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	useEditor,
	useValue,
} from 'tldraw'
import { CellShapeUtil } from '../cells/CellShapeUtil'

/** Moves every structure shares, after its own. */
const SHARED = [
	'Point at an element and press 1–4 to mark it, 0 to clear',
	'Right-click an element: Step by step (animated), then its own name (instant changes), Show, Mark, Pointer',
	'While an operation plays: Space, ← → or a clicker, Enter finishes, Esc cancels; the ? on its bar asks the class first',
]

/**
 * "What can I do here?" at the foot of the style panel while one structure is selected: its
 * gestures, buttons and settings (its util's `moves`), then the moves every structure shares,
 * in a popover beside the panel.
 */
export function StructureHint() {
	const editor = useEditor()
	const hint = useValue(
		'structure hint',
		() => {
			const shape = editor.getOnlySelectedShape()
			const util = shape && editor.getShapeUtil(shape)
			if (!shape || !(util instanceof CellShapeUtil) || !util.moves) return null
			return { name: util.menuName?.(shape) ?? shape.type, moves: util.moves(shape) }
		},
		[editor]
	)
	if (!hint) return null
	return (
		<StylePanelSection>
			<TldrawUiPopover id="drawds-structure-hint">
				<TldrawUiPopoverTrigger>
					<TldrawUiButton type="menu" data-testid="structure-hint" title={`What can I do with this ${hint.name.toLowerCase()}?`}>
						<TldrawUiButtonIcon icon="question-mark-circle" small />
						<TldrawUiButtonLabel>What can I do?</TldrawUiButtonLabel>
					</TldrawUiButton>
				</TldrawUiPopoverTrigger>
				<TldrawUiPopoverContent side="left" align="end" sideOffset={8}>
					<div data-testid="structure-hint-content" style={{ width: 300, padding: '10px 12px', fontSize: 12, lineHeight: 1.4 }}>
						<div style={{ fontWeight: 600, marginBottom: 6 }}>{hint.name}</div>
						<ul style={{ margin: 0, paddingLeft: 16 }}>
							{[...hint.moves, ...SHARED].map((move, i) => (
								<li key={i} style={{ marginBottom: 4, color: i < hint.moves.length ? undefined : 'var(--tl-color-text-3, inherit)' }}>
									{move}
								</li>
							))}
						</ul>
					</div>
				</TldrawUiPopoverContent>
			</TldrawUiPopover>
		</StylePanelSection>
	)
}
