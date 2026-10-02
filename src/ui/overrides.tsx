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
import { NodeLinkShapeUtil } from '../nodelink/NodeLinkShapeUtil'
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
			<MarkMenu />
			<RelayoutMenuItem />
			<DefaultContextMenuContent />
		</DefaultContextMenu>
	),
}
