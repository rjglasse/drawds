import { ARRAY_CODE } from '../array/code'
import { LIST_CODE } from '../list/code'
import { TREE_CODE } from '../tree/code'
import { GRAPH_CODE } from '../graph/code'
import type { CodeLanguage } from './highlight'
import { codeLines } from './layout'

// The code of the algorithms drawds plays, for a code box beside the structure to show while one
// plays, the line each step is on lit (`Frame.line`). Each is written once per language as a
// teacher would write it, and a line a step can be on carries a tag at its end, two spaces or more
// after the code: `@compare` (several tags if more than one kind of step lands there). `$i` shows
// the variable i's value after that line as the steps run (`$min_idx=min`: the step's `min`, under
// the name this language gives it), on the line that drives it: its loop, or where it is set.

/** Code with tags as written: as many languages as it has been written in, Java always. */
export type CodeSource = { java: string } & Partial<Record<CodeLanguage, string>>

/** A variable whose value shows after a line: `name` as the code calls it, `key` as the steps do. */
export interface ShownValue {
	line: number
	name: string
	key: string
}

/** An algorithm's code in one language, without its tags, the line each tag is on and the values shown. */
export interface AlgorithmCode {
	language: CodeLanguage
	text: string
	lines: Record<string, number>
	values: ShownValue[]
}

const TAGS = /^(.*\S)\s{2,}((?:[@$][\w=-]+\s*)+)$/

/** Tags taken off the ends of the lines (the indentation the first line has goes too). */
export function parseCode(source: string, language: CodeLanguage): AlgorithmCode {
	const raw = source.replace(/^\n+|\s+$/g, '').split('\n')
	const indent = Math.min(...raw.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
	const lines: Record<string, number> = {}
	const values: ShownValue[] = []
	const text = raw.map((line, i) => {
		const tagged = TAGS.exec(line)
		for (const tag of tagged ? tagged[2].trim().split(/\s+/) : []) {
			if (tag[0] === '@') lines[tag.slice(1)] = i
			else {
				const [name, key = name] = tag.slice(1).split('=')
				values.push({ line: i, name, key })
			}
		}
		return (tagged ? tagged[1] : line).slice(indent).trimEnd()
	})
	return { language, text: text.join('\n'), lines, values }
}

/** Every algorithm with code, by id (what an operation names as its `code`). */
export const ALGORITHMS: Record<string, CodeSource> = { ...ARRAY_CODE, ...LIST_CODE, ...TREE_CODE, ...GRAPH_CODE }

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
	return at === undefined ? undefined : sameLine(code, algorithm, at)
}

/** Line `at` of the algorithm's code in `code`: the same, or (edited since) the first line reading the same. */
function sameLine(code: string, algorithm: AlgorithmCode, at: number): number | undefined {
	if (code === algorithm.text) return at
	const want = codeLines(algorithm.text)[at].trim()
	const found = codeLines(code).findIndex((line) => line.trim() === want)
	return found < 0 ? undefined : found
}

/** The values the algorithm's code shows, on their lines in `code` (as `taggedLine` finds them). */
export function shownValues(code: string, algorithm: AlgorithmCode): ShownValue[] {
	return algorithm.values.flatMap((v) => {
		const line = sameLine(code, algorithm, v.line)
		return line === undefined ? [] : [{ ...v, line }]
	})
}
