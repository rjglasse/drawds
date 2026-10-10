import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import {
	Rectangle2d,
	SVGContainer,
	getColorValue,
	type TLDefaultColorStyle,
	type TLFontFace,
	type TLThemeColors,
	type SvgExportContext,
	type VecLike,
} from 'tldraw'
import { CellShapeUtil, useFocusOnEdit, type NodeOperation } from '../../cells/CellShapeUtil'
import { CueBadge } from '../../cells/CueBadge'
import { cueBadgeAt, showsColourCues } from '../../cells/cues'
import { beginCellEdit, getEditingCell, type EditableCells } from '../../cells/editable-cells'
import { pruneMarks, type Marks } from '../../cells/marks'
import { CODE_TYPE, codeShapeMigrations, codeShapeProps, type CodeShape } from './code-shape-types'
import { applyEdit, closeBraceEdit, indentEdit, newlineEdit, type CodeEdit } from './editing'
import { highlightLines, type CodeLanguage, type TokenKind } from './highlight'
import { INDENT, codeLines, getCodeLayout, getCodeMetrics, offsetOf, type CodeLayout, type CodeMetrics } from './layout'

/** The one editable "cell": the whole code. */
const CODE_KEY = 'code'

/** A new box's creation mark (CodeShapeTool), which its first edit goes on from. */
export const createdFrom = new Map<string, string>()

/** A line's key, for marks. */
export const lineKey = (i: number) => `L${i}`

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

const layoutOf = (shape: CodeShape) => getCodeLayout(shape.props.code, getCodeMetrics(shape.props.size), shape.props.lineNumbers)

/** Marks on lines the code no longer has go. */
const keptMarks = (marks: Marks, code: string) =>
	pruneMarks(
		marks,
		codeLines(code).map((_, i) => lineKey(i))
	)

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
		return { id: shape.id, type: CODE_TYPE, props: { code, marks: keptMarks(shape.props.marks, code) } }
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
		return { code: '', language: 'java', lineNumbers: false, marks: {}, pointers: [], color: 'black', size: 'm' }
	}

	getGeometry(shape: CodeShape) {
		const { box } = layoutOf(shape)
		return new Rectangle2d({ x: box.x, y: box.y, width: box.w, height: box.h, isFilled: true })
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	/** A mark (1-4) lights the line under the pointer. */
	override markKeyAt(shape: CodeShape, point: VecLike): string | undefined {
		if (codeCells.cellAt(shape, point) === undefined) return undefined
		return lineKey(layoutOf(shape).caretAt(point).line)
	}

	override menuName() {
		return 'Code'
	}

	override readonly menuId = 'code'

	override shapeOperations(shape: CodeShape): NodeOperation[] {
		const { lineNumbers } = shape.props
		return [
			{
				section: 'show',
				id: 'code-line-numbers',
				label: lineNumbers ? 'Hide line numbers' : 'Line numbers',
				run: () => {
					this.editor.markHistoryStoppingPoint('line numbers')
					this.editor.updateShape<CodeShape>({ id: shape.id, type: CODE_TYPE, props: { lineNumbers: !lineNumbers } })
				},
			},
		]
	}

	override moves() {
		return [
			'Double-click to edit: highlighted as you type; Tab / Shift+Tab indent, Enter keeps the indentation, Esc finishes',
			'Style panel: C, Java or Python',
			'Point at a line and press 1–4 to light it (0 clears)',
			'Right-click: Show > Line numbers',
		]
	}

	override onEditStart(shape: CodeShape) {
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

	component(shape: CodeShape) {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const metrics = getCodeMetrics(shape.props.size)
		const layout = layoutOf(shape)
		const editing = this.getEditingKey(shape) === CODE_KEY
		const cell = getEditingCell(this.editor)
		return (
			<>
				<SVGContainer>
					<CodeSvg shape={shape} layout={layout} metrics={metrics} colors={colors} fontFamily={this.getFontFamily()} cues={showsColourCues()} />
				</SVGContainer>
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

	override toSvg(shape: CodeShape, ctx: SvgExportContext) {
		const colors = this.editor.getCurrentTheme().colors[ctx.colorMode]
		return (
			<CodeSvg
				shape={shape}
				layout={layoutOf(shape)}
				metrics={getCodeMetrics(shape.props.size)}
				colors={colors}
				fontFamily={this.getFontFamily()}
				cues={showsColourCues()}
			/>
		)
	}

	getIndicatorPath(shape: CodeShape) {
		const { box } = layoutOf(shape)
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

/** The box, lit lines, line numbers and the highlighted code: the canvas and exports alike. */
export function CodeSvg({
	shape,
	layout,
	metrics,
	colors,
	fontFamily,
	cues,
}: {
	shape: CodeShape
	layout: CodeLayout
	metrics: CodeMetrics
	colors: TLThemeColors
	fontFamily: string
	cues?: boolean
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
				if (!c) return null
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
			{lineNumbers &&
				lines.map((_, i) => (
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
				))}
			{lines.map((tokens, i) => {
				const at = layout.lineAt(i)
				return (
					<text key={i} x={at.x} y={at.y} fontSize={fontSize} dominantBaseline="central" fill={colors.text} style={{ whiteSpace: 'pre' }}>
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

