import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import { MemoryBusyStyle } from '../shapes/memory/memory-shape-types'
import type { MemoryBusy } from '../shapes/memory/model'
import { svgIcon } from './icons'

// A 4 x 3 grid of memory cells, other data filled in.
const GRID = '<rect x="3" y="6" width="24" height="18"/><path d="M9 6v18M15 6v18M21 6v18M3 12h24M3 18h24"/>'
const cells = (...at: [number, number][]) => at.map(([c, r]) => `<rect x="${3 + c * 6}" y="${6 + r * 6}" width="6" height="6" fill="black"/>`).join('')

const BUSY_ITEMS: StyleValuesForUi<MemoryBusy> = [
	{ value: 'free', icon: svgIcon(GRID) },
	{ value: 'some', icon: svgIcon(GRID + cells([1, 0], [3, 1], [0, 2])) },
	{ value: 'crowded', icon: svgIcon(GRID + cells([0, 0], [3, 0], [0, 1], [1, 1], [2, 2], [3, 2])) },
]

export const memoryPickerTranslations: Record<string, string> = {
	'memory-busy-style.free': 'Free memory',
	'memory-busy-style.some': 'Some other data',
	'memory-busy-style.crowded': 'Crowded: an array may find no room',
}

/** How busy a memory view's memory is: free, some other data, or crowded. */
export function MemoryPickers() {
	const { styles } = useStylePanelContext()
	const busy = styles.get(MemoryBusyStyle)
	if (busy === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="Memory" uiType="memory-busy" style={MemoryBusyStyle} items={BUSY_ITEMS} value={busy} />
		</StylePanelSection>
	)
}
