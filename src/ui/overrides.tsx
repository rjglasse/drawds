import {
	DefaultContextMenu,
	DefaultContextMenuContent,
	DefaultKeyboardShortcutsDialog,
	DefaultKeyboardShortcutsDialogContent,
	DefaultMainMenu,
	DefaultMainMenuContent,
	DefaultStylePanel,
	DefaultStylePanelContent,
	DefaultToolbar,
	DefaultToolbarContent,
	TldrawUiMenuActionItem,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TldrawUiMenuSubmenu,
	useActions,
	useEditor,
	useIsToolSelected,
	useTools,
	useValue,
	type Editor,
	type TLComponents,
	type TLUiOverrides,
} from 'tldraw'
import { useState } from 'react'
import { clearMarks, markElement, markTargetUnderPointer } from '../cells/marking'
import { MARK_COLORS, MARK_MEANINGS, type MarkColor } from '../cells/marks'
import { PlaybackOverlay } from '../controls/PlaybackOverlay'
import { openBoard, saveBoard } from '../files/board'
import type { MenuSection, NodeOperation } from '../cells/CellShapeUtil'
import { NodeLinkShapeUtil } from '../nodelink/NodeLinkShapeUtil'
import { placePointer, removePointer, type Pointer } from '../pointers/pointers'
import { operationPrompt } from '../controls/prompt'
import { pointerState } from '../pointers/state'
import { ArrayPickers, arrayPickerTranslations } from './ArrayPickers'
import { FillPicker, fillPickerTranslations } from './FillPicker'
import { invariantPickerTranslations } from './InvariantPicker'
import { ListPickers, listPickerTranslations } from './ListPickers'
import { GraphPickers, GraphViewPickers, graphPickerTranslations, graphViewPickerTranslations } from './GraphPickers'
import { maskIcon } from './icons'
import arrayIconUrl from './icons/array.svg'
import graphIconUrl from './icons/graph.svg'
import listIconUrl from './icons/list.svg'
import treeIconUrl from './icons/tree.svg'
import { HeapPickers, heapPickerTranslations } from './HeapPickers'
import heapIconUrl from './icons/heap.svg'
import matrixIconUrl from './icons/matrix.svg'
import hashIconUrl from './icons/hash.svg'
import { HashPickers, hashPickerTranslations } from './HashPickers'
import { TreePickers, treePickerTranslations } from './TreePickers'
import { StructureHint } from './StructureHint'

/** Our structure tools, in toolbar order. */
const STRUCTURE_TOOLS = ['array', 'matrix', 'linked-list', 'binary-tree', 'heap', 'hash-table', 'graph'] as const

const RELAYOUT = 'drawds.relayout'

/** Board files, first in the main menu. */
const BOARD_ACTIONS = ['drawds.open-board', 'drawds.save-board', 'drawds.save-board-as'] as const

const markLabel = (color: MarkColor) => `${color[0].toUpperCase()}${color.slice(1)} (${MARK_MEANINGS[color]})`

/** Selected node-link shapes that have nodes dragged away from their automatic layout. */
function relayoutTargets(editor: Editor) {
	return editor.getSelectedShapes().flatMap((shape) => {
		const util = editor.getShapeUtil(shape)
		return util instanceof NodeLinkShapeUtil && util.hasManualLayout(shape) ? [{ shape, util }] : []
	})
}

export const uiOverrides: TLUiOverrides = {
	tools(editor, tools) {
		tools.array = {
			id: 'array',
			icon: maskIcon(arrayIconUrl),
			label: 'Array',
			// Plain "a" is tldraw's arrow tool.
			kbd: 'shift+a',
			onSelect: () => editor.setCurrentTool('array'),
		}
		tools.matrix = {
			id: 'matrix',
			icon: maskIcon(matrixIconUrl),
			label: 'Matrix (2D array)',
			kbd: 'shift+m',
			onSelect: () => editor.setCurrentTool('matrix'),
		}
		tools['linked-list'] = {
			id: 'linked-list',
			icon: maskIcon(listIconUrl),
			label: 'Linked list',
			// "n" for nodes; plain "l" is the line tool and shift+l is lock.
			kbd: 'shift+n',
			onSelect: () => editor.setCurrentTool('linked-list'),
		}
		tools['binary-tree'] = {
			id: 'binary-tree',
			icon: maskIcon(treeIconUrl),
			label: 'Binary tree',
			kbd: 'shift+t',
			onSelect: () => editor.setCurrentTool('binary-tree'),
		}
		tools.heap = {
			id: 'heap',
			icon: maskIcon(heapIconUrl),
			label: 'Heap',
			// "p" for priority queue; plain "h" is the hand tool.
			kbd: 'shift+p',
			onSelect: () => editor.setCurrentTool('heap'),
		}
		tools['hash-table'] = {
			id: 'hash-table',
			icon: maskIcon(hashIconUrl),
			label: 'Hash table',
			// "b" for buckets; shift+h is tldraw's flip horizontal.
			kbd: 'shift+b',
			onSelect: () => editor.setCurrentTool('hash-table'),
		}
		tools.graph = {
			id: 'graph',
			icon: maskIcon(graphIconUrl),
			label: 'Graph',
			// Plain "g" is tldraw's geo tool.
			kbd: 'shift+g',
			onSelect: () => editor.setCurrentTool('graph'),
		}
		return tools
	},
	actions(editor, actions, helpers) {
		actions['drawds.open-board'] = {
			id: 'drawds.open-board',
			label: 'Open board…',
			kbd: 'cmd+o,ctrl+o',
			onSelect: () => openBoard(editor, helpers),
		}
		actions['drawds.save-board'] = {
			id: 'drawds.save-board',
			label: 'Save board',
			kbd: 'cmd+s,ctrl+s',
			onSelect: () => saveBoard(editor, helpers),
		}
		actions['drawds.save-board-as'] = {
			id: 'drawds.save-board-as',
			label: 'Save board as…',
			kbd: 'cmd+shift+s,ctrl+shift+s',
			onSelect: () => saveBoard(editor, helpers, { as: true }),
		}
		actions[RELAYOUT] = {
			id: RELAYOUT,
			label: 'Re-layout',
			onSelect: () => {
				const targets = relayoutTargets(editor)
				if (!targets.length) return
				editor.markHistoryStoppingPoint('re-layout')
				editor.updateShapes(targets.map(({ shape, util }) => util.resetLayout(shape)))
			},
		}
		// Point at a cell or node and press 1-4 to mark it (again to clear), 0 to clear. Shortcuts are
		// off while typing in a cell, so digits typed as values never mark anything.
		MARK_COLORS.forEach((color, i) => {
			actions[`drawds.mark-${color}`] = {
				id: `drawds.mark-${color}`,
				label: `Mark ${markLabel(color)}`,
				kbd: String(i + 1),
				onSelect: () => markElement(editor, markTargetUnderPointer(editor), color),
			}
		})
		actions['drawds.unmark'] = {
			id: 'drawds.unmark',
			label: 'Clear mark',
			kbd: '0',
			onSelect: () => markElement(editor, markTargetUnderPointer(editor), null),
		}
		return actions
	},
	translations: {
		en: {
			...fillPickerTranslations,
			...arrayPickerTranslations,
			...listPickerTranslations,
			...hashPickerTranslations,
			...treePickerTranslations,
			...heapPickerTranslations,
			...invariantPickerTranslations,
			...graphPickerTranslations,
			...graphViewPickerTranslations,
		},
	},
}

function StructureToolbarItem({ id }: { id: string }) {
	const tools = useTools()
	const isSelected = useIsToolSelected(tools[id])
	return <TldrawUiMenuItem {...tools[id]} isSelected={isSelected} />
}

/**
 * Mark submenu for the element under the pointer when the menu opened (captured then, because the
 * pointer moves onto the menu afterwards).
 */
function MarkMenu() {
	const editor = useEditor()
	const [target] = useState(() => markTargetUnderPointer(editor))
	if (!target) return null
	const hasMarks = Object.keys(target.util.getMarks(target.shape)).length > 0
	return (
		<TldrawUiMenuGroup id="drawds-mark">
			<TldrawUiMenuSubmenu id="drawds-mark" label="Mark">
				{target.key !== undefined && (
					<TldrawUiMenuGroup id="drawds-mark-colors">
						{MARK_COLORS.map((color, i) => (
							<TldrawUiMenuItem
								key={color}
								id={`mark-${color}`}
								label={markLabel(color)}
								kbd={String(i + 1)}
								onSelect={() => markElement(editor, target, color)}
							/>
						))}
						<TldrawUiMenuItem id="unmark" label="Clear mark" kbd="0" onSelect={() => markElement(editor, target, null)} />
					</TldrawUiMenuGroup>
				)}
				<TldrawUiMenuGroup id="drawds-mark-all">
					<TldrawUiMenuItem
						id="clear-marks"
						label="Clear all marks"
						disabled={!hasMarks}
						onSelect={() => clearMarks(editor, target)}
					/>
				</TldrawUiMenuGroup>
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}

/**
 * Operations that start from the element under the pointer when the menu opened (a graph's BFS /
 * DFS from it), captured then like the mark target, then those on the whole structure (an array's
 * sorts).
 */
function NodeOperationsMenu() {
	const editor = useEditor()
	const [target] = useState(() => markTargetUnderPointer(editor))
	const [operations] = useState(() => {
		if (!target) return []
		const { util, shape, key } = target
		return [...(key !== undefined ? (util.nodeOperations?.(shape, key) ?? []) : []), ...(util.shapeOperations?.(shape) ?? [])]
	})
	if (!target || !operations.length) return null
	const { util, shape } = target
	const item = (op: NodeOperation) => (
		<TldrawUiMenuItem
			key={op.id}
			id={op.id}
			label={op.prompt ? `${op.label}...` : op.label}
			onSelect={() => {
				const at = target?.key ?? op.promptAt
				if (op.prompt && target && at !== undefined) {
					operationPrompt(editor).set({ shapeId: target.shape.id, at, label: op.prompt, run: op.run })
				} else {
					op.run()
				}
			}}
		/>
	)
	// The same layout for every structure: Step by step, then its own name (instant changes), then
	// Show; families of operations divided within each. Test ids follow the sections, not the labels.
	const sections: [MenuSection, string][] = [
		['steps', 'Step by step'],
		['actions', util.menuName?.(shape) ?? shape.type],
		['show', 'Show'],
	]
	return (
		<TldrawUiMenuGroup id="drawds-node-operations">
			{sections.map(([section, label]) => {
				const ops = operations.filter((op) => (op.section ?? 'steps') === section)
				if (!ops.length) return null
				const id = `drawds-${util.menuId ?? shape.type}-${section}`
				const groups = [...new Set(ops.map((op) => op.group ?? ''))]
				return (
					<TldrawUiMenuSubmenu key={section} id={id} label={label}>
						{groups.map((group) => (
							<TldrawUiMenuGroup key={group} id={`${id}-${group || 'items'}`}>
								{ops.filter((op) => (op.group ?? '') === group).map(item)}
							</TldrawUiMenuGroup>
						))}
					</TldrawUiMenuSubmenu>
				)
			})}
		</TldrawUiMenuGroup>
	)
}

/**
 * Pointer submenu for the element under the pointer when the menu opened: the structure's usual
 * names (a name already on the shape moves here), a custom name, and removing pointers here.
 */
function PointerMenu() {
	const editor = useEditor()
	const [target] = useState(() => markTargetUnderPointer(editor))
	if (!target || target.key === undefined || !target.util.pointerAnchor?.(target.shape, target.key)) return null
	const { util, shape, key } = target
	const pointers = util.getPointers(shape)
	const here = pointers.filter((p) => p.at === key)
	const names = (util.pointerNames?.(shape) ?? []).filter((name) => !here.some((p) => p.name === name))
	const change = (label: string, f: (pointers: Pointer[]) => Pointer[]) => {
		const current = editor.getShape(shape.id)
		if (!current) return
		editor.markHistoryStoppingPoint(label)
		editor.updateShape(util.withPointers(current, f(util.getPointers(current))))
	}
	return (
		<TldrawUiMenuGroup id="drawds-pointer">
			<TldrawUiMenuSubmenu id="drawds-pointer" label="Pointer">
				<TldrawUiMenuGroup id="drawds-pointer-names">
					{names.map((name) => (
						<TldrawUiMenuItem
							key={name}
							id={`pointer-${name}`}
							label={pointers.some((p) => p.name === name) ? `${name} (move here)` : name}
							onSelect={() => change('add pointer', (ps) => placePointer(ps, name, key))}
						/>
					))}
					<TldrawUiMenuItem
						id="pointer-custom"
						label="Custom name..."
						onSelect={() => {
							pointerState(editor).prompt.set({ shapeId: shape.id, at: key })
						}}
					/>
				</TldrawUiMenuGroup>
				{here.length > 0 && (
					<TldrawUiMenuGroup id="drawds-pointer-remove">
						{here.map((p) => (
							<TldrawUiMenuItem
								key={p.id}
								id={`remove-pointer-${p.name}`}
								label={`Remove ${p.name}`}
								onSelect={() => change('remove pointer', (ps) => removePointer(ps, p.id))}
							/>
						))}
					</TldrawUiMenuGroup>
				)}
			</TldrawUiMenuSubmenu>
		</TldrawUiMenuGroup>
	)
}

function RelayoutMenuItem() {
	const editor = useEditor()
	const actions = useActions()
	const show = useValue('can re-layout', () => relayoutTargets(editor).length > 0, [editor])
	if (!show) return null
	const { id, label, onSelect } = actions[RELAYOUT]
	return (
		<TldrawUiMenuGroup id="drawds">
			<TldrawUiMenuItem id={id} label={label} onSelect={onSelect} />
		</TldrawUiMenuGroup>
	)
}

export const components: TLComponents = {
	InFrontOfTheCanvas: PlaybackOverlay,
	MainMenu: (props) => (
		<DefaultMainMenu {...props}>
			<TldrawUiMenuGroup id="drawds-board">
				{BOARD_ACTIONS.map((id) => (
					<TldrawUiMenuActionItem key={id} actionId={id} />
				))}
			</TldrawUiMenuGroup>
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	),
	Toolbar: (props) => (
		<DefaultToolbar {...props}>
			{STRUCTURE_TOOLS.map((id) => (
				<StructureToolbarItem key={id} id={id} />
			))}
			<DefaultToolbarContent />
		</DefaultToolbar>
	),
	KeyboardShortcutsDialog: (props) => {
		const tools = useTools()
		return (
			<DefaultKeyboardShortcutsDialog {...props}>
				<DefaultKeyboardShortcutsDialogContent />
				{STRUCTURE_TOOLS.map((id) => (
					<TldrawUiMenuItem key={id} {...tools[id]} />
				))}
				<TldrawUiMenuGroup label="shortcuts-dialog.file" id="drawds-board">
					{BOARD_ACTIONS.map((id) => (
						<TldrawUiMenuActionItem key={id} actionId={id} />
					))}
				</TldrawUiMenuGroup>
			</DefaultKeyboardShortcutsDialog>
		)
	},
	StylePanel: (props) => (
		<DefaultStylePanel {...props}>
			<DefaultStylePanelContent />
			<FillPicker />
			<ArrayPickers />
			<ListPickers />
			<TreePickers />
			<HeapPickers />
			<HashPickers />
			<GraphPickers />
			<GraphViewPickers />
			<StructureHint />
		</DefaultStylePanel>
	),
	ContextMenu: (props) => (
		<DefaultContextMenu {...props}>
			<NodeOperationsMenu />
			<MarkMenu />
			<PointerMenu />
			<RelayoutMenuItem />
			<DefaultContextMenuContent />
		</DefaultContextMenu>
	),
}
