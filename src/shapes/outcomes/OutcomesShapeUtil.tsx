import {
	Rectangle2d,
	SVGContainer,
	ShapeUtil,
	getColorValue,
	type Editor,
	type SvgExportContext,
	type TLFontFace,
	type TLShape,
	type TLShapeId,
	type TLThemeColors,
} from 'tldraw'
import { followersOf } from '../../cells/followers'
import { exportingStep } from '../../export/exporting'
import { playbackFor, shownFrame, type FrameOutcomes } from '../../nodelink/playback'
import type { ShuffleKind } from '../array/shuffles'
import { ORDER_COLORS, outcomesLayout, outcomesTitle, type OutcomesLayout } from './layout'
import { orderName, simulate, tallyOf, tallySteps, type OutcomesMode } from './outcomes'
import { OUTCOMES_TYPE, outcomesShapeMigrations, outcomesShapeProps, type OutcomesShape } from './outcomes-shape-types'

const layouts = new WeakMap<OutcomesShape['props'], OutcomesLayout>()

const layoutOf = (shape: OutcomesShape) => {
	let layout = layouts.get(shape.props)
	if (!layout) {
		const { values, kind, mode, size } = shape.props
		layouts.set(shape.props, (layout = outcomesLayout(values, kind, mode, size)))
	}
	return layout
}

/**
 * A shuffle's outcomes beside the array it ran on: every run as a tree (a level per pick, the
 * leaves coloured by the order they leave) over a tally of leaves per order, or many seeded runs
 * tallied. While its operation plays, it shows as much as the step has revealed; otherwise all of it.
 */
export class OutcomesShapeUtil extends ShapeUtil<OutcomesShape> {
	static override type = OUTCOMES_TYPE
	static override props = outcomesShapeProps
	static override migrations = outcomesShapeMigrations

	getDefaultProps(): OutcomesShape['props'] {
		return { structureId: '', kind: 'unfair', mode: 'tree', values: [], seed: 1, color: 'black', size: 'm', font: 'mono' }
	}

	/** How much the step on screen reveals, while this view's operation plays on its array. */
	private following(shape: OutcomesShape, live: boolean): FrameOutcomes | undefined {
		const view = live ? playbackFor(this.editor, shape.props.structureId as TLShapeId) : undefined
		if (!view || view.fading || !view.frames.length) return undefined
		const { kind, mode } = shape.props
		const first = view.frames[0]?.outcomes
		if (first?.kind !== kind || first.mode !== mode) return undefined
		return view.frames[Math.max(0, shownFrame({ step: view.step, asking: view.question !== undefined }))]?.outcomes
	}

	getGeometry(shape: OutcomesShape) {
		const { box } = layoutOf(shape)
		return new Rectangle2d({ x: 0, y: 0, width: box.w, height: box.h, isFilled: true })
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

	component(shape: OutcomesShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return <SVGContainer>{this.draw(shape, colors, true)}</SVGContainer>
	}

	override toSvg(shape: OutcomesShape, ctx: SvgExportContext) {
		const live = !!exportingStep(this.editor, shape.props.structureId as TLShapeId)
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], live)
	}

	private draw(shape: OutcomesShape, colors: TLThemeColors, live: boolean) {
		const { values, kind, mode, seed, font } = shape.props
		const layout = layoutOf(shape)
		const { fontSize, strokeWidth, tree } = layout
		const fontFamily = this.editor.getCurrentTheme().fonts[font].fontFamily
		const follow = this.following(shape, live)
		const steps = tallySteps(values.length)
		// The tree down to this level (past the last pick: coloured leaves and their tally); or this many runs.
		const level = follow?.level ?? (tree ? tree.depth + 1 : 0)
		const runs = mode === 'tally' ? (follow?.runs ?? steps[steps.length - 1]) : undefined
		const colorOf = new Map(layout.bars.map((b, k) => [b.order, layout.bars.length <= ORDER_COLORS.length ? ORDER_COLORS[k] : 'blue']))
		const solid = (order: string) => getColorValue(colors, colorOf.get(order) ?? 'blue', 'solid')
		const semi = (order: string) => getColorValue(colors, colorOf.get(order) ?? 'blue', 'semi')
		const results = tree ? tree.leaves.map((leaf) => tree.nodes[leaf].values) : simulate(values, kind, seed, runs ?? 0)
		const tally = tallyOf(values, results)
		const showsTally = mode === 'tally' || (tree !== undefined && level > tree.depth)
		const total = results.length
		const fair = total / layout.bars.length
		const height = (count: number) => Math.min(layout.maxH, (total ? count / total / layout.fullShare : 0) * layout.maxH)
		const text = { fontFamily, fill: colors.text, textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
		return (
			<g data-testid="shuffle-outcomes" data-kind={kind} data-mode={mode}>
				<text x={layout.title.x} y={layout.title.y} {...text} textAnchor="start" fontSize={fontSize} opacity={0.75}>
					{outcomesTitle(kind, mode, runs)}
				</text>
				{tree?.nodes.map((node, at) => {
					if (node.depth > level) return null
					const { box } = node
					const leaf = node.depth === tree.depth && level > tree.depth
					const order = orderName(node.values)
					const parent = node.parent === undefined ? undefined : tree.nodes[node.parent].box
					return (
						<g key={at} data-node-depth={node.depth} data-order={leaf ? order : undefined}>
							{parent && (
								<>
									<line
										x1={parent.x + parent.w / 2}
										y1={parent.y + parent.h}
										x2={box.x + box.w / 2}
										y2={box.y}
										stroke={colors.text}
										strokeWidth={strokeWidth * 0.7}
										opacity={0.45}
									/>
									{/* The pick that led here: n. */}
									<text
										x={(parent.x + parent.w / 2) * 0.35 + (box.x + box.w / 2) * 0.65}
										y={(parent.y + parent.h) * 0.35 + box.y * 0.65}
										{...text}
										fontSize={fontSize * 0.7}
										opacity={0.6}
										dx={-fontSize * 0.45}
									>
										{node.pick}
									</text>
								</>
							)}
							<rect
								x={box.x}
								y={box.y}
								width={box.w}
								height={box.h}
								rx={fontSize * 0.3}
								fill={leaf ? semi(order) : colors.background}
								stroke={leaf ? solid(order) : colors.text}
								strokeWidth={strokeWidth}
							/>
							<text x={box.x + box.w / 2} y={box.y + box.h / 2} {...text} fontSize={fontSize}>
								{orderName(node.values)}
							</text>
						</g>
					)
				})}
				{showsTally && (
					<g data-testid="shuffle-tally">
						{tally.map(({ order, count }, k) => {
							const bar = layout.bars[k]
							const h = height(count)
							return (
								<g key={order} data-order={order} data-count={count}>
									<rect
										x={bar.x - bar.w / 2}
										y={layout.base - h}
										width={bar.w}
										height={h}
										fill={semi(order)}
										stroke={solid(order)}
										strokeWidth={strokeWidth}
									/>
									<text x={bar.x} y={layout.base - h - fontSize * 0.7} {...text} fontSize={fontSize * 0.75}>
										{count.toLocaleString('en')}
									</text>
									<text x={bar.x} y={layout.base + fontSize * 0.9} {...text} fontSize={fontSize * 0.8}>
										{order}
									</text>
								</g>
							)
						})}
						{/* A fair share: every order as likely as the others. */}
						<line
							x1={layout.bars[0].x - layout.bars[0].w / 2 - fontSize * 0.3}
							x2={layout.bars[layout.bars.length - 1].x + layout.bars[0].w / 2 + fontSize * 0.3}
							y1={layout.base - height(fair)}
							y2={layout.base - height(fair)}
							stroke={colors.text}
							strokeWidth={strokeWidth}
							strokeDasharray={`${fontSize * 0.4} ${fontSize * 0.3}`}
							opacity={0.6}
						/>
						<text
							x={layout.bars[layout.bars.length - 1].x + layout.bars[0].w / 2 + fontSize * 0.5}
							y={layout.base - height(fair)}
							{...text}
							textAnchor="start"
							fontSize={fontSize * 0.7}
							opacity={0.7}
						>
							fair
						</text>
						<line
							x1={layout.bars[0].x - layout.bars[0].w / 2}
							x2={layout.bars[layout.bars.length - 1].x + layout.bars[0].w / 2}
							y1={layout.base}
							y2={layout.base}
							stroke={colors.text}
							strokeWidth={strokeWidth}
						/>
					</g>
				)}
			</g>
		)
	}

	getIndicatorPath(shape: OutcomesShape) {
		const { box } = layoutOf(shape)
		const path = new Path2D()
		path.rect(0, 0, box.w, box.h)
		return path
	}

	override getFontFaces(shape: OutcomesShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}
}

/** The outcome views beside `structure`. */
const viewsOf = (editor: Editor, structure: TLShape) =>
	followersOf(editor, structure.id).filter((s): s is OutcomesShape => s.type === OUTCOMES_TYPE)

/**
 * Before playing a shuffle's outcomes: a view of them to the right of the array (past anything
 * already following it), one undo step, unless one there already shows them (a tally then takes
 * the new seed). Returns what takes it back again (cancelling changes nothing), if anything changed.
 */
export function openOutcomes(
	editor: Editor,
	structure: TLShape,
	{ kind, mode, values, seed }: { kind: ShuffleKind; mode: OutcomesMode; values: string[]; seed: number }
): (() => void) | undefined {
	const same = viewsOf(editor, structure).find((v) => v.props.kind === kind && v.props.mode === mode && v.props.values.join('\u0000') === values.join('\u0000'))
	if (same && (mode === 'tree' || same.props.seed === seed)) return undefined
	const bounds = editor.getShapePageBounds(structure)
	if (!bounds) return undefined
	const mark = editor.markHistoryStoppingPoint('show the shuffle outcomes')
	if (same) {
		editor.updateShape<OutcomesShape>({ id: same.id, type: OUTCOMES_TYPE, props: { seed } })
	} else {
		const right = Math.max(bounds.maxX, ...followersOf(editor, structure.id).map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
		const style = structure.props as Partial<Pick<OutcomesShape['props'], 'color' | 'size'>>
		editor.createShape<OutcomesShape>({
			type: OUTCOMES_TYPE,
			x: right + 60,
			y: bounds.minY,
			// Mono, as its layout measures the orders.
			props: { structureId: structure.id, kind, mode, values, seed, color: style.color ?? 'black', size: style.size ?? 'm', font: 'mono' },
		})
	}
	return () => void editor.bailToMark(mark)
}
