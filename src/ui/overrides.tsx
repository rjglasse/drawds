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
	useActions,
	useEditor,
	useIsToolSelected,
	useTools,
	useValue,
	type Editor,
	type TLComponents,
	type TLUiOverrides,
} from 'tldraw'
import { NodeLinkShapeUtil } from '../nodelink/NodeLinkShapeUtil'
import { FillPicker, fillPickerTranslations } from './FillPicker'
import { maskIcon } from './icons'
import arrayIconUrl from './icons/array.svg'
import listIconUrl from './icons/list.svg'

/** Our structure tools, in toolbar order. */
const STRUCTURE_TOOLS = ['array', 'linked-list'] as const

const RELAYOUT = 'drawds.relayout'

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
		return actions
	},
	translations: { en: fillPickerTranslations },
}

function StructureToolbarItem({ id }: { id: string }) {
	const tools = useTools()
	const isSelected = useIsToolSelected(tools[id])
	return <TldrawUiMenuItem {...tools[id]} isSelected={isSelected} />
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
		</DefaultStylePanel>
	),
	ContextMenu: (props) => (
		<DefaultContextMenu {...props}>
			<RelayoutMenuItem />
			<DefaultContextMenuContent />
		</DefaultContextMenu>
	),
}
