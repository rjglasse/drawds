import type { Frame } from '../../nodelink/playback'
import { HEAD_KEY, listScene, NULL_KEY, NULL_PREV_KEY, SENTINEL_KEY, SIZE_KEY, TAIL_KEY, withSize } from './layout'
import { CHANGED, edgeMark, FOUND, GONE, listOf, LOOK, next, pointer, prevOf, type ListOperation, type ListProps } from './operations'

// Lecture 5's size: "linear or constant? It depends": counted by walking every node, O(n), or kept
// in a field that every add and remove updates (size++ / size--) and read in O(1). And its
// invariants slide: what must hold of a list between operations, each check O(1) as it only looks
// at the ends: size 0, head and tail null; size > 0, both at nodes; size 1, head == tail; the last
// node's next null (a doubly linked list's first prev null too).

/**
 * With the size field shown, an operation that adds or removes a node keeps it: its steps show the
 * old size, then a last step does size++ (or size--) on the list as it ends up.
 */
export function withSizeStep(frames: readonly Frame[], props: ListProps, after: number): Frame[] {
	const before = props.nodes.length
	if (!props.showSize || after === before) return [...frames]
	const scenes = frames.map((f) => (f.scene ? { ...f, scene: withSize(f.scene, before) } : f))
	const last = [...frames].reverse().find((f) => f.scene)?.scene ?? listScene(props)
	const change = after > before ? 'size++' : 'size--'
	return [
		...scenes,
		{
			scene: withSize(last, after),
			flash: { [SIZE_KEY]: CHANGED },
			caption: `${change}: size = ${after}. Every add and remove keeps it, so reading it is O(1)`,
			ask: `${after > before ? 'A node added' : 'A node gone'}: what happens to size?`,
			askFocus: [SIZE_KEY],
		},
	]
}

/**
 * Count the nodes: curr walks from the first node to null, count going up at each, n steps, O(n).
 * With the size field shown, the last step reads it instead: O(1). (Not for a list with a cycle: the
 * walk would never end.)
 */
export function countNodes(props: ListProps): ListOperation {
	const { nodes } = props
	const { v } = listOf(props)
	const frames: Frame[] = []
	const code = !v.sentinel && !v.circular ? 'list-count' : undefined
	const start = v.sentinel ? 'past the sentinel' : 'at the head'
	const vars = (curr: string, count: number) => ({ curr, count: String(count) })
	frames.push({
		pointers: [pointer('curr', nodes[0]?.id ?? NULL_KEY)],
		flash: nodes[0] ? { [nodes[0].id]: LOOK } : {},
		caption: `How many nodes? count = 0, curr ${start}`,
		counts: { 'nodes visited': 0 },
		vars: vars(nodes[0]?.value ?? 'null', 0),
		line: 'start',
		ask: false,
	})
	nodes.forEach((node, i) => {
		const onto = nodes[i + 1]
		const end = onto ? onto.id : v.circular ? (v.sentinel ? SENTINEL_KEY : nodes[0].id) : NULL_KEY
		frames.push({
			pointers: [pointer('curr', end)],
			flash: { [node.id]: FOUND, ...(onto ? { [onto.id]: LOOK } : {}) },
			caption: `count = ${i + 1}, curr = curr.next${onto ? ` (${onto.value})` : v.circular ? ': back at the start' : ': null'}`,
			counts: { 'nodes visited': i + 1 },
			vars: vars(onto?.value ?? 'null', i + 1),
			line: 'count',
			ask: `count = ${i}: what is count now, and where does curr go?`,
			askFocus: [node.id],
		})
	})
	const n = nodes.length
	const steps = `${n} step${n === 1 ? '' : 's'}, one per node: O(n)`
	frames.push({
		pointers: [pointer('curr', v.circular && n ? (v.sentinel ? SENTINEL_KEY : nodes[0].id) : NULL_KEY)],
		flash: props.showSize ? { [SIZE_KEY]: FOUND } : {},
		caption: props.showSize
			? `${n} node${n === 1 ? '' : 's'}, counted in ${steps}. The size field says ${n} at once: O(1), as long as every add and remove keeps it`
			: `${n} node${n === 1 ? '' : 's'}, counted in ${steps}. A size field that every add and remove keeps would answer in O(1)`,
		vars: vars('null', n),
		line: 'done',
		ask: 'Every node counted: how long did that take?',
	})
	return { frames, code }
}

/**
 * Check the list's invariants (lecture 5's slide), one at a time, lighting what each looks at: they
 * all hold between operations, and each is O(1). Checking that size is the number of nodes would
 * be O(n).
 */
export function checkInvariants(props: ListProps): ListOperation {
	const { nodes } = props
	const { v, name, chain, end } = listOf(props)
	const n = nodes.length
	const [head, tail] = [v.names.head, v.names.tail]
	const first = nodes[0]?.id
	const last = nodes.at(-1)?.id
	const frames: Frame[] = []
	// Each check named by its place on the slide: its caption, and what predict mode asks first.
	const check = (caption: string, flash: Frame['flash'], ask: string) => {
		const k = frames.length + 1
		frames.push({ caption: `Invariant ${k}: ${caption}`, flash, ask: `Invariant ${k}: ${ask} Does it hold?`, askFocus: Object.keys(flash ?? {}) })
	}
	const ends = { [HEAD_KEY]: FOUND, ...(v.tail ? { [TAIL_KEY]: FOUND } : {}) }
	const off = { [HEAD_KEY]: null, [TAIL_KEY]: null }
	const size = props.showSize ? 'size' : 'the number of nodes'
	check(
		n === 0
			? `${size} == 0, so ${head}${v.tail ? ` and ${tail}` : ''} must be null: ${v.tail ? 'both are' : 'it is'}. Holds`
			: `${size} == 0? No, it is ${n}: nothing to check here`,
		n === 0 ? ends : {},
		`if ${size} is 0, ${head}${v.tail ? ` and ${tail}` : ''} ${v.tail ? 'are' : 'is'} null.`
	)
	check(
		n > 0
			? `${size} > 0, so ${head}${v.tail ? ` and ${tail}` : ''} must point at nodes: ${head} at ${name(first!)}${v.tail ? `, ${tail} at ${name(last!)}` : ''}. Holds`
			: `${size} > 0? No: nothing to check here`,
		n > 0 ? { ...ends, [first!]: FOUND, ...(v.tail ? { [last!]: FOUND } : {}) } : off,
		`if ${size} > 0, ${head}${v.tail ? ` and ${tail}` : ''} point${v.tail ? '' : 's'} at nodes.`
	)
	check(
		n === 1
			? `${size} == 1, so ${v.tail ? `${head} == ${tail}: both at ${name(first!)}, the only node` : `${head}'s node is also the last: its next is ${v.circular ? 'itself' : 'null'}`}. Holds`
			: `${size} == 1? No, it is ${n}: nothing to check here`,
		n === 1 ? { ...ends, [first!]: FOUND } : { ...off, ...(first ? { [first]: null } : {}), ...(last ? { [last]: null } : {}) },
		`if ${size} is 1, ${v.tail ? `${head} == ${tail}` : 'the first node is the last'}.`
	)
	if (n > 0) {
		const lastName = v.tail ? `${tail}.next` : "the last node's next"
		check(
			v.circular
				? `${lastName} is the first node: a circular list's last node points back round by design, the one invariant it swaps`
				: v.cycleTo
					? `${lastName} isn't null: it points back at ${name(end)}, a cycle. This list breaks the invariant: it has no end`
					: `${lastName} == null: nothing after the last node. Holds`,
			{ [last!]: FOUND, [edgeMark(next(last!))]: v.cycleTo ? GONE : FOUND },
			`${lastName} == null.`
		)
		if (v.doubly && !v.circular) {
			const firstKey = v.sentinel ? SENTINEL_KEY : chain[0]
			check(`${head}.prev == null: nothing before the first node (a doubly linked list's other end). Holds`, { [firstKey]: FOUND, [edgeMark(prevOf(firstKey))]: FOUND, [NULL_PREV_KEY]: FOUND }, `${head}.prev == null.`)
		}
	}
	const broken = !!v.cycleTo
	frames.push({
		caption: broken
			? 'One invariant broken: a list with a cycle has no last node. Every check looked only at the ends: O(1)'
			: `All hold. Each check looked only at the ends, O(1), so a list could check them after every method. Checking that size is the number of nodes would walk them all: O(n)`,
		flash: {},
		ask: false,
	})
	return { frames }
}
