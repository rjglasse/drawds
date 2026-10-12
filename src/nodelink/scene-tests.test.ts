import { describe, expect, it } from 'vitest'
import { algorithmCode } from '../shapes/code/algorithms'
import { conditionOf, readsBefore, shownTest, type ShownTest, type TestValues } from '../shapes/code/tests'
import { components } from '../shapes/graph/algorithms'
import { graphScene } from '../shapes/graph/layout'
import { findCycle, shortestPath } from '../shapes/graph/paths'
import { bfs, dfs } from '../shapes/graph/traverse'
import { heapCode } from '../shapes/heap/code'
import { buildHeapSteps } from '../shapes/heap/heap'
import { insertSteps, removeSteps } from '../shapes/heap/steps'
import { listScene } from '../shapes/list/layout'
import { deleteFromList, detectCycle, findInList, findMiddle, insertIntoList, insertSorted } from '../shapes/list/operations'
import { treeScene } from '../shapes/tree/layout'
import { measureTree } from '../shapes/tree/measure'
import { bstDeleteSteps, bstExtreme, bstInsertSteps, bstSearch } from '../shapes/tree/search'
import { traverseTree } from '../shapes/tree/traverse'
import { findSteps, unionSteps } from '../shapes/union-find/operations'
import { stateAt, type Frame } from './playback'
import { graphTestValues, indexTestValues, sceneTestValues } from './scene-tests'

// Every step an operation shows on a loop's or an if's line, its test worked out from the step as the
// code box does (`CodeShapeUtil.following`): the step before for a one-line test that acts.

type Op = { frames: Frame[]; code?: string }
type Values = (frame: Frame) => TestValues

const LANGUAGES = ['java', 'python', 'c'] as const

/** Each step on a test line: its caption and, per language, the test as written out (undefined: nothing shown). */
function testsOf(op: Op, values: Values) {
	return op.frames.flatMap((frame, i) => {
		const byLanguage = LANGUAGES.map((language) => {
			const code = algorithmCode(op.code!, language)!
			const at = frame.line === undefined ? undefined : code.lines[frame.line]
			if (at === undefined || code.firstTags[at] !== frame.line) return undefined
			const line = code.text.split('\n')[at]
			if (!conditionOf(line, language)) return undefined
			const tags = Object.values(code.lines).filter((l) => l === at).length
			const read = readsBefore(line, language, tags) ? Math.max(0, i - 1) : i
			const step = { ...op.frames[read], strips: op.frames[read].strips ?? stateAt(op.frames, read).strips }
			return { line: line.trim(), test: shownTest(line, language, values(step)) }
		})
		return byLanguage.some(Boolean) ? [{ caption: frame.caption ?? '', java: byLanguage[0], python: byLanguage[1], c: byLanguage[2] }] : []
	})
}

const written = (t: ShownTest | undefined) => t && `${t.parts.map((p) => p.shown ?? '…').join(` ${t.ops[0] ?? ''} `)} → ${t.result}`

const plainList = (values: string[]) => ({ nodes: values.map((value, i) => ({ id: `n${i}`, value, dx: 0, dy: 0 })), direction: 'right' as const, size: 'm' as const })
const listValues =
	(props: object): Values =>
	(f) =>
		sceneTestValues(f.scene ?? listScene({ ...props, ...(f.props as object) } as never), f)
const treeNode = (id: string, value: string, children: (string | null)[] = [null, null]) => ({ id, value, children, dx: 0, dy: 0 })
// 40 (20 (10, 30 (25, -)), 50 (-, 60))
const bst = [treeNode('a', '40', ['b', 'c']), treeNode('b', '20', ['d', 'e']), treeNode('c', '50', [null, 'g']), treeNode('d', '10'), treeNode('e', '30', ['f', null]), treeNode('f', '25'), treeNode('g', '60')]
const tree = [treeNode('a', 'A', ['b', 'c']), treeNode('b', 'B', ['d', null]), treeNode('c', 'C'), treeNode('d', 'D')]
const treeValues =
	(nodes: typeof bst, nulls = false): Values =>
	(f) =>
		sceneTestValues(f.scene ?? treeScene({ nodes, nulls, size: 'm', ...(f.props as object) } as never), f, { children: true })
const graph = {
	nodes: ['A', 'B', 'C', 'D', 'E'].map((v, i) => ({ id: v.toLowerCase(), value: v, x: i, y: 0 })),
	edges: [['a', 'b'], ['b', 'c'], ['a', 'c'], ['d', 'e']].map(([from, to], i) => ({ id: `e${i}`, from, to, weight: '1' })),
}
const graphValues: Values = (f) => graphTestValues(f.scene ?? graphScene({ ...graph, direction: 'undirected', weights: 'hidden', size: 'm' } as never), f)
const heapValues =
	(start: string[]): Values =>
	(f) => {
		const values = (f.props as { values?: string[] } | undefined)?.values ?? start
		return indexTestValues(f, { heap: values, a: values })
	}
const forest = { parent: [0, 0, 1, 2, 4], sizes: [4, 1, 1, 1, 1], ranks: [3, 0, 0, 0, 0] }
const ufProps = { labels: forest.parent.map(String), ...forest, unionBy: 'size' as const, compression: 'on' as const, size: 'm' as const }
const ufValues: Values = (f) => {
	const p = { ...ufProps, ...(f.props as object) }
	return indexTestValues(f, { parent: p.parent.map(String), size: p.sizes.map(String), rank: p.ranks.map(String) })
}

const dup = plainList(['7', '9', '3', '9', '4'])
const runs: [string, Op, Values][] = [
	['find', findInList(dup as never, '9') as Op, listValues(dup)],
	['middle', findMiddle(dup as never) as Op, listValues(dup)],
	['floyd', detectCycle({ ...dup, cycleTo: 'n1' } as never) as Op, listValues({ ...dup, cycleTo: 'n1' })],
	['floyd, 9s', detectCycle({ ...plainList(['9', '2', '9']), cycleTo: 'n0' } as never) as Op, listValues({ ...plainList(['9', '2', '9']), cycleTo: 'n0' })],
	['insert sorted', insertSorted(plainList(['3', '7', '9']) as never, 'n9', '12') as Op, listValues(plainList(['3', '7', '9']))],
	['delete the tail', deleteFromList({ ...plainList(['7', '3', '9']), tail: 'tail' } as never, 'n2') as Op, listValues({ ...plainList(['7', '3', '9']), tail: 'tail' })],
	['insert after the tail', insertIntoList({ ...plainList(['7', '3', '9']), tail: 'tail' } as never, 'n2', 'n9', '5') as Op, listValues({ ...plainList(['7', '3', '9']), tail: 'tail' })],
	['bst search', { ...bstSearch(bst, '25'), code: 'bst-search' }, treeValues(bst)],
	['bst search, missing', { ...bstSearch(bst, '33'), code: 'bst-search' }, treeValues(bst)],
	['bst insert', { ...bstInsertSteps(bst, '33'), code: 'bst-insert' }, treeValues(bst)],
	...['d', 'c', 'b', 'a'].map((id): [string, Op, Values] => [`bst delete ${id}`, { ...bstDeleteSteps(bst, id), code: 'bst-delete' }, treeValues(bst)]),
	['bst min', { ...bstExtreme(bst, 'a', 'min'), code: 'bst-min' }, treeValues(bst)],
	['pre-order', traverseTree(tree, 'a', 'pre') as Op, treeValues(tree)],
	['height, nulls', measureTree(tree, 'a', 'height', { nulls: true }) as Op, treeValues(tree, true)],
	['leaves', measureTree(tree, 'a', 'leaves') as Op, treeValues(tree)],
	['bfs', bfs(graph as never, 'a', false) as Op, graphValues],
	['dfs', dfs(graph as never, 'a', false) as Op, graphValues],
	['path', shortestPath(graph as never, 'a', 'c', false) as Op, graphValues],
	['cycle', findCycle(graph as never, false) as Op, graphValues],
	['cycle, directed', findCycle(graph as never, true) as Op, graphValues],
	['components', components(graph as never, { directed: false, weighted: false }) as Op, graphValues],
	['heap insert', insertSteps(['1', '10', '2', '11', '12', '3', '4'], '0', 'min') as Op, heapValues(['1', '10', '2', '11', '12', '3', '4'])],
	['heap insert, stays', insertSteps(['1', '10', '2', '11', '12', '3', '4'], '99', 'min') as Op, heapValues(['1', '10', '2', '11', '12', '3', '4'])],
	['heap remove', removeSteps(['1', '10', '2', '11', '12', '3', '4'], 0, 'min') as Op, heapValues(['1', '10', '2', '11', '12', '3', '4'])],
	['heap build', { ...buildHeapSteps(['5', '9', '1', '7', '3', '8'], 'max'), code: heapCode('build', 'max') } as Op, heapValues(['5', '9', '1', '7', '3', '8'])],
	['find', findSteps(ufProps, { ...forest, parent: [...forest.parent] }, 3) as Op, ufValues],
	['union', unionSteps(ufProps, 4, 3) as Op, ufValues],
	['union, one set', unionSteps(ufProps, 1, 3) as Op, ufValues],
]

describe('tests beside lists, trees, graphs, heaps and union-find', () => {
	it('come out the same in C, Java and Python, step by step', () => {
		for (const [name, op, values] of runs) {
			for (const step of testsOf(op, values)) {
				const results = LANGUAGES.map((l) => step[l]?.test?.result).filter((r) => r !== undefined)
				expect(new Set(results).size, `${name}: ${step.caption}\n${LANGUAGES.map((l) => `${l}: ${step[l]?.line} ${written(step[l]?.test)}`).join('\n')}`).toBeLessThanOrEqual(1)
			}
		}
	})

	const shown = (name: string, language: (typeof LANGUAGES)[number] = 'java') => {
		const [, op, values] = runs.find(([n]) => n === name)!
		return testsOf(op, values).map((s) => written(s[language]?.test))
	}

	it("a list's walks: find, Floyd (two nodes holding 9 apart; meeting at a 9, one node), the tail", () => {
		expect(shown('find')).toContain('9 == 9 → true')
		expect(shown('floyd, 9s')).toEqual(['9@0 == 9@0 → true'])
		expect(shown('floyd, 9s', 'python')).toEqual(['9@0 is 9@0 → true'])
		expect(shown('delete the tail')).toContain('9 == 9 → true')
		expect(shown('delete the tail', 'c')).toContain('9 == 9 → true')
	})

	it("a BST's walks: which way at each node, the delete's cases, the successor's walk", () => {
		expect(shown('bst search')).toEqual(['25 < 40 → true', '25 < 30 → true', '25 == 25 → true'])
		expect(shown('bst insert', 'python')).toContain('33 < 40 → true')
		expect(shown('bst delete d')).toEqual(['null == null && null == null → true'])
		expect(shown('bst delete c', 'c')).toEqual(['NULL == NULL || … → true'])
		expect(shown('bst delete b')).toContain('25 != 30 → true')
		expect(shown('leaves', 'java')).toContain('null == null && null == null → true')
	})

	it("a graph's searches: visited[w] by vertex, the path walked back, a heap's sift stopping, union-find's walk up", () => {
		expect(shown('bfs')).toContain('!true → false')
		expect(shown('bfs', 'python')).toContain('not True → false')
		expect(shown('path')).toEqual(['C == C → true', 'C != A → true', 'A != A → false'])
		expect(shown('heap insert, stays')).toEqual(['7 > 0 && 99 < 11 → false'])
		expect(shown('heap insert', 'python')).toContain('0 > 0 and … → false')
		expect(shown('heap build', 'python').at(-1)).toBe('-1 in range(6 // 2 - 1, -1, -1) → false')
		expect(shown('find').length).toBeGreaterThan(0)
	})
})
