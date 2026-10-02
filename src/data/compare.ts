const asNumber = (v: string) => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)

/** Order two keys: numerically when both are numbers, otherwise as text. */
export function compareKeys(a: string, b: string): number {
	const [x, y] = [asNumber(a), asNumber(b)]
	if (x !== undefined && y !== undefined) return x - y
	return a.localeCompare(b)
}
