import {
	TldrawUiButton,
	TldrawUiDropdownMenuContent,
	TldrawUiDropdownMenuRoot,
	TldrawUiDropdownMenuTrigger,
	TldrawUiMenuCheckboxItem,
	TldrawUiMenuContextProvider,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TldrawUiMenuSubmenu,
	useValue,
} from 'tldraw'
import { KEYS, SCALES, scaleRun, type Tuning } from '../sound/notes'
import { isSoundOn, play, setSoundTuning, soundTuning, stopSound } from '../sound/player'

/**
 * While drawds makes sounds (bogosort found them): a speaker at the top, its menu the scale (each with
 * its intervals and what it is: some music theory with the algorithms) and the key, each played as it
 * is picked, and the way to turn them off.
 */
export function SoundButton() {
	const on = useValue('sound on', isSoundOn, [])
	const tuning = useValue('sound tuning', soundTuning, [])
	if (!on) return null
	const scale = SCALES.find((s) => s.id === tuning.scale) ?? SCALES[0]
	const pick = (next: Tuning) => {
		setSoundTuning(next)
		play(scaleRun(next), { gap: 0.09, ahead: 2 })
	}
	return (
		<div style={{ pointerEvents: 'all', margin: 8 }}>
			<TldrawUiDropdownMenuRoot id="sound">
				<TldrawUiDropdownMenuTrigger>
					<TldrawUiButton type="normal" data-testid="sound-menu.button" title="Sounds are on (you ran bogosort): pick a scale and a key, or turn them off">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
							<path d="M4 9v6h4l5 4V5L8 9H4z" />
							<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
						</svg>
						<span style={{ marginLeft: 6 }}>
							{KEYS[tuning.key]} {scale.name.toLowerCase()}
						</span>
					</TldrawUiButton>
				</TldrawUiDropdownMenuTrigger>
				<TldrawUiDropdownMenuContent side="bottom" align="center">
					<TldrawUiMenuContextProvider type="menu" sourceId="menu">
						<TldrawUiMenuGroup id="sound-scales">
							{SCALES.map((s) => (
								<TldrawUiMenuCheckboxItem
									key={s.id}
									id={`scale-${s.id}`}
									label={`${s.name}: ${s.intervals}`}
									checked={s.id === scale.id}
									onSelect={() => pick({ ...tuning, scale: s.id })}
								/>
							))}
						</TldrawUiMenuGroup>
						<TldrawUiMenuGroup id="sound-about">
							<TldrawUiMenuItem id="sound-about" label={scale.about} disabled onSelect={() => {}} />
						</TldrawUiMenuGroup>
						<TldrawUiMenuGroup id="sound-key">
							<TldrawUiMenuSubmenu id="sound-key" label={`Key: ${KEYS[tuning.key]}`}>
								<TldrawUiMenuGroup id="sound-keys">
									{KEYS.map((k, i) => (
										<TldrawUiMenuCheckboxItem key={k} id={`key-${i}`} label={k} checked={i === tuning.key} onSelect={() => pick({ ...tuning, key: i })} />
									))}
								</TldrawUiMenuGroup>
							</TldrawUiMenuSubmenu>
						</TldrawUiMenuGroup>
						<TldrawUiMenuGroup id="sound-off">
							<TldrawUiMenuItem id="sound-off" label="Turn the sounds off" onSelect={stopSound} />
						</TldrawUiMenuGroup>
					</TldrawUiMenuContextProvider>
				</TldrawUiDropdownMenuContent>
			</TldrawUiDropdownMenuRoot>
		</div>
	)
}
