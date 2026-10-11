import { useValue } from 'tldraw'
import { isSoundOn, stopSound } from '../sound/player'

/** While drawds makes sounds (bogosort found them): a speaker at the top that turns them off. */
export function SoundButton() {
	const on = useValue('sound on', isSoundOn, [])
	if (!on) return null
	return (
		<button
			className="tlui-button"
			data-testid="sound-off"
			title="Sounds are on (you ran bogosort). Click to turn them off"
			onClick={stopSound}
			onPointerDown={(e) => e.stopPropagation()}
			style={{ pointerEvents: 'all', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', margin: 8, borderRadius: 8, background: 'var(--color-panel)', boxShadow: 'var(--shadow-2)', fontSize: 13 }}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
				<path d="M4 9v6h4l5 4V5L8 9H4z" />
				<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
			</svg>
			Sound on
		</button>
	)
}
