import type { CSSProperties } from 'react'
import { getColorValue, type TLThemeColors } from 'tldraw'
import { CueBadge } from '../../cells/CueBadge'
import { cueBadgeAt } from '../../cells/cues'
import type { Marks } from '../../cells/marks'
import { usedCount, type ArrayShape } from './array-shape-types'
import { arrayMetricsOf } from './cells'
import type { AuxRow } from './operations'
import { isUsed } from './kinds'
import { getArrayLayout, getAuxLayout, type ArrayMetrics } from './layout'
import { type Slides, type SwapDrag } from './swap'

/** How long values take to arc into their new cells (a swap, a sort, a shift). */
export const SLIDE_MS = 450

export function ArraySvg({
	shape,
	colors,
	fontFamily,
	hiddenIndex,
	drag,
	slides,
	flash,
	badges,
	dim,
	pulse,
	offEnd = [],
	aux,
	cross,
	cues,
	metrics = arrayMetricsOf(shape),
}: {
	shape: ArrayShape
	/** The shape's own metrics: a step showing more cells mustn't move an upright array's origin. */
	metrics?: ArrayMetrics
	colors: TLThemeColors
	fontFamily: string
	/** Indices just off the array that a pointer is at: drawn as dashed cells. */
	offEnd?: number[]
	/** Cell whose value is drawn by the inline editor instead. */
	hiddenIndex?: number
	/** A cell being dragged onto another (canvas only). */
	drag?: SwapDrag
	/** Values arcing into their new cells: a swap, a sort, a step's swaps or shifts (canvas only). */
	slides?: Slides
	/** Canvas only: an operation's highlights, fading out once it is dismissed. */
	flash?: { marks: Marks; fading: boolean; id: number }
	/** A step's small notes in cells' corners, by index (the kronor an append saved there). */
	badges?: Record<string, string>
	/** Canvas only, while an operation is open: cells out of play, drawn faded (in or out). */
	dim?: readonly string[]
	/** Canvas only, in predict mode: the cells the play bar's question is about, ringed in pulsing violet. */
	pulse?: readonly string[]
	/** Canvas only: a second row under the array, such as a new array being filled. */
	aux?: AuxRow
	/** Values moving between the array and the second row this step, or within the second row, or into it from another shape's cells (`fromAt`, this shape's space). */
	cross?: {
		toAux: Record<number, number>
		toMain: Record<number, number>
		inAux?: Record<number, number>
		fromAt?: Record<number, { x: number; y: number } | undefined>
		id: number
	}
	/** Colour-blind cues: marked and highlighted cells get a shape badge (`cues.ts`). */
	cues?: boolean
}) {
	const { values, showIndices, color, marks, sizing, kind } = shape.props
	const direction = metrics.axis
	const layout = getArrayLayout(values.length, metrics)
	const fixed = sizing === 'fixed'
	const used = usedCount(shape.props)
	const { cells, cellAt } = layout
	const { cell, strokeWidth } = metrics
	const stroke = getColorValue(colors, color, 'solid')
	const textSize = (value: string) => metrics.fontSize * Math.min(1, 2.5 / Math.max(1, value.length))
	const cueAt = ({ x, y }: { x: number; y: number }) => cueBadgeAt({ x: x + cell / 2, y: y + cell / 2, w: cell, h: cell }, false, strokeWidth * 1.2)
	const badgeAt = (i: number) => cueAt(cellAt(i))

	// A value arcs from its old cell into its new one: those moving towards the end over the array,
	// those moving back under it, so two that swap or cross pass each other. When every value moves
	// the same way (a shift) none cross, so they slide straight along.
	const arcs = (slid: Record<number, number> | undefined, at: (i: number) => { x: number; y: number }) => {
		const moves = Object.entries(slid ?? {}).map(([to, from]) => Math.sign(Number(to) - from))
		const crossing = moves.includes(1) && moves.includes(-1)
		return (i: number): CSSProperties | undefined => {
			const from = slid?.[i]
			if (from === undefined || from === i) return undefined
			const dx = at(from).x - at(i).x
			const dy = at(from).y - at(i).y
			const lift = crossing ? (i > from ? -1 : 1) * cell * Math.min(0.9, 0.35 + 0.15 * Math.abs(i - from)) : 0
			const [mx, my] = direction === 'horizontal' ? [dx / 2, dy / 2 + lift] : [dx / 2 + lift, dy / 2]
			return {
				'--from-x': `${dx}px`,
				'--from-y': `${dy}px`,
				'--mid-x': `${mx}px`,
				'--mid-y': `${my}px`,
				animation: `drawds-swap ${slides?.ms ?? SLIDE_MS}ms ease-in-out`,
			} as CSSProperties
		}
	}
	const slideStyle = arcs(slides?.from, cellAt)
	const dimmed = new Set(dim)
	const auxLayout = aux && getAuxLayout(aux.values.length, metrics, layout, aux)
	// The second row's values sliding within it (a copy being sorted), arcing as the array's do.
	const auxSlideStyle = auxLayout && arcs(cross?.inAux, auxLayout.cellAt)
	// Values moving up from a second row the step no longer draws (a = newArr): where it was, as
	// long as the array now is.
	const fromBelow = auxLayout ?? (cross && Object.keys(cross.toMain).length ? getAuxLayout(values.length, metrics, layout) : undefined)
	// Between the rows a value moves straight down (or across) to its cell, or back up.
	const crossStyle = (to: { x: number; y: number }, from: { x: number; y: number }): CSSProperties => {
		const dx = from.x - to.x
		const dy = from.y - to.y
		return {
			'--from-x': `${dx}px`,
			'--from-y': `${dy}px`,
			'--mid-x': `${dx / 2}px`,
			'--mid-y': `${dy / 2}px`,
			animation: `drawds-swap ${slides?.ms ?? SLIDE_MS}ms ease-in-out`,
		} as CSSProperties
	}

	return (
		<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central">
			{offEnd.map((i) => (
				<rect
					key={`off-${i}`}
					x={cellAt(i).x}
					y={cellAt(i).y}
					width={cell}
					height={cell}
					fill="none"
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2.5}`}
					opacity={0.45}
				/>
			))}
			<rect
				x={cells.x}
				y={cells.y}
				width={cells.w}
				height={cells.h}
				fill={values.length ? getColorValue(colors, color, 'semi') : 'none'}
				stroke={stroke}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
				// An emptied growing stack or queue: a dashed outline where its first value would go.
				strokeDasharray={values.length ? undefined : `${strokeWidth * 3} ${strokeWidth * 2.5}`}
				opacity={values.length ? 1 : 0.5}
			/>
			{fixed &&
				// Spare slots: blank, so the cells in use stand out (a circular buffer's may wrap round).
				values.map((_, i) =>
					isUsed(shape.props, i) ? null : (
						<rect
							key={`spare-${i}`}
							x={cellAt(i).x + strokeWidth / 2}
							y={cellAt(i).y + strokeWidth / 2}
							width={cell - strokeWidth}
							height={cell - strokeWidth}
							fill={colors.background}
						/>
					)
				)}
			{values.slice(1).map((_, k) => {
				const at = layout.boundaryAt(k + 1)
				const { x, y } = cellAt(k + 1)
				// Where the cells in use end, a heavier line (a queue has its front and rear instead).
				const width = fixed && kind !== 'queue' && k + 1 === used ? strokeWidth * 2.4 : strokeWidth
				return direction === 'horizontal' ? (
					<line key={k} x1={at} y1={y} x2={at} y2={y + cell} stroke={stroke} strokeWidth={width} />
				) : (
					<line key={k} x1={x} y1={at} x2={x + cell} y2={at} stroke={stroke} strokeWidth={width} />
				)
			})}
			{fixed && (
				<text
					x={layout.footerAt.x}
					y={layout.footerAt.y}
					textAnchor="start"
					fontSize={metrics.indexFontSize}
					fill={colors.text}
					opacity={0.7}
					data-testid="array-capacity"
				>
					size {used} · capacity {values.length}
				</text>
			)}
			{values.map((_, i) => {
				const mark = marks[String(i)]
				if (!mark) return null
				const { x, y } = cellAt(i)
				return (
					<g key={`mark-${i}`}>
						<rect
							x={x}
							y={y}
							width={cell}
							height={cell}
							fill={getColorValue(colors, mark, 'semi')}
							stroke={getColorValue(colors, mark, 'solid')}
							strokeWidth={strokeWidth * 1.6}
							strokeLinejoin="round"
						/>
						{cues && <CueBadge color={mark} at={badgeAt(i)} colors={colors} strokeWidth={strokeWidth} />}
					</g>
				)
			})}
			{flash &&
				values.map((_, i) => {
					const color = flash.marks[String(i)]
					if (!color) return null
					const { x, y } = cellAt(i)
					return (
						// A new key per step restarts the element, which (once dismissed) starts the fade.
						<g key={`flash-${i}-${flash.id}`} className={flash.fading ? 'drawds-flash drawds-flash-fade' : 'drawds-flash'}>
							<rect
								x={x}
								y={y}
								width={cell}
								height={cell}
								fill={getColorValue(colors, color, 'semi')}
								stroke={getColorValue(colors, color, 'solid')}
								strokeWidth={strokeWidth * 1.6}
								strokeLinejoin="round"
							/>
							{cues && <CueBadge color={color} at={badgeAt(i)} colors={colors} strokeWidth={strokeWidth} />}
						</g>
					)
				})}
			{dim &&
				values.map((_, i) => {
					const { x, y } = cellAt(i)
					return (
						<rect
							key={`dim-${i}`}
							x={x}
							y={y}
							width={cell}
							height={cell}
							fill={colors.background}
							opacity={dimmed.has(String(i)) ? 0.6 : 0}
							style={{ transition: 'opacity 300ms ease-in-out' }}
						/>
					)
				})}
			{pulse?.map((key) => {
				const i = Number(key)
				if (!Number.isInteger(i) || i < 0 || i >= values.length) return null
				const { x, y } = cellAt(i)
				// Inside the cell: neighbours share its edges, and the shape's box ends at the outer ones.
				return (
					<rect
						key={`pulse-${i}`}
						className="drawds-pulse"
						data-pulse={key}
						x={x + strokeWidth * 2}
						y={y + strokeWidth * 2}
						width={cell - strokeWidth * 4}
						height={cell - strokeWidth * 4}
						rx={strokeWidth}
						fill="none"
						stroke={getColorValue(colors, 'violet', 'solid')}
						strokeWidth={strokeWidth * 2}
					/>
				)
			})}
			{drag?.to !== undefined && drag.to !== drag.from && (
				<rect
					x={cellAt(drag.to).x + strokeWidth}
					y={cellAt(drag.to).y + strokeWidth}
					width={cell - strokeWidth * 2}
					height={cell - strokeWidth * 2}
					fill="none"
					stroke={colors.selectionStroke}
					strokeWidth={strokeWidth * 1.5}
					strokeDasharray={`${strokeWidth * 3} ${strokeWidth * 2}`}
				/>
			)}
			{values.map((value, i) => {
				if (i === hiddenIndex) return null
				const { x, y } = cellAt(i)
				const up = cross?.toMain[i]
				const animated = up !== undefined && fromBelow ? crossStyle(cellAt(i), fromBelow.cellAt(up)) : slideStyle(i)
				// A spare slot's value (what a pop left there) is still in memory but off the stack: faded.
				const faded = dimmed.has(String(i)) || (fixed && !isUsed(shape.props, i))
				return (
					<text
						// A new key per move remounts the texts that move, which restarts their animation.
						key={up !== undefined ? `${i}:up-${cross!.id}` : animated ? `${i}:${slides!.id}` : i}
						x={x + cell / 2}
						y={y + cell / 2}
						fontSize={textSize(value)}
						fill={colors.text}
						opacity={drag?.from === i ? 0.25 : faded ? 0.35 : 1}
						style={{ ...animated, transition: 'opacity 300ms ease-in-out' }}
					>
						{value}
					</text>
				)
			})}
			{badges &&
				values.map((_, i) => {
					const note = badges[String(i)]
					if (!note) return null
					const { x, y } = cellAt(i)
					return (
						<text
							key={`badge-${i}`}
							data-badge={i}
							x={x + cell - strokeWidth * 2}
							y={y + strokeWidth * 2}
							fontSize={metrics.indexFontSize * 0.85}
							textAnchor="end"
							dominantBaseline="hanging"
							fill={getColorValue(colors, 'green', 'solid')}
						>
							{note}
						</text>
					)
				})}
			{drag && (
				<text x={drag.at.x} y={drag.at.y - cell * 0.35} fontSize={textSize(values[drag.from] ?? '')} fill={colors.text} opacity={0.85}>
					{values[drag.from]}
				</text>
			)}
			{showIndices &&
				[...values.keys(), ...offEnd].map((i) => {
					const { x, y } = layout.indexAt(i)
					return (
						<text key={`i${i}`} x={x} y={y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={i < 0 || i >= values.length ? 0.3 : 0.5}>
							{i}
						</text>
					)
				})}
			{aux && auxLayout && (
				<g data-testid="array-aux">
					<text x={auxLayout.titleAt.x} y={auxLayout.titleAt.y} textAnchor="start" fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.8}>
						{aux.title}
					</text>
					<rect
						x={auxLayout.cells.x}
						y={auxLayout.cells.y}
						width={auxLayout.cells.w}
						height={auxLayout.cells.h}
						fill={getColorValue(colors, color, 'semi')}
						stroke={stroke}
						strokeWidth={strokeWidth}
						strokeLinejoin="round"
					/>
					{aux.values.slice(1).map((_, k) => {
						const { x, y } = auxLayout.cellAt(k + 1)
						// Upright, the line between cells k and k + 1 is the bottom of cell k + 1.
						const lineY = direction === 'up' ? y + cell : y
						return direction === 'horizontal' ? (
							<line key={k} x1={x} y1={y} x2={x} y2={y + cell} stroke={stroke} strokeWidth={strokeWidth} />
						) : (
							<line key={k} x1={x} y1={lineY} x2={x + cell} y2={lineY} stroke={stroke} strokeWidth={strokeWidth} />
						)
					})}
					{Object.entries(aux.marks ?? {}).map(([key, mark]) => {
						const { x, y } = auxLayout.cellAt(Number(key))
						return (
							<g key={`aux-mark-${key}`} data-aux-mark={key}>
								<rect
									x={x}
									y={y}
									width={cell}
									height={cell}
									fill={getColorValue(colors, mark, 'semi')}
									stroke={getColorValue(colors, mark, 'solid')}
									strokeWidth={strokeWidth * 1.6}
									strokeLinejoin="round"
								/>
								{cues && <CueBadge color={mark} at={cueAt({ x, y })} colors={colors} strokeWidth={strokeWidth} />}
							</g>
						)
					})}
					{aux.values.map((value, j) => {
						const { x, y } = auxLayout.cellAt(j)
						const down = cross?.toAux[j]
						const along = auxSlideStyle?.(j)
						const from = down !== undefined ? cellAt(down) : cross?.fromAt?.[j]
						return (
							<text
								key={from ? `aux${j}:${cross!.id}` : along ? `aux${j}:in-${cross!.id}` : `aux${j}`}
								x={x + cell / 2}
								y={y + cell / 2}
								fontSize={textSize(value)}
								fill={colors.text}
								style={from ? crossStyle(auxLayout.cellAt(j), from) : along}
							>
								{value}
							</text>
						)
					})}
					{showIndices &&
						aux.values.map((_, j) => {
							const { x, y } = auxLayout.indexAt(j)
							return (
								<text key={`ai${j}`} x={x} y={y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.5}>
									{j}
								</text>
							)
						})}
				</g>
			)}
		</g>
	)
}
