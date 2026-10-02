import {
	DefaultContextMenu,
	DefaultContextMenuContent,
	DefaultKeyboardShortcutsDialog,
	DefaultKeyboardShortcutsDialogContent,
	DefaultStylePanel,
	DefaultStylePanelContent,
	DefaultToolbar,
	DefaultToolbarContent,
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
import { NodeLinkShapeUtil, type NodeOperation } from '../nodelink/NodeLinkShapeUtil'
import { placePointer, removePointer, type Pointer } from '../pointers/pointers'
import { pointerState } from '../pointers/state'
import { FillPicker, fillPickerTranslations } from './FillPicker'
import { GraphPickers, graphPickerTranslations } from './GraphPickers'
import { maskIcon } from './icons'
import arrayIconUrl from './icons/array.svg'
import graphIconUrl from './icons/graph.svg'
import listIconUrl from './icons/list.svg'
import treeIconUrl from './icons/tree.svg'
import { HeapPickers, heapPickerTranslations } from './HeapPickers'
import heapIconUrl from './icons/heap.svg'
import { TreePickers, treePickerTranslations } from './TreePickers'

/** Our structure tools, in toolbar order. */
const STRUCTURE_TOOLS = ['array', 'linked-list', 'binary-tree', 'heap', 'graph'] as const

const RELAYOUT = 'drawds.relayout'

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
	actions(editor, actions) {
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
		en: { ...fillPickerTranslations, ...treePickerTranslations, ...heapPickerTranslations, ...graphPickerTranslations },
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
 * Operations that start from the node under the pointer when the menu opened (a graph's BFS / DFS
 * from it), captured then like the mark target.
 */
function NodeOperationsMenu() {
	const editor = useEditor()
	const [operations] = useState(() => {
		const target = markTargetUnderPointer(editor)
		const util = target?.util
		if (!target || target.key === undefined || !(util instanceof NodeLinkShapeUtil) || !util.nodeOperations) return []
		return util.nodeOperations(target.shape, target.key)
	})
	if (!operations.length) return null
	const item = (op: NodeOperation) => <TldrawUiMenuItem key={op.id} id={op.id} label={op.label} onSelect={op.run} />
	const submenus = [...new Set(operations.flatMap((op) => (op.submenu ? [op.submenu] : [])))]
	return (
		<TldrawUiMenuGroup id="drawds-node-operations">
			{operations.filter((op) => !op.submenu).map(item)}
			{submenus.map((label, i) => (
				<TldrawUiMenuSubmenu key={label} id={`drawds-node-operations-${i}`} label={label}>
					<TldrawUiMenuGroup id={`drawds-node-operations-${i}-items`}>
						{operations.filter((op) => op.submenu === label).map(item)}
					</TldrawUiMenuGroup>
				</TldrawUiMenuSubmenu>
			))}
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
			</DefaultKeyboardShortcutsDialog>
		)
	},
	StylePanel: (props) => (
		<DefaultStylePanel {...props}>
			<DefaultStylePanelContent />
			<FillPicker />
			<TreePickers />
			<HeapPickers />
			<GraphPickers />
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
