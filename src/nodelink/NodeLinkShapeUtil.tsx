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
import type { Marks } from '../cells/marks'
import { growHandle, isGrowHandle } from '../controls/grow'
import { GrowGrip } from '../controls/GrowGrip'
import { ControlButton } from '../controls/ControlButton'
import { KeyPrompt } from '../controls/KeyPrompt'
import { closePrompt, isPromptOpen, openPrompt } from '../controls/prompt'
import { showsStructureControls } from '../controls/visibility'
import { labelBox, routeScene, type EdgeRoute } from './geometry'
import { hoveredEdge, hoveredNode } from './hover'
import { playbackFor } from './playback'
import { edgeCellKey, type Scene, type SceneEdge } from './scene'
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
	/** Remove an edge: offered as an x on the edge near the pointer. */
	removeEdge?(shape: S, edgeKey: string): TLShapePartial<S>
	canRemoveEdge?(shape: S, edge: SceneEdge): boolean
	/**
	 * Empty child slots of a node (0 = left, 1 = right): offered as + buttons on the node's lower
	 * left / right corners. `addChildAt` returns the update and the new node's key, which is then
	 * opened for editing.
	 */
	getEmptySlots?(shape: S, key: string): number[]
	addChildAt?(shape: S, key: string, slot: number): { update: TLShapePartial<S>; key: string } | undefined
	/**
	 * Remove a node as an animated operation (BST delete, heap extract). Return true if handled;
	 * otherwise `removeNode` applies at once. `keep`: Shift was held, keep highlights as marks.
	 */
	removeNodeAnimated?(shape: S, key: string, keep: boolean): boolean
	/** An "insert a key" button (and the prompt it opens), for structures that place keys themselves. */
	getInsertPrompt?(shape: S): { at: VecLike; label: string } | undefined
	insertKey?(shape: S, key: string, keep: boolean): void
	/** Steady highlights while the pointer is over a node (e.g. a heap's parent and children). */
	hoverHighlights?(shape: S, key: string): Marks

	/**
	 * Whether edges take marks too (keyed `edge:<key>`, like edge cells). Shapes that opt in prune
	 * edge marks when edges go.
	 */
	readonly markableEdges: boolean = false

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

	/** The node or edge cell at the point, else (if edges take marks) the edge passing near it. */
	override markKeyAt(shape: S, point: VecLike) {
		const key = this.cells.cellAt(shape, point)
		if (key !== undefined || !this.markableEdges) return key
		const scene = this.getScene(shape)
		const reach = 10 / this.editor.getZoomLevel()
		const edge = hoveredEdge(routeScene(scene), scene.edges.map((e) => e.key), point, reach)
		return edge === undefined ? undefined : edgeCellKey(edge)
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

	/** Marks to draw, keyed by scene node key (structures with two views of one value map both). */
	sceneMarks(shape: S) {
		return this.getMarks(shape)
	}

	component(shape: S) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const controls = showsStructureControls(this.editor, shape)
		const zoom = this.editor.getZoomLevel()
		const playing = playbackFor(this.editor, shape.id)
		const scene = this.displayScene(shape)
		const prompt = this.getInsertPrompt?.(shape)
		const promptOpen = isPromptOpen(this.editor, shape.id)
		const hover = controls && !playing ? this.hoverHighlightsAtPointer(shape) : undefined
		return (
			<>
				<SVGContainer>
					<SceneSvg
						scene={scene}
						colors={colors}
						color={this.style(shape).color}
						fontFamily={this.getFontFamily(shape)}
						hiddenKey={this.getEditingKey(shape)}
						marks={this.sceneMarks(shape)}
						flash={
							playing ? { marks: playing.flash, fading: playing.fading, id: playing.id } : hover && { marks: hover, fading: false, id: 0 }
						}
						swaps={playing?.frame?.swaps && { pairs: playing.frame.swaps, id: playing.id }}
					/>
					{controls &&
						this.getGrowGrips?.(shape).map((grip) => (
							<GrowGrip key={grip.id} at={grip.at} zoom={zoom} colors={colors} />
						))}
				</SVGContainer>
				{controls &&
					!playing?.frame &&
					!this.editor.isIn('select.dragging_handle') &&
					this.renderNodeAndEdgeButtons(shape, colors)}
				{controls && prompt && !promptOpen && (
					<ControlButton
						editor={this.editor}
						kind="insert"
						at={prompt.at}
						label={prompt.label}
						testId="insert-key"
						colors={colors}
						onPress={() => openPrompt(this.editor, shape.id)}
					/>
				)}
				{prompt && promptOpen && (
					<KeyPrompt
						editor={this.editor}
						at={prompt.at}
						label={prompt.label}
						colors={colors}
						onCancel={() => closePrompt(this.editor)}
						onSubmit={(value, keep) => {
							closePrompt(this.editor)
							const current = this.editor.getShape(shape.id) as S | undefined
							if (current) this.insertKey?.(current, value, keep)
						}}
					/>
				)}
				{this.renderCellEditor(shape)}
			</>
		)
	}

	private hoverHighlightsAtPointer(shape: S): Marks | undefined {
		if (!this.hoverHighlights || this.editor.getInstanceState().isCoarsePointer) return undefined
		const p = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
		const key = hoveredNode(
			this.getScene(shape).nodes.filter((n) => n.editable),
			p,
			0
		)
		return key === undefined ? undefined : this.hoverHighlights(shape, key)
	}

	/**
	 * An x on each removable node, a + mid-way along each edge a node can be inserted on, and an x
	 * on each removable edge. With a mouse, only the node or else the edge near the pointer shows
	 * its buttons, so big structures stay readable; touch screens have no hover, so they show all.
	 */
	private renderNodeAndEdgeButtons(shape: S, colors: Parameters<typeof ControlButton>[0]['colors']) {
		const scene = this.getScene(shape)
		const routes = routeScene(scene)
		const zoom = this.editor.getZoomLevel()
		const removable =
			this.removeNode || this.removeNodeAnimated
				? scene.nodes.filter(
					(n) => n.kind !== 'null' && n.kind !== 'label' && (this.canRemoveNode?.(shape, n.key) ?? true)
				)
			: []
		const insertable = this.insertOnEdge ? scene.edges.filter((e) => this.canInsertOnEdge?.(shape, e) ?? true) : []
		const removableEdges = this.removeEdge ? scene.edges.filter((e) => this.canRemoveEdge?.(shape, e) ?? true) : []

		const { showNode, showEdge } = this.controlTargets(
			shape,
			[...insertable, ...removableEdges].map((e) => e.key)
		)

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
							onPress={(keep) => this.pressRemove(shape, n.key, keep)}
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
				{removableEdges
					.filter((e) => showEdge(e.key) && routes.has(e.key))
					.map((edge) => (
						<ControlButton
							key={`remove-edge-${edge.key}`}
							editor={this.editor}
							kind="remove"
							at={this.removeEdgeButtonAt(shape, scene, edge, routes.get(edge.key)!)}
							label="Remove this edge"
							testId={`remove-edge-${edge.key}`}
							colors={colors}
							onPress={() => this.pressRemoveEdge(shape, edge.key)}
						/>
					))}
			</>
		)
	}

	/**
	 * Mid-edge, or when the middle is taken (by a label or a + button) just beside it, off the edge
	 * on its upper side.
	 */
	private removeEdgeButtonAt(shape: S, scene: Scene, edge: SceneEdge, route: EdgeRoute): VecLike {
		const zoom = this.editor.getZoomLevel()
		const busy = edge.label !== undefined || (!!this.insertOnEdge && (this.canInsertOnEdge?.(shape, edge) ?? true))
		if (!busy) return route.labelAt
		// The edge's direction at its middle (routes have at least two points).
		const mid = Math.floor(route.points.length / 2)
		const [a, b] = [route.points[mid - 1], route.points[mid]]
		const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
		let normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
		if (normal.y > 0 || (normal.y === 0 && normal.x > 0)) normal = { x: -normal.x, y: -normal.y }
		// Clear of the label (an axis-aligned box: its half-extent across the edge) or the + button.
		const box = edge.label !== undefined ? labelBox(route.labelAt, edge.label, scene.metrics.labelFontSize) : undefined
		const halfAcross = box ? (Math.abs(normal.x) * box.w + Math.abs(normal.y) * box.h) / 2 : 9 / zoom
		const offset = halfAcross + 10 / zoom
		return { x: route.labelAt.x + normal.x * offset, y: route.labelAt.y + normal.y * offset }
	}

	/**
	 * Which nodes and edges show their controls. With a mouse, the node near the pointer, or else the
	 * edge near it (out of `edgeKeys`): edges meet at nodes, so a hovered node wins. Touch screens
	 * have no hover, so everything shows.
	 */
	protected controlTargets(shape: S, edgeKeys: readonly string[] = []) {
		if (this.editor.getInstanceState().isCoarsePointer) {
			return { showNode: (_key: string) => true, showEdge: (_key: string) => true }
		}
		const scene = this.getScene(shape)
		const p = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
		const reach = 16 / this.editor.getZoomLevel()
		const node = hoveredNode(
			scene.nodes.filter((n) => n.kind !== 'null' && n.kind !== 'label'),
			p,
			reach
		)
		const edge = node === undefined ? hoveredEdge(routeScene(scene), edgeKeys, p, reach) : undefined
		return { showNode: (key: string) => key === node, showEdge: (key: string) => key === edge }
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

	private pressRemove(shape: S, key: string, keep: boolean) {
		const current = this.editor.getShape(shape.id) as S | undefined
		if (!current) return
		if (this.removeNodeAnimated?.(current, key, keep)) return
		if (!this.removeNode) return
		this.editor.markHistoryStoppingPoint('remove node')
		this.editor.updateShape(this.removeNode(current, key))
	}

	private pressRemoveEdge(shape: S, edgeKey: string) {
		const current = this.editor.getShape(shape.id) as S | undefined
		if (!current || !this.removeEdge) return
		this.editor.markHistoryStoppingPoint('remove edge')
		this.editor.updateShape(this.removeEdge(current, edgeKey))
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
				marks={this.sceneMarks(shape)}
			/>
		)
	}

	/**
	 * The scene being shown: while an operation plays, its current frame rather than the committed
	 * props. Reactive, so the selection outline (tldraw caches it in a computed) follows the frames.
	 */
	displayScene(shape: S): Scene {
		const frame = playbackFor(this.editor, shape.id)?.frame
		return frame?.props ? this.buildScene({ ...shape, props: { ...shape.props, ...frame.props } }) : this.getScene(shape)
	}

	getIndicatorPath(shape: S) {
		const path = new Path2D()
		for (const n of this.displayScene(shape).nodes) {
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

	protected getFontFamily(shape: S) {
		return this.editor.getCurrentTheme().fonts[this.style(shape).font].fontFamily
	}
}
