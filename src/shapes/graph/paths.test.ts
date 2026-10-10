import { describe, expect, it } from 'vitest'
import { stateAt } from '../../nodelink/playback'
import type { GraphModel } from './model'
import { findCycle, shortestPath } from './paths'

/** A graph from "0-1" style pairs over vertices named by `labels` (ids are the labels). */
function graph(labels: string[], pairs: string[]): GraphModel {
	return {
		nodes: labels.map((l, i) => ({ id: l, value: l, x: i, y: 0 })),
		edges: pairs.map((p, i) => {
			const [from, to] = p.split('-')
			return { id: `e${i}`, from, to, weight: '1' }
		}),
	}
}

// Lecture 9's running example: vertices 0..6.
const lecturePairs = ['0-1', '0-2', '1-3', '2-3', '2-5', '3-4', '3-5', '5-6', '4-6']
const lecture = graph(['0', '1', '2', '3', '4', '5', '6'], lecturePairs)
const edge = (pair: string) => `edge:e${lecturePairs.indexOf(pair)}`

describe('a path with the fewest edges (BFS, then walk back the parents)', () => {
	it("from 0 to 6: 0–2–5–6, three edges (the lecture's 0–1–3–5–6 has four)", () => {
		const run = shortestPath(lecture, '0', '6', false)
		expect(run.path).toEqual(['0', '2', '5', '6'])
		const end = stateAt(run.frames, run.frames.length - 1)
		// Only the path is lit at the end; the rest of the search's tree has faded back.
		expect(Object.entries(end.flash).filter(([, c]) => c === 'green').map(([k]) => k).sort()).toEqual(['0', '2', '5', '6', edge('0-2'), edge('2-5'), edge('5-6')].sort())
		expect(end.badges).toMatchObject({ 0: '0', 1: '1', 2: '1', 3: '2', 5: '2', 6: '3' })
		expect(run.frames.at(-1)!.caption).toBe('The path 0–2–5–6: 3 edges, the fewest there are, as BFS reaches every vertex 2 edges away before any 3 away')
		const found = run.frames.find((f) => f.line === 'found')!
		expect(found.caption).toBe('5–6: that is 6, reached 3 edges from 0: parent[6] = 5. Now walk back')
		// parent[] beside visited[] and the queue.
		expect(found.strips?.map((s) => s.title)).toEqual(['queue (front on the left)', 'visited[]', 'parent[]'])
		expect(found.strips?.[2].items).toEqual(['–', '0', '0', '1', '3', '2', '5'])
		expect(run.frames.filter((f) => f.line === 'walk').map((f) => f.vars?.x)).toEqual(['6', '5', '2', '0'])
		expect(run.code).toBe('graph-path')
	})

	it("says so when t can't be reached: one way only, or another piece", () => {
		const run = shortestPath(graph(['A', 'B', 'C'], ['A-B']), 'B', 'A', true)
		expect(run.path).toBeUndefined()
		expect(run.frames.at(-1)!.caption).toBe('Queue empty and A never reached: there is no path from B to A (edges only go one way)')
		expect(shortestPath(graph(['A', 'B', 'C'], ['A-B']), 'A', 'C', false).frames.at(-1)!.line).toBe('none')
		expect(shortestPath(lecture, '4', '4', false).path).toEqual(['4'])
	})
})

describe('is there a cycle? (DFS, Task 18)', () => {
	it("undirected: a visited neighbour that isn't the parent closes one, lit in red", () => {
		const run = findCycle(lecture, false)
		expect(run.cycle).toEqual(['0', '1', '3', '2', '0'])
		const found = run.frames.find((f) => f.line === 'cycle')!
		expect(found.caption).toBe("2–0: 0 is visited and isn't 2's parent: a cycle, 0–1–3–2–0")
		expect(found.ask).toBe('2–0: new, the parent, or visited?')
		const end = stateAt(run.frames, run.frames.length - 1)
		for (const key of ['0', '1', '3', '2', edge('0-1'), edge('1-3'), edge('2-3'), edge('0-2')]) expect(end.flash[key], key).toBe('red')
		expect(run.frames.at(-1)!.caption).toBe('Yes: 0–1–3–2–0, a cycle of 4 edges')
		// The edge back to the parent is skipped, saying why.
		expect(run.frames.find((f) => f.line === 'parent')?.caption).toBe("1–0: 0 is 1's parent, the edge just come along: no cycle there")
		expect(run.code).toBe('graph-cycle')
	})

	it('undirected, no cycle: a forest, every piece searched (a tree only if connected)', () => {
		const run = findCycle(graph(['0', '1', '2', '3', '4'], ['0-1', '0-2', '3-4']), false)
		expect(run.cycle).toBeUndefined()
		expect(run.frames.filter((f) => f.line === 'search').map((f) => f.vars?.s)).toEqual(['0', '3'])
		expect(run.frames.at(-1)!.caption).toBe("Every vertex visited and no visited neighbour but a parent: no cycle. The graph is a forest (a tree if it's connected)")
	})

	it('directed: an edge back to the call stack is a cycle; to a vertex that is done, not', () => {
		const loop = findCycle(graph(['A', 'B', 'C'], ['A-B', 'B-C', 'C-A']), true)
		expect(loop.cycle).toEqual(['A', 'B', 'C', 'A'])
		expect(loop.frames.find((f) => f.line === 'cycle')?.caption).toBe('C→A: A is still on the call stack, so this edge leads back to it: a cycle, A→B→C→A')
		expect(loop.code).toBe('graph-cycle-directed')
		const dag = findCycle(graph(['A', 'B', 'C'], ['A-B', 'A-C', 'B-C']), true)
		expect(dag.cycle).toBeUndefined()
		expect(dag.frames.find((f) => f.line === 'done')?.caption).toBe('A→C: C is visited but done, off the stack: no way back round from it to A')
		expect(dag.frames.at(-1)!.caption).toContain('no cycle. The graph is a DAG, so it has a topological order')
		// The same edges undirected do make a cycle.
		expect(findCycle(graph(['A', 'B', 'C'], ['A-B', 'A-C', 'B-C']), false).cycle).toEqual(['A', 'B', 'C', 'A'])
	})
})
