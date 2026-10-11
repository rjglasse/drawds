// A circular buffer drawn as a ring (dds-55z.31): its cells round a circle, index 0 at the top and on
// clockwise, so a queue's front and rear march round it and the wrap-around reads at a glance (the
// row beside it stays as it is, closer to the code).

export interface Point {
	x: number
	y: number
}

export interface RingCell {
	/** The cell, a slice of the ring (SVG path). */
	path: string
	/** Where its value goes. */
	centre: Point
	/** Where its index goes, just outside the ring. */
	index: Point
	/** The angle through its middle (radians, 0 = right, clockwise in screen space). */
	mid: number
}

export interface RingLayout {
	centre: Point
	outer: number
	inner: number
	cells: RingCell[]
	/** A marker (front, rear) pointing at cell i from outside: its arrow, and its name beyond it. */
	marker(i: number): { label: Point; from: Point; to: Point }
	size: { w: number; h: number }
}

/** Room outside the ring: the indices, then the markers' arrows and their names. */
const REACH = 2.2

/** The ring for `capacity` cells of side `cell` (round the middle of the ring, each cell is about that long). */
export function ringLayout(capacity: number, cell: number): RingLayout {
	const n = Math.max(1, capacity)
	const outer = Math.max(cell * 1.5, (n * cell) / (2 * Math.PI) + cell / 2)
	const inner = outer - cell
	const r = outer + cell * REACH
	const centre = { x: r, y: r }
	const angle = (k: number) => -Math.PI / 2 + (2 * Math.PI * k) / n
	const at = (radius: number, a: number) => ({ x: centre.x + radius * Math.cos(a), y: centre.y + radius * Math.sin(a) })
	const p = (q: Point) => `${q.x} ${q.y}`
	const cells = Array.from({ length: n }, (_, i): RingCell => {
		const [a0, a1] = [angle(i), angle(i + 1)]
		const mid = (a0 + a1) / 2
		// One cell is the whole ring: two half circles each way.
		const path =
			n === 1
				? `M ${p(at(outer, a0))} A ${outer} ${outer} 0 1 1 ${p(at(outer, a0 + Math.PI))} A ${outer} ${outer} 0 1 1 ${p(at(outer, a0))} ` +
					`M ${p(at(inner, a0))} A ${inner} ${inner} 0 1 0 ${p(at(inner, a0 + Math.PI))} A ${inner} ${inner} 0 1 0 ${p(at(inner, a0))} Z`
				: `M ${p(at(outer, a0))} A ${outer} ${outer} 0 0 1 ${p(at(outer, a1))} L ${p(at(inner, a1))} A ${inner} ${inner} 0 0 0 ${p(at(inner, a0))} Z`
		return { path, centre: at((outer + inner) / 2, mid), index: at(outer + cell * 0.3, mid), mid }
	})
	return {
		centre,
		outer,
		inner,
		cells,
		marker: (i) => {
			const mid = cells[((i % n) + n) % n].mid
			return { to: at(outer + cell * 0.6, mid), from: at(outer + cell * 1.25, mid), label: at(outer + cell * 1.6, mid) }
		},
		size: { w: 2 * r, h: 2 * r },
	}
}
