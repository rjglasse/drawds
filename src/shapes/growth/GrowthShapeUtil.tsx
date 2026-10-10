import {
	Rectangle2d,
	SVGContainer,
	ShapeUtil,
	getColorValue,
	type Editor,
	type SvgExportContext,
	type TLDefaultColorStyle,
	type TLFontFace,
	type TLShape,
	type TLShapeId,
	type TLThemeColors,
} from 'tldraw'
import { followersOf } from '../../cells/followers'
import { exportingStep } from '../../export/exporting'
import { playbackFor, shownFrame } from '../../nodelink/playback'
import type { CountedSort } from '../array/sort-counts'
import { GROWTH_ORDERS, GROWTH_SIZES, ORDER_TITLES, growthTable, showCount, showFactor, type Growth } from './growth'
import { GROWTH_TYPE, growthShapeMigrations, growthShapeProps, type GrowthShape } from './growth-shape-types'
import { N_COLUMN, growthLayout, type GrowthLayout } from './layout'

const layouts = new WeakMap<GrowthShape['props'], GrowthLayout>()

const layoutOf = (shape: GrowthShape) => {
	let layout = layouts.get(shape.props)
	if (!layout) {
		const { sort, seed, cutoff, size } = shape.props
		layouts.set(shape.props, (layout = growthLayout(sort, seed, cutoff, size)))
	}
	return layout
}

/** How each column grows, in the marks' colours: linear green, n log n blue, quadratic red. */
const GROWTH_COLORS: Record<Growth, TLDefaultColorStyle> = { n: 'green', 'n log n': 'blue', 'n²': 'red' }

/**
 * A sort's comparisons as n grows, beside the array it was opened from: a row per n (10, 100, 1000),
 * a column per kind of input, each count over the factor it grew by, and how each column grows.
 * While its operation plays it shows the rows the step has filled in (the rest '?'); otherwise all.
 */
export class GrowthShapeUtil extends ShapeUtil<GrowthShape> {
	static override type = GROWTH_TYPE
	static override props = growthShapeProps
	static override migrations = growthShapeMigrations

	getDefaultProps(): GrowthShape['props'] {
		return { structureId: '', sort: 'insertion-sort', seed: 1, cutoff: 3, color: 'black', size: 'm', font: 'mono' }
	}

	/** How many rows the step on screen fills in, while this table's operation plays on its array. */
	private following(shape: GrowthShape, live: boolean): number | undefined {
		const view = live ? playbackFor(this.editor, shape.props.structureId as TLShapeId) : undefined
		if (!view || view.fading || !view.frames.length || view.frames[0]?.growth?.sort !== shape.props.sort) return undefined
		return view.frames[Math.max(0, shownFrame({ step: view.step, asking: view.question !== undefined }))]?.growth?.rows
	}

	getGeometry(shape: GrowthShape) {
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

	component(shape: GrowthShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return <SVGContainer>{this.draw(shape, colors, true)}</SVGContainer>
	}

	override toSvg(shape: GrowthShape, ctx: SvgExportContext) {
		const live = !!exportingStep(this.editor, shape.props.structureId as TLShapeId)
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], live)
	}

	private draw(shape: GrowthShape, colors: TLThemeColors, live: boolean) {
		const { sort, seed, cutoff, font } = shape.props
		const layout = layoutOf(shape)
		const { fontSize, strokeWidth, cols, rows, title } = layout
		const table = growthTable(sort, seed, cutoff)
		const fontFamily = this.editor.getCurrentTheme().fonts[font].fontFamily
		// Rows of counts shown; one more: how each column grows too.
		const shown = this.following(shape, live) ?? GROWTH_SIZES.length + 1
		const text = { fontFamily, fill: colors.text, textAnchor: 'middle' as const, dominantBaseline: 'central' as const }
		const centre = (col: number) => cols[col].x + cols[col].w / 2
		const middle = (row: number) => rows[row].y + rows[row].h / 2
		const first = rows[0]
		const last = rows[rows.length - 1]
		const right = cols[cols.length - 1].x + cols[cols.length - 1].w
		const line = { stroke: colors.text, strokeWidth: strokeWidth * 0.7, opacity: 0.45 }
		return (
			<g data-testid="sort-growth" data-sort={sort} data-rows={shown}>
				<text x={title.x} y={title.y} {...text} textAnchor="start" fontSize={fontSize} opacity={0.75}>
					{title.text}
				</text>
				<rect x={0} y={first.y} width={right} height={last.y + last.h - first.y} fill={colors.background} stroke={colors.text} strokeWidth={strokeWidth} />
				{rows.slice(1).map((r, k) => (
					<line key={`r${k}`} x1={0} x2={right} y1={r.y} y2={r.y} {...line} />
				))}
				{cols.slice(1).map((c, k) => (
					<line key={`c${k}`} x1={c.x} x2={c.x} y1={first.y} y2={last.y + last.h} {...line} />
				))}
				{N_COLUMN.map((label, row) => (
					<text key={`n${row}`} x={centre(0)} y={middle(row)} {...text} fontSize={fontSize * (row === 0 || row === rows.length - 1 ? 0.8 : 1)} opacity={0.75}>
						{label}
					</text>
				))}
				{GROWTH_ORDERS.map((order, k) => (
					<text key={order} x={centre(k + 1)} y={middle(0)} {...text} fontSize={fontSize * 0.8} opacity={0.75}>
						{ORDER_TITLES[order]}
					</text>
				))}
				{table.counts.map((counts, k) =>
					counts.map((count, col) => {
						const row = k + 1
						const factor = table.factors[k][col]
						if (k >= shown)
							return (
								<text key={`${k}:${col}`} x={centre(col + 1)} y={middle(row)} {...text} fontSize={fontSize} opacity={0.3}>
									?
								</text>
							)
						return (
							<g key={`${k}:${col}`} data-count={count}>
								<text x={centre(col + 1)} y={factor === undefined ? middle(row) : rows[row].y + fontSize * 0.95} {...text} fontSize={fontSize}>
									{showCount(count)}
								</text>
								{factor !== undefined && (
									<text x={centre(col + 1)} y={rows[row].y + fontSize * 1.95} {...text} fontSize={fontSize * 0.7} opacity={0.65}>
										{showFactor(factor)}
									</text>
								)}
							</g>
						)
					})
				)}
				{shown > GROWTH_SIZES.length &&
					table.growth.map((growth, col) => (
						<text
							key={`g${col}`}
							data-growth={growth}
							x={centre(col + 1)}
							y={middle(rows.length - 1)}
							{...text}
							fontSize={fontSize}
							fontWeight="bold"
							fill={getColorValue(colors, GROWTH_COLORS[growth], 'solid')}
						>
							{growth}
						</text>
					))}
			</g>
		)
	}

	getIndicatorPath(shape: GrowthShape) {
		const { box } = layoutOf(shape)
		const path = new Path2D()
		path.rect(0, 0, box.w, box.h)
		return path
	}

	override getFontFaces(shape: GrowthShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}
}

/**
 * Before filling in a sort's counts table: a table to the right of the array (past anything already
 * following it), one undo step, unless one there counts that sort already. Returns its seed (an open
 * table keeps its own, so its numbers stay put) and what takes it back again, if it was made.
 */
export function openGrowth(
	editor: Editor,
	structure: TLShape,
	{ sort, seed, cutoff }: { sort: CountedSort; seed: number; cutoff: number }
): { seed: number; opened?: () => void } {
	const followers = followersOf(editor, structure.id)
	const same = followers.find((f): f is GrowthShape => f.type === GROWTH_TYPE && f.props.sort === sort && f.props.cutoff === cutoff)
	if (same) return { seed: same.props.seed }
	const bounds = editor.getShapePageBounds(structure)
	if (!bounds) return { seed }
	const mark = editor.markHistoryStoppingPoint('show the counts as n grows')
	const right = Math.max(bounds.maxX, ...followers.map((f) => editor.getShapePageBounds(f)?.maxX ?? -Infinity))
	const style = structure.props as Partial<Pick<GrowthShape['props'], 'color' | 'size'>>
	editor.createShape<GrowthShape>({
		type: GROWTH_TYPE,
		x: right + 60,
		y: bounds.minY,
		// Mono, as its layout measures the counts.
		props: { structureId: structure.id, sort, seed, cutoff, color: style.color ?? 'black', size: style.size ?? 'm', font: 'mono' },
	})
	return { seed, opened: () => void editor.bailToMark(mark) }
}
