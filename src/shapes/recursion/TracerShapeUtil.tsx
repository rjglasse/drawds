import type { CSSProperties } from 'react'
import {
	Rectangle2d,
	SVGContainer,
	getColorValue,
	type SvgExportContext,
	type TLFontFace,
	type TLThemeColors,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, type CellFont, type NodeOperation, type PlaybackLayout } from '../../cells/CellShapeUtil'
import type { EditableCells } from '../../cells/editable-cells'
import { bottomBeside } from '../../cells/followers'
import { cueBadgeAt, showsColourCues } from '../../cells/cues'
import { CueBadge } from '../../cells/CueBadge'
import type { MarkColor } from '../../cells/marks'
import { exportingStep } from '../../export/exporting'
import { animationMs, playbackFor, playOperation, type Frame, type PlaybackView } from '../../nodelink/playback'
import { branches, callRun } from './calls'
import { openRecursionTree } from './RecursionTreeShapeUtil'
import { FUNCTIONS, parseCall, slotIndex, traceCall, traceOf, type CodeLine, type Trace, type TraceView } from './tracer'
import { tracerLayout, type TracerLayout } from './tracer-layout'
import { TRACER_TYPE, tracerShapeMigrations, tracerShapeProps, type TracerShape } from './tracer-shape-types'

/** The one editable cell: main's call. */
const CALL = 'call'

interface Model {
	parsed: ReturnType<typeof parseCall>
	trace?: Trace
	layout: TracerLayout
}

const models = new WeakMap<TracerShape['props'], Model>()

function modelOf(shape: TracerShape): Model {
	let model = models.get(shape.props)
	if (!model) {
		const parsed = parseCall(shape.props.call, shape.props.fn)
		const trace = 'error' in parsed ? undefined : traceCall(parsed.fn, parsed.args)
		model = { parsed, trace, layout: tracerLayout(shape.props, shape.props.call, trace) }
		models.set(shape.props, model)
	}
	return model
}

/** The colour of each line of code a step can be on. */
const LINE_COLORS: Record<CodeLine, MarkColor> = { base: 'green', recursive: 'orange', print: 'blue' }

const tracerCells: EditableCells<TracerShape> = {
	cellAt(shape, point) {
		const b = modelOf(shape).layout.slotBox(0)
		return point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h ? CALL : undefined
	},
	firstCell: () => CALL,
	cellBox(shape) {
		const { layout } = modelOf(shape)
		const b = layout.slotBox(0)
		return { x: b.x + layout.callW, y: b.y, w: b.w - layout.callW, h: b.h }
	},
	getValue: (shape) => shape.props.call,
	setValue: (shape, _key, value) => ({ id: shape.id, type: TRACER_TYPE, props: { call: value } }),
	neighbor: () => undefined,
}

/**
 * A recursive function traced on the call stack (lecture 1): main at the bottom calls the function
 * (gcd(60, 24), typed in main's frame), each call goes on the stack above the one that made it with
 * what it still has to do (3 * fact(2)), the base case returns, and the values come back down, each
 * frame finishing and returning in turn. The code underneath lights the line each step is on, and
 * the recursion tree grows beside it. sayHello (no base case) and a sum whose n never shrinks fill
 * the stack until it overflows.
 */
export class TracerShapeUtil extends CellShapeUtil<TracerShape> {
	static override type = TRACER_TYPE
	static override props = tracerShapeProps
	static override migrations = tracerShapeMigrations

	readonly cells = tracerCells
	override readonly menuId = 'tracer'

	getDefaultProps(): TracerShape['props'] {
		return { fn: 'gcd', call: FUNCTIONS.gcd.example, seed: 0, color: 'black', size: 'm', font: 'mono' }
	}

	/** A new tracer starts with its function's example call. */
	override onBeforeCreate(shape: TracerShape) {
		const parsed = parseCall(shape.props.call, shape.props.fn)
		if ('error' in parsed || parsed.fn !== shape.props.fn) return { ...shape, props: { ...shape.props, call: FUNCTIONS[shape.props.fn].example } }
	}

	/**
	 * The Function picker types its example call; typing another function's name picks it. Then the
	 * stack may be taller or shorter: main stays where it is on the page.
	 */
	override onBeforeUpdate(prev: TracerShape, next: TracerShape) {
		let synced = next
		if (prev.props.fn !== next.props.fn && prev.props.call === next.props.call) {
			synced = { ...next, props: { ...next.props, call: FUNCTIONS[next.props.fn].example } }
		} else if (prev.props.call !== next.props.call) {
			const parsed = parseCall(next.props.call, next.props.fn)
			if (!('error' in parsed) && parsed.fn !== next.props.fn) synced = { ...next, props: { ...next.props, fn: parsed.fn } }
		}
		return super.onBeforeUpdate(prev, synced) ?? (synced === next ? undefined : synced)
	}

	override layoutOffset(shape: TracerShape): VecLike {
		return modelOf(shape).layout.offset
	}

	getCellFont(shape: TracerShape): CellFont {
		return { fontFamily: this.fontFamily(shape), fontSize: modelOf(shape).layout.fontSize }
	}

	private fontFamily(shape: TracerShape) {
		return this.editor.getCurrentTheme().fonts[shape.props.font].fontFamily
	}

	// No marks or pointers on a tracer: its frames come and go.
	override markKeyAt() {
		return undefined
	}

	getGeometry(shape: TracerShape) {
		const { box } = modelOf(shape).layout
		return new Rectangle2d({ x: 0, y: 0, width: box.w, height: box.h, isFilled: true })
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	override menuName() {
		return 'Recursion'
	}

	override moves() {
		return [
			"Double-click main's call to type another: gcd(1071, 462), fact(6), fib(6), sum(5), sayHello()",
			'Right-click > Step by step > Run: frames go on the stack and come off it, the recursion tree grows beside it',
			'Style panel: Function (gcd, factorial, fib, sum, sayHello, a sum that never gets smaller)',
		]
	}

	override shapeOperations(shape: TracerShape): NodeOperation[] {
		const { parsed } = modelOf(shape)
		if ('error' in parsed) return []
		return [{ id: 'tracer-run', label: `Run ${shape.props.call.trim()}`, run: () => this.run(shape.id) }]
	}

	/** Run the call step by step, with its recursion tree beside the tracer. Nothing changes. */
	private run(id: TracerShape['id']) {
		const shape = this.editor.getShape(id) as TracerShape | undefined
		const trace = shape && modelOf(shape).trace
		if (!shape || !trace) return
		const label = `run ${shape.props.call.trim()}`
		// A chain of calls (gcd, fact, sum, sayHello) is what the stack shows; a tree (fib) goes beside it.
		const onCancel = branches(callRun(trace.frames).calls) ? openRecursionTree(this.editor, shape, trace.frames, shape.props.call.trim()) : undefined
		playOperation(this.editor, { shapeId: id, label, frames: trace.frames, onCancel })
	}

	override playbackLayout(shape: TracerShape, _frame: Frame | undefined): PlaybackLayout {
		const { layout } = modelOf(shape)
		return {
			left: 0,
			bottom: bottomBeside(this.editor, shape, layout.box.h),
			metrics: { fontSize: layout.fontSize, labelFontSize: layout.fontSize * 0.85, strokeWidth: layout.strokeWidth },
			color: shape.props.color,
			fontFamily: this.fontFamily(shape),
		}
	}

	component(shape: TracerShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const view = playbackFor(this.editor, shape.id)
		return (
			<>
				<SVGContainer>{this.draw(shape, colors, view && !view.fading ? view : undefined, this.getEditingKey(shape) === CALL)}</SVGContainer>
				{this.renderCellEditor(shape)}
				{this.renderOperationPrompt(shape, colors)}
			</>
		)
	}

	override toSvg(shape: TracerShape, ctx: SvgExportContext) {
		return this.draw(shape, this.editor.getCurrentTheme().colors[ctx.colorMode], exportingStep(this.editor, shape.id), false)
	}

	private draw(shape: TracerShape, colors: TLThemeColors, view: PlaybackView | undefined, editing: boolean) {
		const { layout, parsed } = modelOf(shape)
		const { fontSize, strokeWidth } = layout
		const fontFamily = this.fontFamily(shape)
		const mono = this.editor.getCurrentTheme().fonts.mono.fontFamily
		const stroke = getColorValue(colors, shape.props.color, 'solid')
		const muted = { fill: colors.text, opacity: 0.65 }
		const shown: TraceView | undefined = view ? traceOf(view.frame) : undefined
		const trace: TraceView = shown ?? { stack: [{ call: 'main', work: shape.props.call }] }
		const top = trace.stack.length - 1
		const cues = showsColourCues()
		// While it runs: the frame working now red, the frames waiting for it orange; main green once it has its value.
		const colorOf = (i: number): MarkColor | undefined =>
			!shown ? undefined : trace.done ? (i === 0 ? 'green' : undefined) : i === top ? 'red' : 'orange'
		const error = 'error' in parsed ? parsed.error : undefined
		const moves = view?.frame?.moves ?? []
		const ms = animationMs(650, view)
		return (
			<g fontFamily={fontFamily} data-testid="tracer">
				<text x={layout.title.x} y={layout.title.y} fontSize={fontSize * 0.9} dominantBaseline="central" {...(error ? { fill: getColorValue(colors, 'red', 'solid') } : muted)}>
					{error ?? 'call stack'}
				</text>
				{/* The stack's room: it fills up, and overflows, from the bottom. */}
				<rect
					data-testid="tracer-stack"
					data-overflow={trace.overflow || undefined}
					x={layout.stack.x}
					y={layout.stack.y}
					width={layout.stack.w}
					height={layout.stack.h}
					fill="none"
					stroke={trace.overflow ? getColorValue(colors, 'red', 'solid') : stroke}
					strokeWidth={trace.overflow ? strokeWidth * 1.5 : strokeWidth * 0.75}
					strokeDasharray={trace.overflow ? undefined : `${strokeWidth * 3} ${strokeWidth * 2.5}`}
					opacity={trace.overflow ? 1 : 0.5}
				/>
				{trace.stack.map((f, i) => {
					const b = layout.slotBox(i)
					const c = colorOf(i)
					const work = i === 0 && editing ? '' : f.work
					return (
						<g key={i} data-frame={f.call} data-state={c ?? 'plain'}>
							<rect
								x={b.x}
								y={b.y}
								width={b.w}
								height={b.h}
								fill={c ? getColorValue(colors, c, 'semi') : colors.background}
								stroke={c ? getColorValue(colors, c, 'solid') : stroke}
								strokeWidth={strokeWidth}
							/>
							<line x1={b.x + layout.callW} y1={b.y} x2={b.x + layout.callW} y2={b.y + b.h} stroke={c ? getColorValue(colors, c, 'solid') : stroke} strokeWidth={strokeWidth * 0.6} />
							<text x={b.x + layout.callW / 2} y={b.y + b.h / 2} fontSize={fontSize} fill={colors.text} textAnchor="middle" dominantBaseline="central" fontWeight="bold">
								{f.call}
							</text>
							<text
								x={b.x + layout.callW + (b.w - layout.callW) / 2}
								y={b.y + b.h / 2}
								fontSize={fontSize}
								textAnchor="middle"
								dominantBaseline="central"
								{...(i === 0 && error ? { fill: getColorValue(colors, 'red', 'solid') } : { fill: colors.text })}
							>
								{work}
							</text>
							{cues && c && <CueBadge color={c} at={cueBadgeAt({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }, false, strokeWidth * 1.2)} colors={colors} strokeWidth={strokeWidth} />}
						</g>
					)
				})}
				{/* Values returned this step, moving down into the frame below. */}
				{moves.map(([from, to], k) => {
					const value = trace.flowing?.[k]
					const [a, b] = [from, to].map((key) => layout.slotBox(slotIndex(key)))
					if (value === undefined || !a || !b) return null
					const w = Math.max(fontSize * 1.6, value.length * fontSize * 0.7 + fontSize * 0.8)
					const x = b.x + layout.callW + fontSize * 0.4
					const style = { animation: `drawds-drop ${ms}ms ease-in-out forwards`, '--from-y': `${a.y - b.y}px` } as CSSProperties
					return (
						<g key={`flow-${view?.id}-${k}`} style={style} data-flowing={value}>
							<rect x={x} y={b.y + b.h * 0.15} width={w} height={b.h * 0.7} rx={b.h * 0.35} fill={colors.background} stroke={getColorValue(colors, 'blue', 'solid')} strokeWidth={strokeWidth} />
							<text x={x + w / 2} y={b.y + b.h / 2} fontSize={fontSize} fill={colors.text} textAnchor="middle" dominantBaseline="central" fontWeight="bold">
								{value}
							</text>
						</g>
					)
				})}
				{/* The code, the line a step is on lit. */}
				<g fontFamily={mono} data-testid="tracer-code">
					<rect x={layout.code.box.x} y={layout.code.box.y} width={layout.code.box.w} height={layout.code.box.h} fill={colors.background} stroke={stroke} strokeWidth={strokeWidth * 0.6} opacity={0.9} />
					{layout.code.lines.map((l, k) => {
						const lit = shown && l.line && l.line === trace.line
						return (
							<g key={k} data-line={l.line} data-lit={lit || undefined}>
								{lit && (
									<rect
										x={layout.code.box.x + strokeWidth}
										y={l.y - layout.code.lineH / 2}
										width={layout.code.box.w - strokeWidth * 2}
										height={layout.code.lineH}
										fill={getColorValue(colors, LINE_COLORS[l.line!], 'semi')}
									/>
								)}
								<text x={layout.code.box.x + layout.code.padX} y={l.y} fontSize={layout.code.fontSize} fill={colors.text} dominantBaseline="central" style={{ whiteSpace: 'pre' }}>
									{l.text}
								</text>
								{l.note && (
									<text x={layout.code.box.x + layout.code.noteX} y={l.y} fontSize={layout.code.fontSize * 0.85} dominantBaseline="central" {...muted}>
										{`// ${l.note}`}
									</text>
								)}
							</g>
						)
					})}
				</g>
			</g>
		)
	}

	getIndicatorPath(shape: TracerShape) {
		const { box } = modelOf(shape).layout
		const path = new Path2D()
		path.rect(0, 0, box.w, box.h)
		return path
	}

	override getFontFaces(shape: TracerShape): TLFontFace[] {
		const fonts = this.editor.getCurrentTheme().fonts
		return [...(fonts[shape.props.font].faces ?? []), ...(shape.props.font === 'mono' ? [] : (fonts.mono.faces ?? []))]
	}
}
