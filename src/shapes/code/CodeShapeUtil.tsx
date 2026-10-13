import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import {
	Group2d,
	Rectangle2d,
	SVGContainer,
	getColorValue,
	type TLDefaultColorStyle,
	type TLShapeId,
	type TLFontFace,
	type TLThemeColors,
	type SvgExportContext,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, useFocusOnEdit, type NodeOperation, type PointerDirection } from '../../cells/CellShapeUtil'
import { CueBadge } from '../../cells/CueBadge'
import { cueBadgeAt, showsColourCues } from '../../cells/cues'
import { beginCellEdit, getEditingCell, type EditableCells } from '../../cells/editable-cells'
import { pruneMarks } from '../../cells/marks'
import { exportingStep } from '../../export/exporting'
import { playbackFor, shownFrame, stateAt } from '../../nodelink/playback'
import { POINTER_FONT_SCALE, placePointers, pointerReachSideways, type PointerAnchor } from '../../pointers/layout'
import { prunePointers } from '../../pointers/pointers'
import { algorithmCode, shownValues, taggedLine, type ShownValue } from './algorithms'
import { conditionOf, readsBefore, shownTest, type ShownTest } from './tests'
import { CODE_TYPE, codeShapeMigrations, codeShapeProps, type CodeShape } from './code-shape-types'
import { transcriptOf } from '../../transcript/transcript'
import { applyEdit, closeBraceEdit, indentEdit, newlineEdit, type CodeEdit } from './editing'
import { highlightLines, type CodeLanguage, type TokenKind } from './highlight'
import { FOLD_LINES, INDENT, codeLines, foldText, foldsFor, getCodeLayout, getCodeMetrics, offsetOf, type CodeLayout, type CodeMetrics, type Fold } from './layout'

/** The one editable "cell": the whole code. */
const CODE_KEY = 'code'

/** A new box's creation mark (CodeShapeTool), which its first edit goes on from. */
export const createdFrom = new Map<string, string>()

/** A line's key, for marks and pointers. */
export const lineKey = (i: number) => `L${i}`
const lineOf = (key: string) => (/^L\d+$/.test(key) ? Number(key.slice(1)) : undefined)

/** Token colours, from the theme (so dark mode has its own); plain text is the text colour. */
const TOKEN_COLORS: Record<Exclude<TokenKind, 'plain'>, TLDefaultColorStyle> = {
	keyword: 'violet',
	type: 'blue',
	constant: 'orange',
	number: 'orange',
	string: 'green',
	comment: 'grey',
	meta: 'red',
}

/** The pointer at the line a step is on, in a box showing an operation's code. */
const PC = 'pc'

/** Values after a line are this much smaller than the code; each keeps room for this many characters. */
const VALUE_SCALE = 0.85
const VALUE_CHARS = 5
/** Room for the times column's counts (×999), as small as the values. */
const COUNT_CHARS = 4
/** After a test written out: whether it held. */
const TEST_MARK = '→ false'

const shownCache = new WeakMap<CodeShape['props'], ShownValue[]>()

/** A transcript box as last drawn, by its record: kept while its code reads the same. */
const shownTranscripts = new WeakMap<CodeShape, CodeShape>()

const foldCache = new WeakMap<CodeShape['props'], Fold[]>()

/**
 * The folds of a long box beside a structure (`foldsFor`): a transcript keeps its first line and its
 * latest; an algorithm's code (as drawds wrote it) the lines its steps light or show values on. Code
 * typed into a box of its own never folds, nor with `fold` off (Show > all the lines).
 */
function foldsOf(shape: CodeShape): Fold[] {
	const { fold, structureId, transcript, algorithm, code, language } = shape.props
	if (!fold || !structureId) return []
	let folds = foldCache.get(shape.props)
	if (!folds) {
		const count = codeLines(code).length
		const source = !transcript && algorithm ? algorithmCode(algorithm, language) : undefined
		const reached = source && new Set([...Object.values(source.lines), ...source.values.map((v) => v.line)])
		folds = transcript ? foldsFor(count) : source && source.text === code ? foldsFor(count, FOLD_LINES, reached) : []
		foldCache.set(shape.props, folds)
	}
	return folds
}

/** The variables whose values show after their lines while the box's algorithm plays. */
function valuesOf(shape: CodeShape): ShownValue[] {
	const { algorithm, code, language } = shape.props
	let values = shownCache.get(shape.props)
	if (!values) {
		const source = algorithm ? algorithmCode(algorithm, language) : undefined
		shownCache.set(shape.props, (values = source ? shownValues(code, source) : []))
	}
	return values
}

const stepLinesCache = new WeakMap<CodeShape['props'], Set<number>>()

/**
 * The lines a step can be on (its algorithm's tagged lines, found in code edited since): only those
 * show a test, so only they keep room after them for it (a loop line no step stops on doesn't widen
 * the box, which beside a list pushed the list off the screen).
 */
function stepLines(shape: CodeShape): Set<number> {
	let lines = stepLinesCache.get(shape.props)
	if (!lines) {
		const { algorithm, code, language } = shape.props
		const source = algorithm ? algorithmCode(algorithm, language) : undefined
		const found = source ? Object.keys(source.lines).map((tag) => taggedLine(code, source, tag)) : []
		stepLinesCache.set(shape.props, (lines = new Set(found.filter((l): l is number => l !== undefined))))
	}
	return lines
}

/** A value as the language prints it (Python's True), long ones cut short to fit the room kept for it. */
function valueText(value: string, language: CodeLanguage) {
	const printed = language === 'python' && (value === 'true' || value === 'false') ? value[0].toUpperCase() + value.slice(1) : value
	return printed.length > VALUE_CHARS ? `${printed.slice(0, VALUE_CHARS - 1)}…` : printed
}

/**
 * The layout, with room on the left for the shape's pointers' labels and arrows (and, in a box that
 * shows an algorithm's code, for the pc arrow that walks it while it plays), and after the lines that
 * show values for them.
 */
function layoutOf(shape: CodeShape) {
	const { code, size, lineNumbers, pointers, algorithm, lineCounts } = shape.props
	const metrics = getCodeMetrics(size)
	const left = pointerReachSideways(
		[...pointers.map((p) => p.name), ...(algorithm ? [PC] : [])],
		metrics.fontSize * POINTER_FONT_SCALE
	)
	const after: Record<number, number> = {}
	for (const v of valuesOf(shape)) after[v.line] = (after[v.line] ?? 2) + Math.ceil((v.name.length + 3 + VALUE_CHARS + 2) * VALUE_SCALE)
	// A loop's or an if's test, written out with its values while a step is on it (in place of the line's values).
	if (algorithm) {
		const steps = stepLines(shape)
		codeLines(code).forEach((line, i) => {
			const c = steps.has(i) ? conditionOf(line, shape.props.language) : undefined
			if (c) after[i] = Math.max(after[i] ?? 0, 2 + Math.ceil((testWidth(line.slice(c.from, c.to)) + TEST_MARK.length + 2) * VALUE_SCALE))
		})
	}
	const right = algorithm && lineCounts ? Math.ceil((COUNT_CHARS + 2) * VALUE_SCALE) : 0
	return getCodeLayout(code, metrics, { lineNumbers, left, after, right, folds: foldsOf(shape) })
}

/**
 * How wide a test reads written out (`2 > 0 && 7 > 3`): each array access or field (heap[(i - 1) / 2],
 * curr.next) a value of up to VALUE_CHARS, each short name a value of up to 3 (an index, a label).
 */
function testWidth(condition: string) {
	return condition
		.replace(/\b[A-Za-z_]\w*(?:\s*(?:\.|->)\s*[A-Za-z_]\w*|\s*\[[^\]]*\])+/g, 'v'.repeat(VALUE_CHARS))
		.replace(/\b[A-Za-z_]\w*\b/g, (name) => (name.length < 3 ? 'v'.repeat(3) : name)).length
}

/** Marks and pointers on lines the code no longer has go. */
function kept(shape: CodeShape, code: string) {
	const lines = codeLines(code).map((_, i) => lineKey(i))
	return { marks: pruneMarks(shape.props.marks, lines), pointers: prunePointers(shape.props.pointers, lines) }
}

const codeCells: EditableCells<CodeShape> = {
	cellAt(shape, { x, y }) {
		const { box } = layoutOf(shape)
		return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h ? CODE_KEY : undefined
	},
	firstCell: () => CODE_KEY,
	cellBox: (shape) => layoutOf(shape).box,
	getValue: (shape) => shape.props.code,
	setValue(shape, _key, value) {
		const code = value.replace(/\t/g, INDENT)
		return { id: shape.id, type: CODE_TYPE, props: { code, ...kept(shape, code) } }
	},
	neighbor: () => undefined,
}

/**
 * A code box: an algorithm in C, Java or Python, syntax highlighted as students see code everywhere
 * else (IDE, slides, book), so the board's code reads the same way. Shift+C and a click places one
 * and opens it for typing; double-click to edit it again (highlighted as you type, Tab indents,
 * Enter keeps the indentation, Esc or a click away finishes). The style panel picks the language.
 */
export class CodeShapeUtil extends CellShapeUtil<CodeShape> {
	static override type = CODE_TYPE
	static override props = codeShapeProps
	static override migrations = codeShapeMigrations

	readonly cells = codeCells

	getDefaultProps(): CodeShape['props'] {
		return {
			code: '',
			language: 'java',
			lineNumbers: false,
			marks: {},
			pointers: [],
			structureId: '',
			algorithm: '',
			lineCounts: false,
			transcript: false,
			fold: true,
			color: 'black',
			size: 'm',
		}
	}

	/**
	 * The box as it is drawn: a transcript's code is its structure's log written out in its language
	 * (the same object while neither changes, so what is worked out from it stays worked out).
	 */
	shown(shape: CodeShape): CodeShape {
		if (!shape.props.transcript) return shape
		const structure = this.editor.getShape(shape.props.structureId as TLShapeId)
		const code = structure ? transcriptOf(this.editor, structure, shape.props.language) : ''
		const cached = shownTranscripts.get(shape)
		if (cached?.props.code === code) return cached
		const drawn = { ...shape, props: { ...shape.props, code } }
		shownTranscripts.set(shape, drawn)
		return drawn
	}

	/** The code beside a structure is the structure's: typing goes there, not here. */
	override canEdit(shape: CodeShape): boolean {
		return !shape.props.transcript && super.canEdit(shape)
	}

	getGeometry(given: CodeShape) {
		const shape = this.shown(given)
		const { box } = layoutOf(shape)
		const body = new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: true })
		// The room the pc arrow walks in counts in the bounds, so it is drawn inside them.
		const room = shape.props.algorithm && box.x > 0 ? [new Rectangle2d({ x: 0, y: box.y, width: box.x, height: box.h, isFilled: false })] : []
		const pointers = [...room, ...this.pointerGeometry(shape)]
		return pointers.length ? new Group2d({ children: [body, ...pointers] }) : body
	}

	/**
	 * While an operation with this box's code plays on the structure it follows: the line the step on
	 * screen is on, if it is on one (in predict mode, while a step is asked about, the one before it).
	 * `live`: the canvas, or exporting the structure's steps.
	 */
	private following(
		shape: CodeShape,
		live: boolean
	): { line?: number; values: { line: number; text: string }[]; counts: { line: number; text: string }[]; test?: ShownTest & { line: number } } | undefined {
		const { structureId, algorithm, code, language, lineCounts } = shape.props
		if (!live || !structureId || !algorithm) return undefined
		const view = playbackFor(this.editor, structureId as TLShapeId)
		if (!view || view.fading || view.code !== algorithm) return undefined
		const shown = shownFrame({ step: view.step, asking: view.question !== undefined })
		const frame = view.frames[shown]
		const source = algorithmCode(algorithm, language)
		// A pointer is the variable of its name, at its element; the step's other variables beside them.
		const vars: Record<string, string> = { ...Object.fromEntries((frame?.pointers ?? []).map((p) => [p.name, p.at])), ...frame?.vars }
		const byLine = new Map<number, string[]>()
		for (const v of valuesOf(shape)) {
			if (vars[v.key] !== undefined) byLine.set(v.line, [...(byLine.get(v.line) ?? []), `${v.name} = ${valueText(vars[v.key], language)}`])
		}
		// The times column: a line has run as often as the tags on it have (Python's one-line return
		// that either finds or misses), so far.
		const counts = new Map<number, number>()
		if (lineCounts && source) {
			for (const [tag, times] of Object.entries(frame?.runs ?? view.frames[0]?.runs ?? {})) {
				const line = taggedLine(code, source, tag)
				if (line !== undefined) counts.set(line, (counts.get(line) ?? 0) + (frame ? times : 0))
			}
		}
		const line = frame?.line && source ? taggedLine(code, source, frame.line) : undefined
		// On a loop's or an if's line: its test, from what the structure says the step's names and
		// arrays are (its nodes, beside a list, a tree or a graph: `testValues`).
		const structure = this.editor.getShape(structureId as TLShapeId)
		const util = structure && this.editor.getShapeUtil(structure)
		// Only a step that is the test itself: a line that tests and acts (if (...) swap(...)) has the test's tag first.
		const at = frame?.line && source ? source.lines[frame.line] : undefined
		const testing = at !== undefined && line !== undefined && source!.firstTags[at] === frame!.line
		// One step for a test and what it does on the same line (curr has moved): the test reads the step before.
		const text = codeLines(code)[line ?? -1] ?? ''
		const tags = Object.values(source?.lines ?? {}).filter((l) => l === at).length
		const read = testing && readsBefore(text, language, tags) ? Math.max(0, shown - 1) : shown
		// The strips as they stand at the step (a step that only looks at an edge keeps visited[] as it was).
		const before = view.frames[read]
		const step = testing && before ? { ...before, strips: before.strips ?? stateAt(view.frames, read).strips } : undefined
		const values = step && util instanceof CellShapeUtil ? util.testValues?.(structure as never, step) : undefined
		const tested = values ? shownTest(text, language, values) : undefined
		const test = tested && line !== undefined ? { ...tested, line } : undefined
		return {
			line,
			values: [...byLine].filter(([at]) => at !== test?.line).map(([at, texts]) => ({ line: at, text: texts.join('  ') })),
			counts: [...counts].map(([at, times]) => ({ line: at, text: `×${times}` })),
			test,
		}
	}

	/** The shape's pointers laid out, plus pc at the line a step is on. */
	private withPc(shape: CodeShape, line: number) {
		const pc = { id: `#${PC}`, name: PC, at: lineKey(line) }
		return placePointers([...shape.props.pointers, pc], (key) => this.pointerAnchor(shape, key), this.getPointerFontSize(shape))
	}

	/**
	 * Picking another language for a box showing an algorithm's code (not edited since) shows the
	 * algorithm in that language.
	 */
	override onBeforeUpdate(prev: CodeShape, next: CodeShape) {
		let synced = next
		const { algorithm } = next.props
		if (algorithm && prev.props.language !== next.props.language && prev.props.code === next.props.code) {
			const was = algorithmCode(algorithm, prev.props.language)
			const now = algorithmCode(algorithm, next.props.language)
			if (was && now && was.text === prev.props.code && now.text !== was.text) {
				synced = { ...next, props: { ...next.props, code: now.text, ...kept(next, now.text) } }
			}
		}
		return super.onBeforeUpdate(prev, synced) ?? (synced === next ? undefined : synced)
	}

	/** Room made on the left for pointers (`layoutOf`): the shape moves so the code stays put. */
	override layoutOffset(shape: CodeShape): VecLike {
		return { x: layoutOf(this.shown(shape)).box.x, y: 0 }
	}

	// Pointers (pc...) come from the left of a line; the arrow keys step them up and down the code.

	pointerAnchor(shape: CodeShape, key: string): PointerAnchor | undefined {
		const line = lineOf(key)
		const layout = layoutOf(this.shown(shape))
		if (line === undefined || line >= layout.lines || layout.hidden(line)) return undefined
		return { box: layout.rowBox(line), side: 'left' }
	}

	override pointerTargetAt(shape: CodeShape, point: VecLike): string | undefined {
		const layout = layoutOf(this.shown(shape))
		const { box } = layout
		if (point.y < box.y || point.y > box.y + box.h || point.x > box.x + box.w) return undefined
		const { line } = layout.caretAt(point)
		return layout.hidden(line) ? undefined : lineKey(line)
	}

	pointerStep(shape: CodeShape, key: string, direction: PointerDirection): string | undefined {
		const line = lineOf(key)
		const by = { up: -1, down: 1, left: 0, right: 0 }[direction]
		if (line === undefined || !by) return undefined
		// Over a fold to the line past it.
		const layout = layoutOf(this.shown(shape))
		let next = line + by
		while (layout.hidden(next)) next += by
		return this.pointerAnchor(shape, lineKey(next)) ? lineKey(next) : undefined
	}

	pointerNames() {
		return ['pc', 'here']
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	/** A mark (1-4) lights the line under the pointer. */
	override markKeyAt(given: CodeShape, point: VecLike): string | undefined {
		const shape = this.shown(given)
		if (codeCells.cellAt(shape, point) === undefined) return undefined
		const layout = layoutOf(shape)
		const { line } = layout.caretAt(point)
		return layout.hidden(line) ? undefined : lineKey(line)
	}

	override menuName() {
		return 'Code'
	}

	/** Its own moves say how its lines are marked and pointed at; it has no seed, and nothing plays on it. */
	override sharedMoves() {
		return ['copy'] as const
	}

	override readonly menuId = 'code'

	/**
	 * A clean copy of the code beside a structure (its moves, or what plays on it) is that code as it
	 * shows now, in a box of its own: a second box following the structure would be the structure's too.
	 */
	override cleanProps(shape: CodeShape): CodeShape['props'] {
		return { ...super.cleanProps(this.shown(shape)), structureId: '', algorithm: '', transcript: false, lineCounts: false }
	}

	override shapeOperations(shape: CodeShape): NodeOperation[] {
		const { lineNumbers, lineCounts, algorithm, fold } = shape.props
		// Long code beside a structure folds; Show undoes it (or folds it again).
		const shown = this.shown(shape)
		const folds = foldsOf({ ...shown, props: { ...shown.props, fold: true } })
		const hiding = folds.reduce((n, f) => n + f.to - f.from + 1, 0)
		return [
			// Its text as drawn (the code beside a structure, written out), to paste into an editor.
			{
				section: 'actions',
				id: 'code-copy',
				label: 'Copy the code',
				run: () => void navigator.clipboard.writeText(this.shown(shape).props.code),
			},
			...(folds.length
				? [
						{
							section: 'show' as const,
							id: 'code-fold',
							label: fold ? `All ${codeLines(shown.props.code).length} lines (${hiding} folded)` : `Fold it to ${FOLD_LINES} lines`,
							run: () => {
								this.editor.markHistoryStoppingPoint('fold')
								this.editor.updateShape<CodeShape>({ id: shape.id, type: CODE_TYPE, props: { fold: !fold } })
							},
						},
					]
				: []),
			{
				section: 'show',
				id: 'code-line-numbers',
				label: lineNumbers ? 'Hide the line numbers' : 'Line numbers',
				run: () => {
					this.editor.markHistoryStoppingPoint('line numbers')
					this.editor.updateShape<CodeShape>({ id: shape.id, type: CODE_TYPE, props: { lineNumbers: !lineNumbers } })
				},
			},
			// Lecture 3's times column, for code an algorithm runs.
			...(algorithm
				? [
						{
							section: 'show' as const,
							id: 'code-line-counts',
							label: lineCounts ? 'Hide the times each line runs' : 'Times each line runs',
							run: () => {
								this.editor.markHistoryStoppingPoint('line counts')
								this.editor.updateShape<CodeShape>({ id: shape.id, type: CODE_TYPE, props: { lineCounts: !lineCounts } })
							},
						},
					]
				: []),
		]
	}

	override moves() {
		return [
			'Double-click to edit: highlighted as you type; Tab / Shift+Tab indent, Enter keeps the indentation, Esc finishes',
			'Style panel: C, Java or Python',
			'Point at a line and press 1–4 to light it (0 clears)',
			'Right-click a line: Pointer > pc, then click pc and step it with ↑ ↓ as you walk through the code',
			'Right-click: Show > Line numbers',
			'Beside a structure (the play bar\'s </> button), it shows the code of what plays, the line each step is on lit',
			'Right-click it beside a structure: Show > Times each line runs, counted as the steps go',
			`Beside a structure, code over ${FOLD_LINES} lines folds (a transcript to its first and latest lines); Show > All the lines unfolds it`,
		]
	}

	override onEditStart(shape: CodeShape) {
		// The editor lies over every line: a folded box (an algorithm's code) shows them all from now on.
		if (layoutOf(shape).folds.length) {
			this.editor.run(() => this.editor.updateShape<CodeShape>({ id: shape.id, type: CODE_TYPE, props: { fold: false } }), { history: 'ignore' })
		}
		const mark = createdFrom.get(shape.id)
		createdFrom.delete(shape.id)
		if (mark) beginCellEdit(this.editor, shape.id, CODE_KEY, mark)
		else super.onEditStart(shape)
	}

	/** An empty code box doesn't stay when its editing ends (as tldraw's text). */
	override onEditEnd(shape: CodeShape) {
		super.onEditEnd(shape)
		const current = this.editor.getShape<CodeShape>(shape.id)
		if (current && !current.props.code.trim()) this.editor.deleteShapes([shape.id])
	}

	component(given: CodeShape) {
		const shape = this.shown(given)
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const metrics = getCodeMetrics(shape.props.size)
		const layout = layoutOf(shape)
		const editing = this.getEditingKey(shape) === CODE_KEY
		const cell = getEditingCell(this.editor)
		const follow = this.following(shape, true)
		const step = follow?.line
		return (
			<>
				<SVGContainer>
					<CodeSvg
						shape={shape}
						layout={layout}
						metrics={metrics}
						colors={colors}
						fontFamily={this.getFontFamily()}
						cues={showsColourCues()}
						step={step}
						values={follow?.values}
						counts={follow?.counts}
						test={follow?.test}
					/>
					{this.renderPointers(shape, colors, step === undefined ? {} : { placed: this.withPc(shape, step) })}
				</SVGContainer>
				{this.renderPointerOverlays(shape, colors)}
				{editing && cell && (
					<CodeEditor
						key={cell.markId}
						util={this}
						shape={shape}
						layout={layout}
						metrics={metrics}
						fontFamily={this.getFontFamily()}
						caretColor={colors.text}
						outlineColor={colors.selectionStroke}
					/>
				)}
			</>
		)
	}

	override toSvg(given: CodeShape, ctx: SvgExportContext) {
		const shape = this.shown(given)
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		// Exporting its structure's steps: the step's line, as on the canvas.
		const live = !!shape.props.structureId && !!exportingStep(this.editor, shape.props.structureId as TLShapeId)
		const follow = this.following(shape, live)
		const step = follow?.line
		return (
			<>
				<CodeSvg
					shape={shape}
					layout={layoutOf(shape)}
					metrics={getCodeMetrics(shape.props.size)}
					colors={colors}
					fontFamily={this.getFontFamily()}
					cues={showsColourCues()}
					step={step}
					values={follow?.values}
					counts={follow?.counts}
					test={follow?.test}
				/>
				{this.renderPointers(shape, colors, { exporting: true, ...(step === undefined ? {} : { placed: this.withPc(shape, step) }) })}
			</>
		)
	}

	getIndicatorPath(shape: CodeShape) {
		const { box } = layoutOf(this.shown(shape))
		const path = new Path2D()
		path.rect(box.x, box.y, box.w, box.h)
		return path
	}

	override getFontFaces(): TLFontFace[] {
		return this.editor.getCurrentTheme().fonts.mono.faces ?? []
	}

	getCellFont(shape: CodeShape) {
		return { fontFamily: this.getFontFamily(), fontSize: getCodeMetrics(shape.props.size).fontSize }
	}

	private getFontFamily() {
		return this.editor.getCurrentTheme().fonts.mono.fontFamily
	}
}

/** The colour of the line a step is on (a debugger's current line), apart from the marks' four. */
const STEP_COLOR: TLDefaultColorStyle = 'yellow'

/**
 * A loop's or an if's test as it is tested: its condition boxed, green if it held and red if not, and
 * after the line its parts with their values (each green or red, a part never evaluated greyed, as
 * written), then whether it held.
 */
function TestSvg({ test, layout, metrics, colors }: { test: ShownTest & { line: number }; layout: CodeLayout; metrics: CodeMetrics; colors: TLThemeColors }) {
	const { charW, lineH, fontSize, strokeWidth } = metrics
	const at = layout.lineAt(test.line)
	const end = layout.endOf(test.line)
	const color = (held: boolean | undefined, tone: 'solid' | 'semi' = 'solid') => (held === undefined ? colors.text : getColorValue(colors, held ? 'green' : 'red', tone))
	const pad = charW * 0.15
	return (
		<g data-test-line={test.line} data-test-result={String(test.result)}>
			<rect
				x={at.x + test.from * charW - pad}
				y={at.y - lineH * 0.42}
				width={(test.to - test.from) * charW + pad * 2}
				height={lineH * 0.84}
				rx={lineH * 0.18}
				fill={color(test.result, 'semi')}
				stroke={color(test.result)}
				strokeWidth={strokeWidth}
			/>
			<text x={end.x + charW * 2} y={end.y} fontSize={fontSize * VALUE_SCALE} dominantBaseline="central" style={{ whiteSpace: 'pre' }}>
				{test.parts.map((part, k) => (
					<tspan key={k}>
						{k > 0 && <tspan fill={colors.text}>{` ${test.ops[k - 1]} `}</tspan>}
						<tspan data-test-part={k} fill={part.value === undefined ? colors.text : color(part.value)} opacity={part.value === undefined ? 0.4 : 1}>
							{part.shown ?? '…'}
						</tspan>
					</tspan>
				))}
				<tspan fill={color(test.result)} fontWeight="bold">{`  ${test.result ? '→ true' : TEST_MARK}`}</tspan>
			</text>
		</g>
	)
}

/** The parts of a test it never got to (short-circuited), faded where they are written: drawn over the code. */
function SkippedSvg({ test, layout, metrics, colors }: { test: ShownTest & { line: number }; layout: CodeLayout; metrics: CodeMetrics; colors: TLThemeColors }) {
	const { charW, lineH } = metrics
	const at = layout.lineAt(test.line)
	return (
		<g data-test-skipped={test.line}>
			{test.parts.map((part, k) =>
				part.value === undefined && part.shown === undefined ? (
					<rect
						key={k}
						x={at.x + part.from * charW}
						y={at.y - lineH * 0.4}
						width={(part.to - part.from) * charW}
						height={lineH * 0.8}
						fill={getColorValue(colors, 'red', 'semi')}
						opacity={0.65}
					/>
				) : null
			)}
		</g>
	)
}

/**
 * The box, lit lines, line numbers and the highlighted code: the canvas and exports alike. `step`:
 * the line an operation's step is on, lit over any mark; `values`: variables' values after their
 * lines, in the pointers' colour (i and j are the pointers on the structure too); `counts`: how many
 * times lines have run, in a column at the right.
 */
export function CodeSvg({
	shape,
	layout,
	metrics,
	colors,
	fontFamily,
	cues,
	step,
	values,
	counts,
	test,
}: {
	shape: CodeShape
	layout: CodeLayout
	metrics: CodeMetrics
	colors: TLThemeColors
	fontFamily: string
	cues?: boolean
	step?: number
	values?: { line: number; text: string }[]
	counts?: { line: number; text: string }[]
	/** The test on the step's line: its condition boxed green or red, written out with its values after the line. */
	test?: ShownTest & { line: number }
}) {
	const { code, language, lineNumbers, marks, color } = shape.props
	const { box } = layout
	const { fontSize, strokeWidth, lineH } = metrics
	const lines = highlightLines(code.replace(/\t/g, INDENT), language)
	return (
		<g fontFamily={fontFamily} data-testid="code-box" data-language={language}>
			<rect
				x={box.x}
				y={box.y}
				width={box.w}
				height={box.h}
				rx={fontSize * 0.4}
				fill={getColorValue(colors, color, 'semi')}
				stroke={getColorValue(colors, color, 'solid')}
				strokeWidth={strokeWidth}
			/>
			{lines.map((_, i) => {
				const c = marks[lineKey(i)]
				if (!c || layout.hidden(i)) return null
				const row = layout.rowBox(i)
				const inset = strokeWidth * 1.5
				return (
					<g key={`mark-${i}`} data-mark-line={i}>
						<rect
							x={row.x + inset}
							y={row.y}
							width={row.w - inset * 2}
							height={row.h}
							rx={lineH * 0.15}
							fill={getColorValue(colors, c, 'semi')}
							stroke={getColorValue(colors, c, 'solid')}
							strokeWidth={strokeWidth}
						/>
						{cues && (
							<CueBadge
								color={c}
								at={cueBadgeAt({ x: row.x + row.w / 2, y: row.y + row.h / 2, w: row.w, h: row.h }, false, inset, true)}
								colors={colors}
								strokeWidth={strokeWidth}
							/>
						)}
					</g>
				)
			})}
			{step !== undefined && step < lines.length && !layout.hidden(step) && (
				<rect
					data-step-line={step}
					x={layout.rowBox(step).x + strokeWidth * 1.5}
					y={layout.rowBox(step).y}
					width={layout.rowBox(step).w - strokeWidth * 3}
					height={layout.rowBox(step).h}
					rx={lineH * 0.15}
					fill={getColorValue(colors, STEP_COLOR, 'semi')}
					stroke={getColorValue(colors, STEP_COLOR, 'solid')}
					strokeWidth={strokeWidth}
				/>
			)}
			{lineNumbers &&
				lines.map((_, i) =>
					layout.hidden(i) ? null : (
					<text
						key={`n${i}`}
						x={layout.gutterRight}
						y={layout.lineAt(i).y}
						fontSize={fontSize * 0.85}
						textAnchor="end"
						dominantBaseline="central"
						fill={colors.text}
						opacity={0.4}
					>
						{i + 1}
					</text>
					)
				)}
			{counts?.filter(({ line }) => !layout.hidden(line)).map(({ line, text }) => (
				<text
					key={`count-${line}`}
					data-count-line={line}
					x={layout.columnRight}
					y={layout.lineAt(line).y}
					fontSize={fontSize * VALUE_SCALE}
					textAnchor="end"
					dominantBaseline="central"
					fill={colors.text}
					opacity={0.55}
				>
					{text}
				</text>
			))}
			{test && <TestSvg test={test} layout={layout} metrics={metrics} colors={colors} />}
			{values?.filter(({ line }) => !layout.hidden(line)).map(({ line, text }) => {
				const end = layout.endOf(line)
				return (
					<text
						key={`value-${line}`}
						data-value-line={line}
						x={end.x + metrics.charW * 2}
						y={end.y}
						fontSize={fontSize * VALUE_SCALE}
						dominantBaseline="central"
						fill={getColorValue(colors, 'violet', 'solid')}
						style={{ whiteSpace: 'pre' }}
					>
						{text}
					</text>
				)
			})}
			{lines.map((tokens, i) => {
				if (layout.hidden(i)) return null
				const at = layout.lineAt(i)
				return (
					<text key={i} data-code-line={i} x={at.x} y={at.y} fontSize={fontSize} dominantBaseline="central" fill={colors.text} style={{ whiteSpace: 'pre' }}>
						{tokens.map((t, k) => (
							<tspan
								key={k}
								data-kind={t.kind}
								fill={t.kind === 'plain' ? undefined : getColorValue(colors, TOKEN_COLORS[t.kind], 'solid')}
								fontStyle={t.kind === 'comment' ? 'italic' : undefined}
							>
								{t.text}
							</tspan>
						))}
					</text>
				)
			})}
			{layout.folds.map((f) => (
				<text
					key={`fold-${f.from}`}
					data-testid="code-fold"
					data-fold-lines={f.to - f.from + 1}
					x={f.at.x}
					y={f.at.y}
					fontSize={fontSize}
					dominantBaseline="central"
					fill={colors.text}
					opacity={0.5}
					fontStyle="italic"
					style={{ whiteSpace: 'pre' }}
				>
					{foldText(f)}
				</text>
			))}
			{test && <SkippedSvg test={test} layout={layout} metrics={metrics} colors={colors} />}
		</g>
	)
}

/**
 * The editor: a textarea laid exactly over the drawn code, its own text see-through, so the code
 * underneath is highlighted as it is typed. Its keys are handled first and kept from tldraw (as the
 * cells' input does): Tab / Shift+Tab indent, Enter keeps the indentation, '}' steps out, Esc or
 * Cmd/Ctrl+Enter finishes (keeping the code; one undo takes the whole edit back).
 */
function CodeEditor({
	util,
	shape,
	layout,
	metrics,
	fontFamily,
	caretColor,
	outlineColor,
}: {
	util: CodeShapeUtil
	shape: CodeShape
	layout: CodeLayout
	metrics: CodeMetrics
	fontFamily: string
	caretColor: string
	outlineColor: string
}) {
	const { editor } = util
	const ref = useRef<HTMLTextAreaElement>(null)
	const latest = () => editor.getShape<CodeShape>(shape.id)

	// The caret goes where the double-click was (or to the end).
	useFocusOnEdit(editor, ref, (area) => {
		const point = editor.getPointInShapeSpace(shape, editor.inputs.getCurrentPagePoint())
		const at = codeCells.cellAt(shape, point) ? offsetOf(shape.props.code, layout.caretAt(point)) : shape.props.code.length
		area.setSelectionRange(at, at)
	})

	// The box grows as the code does, a render after the text: the textarea never stays scrolled meanwhile.
	useLayoutEffect(() => {
		if (ref.current) ref.current.scrollLeft = ref.current.scrollTop = 0
	})

	const sync = () => {
		const current = latest()
		if (current && ref.current) editor.updateShape(codeCells.setValue(current, CODE_KEY, ref.current.value))
	}

	const apply = (area: HTMLTextAreaElement, edit: CodeEdit) => {
		area.setSelectionRange(edit.from, edit.to)
		// insertText keeps the browser's own undo (Cmd+Z while typing) in step; else replace directly.
		const before = area.value
		if (!edit.insert || !document.execCommand('insertText', false, edit.insert) || area.value === before) {
			area.value = applyEdit(before, edit)
		}
		area.setSelectionRange(edit.selStart, edit.selEnd)
		sync()
	}

	const onKeyDownCapture = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		editor.markEventAsHandled(e)
		if (e.nativeEvent.isComposing) return
		const area = e.currentTarget
		const { selectionStart: start, selectionEnd: end, value } = area
		const language: CodeLanguage = (latest() ?? shape).props.language
		let edit: CodeEdit | undefined
		if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
			e.preventDefault()
			editor.complete()
			return
		}
		if (e.key === 'Tab') edit = indentEdit(value, start, end, e.shiftKey)
		else if (e.key === 'Enter') edit = newlineEdit(value, start, end, language)
		else if (e.key === '}' && language !== 'python') edit = closeBraceEdit(value, start, end)
		if (!edit) return
		e.preventDefault()
		apply(area, edit)
	}

	const { box, top, textX } = layout
	return (
		<textarea
			ref={ref}
			className="drawds-code-editor"
			data-testid="code-editor"
			aria-label="Code"
			defaultValue={shape.props.code}
			wrap="off"
			spellCheck={false}
			autoComplete="off"
			autoCorrect="off"
			autoCapitalize="off"
			onInput={sync}
			onKeyDownCapture={onKeyDownCapture}
			onPointerDown={(e) => editor.markEventAsHandled(e)}
			onScroll={(e) => (e.currentTarget.scrollLeft = e.currentTarget.scrollTop = 0)}
			style={{
				position: 'absolute',
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				boxSizing: 'border-box',
				margin: 0,
				padding: `${top}px 0 0 ${textX}px`,
				border: 'none',
				outline: `2px solid ${outlineColor}`,
				outlineOffset: -1,
				borderRadius: metrics.fontSize * 0.4,
				background: 'transparent',
				color: 'transparent',
				caretColor,
				fontFamily,
				fontSize: metrics.fontSize,
				lineHeight: `${metrics.lineH}px`,
				whiteSpace: 'pre',
				overflow: 'hidden',
				resize: 'none',
				pointerEvents: 'all',
			}}
		/>
	)
}

