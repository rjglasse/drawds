import type { MarkColor } from '../../cells/marks'
import type { Frame } from '../../nodelink/playback'
import type { Pointer } from '../../pointers/pointers'
import { edgeKey, elementKey, parentKey, unionFindScene, weightKey } from './layout'
import { compress, findPath, toCompress, union, type Forest, type UnionBy } from './union-find'
import type { UnionFindShapeProps } from './union-find-shape-types'

type Props = Pick<UnionFindShapeProps, 'labels' | 'parent' | 'sizes' | 'ranks' | 'unionBy' | 'compression' | 'size'>

const LOOK: MarkColor = 'orange'
const ROOT: MarkColor = 'green'
const START: MarkColor = 'blue'
const SAME: MarkColor = 'red'

const pointer = (name: string, i: number): Pointer => ({ id: `#${name}`, name, at: elementKey(i) })

/** An element and its parent cell, lit together. */
const lit = (i: number, color: MarkColor | null) => ({ [elementKey(i)]: color, [parentKey(i)]: color })

const forestOf = (props: Props): Forest => ({ parent: [...props.parent], sizes: [...props.sizes], ranks: [...props.ranks] })

const stateProps = (f: Forest) => ({ parent: [...f.parent], sizes: [...f.sizes], ranks: [...f.ranks] })

export interface Steps {
	frames: Frame[]
	forest: Forest
}

/**
 * find(i), as the code runs: follow parent pointers up until an element is its own parent, then
 * (with compression on) point every node on the way straight at the root, one arrow at a time,
 * drawn where the nodes are; the last step tidies the trees. `keep` pointers stay on show (union's
 * roots found so far); `hops` counts the parent steps taken before.
 */
export function findSteps(props: Props, forest: Forest, i: number, keep: Pointer[] = [], hops = 0, name = 'curr'): Steps & { root: number; hops: number } {
	const L = (j: number) => props.labels[j] ?? String(j)
	const path = findPath(forest.parent, i)
	const root = path[path.length - 1]
	const state = stateProps(forest)
	const frames: Frame[] = [
		{
			props: state,
			pointers: [...keep, pointer(name, i)],
			flash: lit(i, LOOK),
			caption: `find(${L(i)}): start at ${L(i)} and follow the parent pointers up`,
			ask: false,
		},
	]
	for (const [k, c] of path.slice(0, -1).entries()) {
		const p = path[k + 1]
		hops++
		frames.push({
			props: state,
			pointers: [...keep, pointer(name, p)],
			flash: { [`edge:${edgeKey(c)}`]: LOOK, ...lit(p, LOOK) },
			counts: { 'parent steps': hops },
			caption: `parent[${c}] = ${p}: ${L(c)} is not a root, so go up to ${L(p)}`,
			ask: `Is ${L(c)} a root?`,
			askFocus: [elementKey(c), parentKey(c)],
		})
	}
	frames.push({
		props: state,
		pointers: [...keep, pointer(name, root)],
		flash: lit(root, ROOT),
		counts: { 'parent steps': hops },
		caption: `parent[${root}] = ${root}: ${L(root)} is its own parent, so it is the root`,
		ask: `Is ${L(root)} a root?`,
		askFocus: [elementKey(root), parentKey(root)],
	})
	const moved = props.compression === 'on' ? toCompress(forest.parent, path) : []
	if (!moved.length) return { frames, forest, root, hops }

	// Re-point the arrows where the nodes are (the layout would move them), then tidy up.
	const base = unionFindScene({ ...props, ...state })
	const done = new Set<number>()
	frames.push({
		props: state,
		pointers: [...keep, pointer('root', root)],
		caption: `Path compression: point ${moved.map(L).join(', ')} straight at the root, so the next find is quick`,
		ask: false,
	})
	for (const [k, c] of moved.entries()) {
		done.add(c)
		frames.push({
			scene: {
				...base,
				nodes: base.nodes.map((n) => (n.key.startsWith('p') && done.has(Number(n.key.slice(1))) ? { ...n, value: String(root) } : n)),
				edges: base.edges.map((e) => (done.has(Number(e.key.slice(1))) ? { ...e, to: elementKey(root), bend: 0.25 } : e)),
			},
			pointers: [...keep, pointer('root', root)],
			flash: { [`edge:${edgeKey(c)}`]: ROOT, [parentKey(c)]: ROOT },
			caption: `parent[${c}] = ${root}: ${L(c)} now points straight at the root`,
			ask: k === 0 ? `Where does ${L(c)} point after compression?` : false,
			askFocus: k === 0 ? [elementKey(c), parentKey(c)] : undefined,
		})
	}
	const compressed: Forest = { ...forest, parent: compress(forest.parent, path) }
	frames.push({
		props: stateProps(compressed),
		pointers: [...keep, pointer('root', root)],
		flash: Object.fromEntries(moved.map((c) => [`edge:${edgeKey(c)}`, null])),
		caption: `The trees, tidied: ${moved.map(L).join(', ')} now hang${moved.length === 1 ? 's' : ''} right under the root`,
		ask: false,
	})
	return { frames, forest: compressed, root, hops }
}

const unionWay = (by: UnionBy, a: string, b: string) =>
	({
		size: 'the smaller tree goes under the bigger root',
		rank: 'the lower-ranked root goes under the higher',
		naive: `${a}'s root goes under ${b}'s`,
	})[by]

/** Highlights set by `frames`, cleared (null), except those in `keep`. */
function cleared(frames: readonly Frame[], keep: Record<string, MarkColor | null>) {
	const keys = new Set(frames.flatMap((f) => Object.keys(f.flash ?? {})))
	return { ...Object.fromEntries([...keys].map((k) => [k, null])), ...keep }
}

/**
 * union(a, b): find both roots (compressing on the way, if on), then link one root under the other
 * the way `unionBy` says, or stop if they are the same root (a and b are in one set already: in
 * Kruskal that edge would close a cycle).
 */
export function unionSteps(props: Props, a: number, b: number): Steps {
	const L = (j: number) => props.labels[j] ?? String(j)
	const by = props.unionBy
	const intro: Frame = {
		props: stateProps(forestOf(props)),
		flash: { [elementKey(a)]: START, [elementKey(b)]: START },
		caption: `union(${L(a)}, ${L(b)}): find both roots; then ${unionWay(by, L(a), L(b))}`,
		ask: false,
	}
	const first = findSteps(props, forestOf(props), a, [], 0, 'a')
	const ra = pointer('ra', first.root)
	// The first root stays lit (and pointed at) while b's is found; the way up to it goes out.
	const second = findSteps(props, first.forest, b, [ra], first.hops, 'b')
	const rb = pointer('rb', second.root)
	const fresh = { ...second.frames[0], flash: { ...cleared(first.frames, lit(first.root, ROOT)), ...second.frames[0].flash } }
	const frames = [intro, ...first.frames, fresh, ...second.frames.slice(1)]
	const forest = second.forest
	const state = stateProps(forest)
	if (first.root === second.root) {
		frames.push({
			props: state,
			pointers: [ra, rb],
			flash: cleared(frames, { ...lit(a, SAME), ...lit(b, SAME), ...lit(first.root, ROOT) }),
			caption: `Both roots are ${L(first.root)}: ${L(a)} and ${L(b)} are in one set already, so nothing to link (in Kruskal, this edge would close a cycle)`,
			ask: 'Same set already, or two sets to join?',
			askFocus: [elementKey(first.root)],
		})
		return { frames, forest }
	}
	const link = union(forest, first.root, second.root, by)
	const [child, root] = [link.child!, link.root!]
	const [wa, wb] = by === 'rank' ? [forest.ranks[first.root], forest.ranks[second.root]] : [forest.sizes[first.root], forest.sizes[second.root]]
	const weighed = by === 'naive' ? '' : `${by} ${wa} vs ${wb}${link.tie ? ' (a tie)' : ''}: `
	const grows =
		by === 'size'
			? `; size[${root}] = ${link.forest.sizes[root]}`
			: by === 'rank' && link.tie
				? `; rank[${root}] grows to ${link.forest.ranks[root]}`
				: ''
	frames.push({
		props: stateProps(link.forest),
		pointers: [ra, rb],
		// The finds' ways up go out: just the link, the root it went under and (by size or rank) its new count.
		flash: cleared(frames, {
			[`edge:${edgeKey(child)}`]: ROOT,
			...lit(child, LOOK),
			...lit(root, ROOT),
			...(by === 'naive' ? {} : { [weightKey(root)]: ROOT }),
		}),
		caption: `${weighed}parent[${child}] = ${root}, so ${L(child)}'s tree goes under ${L(root)}${grows}`,
		ask: by === 'naive' ? 'Which root goes under which?' : `Which root goes under which, by ${by}?`,
		askFocus: [elementKey(first.root), elementKey(second.root), ...(by === 'naive' ? [] : [weightKey(first.root), weightKey(second.root)])],
	})
	return { frames, forest: link.forest }
}
