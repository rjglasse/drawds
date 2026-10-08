import type { CSSProperties } from 'react'
import {
	Rectangle2d,
	SVGContainer,
	getColorValue,
	getIndices,
	type SvgExportContext,
	type TLFontFace,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShape,
	type TLShapePartial,
	type TLThemeColors,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, type NodeOperation, type PlaybackLayout } from '../../cells/CellShapeUtil'
import { CueBadge } from '../../cells/CueBadge'
import { exportingStep } from '../../export/exporting'
import { StepExtrasSvg } from '../../export/StepExtrasSvg'
import { cueBadgeAt, showsColourCues } from '../../cells/cues'
import { pruneMarks, type MarkColor, type Marks } from '../../cells/marks'
import { growHandle, grownCount } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import type { Refillable } from '../../data/fill-style'
import { newSeed } from '../../data/random'
import { animationMs, isBusy, playOperation, playbackFor, type Frame } from '../../nodelink/playback'
import { placePointers, type PointerAnchor } from '../../pointers/layout'
import { layoutOf, matrixCells } from './cells'
import { cellKey, getMatrixLayout, getMatrixMetrics, parseCellKey, parseHeaderKey, type MatrixHeaders, type MatrixMetrics } from './layout'
import { MATRIX_SHAPE_TYPE, MAX_MATRIX, matrixShapeMigrations, matrixShapeProps, type MatrixShape } from './matrix-shape-types'
import {
	colsOf,
	deleteCol,
	deleteRow,
	freshValues,
	insertCol,
	insertRow,
	matrixValues,
	moveMarks,
	resize,
	rowsOf,
	shiftAt,
	shiftLabels,
	transpose,
	type Grid,
} from './model'
import { colKey, isSortedMatrix, rowKey, staircaseSearch, transposeSteps, traverse, type MatrixOperation } from './operations'

const GROW_COLS = 'grow-cols'
const GROW_ROWS = 'grow-rows'
const SWAP_MS = 420

/**
 * A matrix (2D array): a grid of cells with row indices on the left and column indices above.
 * Sketch it by dragging a rectangle; grow it with the grips on its right and bottom edges; edit
 * cells in place; insert or delete rows and columns from a cell's menu; and step through the
 * classic loops: row-major and column-major traversal, transpose, staircase search.
 */
export class MatrixShapeUtil extends CellShapeUtil<MatrixShape> implements Refillable {
	static override type = MATRIX_SHAPE_TYPE
	static override props = matrixShapeProps
	static override migrations = matrixShapeMigrations

	readonly cells = matrixCells

	getDefaultProps(): MatrixShape['props'] {
		return {
			values: [['']],
			fill: 'random',
			range: 'medium',
			seed: 0,
			marks: {},
			pointers: [],
			rowLabels: [],
			colLabels: [],
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	refill(shape: MatrixShape): TLShapePartial<MatrixShape> {
		const { fill, seed, range, values } = shape.props
		return this.update(shape, { values: matrixValues(fill, seed, rowsOf(values), colsOf(values), range) })
	}

	private layout(shape: MatrixShape, values: Grid = shape.props.values) {
		return getMatrixLayout(rowsOf(values), colsOf(values), getMatrixMetrics(shape.props.size), headersOf(shape))
	}

	/** Labelled rows widen the strip on their left; the cells stay put on the page (see `onBeforeUpdate`). */
	override layoutOffset(shape: MatrixShape): VecLike {
		return { x: layoutOf(shape).cells.x - getMatrixMetrics(shape.props.size).origin.x, y: 0 }
	}

	getGeometry(shape: MatrixShape) {
		const { box } = this.layout(shape, this.displayValues(shape))
		return new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: true })
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	// Grips on the right edge (columns) and the bottom edge (rows): drag to add or remove them.

	override getHandles(shape: MatrixShape): TLHandle[] {
		if (isBusy(playbackFor(this.editor, shape.id))) return []
		const layout = this.layout(shape)
		const [a, b] = getIndices(2)
		return [growHandle(layout.growCols, a, GROW_COLS), growHandle(layout.growRows, b, GROW_ROWS)]
	}

	override onHandleDrag(shape: MatrixShape, { handle, initial = shape }: TLHandleDragInfo<MatrixShape>): TLShapePartial<MatrixShape> | void {
		if (handle.id !== GROW_COLS && handle.id !== GROW_ROWS) return
		const { values, fill, seed, range, marks, rowLabels, colLabels } = initial.props
		const layout = this.layout(initial)
		const { cell } = getMatrixMetrics(initial.props.size)
		const [rows, cols] = [rowsOf(values), colsOf(values)]
		const grow = (n: number, from: { x: number; y: number }, axis: { x: number; y: number }) =>
			Math.min(MAX_MATRIX, grownCount(n, from, handle, axis, cell))
		const [r, c] = handle.id === GROW_COLS ? [rows, grow(cols, layout.growCols, { x: 1, y: 0 })] : [grow(rows, layout.growRows, { x: 0, y: 1 }), cols]
		const grid = resize(values, r, c, (count) => freshValues(values, fill, seed, range, count))
		return this.update(shape, {
			values: grid,
			marks: moveMarks(marks, (i, j) => (i < r && j < c ? [i, j] : undefined)),
			rowLabels: rowLabels.slice(0, r),
			colLabels: colLabels.slice(0, c),
		})
	}

	// A cell's menu: rows and columns through it. Wherever it is right-clicked: the steps, transpose.

	override nodeOperations(shape: MatrixShape, key: string): NodeOperation[] {
		const at = parseCellKey(key)
		if (!at) return []
		const [r, c] = at
		const [rows, cols] = [rowsOf(shape.props.values), colsOf(shape.props.values)]
		const edit = { section: 'actions', group: 'rows' } as const
		const id = shape.id
		return [
			...(rows < MAX_MATRIX
				? [
						{ ...edit, id: 'matrix-row-above', label: 'Insert a row above', run: () => this.addRow(id, r) },
						{ ...edit, id: 'matrix-row-below', label: 'Insert a row below', run: () => this.addRow(id, r + 1) },
					]
				: []),
			...(cols < MAX_MATRIX
				? [
						{ ...edit, id: 'matrix-col-left', label: 'Insert a column left', run: () => this.addCol(id, c) },
						{ ...edit, id: 'matrix-col-right', label: 'Insert a column right', run: () => this.addCol(id, c + 1) },
					]
				: []),
			...(rows > 1 ? [{ ...edit, id: 'matrix-delete-row', label: `Delete row ${r}`, run: () => this.removeRow(id, r) }] : []),
			...(cols > 1 ? [{ ...edit, id: 'matrix-delete-col', label: `Delete column ${c}`, run: () => this.removeCol(id, c) }] : []),
		]
	}

	override shapeOperations(shape: MatrixShape): NodeOperation[] {
		const { values } = shape.props
		const id = shape.id
		const steps = { group: 'visit' }
		const square = rowsOf(values) === colsOf(values) && rowsOf(values) > 1
		const run = (label: string, op: (values: Grid) => MatrixOperation) => () => this.play(id, label, op)
		return [
			{ ...steps, id: 'matrix-row-major', label: 'Visit row by row (row-major)', run: run('traverse', (v) => traverse(v, 'row')) },
			{ ...steps, id: 'matrix-col-major', label: 'Visit column by column (column-major)', run: run('traverse', (v) => traverse(v, 'col')) },
			...(square ? [{ ...steps, id: 'matrix-transpose-steps', label: 'Transpose (swap across the diagonal)', run: run('transpose', transposeSteps) }] : []),
			...(isSortedMatrix(values)
				? [
						{
							group: 'search',
							id: 'matrix-staircase',
							label: 'Find a value (staircase search)',
							prompt: 'Value to find',
							promptAt: cellKey(0, colsOf(values) - 1),
							run: (value?: string) => value !== undefined && this.play(id, 'search', (v) => staircaseSearch(v, value)),
						},
					]
				: []),
			{ section: 'actions', id: 'matrix-transpose', label: 'Transpose', run: () => this.transposeNow(id) },
			{ section: 'actions', id: 'matrix-reroll', label: 'New values', run: () => this.reroll(id) },
			...(shape.props.rowLabels.some(Boolean) || shape.props.colLabels.some(Boolean)
				? [{ section: 'actions' as const, id: 'matrix-clear-labels', label: 'Back to indices (clear labels)', run: () => this.clearLabels(id) }]
				: []),
		]
	}

	override menuName() {
		return 'Matrix'
	}

	override readonly menuId = 'matrix'

	override moves() {
		return [
			'Double-click a cell to type; Tab and the arrows move on',
			'Drag the grips on the right and at the bottom to add columns and rows',
			'Right-click a cell to insert or delete its row or column',
			'Double-click an index to label its row or column (e.g. an address, 0x0); clear it to get the index back',
			'A numbered label carries on down the rows (0x0: 0x1, 0x2...); label the next one too to set the step (0x00, 0x04: 0x08...)',
		]
	}

	private play(id: MatrixShape['id'], label: string, operation: (values: Grid) => MatrixOperation) {
		const shape = this.editor.getShape(id) as MatrixShape | undefined
		if (!shape) return
		const { frames, values, finalFlash } = operation(shape.props.values)
		playOperation(this.editor, {
			shapeId: id,
			label,
			frames,
			final: values && this.update(shape, { values }),
			finalFlash,
			// Shift: the highlights become marks, on cells still there.
			withMarks: (_update, highlights) => {
				const marks = pruneMarks({ ...shape.props.marks, ...highlights }, this.cellKeys(values ?? shape.props.values))
				return this.update(shape, values ? { values, marks } : { marks })
			},
		})
	}

	private cellKeys(values: Grid) {
		return values.flatMap((row, r) => row.map((_, c) => cellKey(r, c)))
	}

	private change(id: MatrixShape['id'], label: string, f: (shape: MatrixShape) => Partial<MatrixShape['props']>) {
		const shape = this.editor.getShape(id) as MatrixShape | undefined
		if (!shape) return
		this.editor.markHistoryStoppingPoint(label)
		this.editor.updateShape(this.update(shape, f(shape)))
	}

	private fresh(shape: MatrixShape, count: number) {
		const { values, fill, seed, range } = shape.props
		return freshValues(values, fill, (seed + values.flat().length * 7919) >>> 0, range, count)
	}

	private addRow(id: MatrixShape['id'], at: number) {
		this.change(id, 'insert row', (s) => ({
			values: insertRow(s.props.values, at, this.fresh(s, colsOf(s.props.values))),
			marks: moveMarks(s.props.marks, (r, c) => [shiftAt(at, 1)(r)!, c]),
			rowLabels: shiftLabels(s.props.rowLabels, rowsOf(s.props.values), at, 1),
		}))
	}

	private addCol(id: MatrixShape['id'], at: number) {
		this.change(id, 'insert column', (s) => ({
			values: insertCol(s.props.values, at, this.fresh(s, rowsOf(s.props.values))),
			marks: moveMarks(s.props.marks, (r, c) => [r, shiftAt(at, 1)(c)!]),
			colLabels: shiftLabels(s.props.colLabels, colsOf(s.props.values), at, 1),
		}))
	}

	private removeRow(id: MatrixShape['id'], at: number) {
		this.change(id, 'delete row', (s) => ({
			values: deleteRow(s.props.values, at),
			rowLabels: shiftLabels(s.props.rowLabels, rowsOf(s.props.values), at, -1),
			marks: moveMarks(s.props.marks, (r, c) => {
				const to = shiftAt(at, -1)(r)
				return to === undefined ? undefined : [to, c]
			}),
		}))
	}

	private removeCol(id: MatrixShape['id'], at: number) {
		this.change(id, 'delete column', (s) => ({
			values: deleteCol(s.props.values, at),
			colLabels: shiftLabels(s.props.colLabels, colsOf(s.props.values), at, -1),
			marks: moveMarks(s.props.marks, (r, c) => {
				const to = shiftAt(at, -1)(c)
				return to === undefined ? undefined : [r, to]
			}),
		}))
	}

	/** Transpose at once (any shape: rows x cols becomes cols x rows); marks and labels go with their values. */
	private transposeNow(id: MatrixShape['id']) {
		this.change(id, 'transpose', (s) => ({
			values: transpose(s.props.values),
			marks: moveMarks(s.props.marks, (r, c) => [c, r]),
			rowLabels: s.props.colLabels,
			colLabels: s.props.rowLabels,
		}))
	}

	private clearLabels(id: MatrixShape['id']) {
		this.change(id, 'clear labels', () => ({ rowLabels: [], colLabels: [] }))
	}

	private reroll(id: MatrixShape['id']) {
		const seed = newSeed()
		this.change(id, 'new values', (s) => ({ seed, values: matrixValues(s.props.fill, seed, rowsOf(s.props.values), colsOf(s.props.values), s.props.range) }))
	}

	private update(shape: MatrixShape, props: Partial<MatrixShape['props']>): TLShapePartial<MatrixShape> {
		return { id: shape.id, type: MATRIX_SHAPE_TYPE, props }
	}

	// Pointers: a step's i sits at a row's index (left), j at a column's (above).

	pointerAnchor(shape: MatrixShape, key: string): PointerAnchor | undefined {
		const layout = this.layout(shape, this.displayValues(shape))
		const row = /^row:(\d+)$/.exec(key)
		if (row) return { box: layout.rowIndexBox(Number(row[1])), side: 'left' }
		const col = /^col:(\d+)$/.exec(key)
		if (col) return { box: layout.colIndexBox(Number(col[1])), side: 'above' }
		return undefined
	}

	/** The values being shown: while an operation plays, its step's. */
	displayValues(shape: MatrixShape, frame: Frame | undefined = playbackFor(this.editor, shape.id)?.frame): Grid {
		return (frame?.props as { values?: Grid } | undefined)?.values ?? shape.props.values
	}

	override playbackLayout(shape: MatrixShape, frame: Frame | undefined): PlaybackLayout {
		const values = this.displayValues(shape, frame)
		const metrics = getMatrixMetrics(shape.props.size)
		const { box } = this.layout(shape, values)
		const fontSize = this.getPointerFontSize(shape)
		return {
			left: box.x,
			bottom: box.y + box.h,
			metrics: { fontSize: metrics.fontSize, labelFontSize: metrics.indexFontSize, strokeWidth: metrics.strokeWidth },
			color: shape.props.color,
			fontFamily: this.getFontFamily(shape),
			pointers: frame?.pointers && {
				placed: placePointers(frame.pointers, (key) => this.pointerAnchor(shape, key), fontSize),
				fontSize,
				slots: [],
			},
		}
	}

	component(shape: MatrixShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const playing = playbackFor(this.editor, shape.id)
		const frame = playing?.frame
		const editing = this.getEditingKey(shape)
		const layout = this.layout(shape)
		const controls = showsStructureControls(this.editor, shape) && !isBusy(playing)
		const zoom = this.editor.getZoomLevel()
		return (
			<>
				<SVGContainer>
					<MatrixSvg
						values={this.displayValues(shape)}
						{...labelsOf(shape)}
						marks={shape.props.marks}
						color={shape.props.color}
						metrics={getMatrixMetrics(shape.props.size)}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						hiddenKey={editing}
						flash={playing && { marks: playing.flash, fading: playing.fading, id: playing.id }}
						dim={playing && !playing.fading ? (playing.dim ?? []) : undefined}
						pulse={playing && !playing.fading ? playing.pulse : undefined}
						swaps={frame?.swaps?.length && playing ? { pairs: frame.swaps, id: playing.id, ms: animationMs(SWAP_MS, playing) } : undefined}
						cues={showsColourCues()}
					/>
					{controls && (
						<>
							<GrowGrip at={layout.growCols} zoom={zoom} colors={colors} />
							<GrowGrip at={layout.growRows} zoom={zoom} colors={colors} />
						</>
					)}
				</SVGContainer>
				{this.renderOperationPrompt(shape, colors)}
				{this.renderCellEditor(shape)}
			</>
		)
	}

	override toSvg(shape: MatrixShape, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		// Exporting an operation's steps: this one as the canvas shows it, with its pointers, strips and caption.
		const step = exportingStep(this.editor, shape.id)
		if (step) {
			return (
				<>
					<MatrixSvg
						values={this.displayValues(shape)}
						{...labelsOf(shape)}
						marks={shape.props.marks}
						color={shape.props.color}
						metrics={getMatrixMetrics(shape.props.size)}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						flash={{ marks: step.flash, fading: false, id: step.id }}
						dim={step.dim ?? []}
						cues={showsColourCues()}
					/>
					<StepExtrasSvg util={this as unknown as CellShapeUtil<TLShape>} shape={shape} view={step} colors={colors} />
				</>
			)
		}
		return (
			<MatrixSvg
				values={shape.props.values}
				{...labelsOf(shape)}
				marks={shape.props.marks}
				color={shape.props.color}
				metrics={getMatrixMetrics(shape.props.size)}
				colors={colors}
				fontFamily={this.getFontFamily(shape)}
				cues={showsColourCues()}
			/>
		)
	}

	getIndicatorPath(shape: MatrixShape) {
		const { cells } = this.layout(shape, this.displayValues(shape))
		const path = new Path2D()
		path.rect(cells.x, cells.y, cells.w, cells.h)
		return path
	}

	override getFontFaces(shape: MatrixShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}

	getCellFont(shape: MatrixShape, key?: string) {
		const header = key === undefined ? undefined : parseHeaderKey(key)
		const fontSize = header ? getMatrixMetrics(shape.props.size).fontSize * 0.8 : getMatrixMetrics(shape.props.size).fontSize
		return { fontFamily: this.getFontFamily(shape), fontSize }
	}

	private getFontFamily(shape: MatrixShape) {
		return this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
	}
}

const headersOf = (shape: MatrixShape): MatrixHeaders => ({ rows: shape.props.rowLabels, cols: shape.props.colLabels })
const labelsOf = (shape: MatrixShape) => ({ rowLabels: shape.props.rowLabels, colLabels: shape.props.colLabels })

/**
 * The grid: cells, marks and a step's highlights, faded cells, values (swapping ones arc), and the
 * row and column headers (indices, or labels such as a graph's node names; marks and highlights
 * keyed `row:<r>` / `col:<c>` tint them).
 */
export function MatrixSvg({
	values,
	marks,
	color,
	metrics,
	colors,
	fontFamily,
	hiddenKey,
	flash,
	dim,
	pulse,
	swaps,
	rowLabels,
	colLabels,
	cues,
}: {
	values: Grid
	marks: Marks
	color: MatrixShape['props']['color']
	metrics: MatrixMetrics
	colors: TLThemeColors
	fontFamily: string
	hiddenKey?: string
	flash?: { marks: Marks; fading: boolean; id: number }
	dim?: readonly string[]
	/** Canvas only, in predict mode: cells the play bar's question is about (`r,c`), ringed in pulsing violet. */
	pulse?: readonly string[]
	swaps?: { pairs: [string, string][]; id: number; ms: number }
	/** Headers in place of the indices ('' keeps the index). */
	rowLabels?: readonly string[]
	colLabels?: readonly string[]
	/** Colour-blind cues: marked and highlighted cells and headers get a shape badge (`cues.ts`). */
	cues?: boolean
}) {
	const [rows, cols] = [rowsOf(values), colsOf(values)]
	const layout = getMatrixLayout(rows, cols, metrics, { rows: rowLabels, cols: colLabels })
	const { cells } = layout
	const { cell, strokeWidth } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const textSize = (value: string) => metrics.fontSize * Math.min(1, 2.5 / Math.max(1, value.length))
	const faded = new Set(dim)
	const all = values.flatMap((row, r) => row.map((value, c) => ({ r, c, value, key: cellKey(r, c), box: layout.cellBox(r, c) })))
	const tint = (c: MarkColor, key: string, className?: string, box = layout.cellBox(...parseCellKey(key)!)) => (
		<g key={key} className={className}>
			<rect
				x={box.x}
				y={box.y}
				width={cell}
				height={cell}
				fill={getColorValue(colors, c, 'semi')}
				stroke={getColorValue(colors, c, 'solid')}
				strokeWidth={strokeWidth * 1.6}
				strokeLinejoin="round"
			/>
			{cues && (
				<CueBadge
					color={c}
					at={cueBadgeAt({ x: box.x + cell / 2, y: box.y + cell / 2, w: cell, h: cell }, false, strokeWidth * 1.2)}
					colors={colors}
					strokeWidth={strokeWidth}
				/>
			)}
		</g>
	)
	// A swapped value arcs in from its partner's cell, the two passing on either side.
	const swapStyle = (key: string): CSSProperties | undefined => {
		for (const [a, b] of swaps?.pairs ?? []) {
			if (key !== a && key !== b) continue
			const [self, other] = [layout.cellBox(...parseCellKey(key)!), layout.cellBox(...parseCellKey(key === a ? b : a)!)]
			const [dx, dy] = [other.x - self.x, other.y - self.y]
			const len = Math.hypot(dx, dy) || 1
			const lift = (key === a ? 1 : -1) * Math.min(len * 0.3, cell)
			return {
				'--from-x': `${dx}px`,
				'--from-y': `${dy}px`,
				'--mid-x': `${dx / 2 + (-dy / len) * lift}px`,
				'--mid-y': `${dy / 2 + (dx / len) * lift}px`,
				animation: `drawds-swap ${swaps?.ms ?? SWAP_MS}ms ease-in-out`,
			} as CSSProperties
		}
		return undefined
	}
	return (
		<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central">
			<rect
				x={cells.x}
				y={cells.y}
				width={cells.w}
				height={cells.h}
				fill={getColorValue(colors, color, 'semi')}
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
			/>
			{Array.from({ length: cols - 1 }, (_, k) => (
				<line key={`v${k}`} x1={cells.x + (k + 1) * cell} y1={cells.y} x2={cells.x + (k + 1) * cell} y2={cells.y + cells.h} stroke={stroke} strokeWidth={strokeWidth} />
			))}
			{Array.from({ length: rows - 1 }, (_, k) => (
				<line key={`h${k}`} x1={cells.x} y1={cells.y + (k + 1) * cell} x2={cells.x + cells.w} y2={cells.y + (k + 1) * cell} stroke={stroke} strokeWidth={strokeWidth} />
			))}
			{all.map(({ key }) => (marks[key] ? tint(marks[key], `mark-${key}`, undefined, layout.cellBox(...parseCellKey(key)!)) : null))}
			{flash &&
				all.map(({ key, box }) =>
					flash.marks[key] ? tint(flash.marks[key], `flash-${key}-${flash.id}`, flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash', box) : null
				)}
			{dim &&
				all.map(({ key, box }) => (
					<rect
						key={`dim-${key}`}
						x={box.x}
						y={box.y}
						width={cell}
						height={cell}
						fill={colors.background}
						opacity={faded.has(key) ? 0.6 : 0}
						style={{ transition: 'opacity 300ms ease-in-out' }}
					/>
				))}
			{pulse?.map((key) => {
				const at = parseCellKey(key)
				if (!at || at[0] >= rows || at[1] >= cols) return null
				const box = layout.cellBox(...at)
				// Inside the cell, as an array's: neighbours share its edges.
				return (
					<rect
						key={`pulse-${key}`}
						className="drawds-pulse"
						data-pulse={key}
						x={box.x + strokeWidth * 2}
						y={box.y + strokeWidth * 2}
						width={cell - strokeWidth * 4}
						height={cell - strokeWidth * 4}
						rx={strokeWidth}
						fill="none"
						stroke={getColorValue(colors, 'violet', 'solid')}
						strokeWidth={strokeWidth * 2}
					/>
				)
			})}
			{all.map(({ key, value, box }) => {
				if (key === hiddenKey) return null
				const swap = swapStyle(key)
				return (
					<text
						key={swap && swaps ? `${key}:swap-${swaps.id}` : key}
						x={box.x + cell / 2}
						y={box.y + cell / 2}
						fontSize={textSize(value)}
						fill={colors.text}
						opacity={faded.has(key) ? 0.35 : 1}
						style={{ ...swap, transition: 'opacity 300ms ease-in-out' }}
					>
						{value}
					</text>
				)
			})}
			{[...Array.from({ length: rows }, (_, r) => ['row', r] as const), ...Array.from({ length: cols }, (_, c) => ['col', c] as const)].map(([side, i]) => {
				const key = `${side}:${i}`
				const box = side === 'row' ? layout.rowIndexBox(i) : layout.colIndexBox(i)
				const tintColor = flash?.marks[key] ?? marks[key]
				// A header's badge goes beside it, in the room its row or column leaves: under a row index, right of a column's.
				const r = box.h * 0.42
				const badge = side === 'row' ? { x: box.x + box.w / 2, y: box.y + box.h + r + 0.5, r } : { x: box.x + box.w + r + 1, y: box.y + box.h / 2, r }
				return tintColor ? (
					<g
						key={`tint-${key}-${flash?.id ?? 0}`}
						className={flash?.marks[key] ? (flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash') : undefined}
					>
						<rect x={box.x} y={box.y} width={box.w} height={box.h} rx={box.h / 3} fill={getColorValue(colors, tintColor, 'semi')} />
						{cues && <CueBadge color={tintColor} at={badge} colors={colors} strokeWidth={strokeWidth} />}
					</g>
				) : null
			})}
			{Array.from({ length: rows }, (_, r) => {
				if (hiddenKey === rowKey(r)) return null
				const at = layout.rowIndexAt(r)
				const { text, labelled, fontSize } = layout.rowHeader(r)
				return (
					<text key={`ri${r}`} data-row-index={r} x={at.x} y={at.y} fontSize={fontSize} fill={colors.text} opacity={labelled ? 0.9 : 0.5}>
						{text}
					</text>
				)
			})}
			{Array.from({ length: cols }, (_, c) => {
				if (hiddenKey === colKey(c)) return null
				const at = layout.colIndexAt(c)
				const { text, labelled, fontSize } = layout.colHeader(c)
				return (
					<text key={`ci${c}`} data-col-index={c} x={at.x} y={at.y} fontSize={fontSize} fill={colors.text} opacity={labelled ? 0.9 : 0.5}>
						{text}
					</text>
				)
			})}
		</g>
	)
}

export { rowKey, colKey }
