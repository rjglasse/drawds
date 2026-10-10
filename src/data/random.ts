/** A source of uniform random numbers in [0, 1). */
export type Rng = () => number

/**
 * Seedable PRNG (mulberry32). The same seed always produces the same sequence, so a generated
 * example can be recreated exactly.
 */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/** A fresh seed, short enough to note down and type in again (1 to 9999). */
export function newSeed(): number {
	return 1 + Math.floor(Math.random() * 9999)
}

/** Random integer in the inclusive range [min, max]. */
export function randomInt(min: number, max: number, rng: Rng = Math.random): number {
	return min + Math.floor(rng() * (max - min + 1))
}
