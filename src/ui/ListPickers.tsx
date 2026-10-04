import {
	StylePanelButtonPicker,
	StylePanelSection,
	TldrawUiButtonIcon,
	TldrawUiRow,
	TldrawUiToolbar,
	TldrawUiToolbarToggleGroup,
	TldrawUiToolbarToggleItem,
	useStylePanelContext,
	type SharedStyle,
	type StyleProp,
	type StyleValuesForUi,
} from 'tldraw'
import {
	ListEndsStyle,
	ListKindStyle,
	ListLinksStyle,
	ListSentinelStyle,
	ListTailStyle,
	type ListKind,
} from '../shapes/list/list-shape-types'
import { svgIcon } from './icons'

// Two linked nodes; the same with an arrow down onto the first (top); with arrows in and out.
const KIND_ITEMS: StyleValuesForUi<ListKind> = [
	{
		value: 'list',
		icon: svgIcon('<rect x="2" y="10" width="10" height="10"/><rect x="18" y="10" width="10" height="10"/><path d="M12 15H18"/>'),
	},
	{
		value: 'stack',
		icon: svgIcon('<rect x="2" y="13" width="10" height="10"/><rect x="18" y="13" width="10" height="10"/><path d="M12 18H18M7 3V10M4.5 7.5L7 10L9.5 7.5"/>'),
	},
	{
		value: 'queue',
		icon: svgIcon('<rect x="6" y="10" width="8" height="10"/><rect x="16" y="10" width="8" height="10"/><path d="M14 15H16M1 15H4M2.5 13.5L4 15L2.5 16.5M26 15H29M27.5 13.5L29 15L27.5 16.5"/>'),
	},
]

export const listPickerTranslations: Record<string, string> = {
	'list-kind-style.list': 'List',
	'list-kind-style.stack': 'Stack: push and pop at the top (the head)',
	'list-kind-style.queue': 'Queue: enqueue at the rear, dequeue at the front',
}

/** One toggle: the style it switches, and its value when on and off. */
interface Toggle {
	id: string
	style: StyleProp<string>
	on: string
	off: string
	label: string
	icon: ReturnType<typeof svgIcon>
}

const TOGGLES: Toggle[] = [
	{
		id: 'doubly',
		style: ListLinksStyle as StyleProp<string>,
		on: 'doubly',
		off: 'singly',
		label: 'Doubly linked: prev and next pointers',
		icon: svgIcon('<rect x="2" y="9" width="9" height="12"/><rect x="19" y="9" width="9" height="12"/><path d="M11 12.5H19M16.5 10.5L19 12.5L16.5 14.5M19 17.5H11M13.5 15.5L11 17.5L13.5 19.5"/>'),
	},
	{
		id: 'tail',
		style: ListTailStyle as StyleProp<string>,
		on: 'tail',
		off: 'none',
		label: 'A tail pointer to the last node',
		icon: svgIcon('<rect x="4" y="15" width="10" height="10"/><rect x="16" y="15" width="10" height="10"/><path d="M21 3V12M18.5 9.5L21 12L23.5 9.5"/>'),
	},
	{
		id: 'circular',
		style: ListEndsStyle as StyleProp<string>,
		on: 'circular',
		off: 'null',
		label: 'Circular: the last node points back to the first',
		icon: svgIcon('<rect x="3" y="6" width="9" height="9"/><rect x="18" y="6" width="9" height="9"/><path d="M12 10.5H18M27 10.5H29V24H1V10.5H3M5.5 8.5L3 10.5L5.5 12.5" />'),
	},
	{
		id: 'sentinel',
		style: ListSentinelStyle as StyleProp<string>,
		on: 'sentinel',
		off: 'none',
		label: 'A sentinel (dummy) node in front',
		icon: svgIcon('<rect x="2" y="10" width="10" height="10" stroke-dasharray="2.5 2"/><rect x="18" y="10" width="10" height="10"/><path d="M12 15H18"/>'),
	},
]

const isOn = (value: SharedStyle<string> | undefined, on: string) => value?.type === 'shared' && value.value === on

/** The toggles a stack or queue doesn't have: a queue always has its rear; circular and sentinel are for plain lists. */
const LIST_ONLY = new Set(['circular', 'sentinel'])

/**
 * What the list is used as (a plain list, a stack, a queue), and its variants, each on or off and
 * combinable: doubly linked, a tail pointer, circular, a sentinel node. Shown with the list tool or
 * a list selected.
 */
export function ListPickers() {
	const { styles, onValueChange, onHistoryMark } = useStylePanelContext()
	const values = TOGGLES.map((t) => styles.get(t.style))
	const kind = styles.get(ListKindStyle)
	if (values.every((v) => v === undefined) && kind === undefined) return null
	const only = kind?.type === 'shared' ? kind.value : undefined
	const shown = TOGGLES.map((t, i) => ({ t, value: values[i] })).filter(
		({ t }) => only === undefined || only === 'list' || (!LIST_ONLY.has(t.id) && !(only === 'queue' && t.id === 'tail'))
	)
	const active = shown.filter(({ t, value }) => isOn(value, t.on)).map(({ t }) => t.id)
	return (
		<>
			{kind !== undefined && (
				<StylePanelSection>
					<StylePanelButtonPicker title="Kind" uiType="list-kind" style={ListKindStyle} items={KIND_ITEMS} value={kind} />
				</StylePanelSection>
			)}
			<TldrawUiToolbar label="List">
				<TldrawUiToolbarToggleGroup data-testid="style.list-variant" type="multiple" value={active} asChild>
					<TldrawUiRow>
						{shown.map(({ t, value }) => {
							const on = isOn(value, t.on)
							return (
								<TldrawUiToolbarToggleItem
									key={t.id}
									type="icon"
									value={t.id}
									data-testid={`style.list-variant.${t.id}`}
									aria-label={`${t.label}${on ? ' (on)' : ''}`}
									aria-pressed={on}
									tooltip={t.label}
									onClick={() => {
										onHistoryMark?.('list variant')
										onValueChange(t.style, on ? t.off : t.on)
									}}
								>
									<TldrawUiButtonIcon icon={t.icon} />
								</TldrawUiToolbarToggleItem>
							)
						})}
					</TldrawUiRow>
				</TldrawUiToolbarToggleGroup>
			</TldrawUiToolbar>
		</>
	)
}
