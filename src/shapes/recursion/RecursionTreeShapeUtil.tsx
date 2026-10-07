import {
	Rectangle2d,
	SVGContainer,
	ShapeUtil,
	type Editor,
	type SvgExportContext,
	type TLFontFace,
	type TLShape,
	type TLShapeId,
	type TLThemeColors,
} from 'tldraw'
import { showsColourCues } from '../../cells/cues'
import { followersOf } from '../../cells/followers'
import { exportingStep } from '../../export/exporting'
import { playbackFor, shownFrame, type Frame } from '../../nodelink/playback'
import { SceneSvg } from '../../nodelink/SceneSvg'
import {
	callHighlights,
	callKey,
	callRun,
	callStates,
	callTreeLayout,
	callsSignature,
	callsTitle,
	hasCalls,
	repeatMarks,
	resultText,
	type Call,
	type CallTreeLayout,
} from './calls'
import { RECURSION_TREE_TYPE, recursionTreeShapeMigrations, recursionTreeShapeProps, type RecursionTreeShape } from './recursion-tree-shape-types'

/** Layouts per props, without and with colour cues (which keep room for their badges). */
const layouts = new WeakMap<RecursionTreeShape['props'], [CallTreeLayout?, CallTreeLayout?]>()
const signatures = new WeakMap<RecursionTreeShape['props'], string>()

/**
 * A recursive operation's calls as a tree beside the structure it ran on. While that run plays, the
 * tree follows its steps: calls appear as they are made (in the places the whole run leaves them,
 * so nothing moves), the running call red, the calls waiting on the stack orange, returned calls
 * blue with their results. Otherwise it shows the whole run, every call with what it returned, so
 * two runs can be set side by side (first + rest against halves: n deep against log n).
 */
export class RecursionTreeShapeUtil extends ShapeUtil<RecursionTreeShape> {
	static override type = RECURSION_TREE_TYPE
	static override props = recursionTreeShapeProps
	static override migrations = recursionTreeShapeMigrations

	getDefaultProps(): RecursionTreeShape['props'] {
		return { structureId: '', title: '', calls: [], color: 'black', size: 'm', font: 'mono' }
	}

	private layout(shape: RecursionTreeShape) {
		const { calls, size, title, font } = shape.props
		const cues = showsColourCues()
		const cached = layouts.get(shape.props) ?? []
		const layout = cached[+cues] ?? callTreeLayout(calls, size, title, font, cues)
		cached[+cues] = layout
		layouts.set(shape.props, cached)
		return layout
	}

	/**
	 * The step to show, while this tree's run is playing on its structure (its calls are this tree's).
	 * `live`: the canvas, or exporting the structure's steps; else (a plain export) the whole run.
	 */
	private following(shape: RecursionTreeShape, live: boolean) {
		const view = live ? playbackFor(this.editor, shape.props.structureId as TLShapeId) : undefined
		if (!view || view.fading || !view.frames.length) return undefined
		const run = callRun(view.frames)
		let signature = signatures.get(shape.props)
		if (signature === undefined) signatures.set(shape.props, (signature = callsSignature(shape.props.calls)))
		if (!run.calls.length || callsSignature(run.calls) !== signature) return undefined
		// In predict mode, while a step is asked about, the one before it is on screen.
		const step = shownFrame({ step: view.step, asking: !!view.question })
		return { run, step, states: callStates(run, step), id: view.id }
	}

	getGeometry(shape: RecursionTreeShape) {
		const { box } = this.layout(shape)
		return new Rectangle2d({ x: 0, y: 0, width: Math.max(1, box.w), height: Math.max(1, box.h), isFilled: true })
	}

	override canEdit() {
		return false
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	component(shape: RecursionTreeShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return <SVGContainer>{this.draw(shape, colors, true)}</SVGContainer>
	}

	override toSvg(shape: RecursionTreeShape, ctx: SvgExportContext) {
		// Exporting its structure's steps: the step, as on the canvas.
		const live = !!exportingStep(this.editor, shape.props.structureId as TLShapeId)
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], live)
	}

	private draw(shape: RecursionTreeShape, colors: TLThemeColors, live: boolean) {
		const { calls } = shape.props
		const layout = this.layout(shape)
		const fontFamily = this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
		const follow = this.following(shape, live)
		const shown = (i: number) => !follow || follow.states.has(i)
		// While following, a call's result shows once it has returned.
		const result = (i: number) => (!follow || follow.states.get(i) === 'returned' || follow.run.returned[i] === follow.step ? calls[i].result : undefined)
		const nodes = follow ? layout.scene.nodes.filter((_, i) => shown(i)) : layout.scene.nodes
		const made = new Set(nodes.map((n) => n.key))
		const scene = follow ? { ...layout.scene, nodes, edges: layout.scene.edges.filter((e) => made.has(e.to)) } : layout.scene
		const { fontSize } = layout
		return (
			<g data-testid="recursion-tree">
				<text
					x={layout.title.x}
					y={layout.title.y}
					fontFamily={fontFamily}
					fontSize={fontSize}
					fill={colors.text}
					opacity={0.7}
					dominantBaseline="central"
				>
					{/* How many calls, how deep: once the run is over (the class can guess while it plays). */}
					{follow ? shape.props.title : callsTitle(shape.props.title, calls)}
				</text>
				<SceneSvg
					scene={scene}
					colors={colors}
					color={shape.props.color}
					fontFamily={fontFamily}
					marks={follow ? undefined : repeatMarks(calls)}
					flash={follow && { marks: callHighlights(follow.run, follow.states), fading: false, id: follow.id }}
					cues={showsColourCues()}
				/>
				<g fontFamily={fontFamily} fontSize={fontSize} fill={colors.text} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
					{layout.boxes.map((b, i) =>
						shown(i) ? (
							<g key={callKey(i)} data-call={calls[i].label}>
								<text x={b.x + layout.textShift} y={b.y - b.h * 0.2}>
									{calls[i].label}
								</text>
								<text x={b.x + layout.textShift} y={b.y + b.h * 0.22} fontWeight={result(i) === undefined ? undefined : 'bold'} opacity={result(i) === undefined ? 0.55 : 1}>
									{resultText(result(i))}
								</text>
							</g>
						) : null
					)}
				</g>
			</g>
		)
	}

	getIndicatorPath(shape: RecursionTreeShape) {
		const { box } = this.layout(shape)
		const path = new Path2D()
		path.rect(0, 0, box.w, box.h)
		return path
	}

	override getFontFaces(shape: RecursionTreeShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}
}

/** The recursion trees beside `structure`. */
export const treesOf = (editor: Editor, structure: TLShape) =>
	followersOf(editor, structure.id).filter((s): s is RecursionTreeShape => s.type === RECURSION_TREE_TYPE)

/** Plain JSON for props: no undefined (a call that never returned has no result). */
const stored = (calls: readonly Call[]): Call[] => calls.map((c) => (c.result === undefined ? { label: c.label, parent: c.parent } : { ...c }))

/**
 * Before playing a recursive operation (frames that make calls): put its recursion tree to the
 * right of `structure` (past anything already following it), one undo step, unless one there
 * already shows these very calls. Returns what takes it away again (cancelling the operation
 * before its result is in changes nothing), if one was put there.
 */
export function openRecursionTree(editor: Editor, structure: TLShape, frames: readonly Frame[], title: string): (() => void) | undefined {
	if (!hasCalls(frames)) return undefined
	const { calls } = callRun(frames)
	const signature = callsSignature(calls)
	if (treesOf(editor, structure).some((t) => callsSignature(t.props.calls) === signature)) return undefined
	const bounds = editor.getShapePageBounds(structure)
	if (!bounds) return undefined
	const right = Math.max(bounds.maxX, ...followersOf(editor, structure.id).map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
	const style = structure.props as Partial<Pick<RecursionTreeShape['props'], 'color' | 'size' | 'font'>>
	const mark = editor.markHistoryStoppingPoint('show recursion tree')
	editor.createShape<RecursionTreeShape>({
		type: RECURSION_TREE_TYPE,
		x: right + 60,
		y: bounds.minY,
		props: { structureId: structure.id, title, calls: stored(calls), color: style.color ?? 'black', size: style.size ?? 'm', font: style.font ?? 'mono' },
	})
	return () => void editor.bailToMark(mark)
}
