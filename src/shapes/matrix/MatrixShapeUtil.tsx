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
	type TLShapePartial,
	type TLThemeColors,
} from 'tldraw'
import { CellShapeUtil, type NodeOperation, type PlaybackLayout } from '../../cells/CellShapeUtil'
import { pruneMarks, type Marks } from '../../cells/marks'
import { growHandle, grownCount } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import type { Refillable } from '../../data/fill-style'
import { newSeed } from '../../data/random'
import { animationMs, isBusy, playOperation, playbackFor, type Frame } from '../../nodelink/playback'
import { placePointers, type PointerAnchor } from '../../pointers/layout'
import { matrixCells } from './cells'
import { cellKey, getMatrixLayout, getMatrixMetrics, parseCellKey, type MatrixMetrics } from './layout'
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
		return getMatrixLayout(rowsOf(values), colsOf(values), getMatrixMetrics(shape.props.size))
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
		const { values, fill, seed, range, marks } = initial.props
		const layout = this.layout(initial)
		const { cell } = getMatrixMetrics(initial.props.size)
		const [rows, cols] = [rowsOf(values), colsOf(values)]
		const grow = (n: number, from: { x: number; y: number }, axis: { x: number; y: number }) =>
			Math.min(MAX_MATRIX, grownCount(n, from, handle, axis, cell))
		const [r, c] = handle.id === GROW_COLS ? [rows, grow(cols, layout.growCols, { x: 1, y: 0 })] : [grow(rows, layout.growRows, { x: 0, y: 1 }), cols]
		const grid = resize(values, r, c, (count) => freshValues(values, fill, seed, range, count))
		return this.update(shape, { values: grid, marks: moveMarks(marks, (i, j) => (i < r && j < c ? [i, j] : undefined)) })
	}

	// A cell's menu: rows and columns through it. Wherever it is right-clicked: the steps, transpose.

	override nodeOperations(shape: MatrixShape, key: string): NodeOperation[] {
		const at = parseCellKey(key)
		if (!at) return []
		const [r, c] = at
		const [rows, cols] = [rowsOf(shape.props.values), colsOf(shape.props.values)]
		const edit = { submenu: 'Rows and columns', submenuId: 'matrix-edit' }
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
		const steps = { submenu: 'Step by step', submenuId: 'matrix-steps' }
		const square = rowsOf(values) === colsOf(values) && rowsOf(values) > 1
		const run = (label: string, op: (values: Grid) => MatrixOperation) => () => this.play(id, label, op)
		return [
			{ ...steps, id: 'matrix-row-major', label: 'Visit row by row (row-major)', run: run('traverse', (v) => traverse(v, 'row')) },
			{ ...steps, id: 'matrix-col-major', label: 'Visit column by column', run: run('traverse', (v) => traverse(v, 'col')) },
			...(square ? [{ ...steps, id: 'matrix-transpose-steps', label: 'Transpose (swap across the diagonal)', run: run('transpose', transposeSteps) }] : []),
			...(isSortedMatrix(values)
				? [
						{
							...steps,
							id: 'matrix-staircase',
							label: 'Find a value (staircase search)',
							prompt: 'Value to find',
							promptAt: cellKey(0, colsOf(values) - 1),
							run: (value?: string) => value !== undefined && this.play(id, 'search', (v) => staircaseSearch(v, value)),
						},
					]
				: []),
			{ submenu: 'Matrix', submenuId: 'matrix-actions', id: 'matrix-transpose', label: 'Transpose', run: () => this.transposeNow(id) },
			{ submenu: 'Matrix', submenuId: 'matrix-actions', id: 'matrix-reroll', label: 'New values', run: () => this.reroll(id) },
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
		}))
	}

	private addCol(id: MatrixShape['id'], at: number) {
		this.change(id, 'insert column', (s) => ({
			values: insertCol(s.props.values, at, this.fresh(s, rowsOf(s.props.values))),
			marks: moveMarks(s.props.marks, (r, c) => [r, shiftAt(at, 1)(c)!]),
		}))
	}

	private removeRow(id: MatrixShape['id'], at: number) {
		this.change(id, 'delete row', (s) => ({
			values: deleteRow(s.props.values, at),
			marks: moveMarks(s.props.marks, (r, c) => {
				const to = shiftAt(at, -1)(r)
				return to === undefined ? undefined : [to, c]
			}),
		}))
	}

	private removeCol(id: MatrixShape['id'], at: number) {
		this.change(id, 'delete column', (s) => ({
			values: deleteCol(s.props.values, at),
			marks: moveMarks(s.props.marks, (r, c) => {
				const to = shiftAt(at, -1)(c)
				return to === undefined ? undefined : [r, to]
			}),
		}))
	}

	/** Transpose at once (any shape: rows x cols becomes cols x rows); marks go with their values. */
	private transposeNow(id: MatrixShape['id']) {
		this.change(id, 'transpose', (s) => ({ values: transpose(s.props.values), marks: moveMarks(s.props.marks, (r, c) => [c, r]) }))
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
		const { box } = getMatrixLayout(rowsOf(values), colsOf(values), metrics)
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
						marks={shape.props.marks}
						color={shape.props.color}
						metrics={getMatrixMetrics(shape.props.size)}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						hiddenKey={editing}
						flash={playing && { marks: playing.flash, fading: playing.fading, id: playing.id }}
						dim={playing && !playing.fading ? (playing.dim ?? []) : undefined}
						swaps={frame?.swaps?.length && playing ? { pairs: frame.swaps, id: playing.id, ms: animationMs(SWAP_MS, playing) } : undefined}
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
		return (
			<MatrixSvg
				values={shape.props.values}
				marks={shape.props.marks}
				color={shape.props.color}
				metrics={getMatrixMetrics(shape.props.size)}
				colors={colors}
				fontFamily={this.getFontFamily(shape)}
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

	getCellFont(shape: MatrixShape) {
		return { fontFamily: this.getFontFamily(shape), fontSize: getMatrixMetrics(shape.props.size).fontSize }
	}

	private getFontFamily(shape: MatrixShape) {
		return this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
	}
}

/** The grid: cells, marks and a step's highlights, faded cells, values (swapping ones arc), indices. */
function MatrixSvg({
	values,
	marks,
	color,
	metrics,
	colors,
	fontFamily,
	hiddenKey,
	flash,
	dim,
	swaps,
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
	swaps?: { pairs: [string, string][]; id: number; ms: number }
}) {
	const [rows, cols] = [rowsOf(values), colsOf(values)]
	const layout = getMatrixLayout(rows, cols, metrics)
	const { cells } = layout
	const { cell, strokeWidth } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const textSize = (value: string) => metrics.fontSize * Math.min(1, 2.5 / Math.max(1, value.length))
	const faded = new Set(dim)
	const all = values.flatMap((row, r) => row.map((value, c) => ({ r, c, value, key: cellKey(r, c), box: layout.cellBox(r, c) })))
	const tint = (c: string, key: string, className?: string, box = layout.cellBox(...parseCellKey(key)!)) => (
		<rect
			key={key}
			className={className}
			x={box.x}
			y={box.y}
			width={cell}
			height={cell}
			fill={getColorValue(colors, c as never, 'semi')}
			stroke={getColorValue(colors, c as never, 'solid')}
			strokeWidth={strokeWidth * 1.6}
			strokeLinejoin="round"
		/>
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
			{Array.from({ length: rows }, (_, r) => {
				const at = layout.rowIndexAt(r)
				return (
					<text key={`ri${r}`} data-row-index={r} x={at.x} y={at.y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.5}>
						{r}
					</text>
				)
			})}
			{Array.from({ length: cols }, (_, c) => {
				const at = layout.colIndexAt(c)
				return (
					<text key={`ci${c}`} data-col-index={c} x={at.x} y={at.y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.5}>
						{c}
					</text>
				)
			})}
		</g>
	)
}

export { rowKey, colKey }
