import type { ReactNode } from 'react'
import {
	Circle2d,
	Group2d,
	Point2d,
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
	type TLThemeColors,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, type CellFont, type PlaybackLayout, type PointerDirection } from '../cells/CellShapeUtil'
import { showsColourCues } from '../cells/cues'
import type { EditableCells } from '../cells/editable-cells'
import type { Marks } from '../cells/marks'
import { growHandle, isGrowHandle } from '../controls/grow'
import { GrowGrip } from '../controls/GrowGrip'
import { ControlButton } from '../controls/ControlButton'
import { KeyPrompt } from '../controls/KeyPrompt'
import { closePrompt, isPromptOpen, openPrompt } from '../controls/prompt'
import { showsStructureControls } from '../controls/visibility'
import { exportingStep } from '../export/exporting'
import { StepExtrasSvg } from '../export/StepExtrasSvg'
import { POINTER_FONT_SCALE, placePointers, type PlacedPointer, type PointerAnchor, type PointerSide } from '../pointers/layout'
import { boxContains, labelBox, nodeBox, nodeContains, routeScene, spatialNeighbor, type EdgeRoute } from './geometry'
import { hoveredEdge, hoveredNode } from './hover'
import { ROOM_KEY, animationMs, isBusy, isLastFrame, playbackFor, roomOf, type Frame, type PlaybackView, type Room } from './playback'
import { edgeCellKey, translateScene, type Scene, type SceneEdge, type SceneNode } from './scene'
import { sceneCells } from './scene-cells'
import { SceneSvg } from './SceneSvg'

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
	private layouts = new WeakMap<object, { scene: Scene; offset: VecLike; room: unknown }>()

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
		// The room an open operation needs lives in the meta, not the props.
		if (!layout || layout.room !== shape.meta[ROOM_KEY]) {
			layout = { ...this.normalise(shape, this.buildScene(shape), roomOf(shape)), room: shape.meta[ROOM_KEY] }
			this.layouts.set(shape.props, layout)
		}
		return layout
	}

	/** A scene moved so that its drawing, pointers included (and any room for steps), starts at (0, 0). */
	private normalise(shape: S, raw: Scene, room: Room | undefined) {
		const fontSize = raw.metrics.fontSize * POINTER_FONT_SCALE
		const labels = placePointers(this.getPointers(shape), (key) => this.pointerAnchorIn(shape, raw, key), fontSize)
		const box = unionRoom(sceneRoom(raw), ...labels.map(({ label }) => roomOfBox(label)), room)
		const offset = { x: box ? -box.minX : 0, y: box ? -box.minY : 0 }
		return { scene: translateScene(raw, offset), offset }
	}

	/**
	 * The room an operation's steps take (layout coordinates), kept in the meta while it is open, so
	 * the box holds every step: a bigger table after a rehash, a heap's new level, a list node off the
	 * line. Without `frames`, takes it away. Undefined when nothing needs changing.
	 */
	withPlaybackRoom(shape: S, frames: readonly Frame[] | undefined): TLShapePartial<S> | undefined {
		const offset = this.layoutOffset(shape)
		const steps = (frames ?? []).filter((f) => f.scene || f.props).map((f) => translateScene(this.displayScene(shape, f), Vec.Neg(offset)))
		const room = unionRoom(...steps.map(sceneRoom))
		const current = roomOf(shape)
		if (room ? current && sameRoom(room, current) : !current) return undefined
		// Meta updates merge key by key: null takes the room away.
		return { id: shape.id, type: shape.type, meta: { [ROOM_KEY]: room ? { ...room } : null } } as unknown as TLShapePartial<S>
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
		// Room for an open operation's steps: its corners stretch the box, without catching clicks.
		const room = roomOf(shape)
		const offset = this.layoutOffset(shape)
		const corners = room
			? [new Vec(room.minX, room.minY), new Vec(room.maxX, room.maxY)].map(
					(p) => new Point2d({ point: Vec.Add(p, offset), margin: 0, isInternal: true })
				)
			: []
		const children = [...nodes, ...edges, ...labels, ...this.pointerGeometry(shape), ...corners]
		return children.length ? new Group2d({ children }) : new Rectangle2d({ width: 1, height: 1, isFilled: false })
	}

	/** Elements that break the structure's invariant (scene node keys), ringed in red. */
	sceneWarnings?(shape: S): readonly string[]

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
					{this.sceneSvg(shape, colors, playing, { scene, hover, animate: true })}

					{controls &&
						!busy &&
						this.growGrips(shape).map((grip) => (
							<GrowGrip key={grip.id} at={grip.at} zoom={zoom} colors={colors} />
						))}
					{/* A step's own pointers (or the shape's on a step's scene) are drawn by the play overlay. */}
					{!this.framePointers(shape, playing?.frame, scene) && this.renderPointers(shape, colors)}
				</SVGContainer>
				{controls && !busy && !this.editor.isIn('select.dragging_handle') && (
					<>
						{this.renderNodeAndEdgeButtons(shape, colors)}
						{this.renderStructureControls?.(shape, colors)}
					</>
				)}
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

	/** What a step draws (shape space): its scene, and its pointers (a list's curr and prev under it). */
	override playbackLayout(shape: S, frame: Frame | undefined): PlaybackLayout {
		const scene = this.displayScene(shape, frame)
		const framePointers = this.framePointers(shape, frame, scene)
		const pointers = framePointers ?? this.placedPointers(shape)
		return {
			left: Math.min(...scene.nodes.map((n) => n.x - n.w / 2)),
			bottom: Math.max(...scene.nodes.map((n) => n.y + n.h / 2), ...pointers.map((p) => p.label.y + p.label.h)),
			metrics: scene.metrics,
			color: this.style(shape).color,
			fontFamily: this.getFontFamily(shape),
			// In front of the canvas: they may lie outside the shape's box (curr above the root).
			pointers: framePointers && { placed: framePointers, fontSize: this.getPointerFontSize(shape), slots: [] },
		}
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
	/** More on-canvas buttons while the structure is the only selected shape (a linked stack's push and pop). */
	protected renderStructureControls?(shape: S, colors: Parameters<typeof ControlButton>[0]['colors']): ReactNode

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

	/**
	 * The scene as the canvas shows it: an operation's step (its highlights, faded elements and, on the
	 * canvas, values arcing into place) or the hovered element's highlights, over the marks.
	 */
	private sceneSvg(
		shape: S,
		colors: TLThemeColors,
		playing: PlaybackView | undefined,
		{ scene = this.displayScene(shape), hover, animate = false }: { scene?: Scene; hover?: Marks; animate?: boolean } = {}
	) {
		return (
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
					animate && playing?.frame && (playing.frame.swaps || playing.frame.moves)
						? { pairs: playing.frame.swaps ?? [], moves: playing.frame.moves, id: playing.id, ms: animationMs(380, playing) }
						: undefined
				}
				dim={playing && !playing.fading ? playing.dim : undefined}
				pulse={playing && !playing.fading ? playing.pulse : undefined}
				// Not while an operation is open: its steps break the invariant on the way to restoring it.
				warnings={playing && !playing.fading ? undefined : this.sceneWarnings?.(shape)}
				cues={showsColourCues()}
			/>
		)
	}

	override toSvg(shape: S, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		// Exporting an operation's steps: this one as the canvas shows it, with its pointers, strips and caption.
		const step = exportingStep(this.editor, shape.id)
		if (step) {
			const scene = this.displayScene(shape)
			return (
				<>
					{this.sceneSvg(shape, colors, step, { scene })}
					{!this.framePointers(shape, step.frame, scene) && this.renderPointers(shape, colors, { exporting: true })}
					<StepExtrasSvg util={this as unknown as CellShapeUtil<TLShape>} shape={shape} view={step} colors={colors} />
				</>
			)
		}
		return (
			<>
				<SceneSvg
					scene={this.getScene(shape)}
					colors={colors}
					color={this.style(shape).color}
					fontFamily={this.getFontFamily(shape)}
					marks={this.sceneMarks(shape)}
					warnings={this.sceneWarnings?.(shape)}
					cues={showsColourCues()}
				/>
				{this.renderPointers(shape, colors, { exporting: true })}
			</>
		)
	}

	/**
	 * The scene being shown: while an operation plays, its current frame rather than the committed
	 * props. Reactive, so the selection outline (tldraw caches it in a computed) follows the frames.
	 */
	displayScene(shape: S, frame: Frame | undefined = playbackFor(this.editor, shape.id)?.frame): Scene {
		const view = playbackFor(this.editor, shape.id)
		const committed = view?.committed
		// Once the result is in, a step with no state of its own shows the structure as it was then
		// (stepping back through an insert, the new node isn't there yet); the last step shows the result.
		const then = !!(committed && view && frame && !frame.scene && !frame.props && !isLastFrame(view, frame))
		if (!frame || (!frame.scene && !frame.props && !then)) return this.getScene(shape)
		// At the committed layout's offset, so whatever the step doesn't change stays put; once the
		// result is in, less the move it made (its origin and its offset), so the steps hold still.
		const base = (committed?.before as S | undefined) ?? shape
		const raw = frame.scene ?? this.buildScene({ ...base, props: { ...base.props, ...frame.props } })
		if (!committed) return translateScene(raw, this.layoutOffset(shape))
		const [before, after] = [committed.before as S, committed.after as S]
		const moved = Vec.Add(Vec.Sub(this.layoutOffset(after), this.layoutOffset(before)), Vec.Rot(Vec.Sub(after, before), -after.rotation))
		return translateScene(raw, Vec.Sub(this.layoutOffset(shape), moved))
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
		// tldraw caches the outline per props, but the room for an operation's steps (meta) moves shape
		// space too: reading the record makes it follow, so the outline stays on the drawing.
		const current = (this.editor.getShape(shape.id) as S | undefined) ?? shape
		const path = new Path2D()
		for (const n of this.displayScene(current).nodes) {
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

/** What a scene's drawing covers: its nodes, edges and edge labels. */
function sceneRoom(scene: Scene): Room | undefined {
	const boxes: Room[] = scene.nodes.map((n) => ({ minX: n.x - n.w / 2, minY: n.y - n.h / 2, maxX: n.x + n.w / 2, maxY: n.y + n.h / 2 }))
	for (const [key, route] of routeScene(scene)) {
		for (const p of route.points) boxes.push({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })
		const label = scene.edges.find((e) => e.key === key)?.label
		if (label !== undefined) boxes.push(roomOfBox(labelBox(route.labelAt, label, scene.metrics.labelFontSize)))
	}
	return unionRoom(...boxes)
}

function roomOfBox(box: { x: number; y: number; w: number; h: number }): Room {
	return { minX: box.x, minY: box.y, maxX: box.x + box.w, maxY: box.y + box.h }
}

function unionRoom(...rooms: (Room | undefined)[]): Room | undefined {
	const present = rooms.filter((r): r is Room => !!r)
	if (!present.length) return undefined
	return {
		minX: Math.min(...present.map((r) => r.minX)),
		minY: Math.min(...present.map((r) => r.minY)),
		maxX: Math.max(...present.map((r) => r.maxX)),
		maxY: Math.max(...present.map((r) => r.maxY)),
	}
}

const sameRoom = (a: Room, b: Room) =>
	Math.abs(a.minX - b.minX) < 1e-6 && Math.abs(a.minY - b.minY) < 1e-6 && Math.abs(a.maxX - b.maxX) < 1e-6 && Math.abs(a.maxY - b.maxY) < 1e-6
