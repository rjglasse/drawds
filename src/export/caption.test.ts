import { describe, expect, it } from 'vitest'
import { stepFileName, wrapText } from './caption'

describe('step captions and file names', () => {
	it('wraps at spaces', () => {
		expect(wrapText('find(A) = C, find(B) = C: one tree already', 16)).toEqual(['find(A) = C,', 'find(B) = C: one', 'tree already'])
		expect(wrapText('', 10)).toEqual([])
		expect(wrapText('supercalifragilistic word', 8)).toEqual(['supercalifragilistic', 'word'])
	})

	it('numbers steps so they sort, then names them by their caption', () => {
		expect(stepFileName(0, 7, '50 > 30: go right', 'png')).toBe('01-50-30-go-right.png')
		expect(stepFileName(11, 120, undefined, 'svg')).toBe('012.svg')
		const long = stepFileName(2, 9, 'A–B (4): find(A) = C, find(B) = C, one tree already, so it would close a cycle: skip it', 'png')
		expect(long).toBe('03-a-b-4-find-a-c-find-b-c-one-tree-already-so-it.png')
	})
})

describe('step image area', () => {
	it('grows a box about its centre to an aspect ratio', async () => {
		const { Box } = await import('tldraw')
		const { toAspect } = await import('./steps')
		const tall = toAspect(new Box(0, 0, 100, 100), 16 / 9)
		expect([tall.w, tall.h, tall.midX, tall.midY]).toEqual([(100 * 16) / 9, 100, 50, 50])
		const wide = toAspect(new Box(10, 0, 400, 100), 16 / 9)
		expect([wide.w, wide.h, wide.midX, wide.midY]).toEqual([400, 225, 210, 50])
	})
})
