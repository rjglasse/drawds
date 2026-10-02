import {
	Rectangle2d,
	SVGContainer,
	ZERO_INDEX_KEY,
	getColorValue,
	type SvgExportContext,
	type TLFontFace,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShapePartial,
	type TLThemeColors,
} from 'tldraw'
import { CellShapeUtil } from '../../cells/CellShapeUtil'
import { extendValues, fillValues } from '../../data/fill'
import type { Refillable } from '../../data/fill-style'
import { GROW_HANDLE_ID, growHandle, grownCount } from '../../controls/grow'
import { GrowGrip } from '../../controls/GrowGrip'
import { showsStructureControls } from '../../controls/visibility'
import { ARRAY_SHAPE_TYPE, arrayShapeMigrations, arrayShapeProps, type ArrayShape } from './array-shape-types'
import { arrayCells } from './cells'
import { getArrayGrowPoint, getArrayLayout, getArrayMetrics } from './layout'

export class ArrayShapeUtil extends CellShapeUtil<ArrayShape> implements Refillable {
	static override type = ARRAY_SHAPE_TYPE
	static override props = arrayShapeProps
	static override migrations = arrayShapeMigrations

	readonly cells = arrayCells

	getDefaultProps(): ArrayShape['props'] {
		return {
			values: [''],
			direction: 'horizontal',
			showIndices: true,
			fill: 'random',
			seed: 0,
			color: 'black',
			size: 'm',
			font: 'mono',
		}
	}

	refill(shape: ArrayShape): TLShapePartial<ArrayShape> {
		const { fill, seed, values } = shape.props
		return { id: shape.id, type: ARRAY_SHAPE_TYPE, props: { values: fillValues(fill, seed, values.length) } }
	}

	override getHandles(shape: ArrayShape): TLHandle[] {
		return [growHandle(this.growPoint(shape), ZERO_INDEX_KEY)]
	}

	/** Dragging the grow grip adds cells past the end (or removes them), keeping existing values. */
	override onHandleDrag(
		shape: ArrayShape,
		{ handle, initial = shape }: TLHandleDragInfo<ArrayShape>
	): TLShapePartial<ArrayShape> | void {
		if (handle.id !== GROW_HANDLE_ID) return
		const { values, direction, fill, seed } = initial.props
		const axis = direction === 'horizontal' ? { x: 1, y: 0 } : { x: 0, y: 1 }
		const step = getArrayMetrics(initial.props).cell
		const count = grownCount(values.length, this.growPoint(initial), handle, axis, step)
		return { id: shape.id, type: ARRAY_SHAPE_TYPE, props: { values: extendValues(values, fill, seed, count) } }
	}

	private growPoint(shape: ArrayShape) {
		return getArrayGrowPoint(shape.props.values.length, shape.props.direction, getArrayMetrics(shape.props))
	}

	// Cell size comes from the size style, not from dragging handles.
	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	getGeometry(shape: ArrayShape) {
		const { width, height } = getArrayLayout(
			shape.props.values.length,
			shape.props.direction,
			getArrayMetrics(shape.props)
		)
		return new Rectangle2d({ width, height, isFilled: true })
	}

	component(shape: ArrayShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const editingKey = this.getEditingKey(shape)
		return (
			<>
				<SVGContainer>
					<ArraySvg
						shape={shape}
						colors={colors}
						fontFamily={this.getFontFamily(shape)}
						hiddenIndex={editingKey === undefined ? undefined : Number(editingKey)}
					/>
					{showsStructureControls(this.editor, shape) && (
						<GrowGrip at={this.growPoint(shape)} zoom={this.editor.getZoomLevel()} colors={colors} />
					)}
				</SVGContainer>
				{this.renderCellEditor(shape)}
			</>
		)
	}

	override toSvg(shape: ArrayShape, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		return <ArraySvg shape={shape} colors={colors} fontFamily={this.getFontFamily(shape)} />
	}

	getIndicatorPath(shape: ArrayShape) {
		const { cells } = getArrayLayout(
			shape.props.values.length,
			shape.props.direction,
			getArrayMetrics(shape.props)
		)
		const path = new Path2D()
		path.rect(cells.x, cells.y, cells.w, cells.h)
		return path
	}

	override getFontFaces(shape: ArrayShape): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[shape.props.font].faces ?? []
	}

	getCellFont(shape: ArrayShape) {
		return { fontFamily: this.getFontFamily(shape), fontSize: getArrayMetrics(shape.props).fontSize }
	}

	private getFontFamily(shape: ArrayShape) {
		return this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
	}
}

function ArraySvg({
	shape,
	colors,
	fontFamily,
	hiddenIndex,
}: {
	shape: ArrayShape
	colors: TLThemeColors
	fontFamily: string
	/** Cell whose value is drawn by the inline editor instead. */
	hiddenIndex?: number
}) {
	const { values, direction, showIndices, color } = shape.props
	const metrics = getArrayMetrics(shape.props)
	const layout = getArrayLayout(values.length, direction, metrics)
	const { cells } = layout
	const stroke = getColorValue(colors, color, 'solid')

	return (
		<g fontFamily={fontFamily} textAnchor="middle" dominantBaseline="central">
			<rect
				x={cells.x}
				y={cells.y}
				width={cells.w}
				height={cells.h}
				fill={getColorValue(colors, color, 'semi')}
				stroke={stroke}
				strokeWidth={metrics.strokeWidth}
				strokeLinejoin="round"
			/>
			{values.slice(1).map((_, k) => {
				const { x, y } = layout.cellAt(k + 1)
				return direction === 'horizontal' ? (
					<line key={k} x1={x} y1={y} x2={x} y2={y + metrics.cell} stroke={stroke} strokeWidth={metrics.strokeWidth} />
				) : (
					<line key={k} x1={x} y1={y} x2={x + metrics.cell} y2={y} stroke={stroke} strokeWidth={metrics.strokeWidth} />
				)
			})}
			{values.map((value, i) => {
				if (i === hiddenIndex) return null
				const { x, y } = layout.cellAt(i)
				return (
					<text
						key={i}
						x={x + metrics.cell / 2}
						y={y + metrics.cell / 2}
						fontSize={metrics.fontSize * Math.min(1, 3 / Math.max(1, value.length))}
						fill={colors.text}
					>
						{value}
					</text>
				)
			})}
			{showIndices &&
				values.map((_, i) => {
					const { x, y } = layout.indexAt(i)
					return (
						<text key={i} x={x} y={y} fontSize={metrics.indexFontSize} fill={colors.text} opacity={0.5}>
							{i}
						</text>
					)
				})}
		</g>
	)
}
