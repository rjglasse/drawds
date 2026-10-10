import { ARRAY_CODE } from '../array/code'
import type { CodeLanguage } from './highlight'
import { codeLines } from './layout'

// The code of the algorithms drawds plays, for a code box beside the structure to show while one
// plays, the line each step is on lit (`Frame.line`). Each is written once per language as a
// teacher would write it, and a line a step can be on carries a tag at its end, two spaces or more
// after the code: `@compare` (several tags if more than one kind of step lands there).

/** Code with tags as written: as many languages as it has been written in, Java always. */
export type CodeSource = { java: string } & Partial<Record<CodeLanguage, string>>

/** An algorithm's code in one language, without its tags, and the line each tag is on. */
export interface AlgorithmCode {
	language: CodeLanguage
	text: string
	lines: Record<string, number>
}

const TAGS = /^(.*\S)\s{2,}((?:@[\w-]+\s*)+)$/

/** Tags taken off the ends of the lines (the indentation the first line has goes too). */
export function parseCode(source: string, language: CodeLanguage): AlgorithmCode {
	const raw = source.replace(/^\n+|\s+$/g, '').split('\n')
	const indent = Math.min(...raw.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
	const lines: Record<string, number> = {}
	const text = raw.map((line, i) => {
		const tagged = TAGS.exec(line)
		if (tagged) for (const tag of tagged[2].trim().split(/\s+/)) lines[tag.slice(1)] = i
		return (tagged ? tagged[1] : line).slice(indent).trimEnd()
	})
	return { language, text: text.join('\n'), lines }
}

/** Every algorithm with code, by id (what an operation names as its `code`). */
export const ALGORITHMS: Record<string, CodeSource> = { ...ARRAY_CODE }

const parsed = new Map<string, AlgorithmCode>()

/**
 * `algorithm`'s code in `language`, or in Java if it hasn't been written in that one (C, so far).
 * Undefined for an algorithm with no code.
 */
export function algorithmCode(algorithm: string, language: CodeLanguage): AlgorithmCode | undefined {
	const source = ALGORITHMS[algorithm]
	if (!source) return undefined
	const shown = source[language] === undefined ? 'java' : language
	const key = `${algorithm}:${shown}`
	let code = parsed.get(key)
	if (!code) parsed.set(key, (code = parseCode(source[shown]!, shown)))
	return code
}

/**
 * The line of `code` that `algorithm`'s tag `tag` is on. In code edited since (a line added, a name
 * changed), the first line reading the same as the tagged one, if there still is one.
 */
export function taggedLine(code: string, algorithm: AlgorithmCode, tag: string): number | undefined {
	const at = algorithm.lines[tag]
	if (at === undefined) return undefined
	if (code === algorithm.text) return at
	const want = codeLines(algorithm.text)[at].trim()
	const found = codeLines(code).findIndex((line) => line.trim() === want)
	return found < 0 ? undefined : found
}
