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
import { CellShapeUtil, type CellFont, type PlaybackLayout, type PointerDirection } from '../cells/CellShapeUtil'
import type { EditableCells } from '../cells/editable-cells'
import type { Marks } from '../cells/marks'
import { growHandle, isGrowHandle } from '../controls/grow'
import { GrowGrip } from '../controls/GrowGrip'
import { ControlButton } from '../controls/ControlButton'
import { KeyPrompt } from '../controls/KeyPrompt'
import { closePrompt, isPromptOpen, openPrompt } from '../controls/prompt'
import { showsStructureControls } from '../controls/visibility'
import { POINTER_FONT_SCALE, placePointers, type PlacedPointer, type PointerAnchor, type PointerSide } from '../pointers/layout'
import { boxContains, labelBox, nodeBox, nodeContains, routeScene, spatialNeighbor, type EdgeRoute } from './geometry'
import { hoveredEdge, hoveredNode } from './hover'
import { isBusy, playbackFor, type Frame, type Strip } from './playback'
import { edgeCellKey, translateScene, type Scene, type SceneEdge, type SceneNode } from './scene'
import { sceneCells } from './scene-cells'
import { SceneSvg, stripsHeight } from './SceneSvg'

export type { NodeOperation } from '../cells/CellShapeUtil'

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
	/** Move a node so its centre is at `to` (layout coordinates), keeping the rest of the layout. */
	abstract moveNode(shape: S, key: string, to: VecLike): TLShapePartial<S>
	/** Put every node back where the automatic layout wants it. */
	abstract resetLayout(shape: S): TLShapePartial<S>
	abstract hasManualLayout(shape: S): boolean

	/**
	 * Grips that grow the structure when dragged (ids from controls/grow), in layout coordinates.
	 * Shown, with their handles, while the shape is the only one selected.
	 */
	getGrowGrips?(shape: S): { id: string; at: VecLike }[]
	/** The shape after dragging grip `gripId` to `to` (layout coordinates of `initial`). */
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
	private layouts = new WeakMap<object, { scene: Scene; offset: VecLike }>()

	/**
	 * The scene in shape space: the layout moved so that everything drawn (nodes, edges, weights,
	 * pointers) starts at the shape's origin, as tldraw's shape box assumes. Cached per props.
	 */
	getScene(shape: S): Scene {
		return this.layoutOf(shape).scene
	}

	/** How far the layout was moved to start at the origin (see `CellShapeUtil.layoutOffset`). */
	override layoutOffset(shape: S): VecLike {
		return this.layoutOf(shape).offset
	}

	private layoutOf(shape: S) {
		let layout = this.layouts.get(shape.props)
		if (!layout) {
			layout = this.normalise(shape, this.buildScene(shape))
			this.layouts.set(shape.props, layout)
		}
		return layout
	}

	/** A scene moved so that its drawing, pointers included, starts at (0, 0). */
	private normalise(shape: S, raw: Scene) {
		const xs: number[] = []
		const ys: number[] = []
		const add = (x: number, y: number) => {
			xs.push(x)
			ys.push(y)
		}
		for (const n of raw.nodes) add(n.x - n.w / 2, n.y - n.h / 2)
		for (const [key, route] of routeScene(raw)) {
			for (const p of route.points) add(p.x, p.y)
			const label = raw.edges.find((e) => e.key === key)?.label
			if (label !== undefined) {
				const box = labelBox(route.labelAt, label, raw.metrics.labelFontSize)
				add(box.x, box.y)
			}
		}
		const fontSize = raw.metrics.fontSize * POINTER_FONT_SCALE
		for (const { label } of placePointers(this.getPointers(shape), (key) => this.pointerAnchorIn(shape, raw, key), fontSize)) {
			add(label.x, label.y)
		}
		const offset = { x: xs.length ? -Math.min(...xs) : 0, y: ys.length ? -Math.min(...ys) : 0 }
		return { scene: translateScene(raw, offset), offset }
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

	// Pointers sit on nodes (and on null markers, so curr can become null). Shapes override the
	// side they are drawn on and how arrow keys step them along the structure.

	/** Which side of a node its pointers are drawn on. */
	pointerSide(_shape: S, _node: SceneNode): PointerSide {
		return 'above'
	}

	pointerAnchor(shape: S, key: string): PointerAnchor | undefined {
		return this.pointerAnchorIn(shape, this.getScene(shape), key)
	}

	/** Where pointers at `key` go in a given scene (the shape's, or its layout before moving it). */
	protected pointerAnchorIn(shape: S, scene: Scene, key: string): PointerAnchor | undefined {
		const node = scene.nodes.find((n) => n.key === key)
		if (!node || node.kind === 'label') return undefined
		return { box: nodeBox(node), side: this.pointerSide(shape, node) }
	}

	override pointerTargetAt(shape: S, point: VecLike): string | undefined {
		return this.getScene(shape).nodes.find(
			(n) => n.kind !== 'label' && (n.kind === 'null' ? boxContains(nodeBox(n), point) : nodeContains(n, point))
		)?.key
	}

	/** By default, the nearest node in the arrow's direction. */
	pointerStep(shape: S, key: string, direction: PointerDirection): string | undefined {
		const nodes = this.getScene(shape).nodes.filter((n) => n.kind !== 'label')
		const from = nodes.find((n) => n.key === key)
		return from && spatialNeighbor(from, nodes.filter((n) => n !== from), direction)?.key
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
		const routes = routeScene(scene)
		const edges = [...routes.values()].map((route) => new Polyline2d({ points: route.points.map((p) => new Vec(p.x, p.y)) }))
		// Weights: part of the drawing (and easier to point at than the thin edge under them).
		const labels = scene.edges.flatMap((e) => {
			const route = routes.get(e.key)
			if (e.label === undefined || !route) return []
			const box = labelBox(route.labelAt, e.label, scene.metrics.labelFontSize)
			return [new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: true })]
		})
		const children = [...nodes, ...edges, ...labels, ...this.pointerGeometry(shape)]
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
		// While an operation plays (or is stepped back through) the controls would act on a state
		// that isn't the shape's; its bar and strip are drawn in front of the canvas (PlaybackOverlay).
		const busy = isBusy(playing)
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
							playing
								? { marks: playing.flash, badges: playing.badges, fading: playing.fading, id: playing.id }
								: hover && { marks: hover, fading: false, id: 0 }
						}
						swaps={
							playing?.frame && (playing.frame.swaps || playing.frame.moves)
								? { pairs: playing.frame.swaps ?? [], moves: playing.frame.moves, id: playing.id }
								: undefined
						}
						dim={playing && !playing.fading ? playing.dim : undefined}
					/>

					{controls &&
						!busy &&
						this.growGrips(shape).map((grip) => (
							<GrowGrip key={grip.id} at={grip.at} zoom={zoom} colors={colors} />
						))}
					{/* A step's own pointers (or the shape's on a step's scene) are drawn by the play overlay. */}
					{!this.framePointers(shape, playing?.frame, scene) && this.renderPointers(shape, colors)}
				</SVGContainer>
				{controls &&
					!busy &&
					!this.editor.isIn('select.dragging_handle') &&
					this.renderNodeAndEdgeButtons(shape, colors)}
				{controls && prompt && !promptOpen && !busy && (
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
				{this.renderOperationPrompt(shape, colors)}
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
				{this.renderPointerOverlays(shape, colors)}
				{this.renderCellEditor(shape)}
			</>
		)
	}

	/**
	 * Where an operation's strip (queue / stack) and play bar go, in shape space: under the scene, in
	 * that order. Also what the strip is drawn with.
	 */
	override playbackLayout(shape: S, strips: readonly Strip[] | undefined): PlaybackLayout {
		const scene = this.displayScene(shape)
		// Below any pointers under the structure too (a list's curr and prev).
		const framePointers = this.framePointers(shape, playbackFor(this.editor, shape.id)?.frame, scene)
		const pointers = framePointers ?? this.placedPointers(shape)
		return {
			...this.belowScene(scene, strips, Math.max(...pointers.map((p) => p.label.y + p.label.h))),
			metrics: scene.metrics,
			color: this.style(shape).color,
			fontFamily: this.getFontFamily(shape),
			// In front of the canvas: they may lie outside the shape's box (curr above the root).
			pointers: framePointers && { placed: framePointers, fontSize: this.getPointerFontSize(shape), slots: [] },
		}
	}

	private belowScene(scene: Scene, strips: readonly Strip[] | undefined, below = -Infinity) {
		const left = Math.min(...scene.nodes.map((n) => n.x - n.w / 2))
		const right = Math.max(...scene.nodes.map((n) => n.x + n.w / 2))
		let bottom = Math.max(below, ...scene.nodes.map((n) => n.y + n.h / 2))
		const gap = scene.metrics.fontSize
		const stripAt = { x: left, y: bottom + gap }
		if (strips?.length) bottom = stripAt.y + stripsHeight(strips, scene.metrics)
		return { strip: stripAt, bar: { x: (left + right) / 2, y: bottom + gap } }
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
			<>
				<SceneSvg
					scene={this.getScene(shape)}
					colors={colors}
					color={this.style(shape).color}
					fontFamily={this.getFontFamily(shape)}
					marks={this.sceneMarks(shape)}
				/>
				{this.renderPointers(shape, colors, { exporting: true })}
			</>
		)
	}

	/**
	 * The scene being shown: while an operation plays, its current frame rather than the committed
	 * props. Reactive, so the selection outline (tldraw caches it in a computed) follows the frames.
	 */
	displayScene(shape: S): Scene {
		const frame = playbackFor(this.editor, shape.id)?.frame
		if (!frame?.scene && !frame?.props) return this.getScene(shape)
		// At the committed layout's offset, so whatever the step doesn't change stays put.
		const raw = frame.scene ?? this.buildScene({ ...shape, props: { ...shape.props, ...frame.props } })
		return translateScene(raw, this.layoutOffset(shape))
	}

	/** Pointers as an operation's step shows them (its own, e.g. curr and prev), on its scene. */
	private framePointers(shape: S, frame: Frame | undefined, scene: Scene): PlacedPointer[] | undefined {
		if (!frame?.pointers && !frame?.scene) return undefined
		return placePointers(
			frame.pointers ?? this.getPointers(shape),
			(key) => this.pointerAnchorIn(shape, scene, key),
			scene.metrics.fontSize * POINTER_FONT_SCALE
		)
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
		// While an operation shows its steps, the shape's own handles would sit on a state that isn't shown.
		if (isBusy(playbackFor(this.editor, shape.id))) return []
		const nodes = this.getScene(shape).nodes.filter((n) => n.draggable)
		const grips = this.growGrips(shape)
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

	/** Grow grips in shape space (`getGrowGrips` gives them in layout coordinates). */
	private growGrips(shape: S) {
		const offset = this.layoutOffset(shape)
		return (this.getGrowGrips?.(shape) ?? []).map((g) => ({ ...g, at: Vec.Add(g.at, offset) }))
	}

	/**
	 * Handles move in the shape space of the shape as it was when the drag started; models want
	 * layout coordinates, so take off that shape's layout offset (it may change while dragging).
	 */
	override onHandleDrag(shape: S, { handle, initial = shape }: TLHandleDragInfo<S>) {
		const at = Vec.Sub(handle, this.layoutOffset(initial))
		if (isGrowHandle(handle.id)) return this.growTo?.(shape, initial, handle.id, at)
		const node = this.getScene(shape).nodes.find((n) => n.key === handle.id)
		if (!node) return
		return this.moveNode(shape, handle.id, { x: at.x, y: at.y - node.h / 2 })
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
