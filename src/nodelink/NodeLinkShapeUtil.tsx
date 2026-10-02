import {
	Circle2d,
	Group2d,
	Polyline2d,
	Rectangle2d,
	SVGContainer,
	Vec,
	getIndices,
	type Geometry2d,
	type SvgExportContext,
	type TLDefaultColorStyle,
	type TLDefaultFontStyle,
	type TLFontFace,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShape,
	type TLShapePartial,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, type CellFont } from '../cells/CellShapeUtil'
import type { EditableCells } from '../cells/editable-cells'
import { growHandle, isGrowHandle } from '../controls/grow'
import { GrowGrip } from '../controls/GrowGrip'
import { ControlButton } from '../controls/ControlButton'
import { showsStructureControls } from '../controls/visibility'
import { routeScene } from './geometry'
import { hoveredEdge, hoveredNode } from './hover'
import type { Scene, SceneEdge } from './scene'
import { sceneCells } from './scene-cells'
import { SceneSvg } from './SceneSvg'

/** Style props every node-link shape has. */
interface NodeLinkStyle {
	color: TLDefaultColorStyle
	font: TLDefaultFontStyle
}

/**
 * Base for node-link structures (lists, trees, heaps, graphs). One shape holds the whole model in
 * its props; subclasses turn props into a `Scene` and apply model edits, and this class does the
 * rest: geometry, rendering and export, value editing (double-click a node, Tab between nodes),
 * and dragging single nodes via handles, which appear on the nodes when the shape is selected.
 */
export abstract class NodeLinkShapeUtil<S extends TLShape> extends CellShapeUtil<S> {
	/** Positioned nodes and edges for the shape's current props, in shape space. Must be pure. */
	abstract buildScene(shape: S): Scene
	abstract setNodeValue(shape: S, key: string, value: string): TLShapePartial<S>
	/** Move a node so its centre is at `to` (shape space), keeping the rest of the layout. */
	abstract moveNode(shape: S, key: string, to: VecLike): TLShapePartial<S>
	/** Put every node back where the automatic layout wants it. */
	abstract resetLayout(shape: S): TLShapePartial<S>
	abstract hasManualLayout(shape: S): boolean

	/**
	 * Grips that grow the structure when dragged (ids from controls/grow), in shape space. Shown,
	 * with their handles, while the shape is the only one selected.
	 */
	getGrowGrips?(shape: S): { id: string; at: VecLike }[]
	/** The shape after dragging grip `gripId` to `to`, measured from where it sat on `initial`. */
	growTo?(shape: S, initial: S, gripId: string, to: VecLike): TLShapePartial<S>
	/** Remove a node: offered as an x button on each node while the shape is selected. */
	removeNode?(shape: S, key: string): TLShapePartial<S>
	canRemoveNode?(shape: S, key: string): boolean
	/**
	 * Insert a node on an edge: offered as a + button on each edge `canInsertOnEdge` accepts. Returns
	 * the update and the new node's key; the new node is then opened for editing.
	 */
	insertOnEdge?(shape: S, edgeKey: string): { update: TLShapePartial<S>; key: string } | undefined
	canInsertOnEdge?(shape: S, edge: SceneEdge): boolean
	/**
	 * Empty child slots of a node (0 = left, 1 = right): offered as + buttons on the node's lower
	 * left / right corners. `addChildAt` returns the update and the new node's key, which is then
	 * opened for editing.
	 */
	getEmptySlots?(shape: S, key: string): number[]
	addChildAt?(shape: S, key: string, slot: number): { update: TLShapePartial<S>; key: string } | undefined

	readonly cells: EditableCells<S> = sceneCells<S>(this)
	private scenes = new WeakMap<object, Scene>()

	getScene(shape: S): Scene {
		let scene = this.scenes.get(shape.props)
		if (!scene) {
			scene = this.buildScene(shape)
			this.scenes.set(shape.props, scene)
		}
		return scene
	}

	getCellFont(shape: S): CellFont {
		return { fontFamily: this.getFontFamily(shape), fontSize: this.getScene(shape).metrics.fontSize }
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	getGeometry(shape: S): Geometry2d {
		const scene = this.getScene(shape)
		const nodes = scene.nodes.map((n) =>
			n.kind === 'circle'
				? new Circle2d({ x: n.x - n.w / 2, y: n.y - n.h / 2, radius: n.w / 2, isFilled: true })
				: new Rectangle2d({ x: n.x - n.w / 2, y: n.y - n.h / 2, width: n.w, height: n.h, isFilled: true })
		)
		const edges = [...routeScene(scene).values()].map(
			(route) => new Polyline2d({ points: route.points.map((p) => new Vec(p.x, p.y)) })
		)
		const children = [...nodes, ...edges]
		return children.length ? new Group2d({ children }) : new Rectangle2d({ width: 1, height: 1, isFilled: false })
	}

	component(shape: S) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const controls = showsStructureControls(this.editor, shape)
		const zoom = this.editor.getZoomLevel()
		return (
			<>
				<SVGContainer>
					<SceneSvg
						scene={this.getScene(shape)}
						colors={colors}
						color={this.style(shape).color}
						fontFamily={this.getFontFamily(shape)}
						hiddenKey={this.getEditingKey(shape)}
						marks={this.getMarks(shape)}
					/>
					{controls &&
						this.getGrowGrips?.(shape).map((grip) => (
							<GrowGrip key={grip.id} at={grip.at} zoom={zoom} colors={colors} />
						))}
				</SVGContainer>
				{controls && this.renderNodeAndEdgeButtons(shape, colors)}
				{this.renderCellEditor(shape)}
			</>
		)
	}

	/**
	 * An x on each removable node and a + mid-way along each edge a node can be inserted on. With a
	 * mouse, only the node and edge near the pointer show theirs, so big structures stay readable;
	 * touch screens have no hover, so they show all of them.
	 */
	private renderNodeAndEdgeButtons(shape: S, colors: Parameters<typeof ControlButton>[0]['colors']) {
		const scene = this.getScene(shape)
		const routes = routeScene(scene)
		const zoom = this.editor.getZoomLevel()
		const removable = this.removeNode
			? scene.nodes.filter(
					(n) => n.kind !== 'null' && n.kind !== 'label' && (this.canRemoveNode?.(shape, n.key) ?? true)
				)
			: []
		const insertable = this.insertOnEdge ? scene.edges.filter((e) => this.canInsertOnEdge?.(shape, e) ?? true) : []

		let showNode = (_key: string) => true
		let showEdge = (_key: string) => true
		if (!this.editor.getInstanceState().isCoarsePointer) {
			const p = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
			const reach = 16 / zoom
			const node = hoveredNode(
				scene.nodes.filter((n) => n.kind !== 'null' && n.kind !== 'label'),
				p,
				reach
			)
			const edge = hoveredEdge(
				routes,
				insertable.map((e) => e.key),
				p,
				reach
			)
			showNode = (key) => key === node
			showEdge = (key) => key === edge
		}

		const nudge = 5 / zoom
		const slotNodes = this.getEmptySlots
			? scene.nodes.filter((n) => n.kind !== 'null' && n.kind !== 'label' && showNode(n.key))
			: []
		return (
			<>
				{slotNodes.flatMap((n) =>
					(this.getEmptySlots?.(shape, n.key) ?? []).map((slot) => {
						const side = slot === 0 ? -1 : 1
						// Lower corner on the slot's side, where that child's edge would leave the node.
						const corner =
							n.kind === 'circle'
								? { x: n.x + side * ((n.w / 2) * Math.SQRT1_2 + nudge), y: n.y + (n.h / 2) * Math.SQRT1_2 + nudge }
								: { x: n.x + side * (n.w / 2 + nudge), y: n.y + n.h / 2 + nudge }
						return (
							<ControlButton
								key={`slot-${n.key}-${slot}`}
								editor={this.editor}
								kind="insert"
								at={corner}
								label={`Add a ${slot === 0 ? 'left' : 'right'} child to ${n.value}`}
								testId={`add-child-${n.key}-${slot === 0 ? 'left' : 'right'}`}
								colors={colors}
								onPress={() => this.pressAddChild(shape, n.key, slot)}
							/>
						)
					})
				)}
				{removable
					.filter((n) => showNode(n.key))
					.map((n) => (
						<ControlButton
							key={`remove-${n.key}`}
							editor={this.editor}
							kind="remove"
							// The top-right corner, nudged off it so the selection outline only touches the button.
							at={
								n.kind === 'circle'
									? { x: n.x + (n.w / 2) * Math.SQRT1_2 + nudge, y: n.y - (n.h / 2) * Math.SQRT1_2 - nudge }
									: { x: n.x + n.w / 2 + nudge, y: n.y - n.h / 2 - nudge }
							}
							label={`Remove node ${n.value}`}
							testId={`remove-node-${n.key}`}
							colors={colors}
							onPress={() => this.pressRemove(shape, n.key)}
						/>
					))}
				{insertable
					.filter((e) => showEdge(e.key) && routes.has(e.key))
					.map((edge) => (
						<ControlButton
							key={`insert-${edge.key}`}
							editor={this.editor}
							kind="insert"
							at={routes.get(edge.key)!.labelAt}
							label="Insert a node here"
							testId={`insert-on-${edge.key}`}
							colors={colors}
							onPress={() => this.pressInsert(shape, edge.key)}
						/>
					))}
			</>
		)
	}

	private pressAddChild(shape: S, key: string, slot: number) {
		const current = this.editor.getShape(shape.id) as S | undefined
		const added = current && this.addChildAt?.(current, key, slot)
		if (!current || !added) return
		this.editor.markHistoryStoppingPoint('add child')
		this.editor.updateShape(added.update)
		const updated = this.editor.getShape(shape.id) as S | undefined
		if (updated) this.editCell(updated, added.key)
	}

	private pressRemove(shape: S, key: string) {
		const current = this.editor.getShape(shape.id) as S | undefined
		if (!current || !this.removeNode) return
		this.editor.markHistoryStoppingPoint('remove node')
		this.editor.updateShape(this.removeNode(current, key))
	}

	/** Insert, then open the new node for editing so the teacher can type its value straight away. */
	private pressInsert(shape: S, edgeKey: string) {
		const current = this.editor.getShape(shape.id) as S | undefined
		const inserted = current && this.insertOnEdge?.(current, edgeKey)
		if (!current || !inserted) return
		this.editor.markHistoryStoppingPoint('insert node')
		this.editor.updateShape(inserted.update)
		const updated = this.editor.getShape(shape.id) as S | undefined
		if (updated) this.editCell(updated, inserted.key)
	}

	override toSvg(shape: S, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		return (
			<SceneSvg
				scene={this.getScene(shape)}
				colors={colors}
				color={this.style(shape).color}
				fontFamily={this.getFontFamily(shape)}
				marks={this.getMarks(shape)}
			/>
		)
	}

	getIndicatorPath(shape: S) {
		const path = new Path2D()
		for (const n of this.getScene(shape).nodes) {
			if (n.kind === 'null' || n.kind === 'label') continue
			if (n.kind === 'circle') {
				path.moveTo(n.x + n.w / 2, n.y)
				path.arc(n.x, n.y, n.w / 2, 0, Math.PI * 2)
			} else {
				path.rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h)
			}
		}
		return path
	}

	// Each draggable node gets a handle on the middle of its bottom edge, clear of its value, plus a
	// handle for each grow grip.
	override getHandles(shape: S): TLHandle[] {
		const nodes = this.getScene(shape).nodes.filter((n) => n.draggable)
		const grips = this.getGrowGrips?.(shape) ?? []
		const indices = getIndices(nodes.length + grips.length)
		const handles: TLHandle[] = nodes.map((n, i) => ({
			id: n.key,
			type: 'vertex',
			label: `Move node ${n.value}`,
			index: indices[i],
			x: n.x,
			y: n.y + n.h / 2,
		}))
		grips.forEach((grip, i) => handles.push(growHandle(grip.at, indices[nodes.length + i], grip.id)))
		return handles
	}

	override onHandleDrag(shape: S, { handle, initial = shape }: TLHandleDragInfo<S>) {
		if (isGrowHandle(handle.id)) return this.growTo?.(shape, initial, handle.id, handle)
		const node = this.getScene(shape).nodes.find((n) => n.key === handle.id)
		if (!node) return
		return this.moveNode(shape, handle.id, { x: handle.x, y: handle.y - node.h / 2 })
	}

	override getFontFaces(shape: S): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts[this.style(shape).font].faces ?? []
	}

	private style(shape: S) {
		return shape.props as unknown as NodeLinkStyle
	}

	private getFontFamily(shape: S) {
		return this.editor.getCurrentTheme().fonts[this.style(shape).font].fontFamily
	}
}
