import {
	Rectangle2d,
	SVGContainer,
	ShapeUtil,
	getColorValue,
	type SvgExportContext,
	type TLFontFace,
	type TLShapeId,
	type TLThemeColors,
} from 'tldraw'
import { CueBadge } from '../../cells/CueBadge'
import { cueBadgeAt, showsColourCues } from '../../cells/cues'
import type { MarkColor, Marks } from '../../cells/marks'
import { exportingStep } from '../../export/exporting'
import { arrowHead } from '../../nodelink/geometry'
import { playbackFor } from '../../nodelink/playback'
import { logOf } from '../../transcript/log'
import { ARRAY_SHAPE_TYPE, type ArrayShape } from '../array/array-shape-types'
import { chainKeys, listVariant, SENTINEL_KEY } from '../list/layout'
import { LIST_SHAPE_TYPE, type ListShape } from '../list/list-shape-types'
import { getMatrixMetrics } from '../matrix/layout'
import { CHAR_WIDTH } from '../recursion/calls'
import { MEMORY_COLS, address, memoryLayout, runRows, type MemoryInput, type MemoryLayout } from './model'
import { MEMORY_TYPE, memoryShapeMigrations, memoryShapeProps, type MemoryShape } from './memory-shape-types'

type Structure = ArrayShape | ListShape

/** The structure as the memory model takes it: an array's cells (spare ones blank), a list's nodes and pointers. */
export function memoryInput(structure: Structure): MemoryInput {
	if (structure.type === ARRAY_SHAPE_TYPE) {
		// The name the code beside it gives it.
		const first = logOf(structure)?.[0]
		return { kind: 'array', name: first?.op === 'new' ? first.name : 'a', values: structure.props.values }
	}
	const props = structure.props
	const variant = listVariant(props, props.nodes)
	const chain = chainKeys(props)
	const values = new Map(props.nodes.map((n) => [n.id, n.value]))
	const last = chain.at(-1)
	const listLast = props.nodes.at(-1)?.id ?? null
	const next = Object.fromEntries(chain.map((id, i) => [id, chain[i + 1] ?? (variant.circular ? chain[0] : (variant.cycleTo ?? null))]))
	const prev = variant.doubly ? Object.fromEntries(chain.map((id, i) => [id, chain[i - 1] ?? (variant.circular ? (last ?? null) : null)])) : undefined
	return {
		kind: 'list',
		nodes: chain.map((id) => ({ id, value: id === SENTINEL_KEY ? '' : (values.get(id) ?? '') })),
		doubly: variant.doubly,
		next,
		prev,
		names: [{ name: variant.names.head, at: chain[0] ?? null }, ...(variant.tail ? [{ name: variant.names.tail, at: listLast }] : [])],
	}
}

/**
 * A structure in memory (lecture 5, dds-szw.25), beside it: an array as one block of cells, a
 * linked list's nodes wherever there is room, with the pointers between them; other data in some
 * cells, as busy as the style panel says. Redrawn whenever the structure changes (it reads it as it
 * renders); the structure's marks show on it, and so do an operation's steps.
 */
export class MemoryShapeUtil extends ShapeUtil<MemoryShape> {
	static override type = MEMORY_TYPE
	static override props = memoryShapeProps
	static override migrations = memoryShapeMigrations

	getDefaultProps(): MemoryShape['props'] {
		return { structureId: '', busy: 'some', seed: 1, color: 'black', size: 'm', font: 'mono' }
	}

	private structure(shape: MemoryShape): Structure | undefined {
		const s = this.editor.getShape(shape.props.structureId as TLShapeId)
		return s && (s.type === ARRAY_SHAPE_TYPE || s.type === LIST_SHAPE_TYPE) ? (s as Structure) : undefined
	}

	/** The structure in memory, as the step on screen has it (`live`) or as it is. */
	private content(shape: MemoryShape, live = true) {
		const structure = this.structure(shape)
		if (!structure) return undefined
		const playing = live ? playbackFor(this.editor, structure.id) : undefined
		const shown = playing?.frame?.props ? ({ ...structure, props: { ...structure.props, ...playing.frame.props } } as Structure) : structure
		const memory = memoryLayout(memoryInput(shown), shape.props.busy, shape.props.seed)
		const metrics = getMatrixMetrics(shape.props.size)
		const { cell } = metrics
		const fontSize = Math.round(cell * 0.3)
		const lineH = fontSize * 1.5
		const title = `memory: ${memory.rows * MEMORY_COLS} cells`
		const lines = [...memory.legend, ...(memory.note ?? [])]
		const charW = fontSize * CHAR_WIDTH[shape.props.font]
		const grid = { x: 0, y: lineH, w: MEMORY_COLS * cell, h: memory.rows * cell }
		const box = {
			w: Math.max(grid.w, ...[title, ...lines].map((l) => l.length * charW)),
			h: grid.y + grid.h + lines.length * lineH + (lines.length ? fontSize * 0.5 : 0),
		}
		return { structure, playing, memory, metrics, fontSize, lineH, title, lines, grid, box }
	}

	getGeometry(shape: MemoryShape) {
		const box = this.content(shape)?.box ?? { w: 200, h: 40 }
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

	component(shape: MemoryShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		return <SVGContainer>{this.draw(shape, colors, true)}</SVGContainer>
	}

	override toSvg(shape: MemoryShape, ctx: SvgExportContext) {
		// Exporting its structure's steps: the step, as on the canvas.
		const live = !!exportingStep(this.editor, shape.props.structureId as TLShapeId)
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], live)
	}

	private draw(shape: MemoryShape, colors: TLThemeColors, live: boolean) {
		const content = this.content(shape, live)
		const fontFamily = this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
		if (!content) {
			return (
				<text x={0} y={20} fontFamily={fontFamily} fontSize={14} fill={colors.text} opacity={0.6}>
					(the structure is gone)
				</text>
			)
		}
		const { structure, playing, memory, metrics, fontSize, lineH, title, lines, grid } = content
		const flash = playing && { marks: playing.flash, fading: playing.fading, id: playing.id }
		return (
			<g fontFamily={fontFamily}>
				<text x={0} y={lineH / 2} fontSize={fontSize} fill={colors.text} opacity={0.75} dominantBaseline="central">
					{title}
				</text>
				<g transform={`translate(${grid.x}, ${grid.y})`}>
					<MemorySvg memory={memory} metrics={metrics} colors={colors} color={shape.props.color} marks={structure.props.marks} flash={flash} cues={showsColourCues()} />
				</g>
				{lines.map((line, i) => (
					<text
						key={i}
						data-memory-line={i}
						x={0}
						y={grid.y + grid.h + fontSize * 0.5 + lineH * (i + 0.5)}
						fontSize={fontSize}
						fill={i >= memory.legend.length ? getColorValue(colors, 'red', 'solid') : colors.text}
						dominantBaseline="central"
					>
						{line}
					</text>
				))}
			</g>
		)
	}

	getIndicatorPath(shape: MemoryShape) {
		const box = this.content(shape)?.box ?? { w: 200, h: 40 }
		const path = new Path2D()
		path.rect(0, 0, box.w, box.h)
		return path
	}

	override getFontFaces(shape: MemoryShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}
}

/**
 * The grid: each cell's address in its corner and what it holds; other data hatched; the array's
 * block and each node outlined; the pointers chased as arrows (prev ones dashed), under the values.
 */
function MemorySvg({
	memory,
	metrics,
	colors,
	color,
	marks,
	flash,
	cues,
}: {
	memory: MemoryLayout
	metrics: ReturnType<typeof getMatrixMetrics>
	colors: TLThemeColors
	color: MemoryShape['props']['color']
	marks: Marks
	flash?: { marks: Marks; fading: boolean; id: number }
	cues: boolean
}) {
	const { cell, strokeWidth, fontSize, indexFontSize } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const boxOf = (a: number) => ({ x: (a % MEMORY_COLS) * cell, y: Math.floor(a / MEMORY_COLS) * cell })
	const centre = (a: number) => {
		const b = boxOf(a)
		return { x: b.x + cell / 2, y: b.y + cell / 2 }
	}
	const textSize = (value: string) => fontSize * Math.min(1, 2.5 / Math.max(1, value.length))
	const tint = (c: MarkColor, a: number, key: string, className?: string) => {
		const b = boxOf(a)
		return (
			<g key={key} className={className}>
				<rect x={b.x} y={b.y} width={cell} height={cell} fill={getColorValue(colors, c, 'semi')} stroke={getColorValue(colors, c, 'solid')} strokeWidth={strokeWidth * 1.6} />
				{cues && <CueBadge color={c} at={cueBadgeAt({ x: b.x + cell / 2, y: b.y + cell / 2, w: cell, h: cell }, false, strokeWidth * 1.2)} colors={colors} strokeWidth={strokeWidth} />}
			</g>
		)
	}
	const [rows, w] = [memory.rows, MEMORY_COLS * cell]
	const h = rows * cell
	const hatch = getColorValue(colors, 'grey', 'solid')
	return (
		<g textAnchor="middle" dominantBaseline="central">
			<rect x={0} y={0} width={w} height={h} fill={colors.background} stroke={stroke} strokeWidth={strokeWidth} />
			{memory.cells.map((c, a) => {
				if (c.role !== 'other') return null
				const b = boxOf(a)
				// Other data: hatched, nothing of ours.
				return (
					<g key={`other-${a}`} data-memory-other={a} stroke={hatch} strokeWidth={strokeWidth * 0.8} opacity={0.45}>
						{[0.25, 0.5, 0.75].map((t) => (
							<line key={t} x1={b.x + cell * t} y1={b.y} x2={b.x} y2={b.y + cell * t} />
						))}
						{[0.25, 0.5, 0.75].map((t) => (
							<line key={`b${t}`} x1={b.x + cell} y1={b.y + cell * t} x2={b.x + cell * t} y2={b.y + cell} />
						))}
					</g>
				)
			})}
			{Array.from({ length: MEMORY_COLS - 1 }, (_, k) => (
				<line key={`v${k}`} x1={(k + 1) * cell} y1={0} x2={(k + 1) * cell} y2={h} stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={0.5} />
			))}
			{Array.from({ length: rows - 1 }, (_, k) => (
				<line key={`h${k}`} x1={0} y1={(k + 1) * cell} x2={w} y2={(k + 1) * cell} stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={0.5} />
			))}
			{memory.cells.map((c, a) => (c.key !== undefined && marks[c.key] ? tint(marks[c.key], a, `mark-${a}`) : null))}
			{flash &&
				memory.cells.map((c, a) =>
					c.key !== undefined && flash.marks[c.key] ? tint(flash.marks[c.key], a, `flash-${a}-${flash.id}`, flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash') : null
				)}
			{memory.blocks.flatMap((block) =>
				runRows(block.from, block.to).map((run) => (
					<rect
						key={`block-${block.key}-${run.row}`}
						data-memory-block={block.key}
						x={run.from * cell}
						y={run.row * cell}
						width={(run.to - run.from + 1) * cell}
						height={cell}
						fill="none"
						stroke={stroke}
						strokeWidth={strokeWidth * 2.2}
						strokeLinejoin="round"
					/>
				))
			)}
			{memory.cells.map((_, a) => {
				const b = boxOf(a)
				return (
					<text key={`addr-${a}`} x={b.x + strokeWidth * 2} y={b.y + indexFontSize * 0.55} fontSize={indexFontSize * 0.75} fill={colors.text} opacity={0.5} textAnchor="start">
						{address(a)}
					</text>
				)
			})}
			{memory.arrows.map(({ from, to, prev }, k) => {
				const [p, q] = [centre(from), centre(to)]
				const [dx, dy] = [q.x - p.x, q.y - p.y]
				const len = Math.hypot(dx, dy) || 1
				// Curved off the straight line, so arrows along a row don't run through the cells between.
				const lift = Math.min(cell * 0.9, len * 0.35)
				const c = { x: (p.x + q.x) / 2 + (-dy / len) * lift, y: (p.y + q.y) / 2 + (dx / len) * lift }
				// Leave the target cell's middle for its value: the tip stops short of it.
				const back = Math.hypot(q.x - c.x, q.y - c.y) || 1
				const tip = { x: q.x - ((q.x - c.x) / back) * cell * 0.32, y: q.y - ((q.y - c.y) / back) * cell * 0.32 }
				const angle = Math.atan2(tip.y - c.y, tip.x - c.x)
				const arrow = getColorValue(colors, 'violet', 'solid')
				return (
					<g key={`arrow-${k}`} data-memory-arrow={`${from}-${to}`} opacity={prev ? 0.5 : 0.9}>
						<circle cx={p.x} cy={p.y + cell * 0.28} r={strokeWidth * 1.8} fill={arrow} />
						<path
							d={`M ${p.x} ${p.y + cell * 0.28} Q ${c.x} ${c.y} ${tip.x} ${tip.y}`}
							fill="none"
							stroke={arrow}
							strokeWidth={strokeWidth * 1.6}
							strokeDasharray={prev ? `${strokeWidth * 3} ${strokeWidth * 2}` : undefined}
						/>
						<polygon points={arrowHead(tip, angle, cell * 0.2)} fill={arrow} />
					</g>
				)
			})}
			{memory.cells.map((c, a) => {
				if (!c.text) return null
				const b = boxOf(a)
				const pointer = c.role === 'next' || c.role === 'prev'
				return (
					<text
						key={`value-${a}`}
						data-memory-cell={a}
						x={b.x + cell / 2}
						y={b.y + cell * 0.58}
						fontSize={textSize(c.text) * (pointer ? 0.8 : 1)}
						fill={colors.text}
						opacity={pointer ? 0.8 : 1}
						// A halo, so an arrow passing under it leaves it readable.
						stroke={colors.background}
						strokeWidth={strokeWidth * 2.5}
						paintOrder="stroke"
					>
						{c.text}
					</text>
				)
			})}
		</g>
	)
}
