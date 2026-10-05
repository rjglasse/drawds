import { describe, expect, it } from 'vitest'
import { boardFileName, boardName } from './names'

describe('boardFileName', () => {
	it('adds the .tldr extension once', () => {
		expect(boardFileName('Lecture 3')).toBe('Lecture 3.tldr')
		expect(boardFileName('Lecture 3.tldr')).toBe('Lecture 3.tldr')
		expect(boardFileName('Lecture 3.TLDR')).toBe('Lecture 3.tldr')
	})

	it('names an unnamed board "board"', () => {
		expect(boardFileName('')).toBe('board.tldr')
		expect(boardFileName('   ')).toBe('board.tldr')
		expect(boardFileName('.tldr')).toBe('board.tldr')
	})

	it('replaces characters file systems refuse and tidies spaces', () => {
		expect(boardFileName('BFS / DFS: graphs?')).toBe('BFS - DFS- graphs-.tldr')
		expect(boardFileName('  two\tspaces  ')).toBe('two spaces.tldr')
		expect(boardFileName('..hidden')).toBe('hidden.tldr')
	})
})

describe('boardName', () => {
	it('is the file name without its folder or extension', () => {
		expect(boardName('Lecture 3.tldr')).toBe('Lecture 3')
		expect(boardName('C:\\boards\\heaps.TLDR')).toBe('heaps')
		expect(boardName('/home/t/trees.json')).toBe('trees')
		expect(boardName('notes')).toBe('notes')
	})

	it('round-trips with boardFileName', () => {
		for (const name of ['Lecture 3', 'heaps and heapsort', 'week 2 - arrays']) {
			expect(boardName(boardFileName(name))).toBe(name)
		}
	})
})
