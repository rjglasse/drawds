import {
	TldrawUiButtonIcon,
	TldrawUiRow,
	TldrawUiToolbar,
	TldrawUiToolbarToggleGroup,
	TldrawUiToolbarToggleItem,
	useStylePanelContext,
	type SharedStyle,
	type StyleProp,
} from 'tldraw'
import { ListEndsStyle, ListLinksStyle, ListSentinelStyle, ListTailStyle } from '../shapes/list/list-shape-types'
import { svgIcon } from './icons'

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

/**
 * Linked list variants, each on or off and combinable: doubly linked, a tail pointer, circular, a
 * sentinel node. Shown with the list tool or a list selected.
 */
export function ListPickers() {
	const { styles, onValueChange, onHistoryMark } = useStylePanelContext()
	const values = TOGGLES.map((t) => styles.get(t.style))
	if (values.every((v) => v === undefined)) return null
	const active = TOGGLES.filter((t, i) => isOn(values[i], t.on)).map((t) => t.id)
	return (
		<TldrawUiToolbar label="List">
			<TldrawUiToolbarToggleGroup data-testid="style.list-variant" type="multiple" value={active} asChild>
				<TldrawUiRow>
					{TOGGLES.map((t, i) => {
						const on = isOn(values[i], t.on)
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
	)
}
