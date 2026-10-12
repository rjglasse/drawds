import { StylePanelButtonPicker, StylePanelSection, useStylePanelContext, type StyleValuesForUi } from 'tldraw'
import type { Traced } from '../shapes/recursion/tracer'
import { TracedStyle } from '../shapes/recursion/tracer-shape-types'
import { svgIcon } from './icons'

const label = (text: string) =>
	svgIcon(
		`<text x="15" y="20" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="12.5" fill="black" stroke="none">${text}</text>`
	)

const FUNCTION_ITEMS: StyleValuesForUi<Traced> = [
	{ value: 'gcd', icon: label('gcd') },
	{ value: 'gcd-loop', icon: label('loop') },
	{ value: 'fact', icon: label('n!') },
	{ value: 'fib', icon: label('fib') },
	{ value: 'sum', icon: label('Σ') },
	{ value: 'hello', icon: label('hi') },
	{ value: 'hello-count', icon: label('hi i') },
	{ value: 'stuck', icon: label('∞') },
]

export const tracerPickerTranslations: Record<string, string> = {
	'recursion-fn-style.gcd': "gcd(m, n): Euclid's algorithm, gcd(n, m % n) until n is 0",
	'recursion-fn-style.gcd-loop': "gcd(m, n) as a loop: one frame, m and n changed in place until n is 0",
	'recursion-fn-style.fact': 'fact(n): n * fact(n - 1), down to fact(1)',
	'recursion-fn-style.fib': 'fib(n): fib(n - 1) + fib(n - 2), the same calls made again and again',
	'recursion-fn-style.sum': 'sum(n): n + sum(n - 1), down to sum(1)',
	'recursion-fn-style.hello': 'sayHello(): no base case, so the stack overflows',
	'recursion-fn-style.hello-count': 'sayHello(i): i passed on, one more each call: how deep the stack gets before it overflows',
	'recursion-fn-style.stuck': 'sum(n): n + sum(n), the argument never gets smaller, so the stack overflows',
}

/** The function a recursion tracer runs (typing another call in main's frame picks it too). */
export function TracerPickers() {
	const { styles, onValueChange } = useStylePanelContext()
	const fn = styles.get(TracedStyle)
	if (fn === undefined) return null
	return (
		<StylePanelSection>
			<StylePanelButtonPicker title="Function" uiType="recursion-fn" style={TracedStyle} items={FUNCTION_ITEMS} value={fn} onValueChange={onValueChange} />
		</StylePanelSection>
	)
}
