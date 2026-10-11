import { algorithmCode } from '../shapes/code/algorithms'
import type { CodeLanguage } from '../shapes/code/highlight'
import type { ArrayMove } from './array-moves'

// An array's moves written out in a language, a line each (a call that can't be written out is its
// effect, under a comment naming it). Python: a list. Java: a List (an ArrayList, as a growing array
// is in Java). C: a list type with the operations a list has (append(&a, 7)), as C's own arrays
// can't grow; its elements are a.items, its length a.size, which C's algorithms take.

const numeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))

/** Whether every value the moves speak of is a number (an int list), else text. */
function allNumbers(moves: readonly ArrayMove[]): boolean {
	const values = moves.flatMap((m): string[] =>
		'values' in m ? m.values : 'v' in m ? [m.v] : m.op === 'call' ? m.effect.flatMap((e) => ('values' in e ? e.values : 'v' in e ? [e.v] : [])) : []
	)
	return values.every((v) => v === '' || numeric(v))
}

interface Spelling {
	ints: boolean
	name: string
	language: CodeLanguage
}

/** A value as the language writes it: a number bare, text quoted, an empty cell as nothing. */
function literal(v: string, { ints, language }: Spelling): string {
	if (v === '') return language === 'python' ? 'None' : language === 'java' ? 'null' : ints ? '0' : 'NULL'
	return ints ? String(Number(v)) : JSON.stringify(v)
}

const list = (values: readonly string[], s: Spelling) => values.map((v) => literal(v, s)).join(', ')

/** A new list holding these values. */
function made(values: readonly string[], s: Spelling): string {
	const items = list(values, s)
	if (s.language === 'python') return `[${items}]`
	if (s.language === 'java') return values.length ? `new ArrayList<>(${values.includes('') ? 'Arrays.asList' : 'List.of'}(${items}))` : 'new ArrayList<>()'
	return values.length ? `listOf(${values.length}, (${s.ints ? 'int' : 'const char *'}[]){${items}})` : 'listOf(0, NULL)'
}

/**
 * A call to an algorithm, as its own code in this language declares it, its parameters filled in:
 * the array, its length (n), its first and last indexes (lo, hi). Undefined if any other parameter
 * (a key, a position) has to be known.
 */
function call(algorithm: string, s: Spelling): string | undefined {
	const code = algorithmCode(algorithm, s.language)
	if (!code || code.language !== s.language) return undefined
	const head = code.text.split('\n')[0]
	const m = s.language === 'python' ? /^def (\w+)\((.*)\):/.exec(head) : /^\S.*?\b(\w+)\((.*)\)\s*\{/.exec(head)
	if (!m) return undefined
	const [, fn, params] = m
	const { name, language } = s
	const length = language === 'python' ? `len(${name})` : language === 'java' ? `${name}.size()` : `${name}.size`
	const args = params
		.split(',')
		.map((p) => p.trim())
		.filter((p) => p && p !== 'self')
		.map((p) => {
			const param = /(\w+)\s*(\[\])?$/.exec(p)?.[1] ?? p
			if (['a', 'arr', 'nums', 'array'].includes(param)) return language === 'c' ? `${name}.items` : name
			if (param === 'n') return length
			if (param === 'lo' || param === 'low') return '0'
			if (param === 'hi' || param === 'high') return `${length} - 1`
			return undefined
		})
	if (args.includes(undefined)) return undefined
	return `${fn}(${args.join(', ')})${language === 'python' ? '' : ';'}`
}

/** One move's lines. */
function lines(move: ArrayMove, s: Spelling): string[] {
	const { name: a, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const note = py ? '#' : '//'
	const v = (x: string) => literal(x, s)
	switch (move.op) {
		case 'new':
			if (py) return [`${a} = ${made(move.values, s)}`]
			if (java) return [`List<${s.ints ? 'Integer' : 'String'}> ${a} = ${made(move.values, s)};`]
			return [`${s.ints ? 'IntList' : 'StrList'} ${a} = ${made(move.values, s)};`]
		case 'assign':
			return [`${a} = ${made(move.values, s)}${end}`]
		case 'set':
			return [py ? `${a}[${move.i}] = ${v(move.v)}` : java ? `${a}.set(${move.i}, ${v(move.v)});` : `${a}.items[${move.i}] = ${v(move.v)};`]
		case 'append':
			return [py ? `${a}.append(${v(move.v)})` : java ? `${a}.add(${v(move.v)});` : `append(&${a}, ${v(move.v)});`]
		case 'insert':
			return [py ? `${a}.insert(${move.i}, ${v(move.v)})` : java ? `${a}.add(${move.i}, ${v(move.v)});` : `insert(&${a}, ${move.i}, ${v(move.v)});`]
		case 'pop':
			return [py ? `${a}.pop()` : java ? `${a}.remove(${a}.size() - 1);` : `pop(&${a});`]
		case 'delete':
			return [py ? `del ${a}[${move.i}]` : java ? `${a}.remove(${move.i});` : `removeAt(&${a}, ${move.i});`]
		case 'swap': {
			const [i, j] = [move.i, move.j]
			return [py ? `${a}[${i}], ${a}[${j}] = ${a}[${j}], ${a}[${i}]` : java ? `Collections.swap(${a}, ${i}, ${j});` : `swap(&${a}.items[${i}], &${a}.items[${j}]);`]
		}
		case 'sort':
			if (move.descending) return [py ? `${a}.sort(reverse=True)` : java ? `${a}.sort(Collections.reverseOrder());` : `sortDescending(&${a});`]
			return [py ? `${a}.sort()` : java ? `Collections.sort(${a});` : `sort(&${a});`]
		case 'reverse':
			return [py ? `${a}.reverse()` : java ? `Collections.reverse(${a});` : `reverse(&${a});`]
		case 'shuffle': {
			const shuffled = py ? `random.shuffle(${a})` : java ? `Collections.shuffle(${a});` : `shuffle(&${a});`
			return [`${shuffled}    ${note} came out ${py ? '[' : '{'}${list(move.values, s)}${py ? ']' : '}'}`]
		}
		case 'call': {
			const written = call(move.algorithm, s)
			if (written) return [written]
			return [`${note} ${move.label}, step by step:`, ...move.effect.flatMap((m) => lines(m, s))]
		}
	}
}

/** An array's log written out in `language`. */
export function renderArrayLog(moves: readonly ArrayMove[], language: CodeLanguage): string {
	const first = moves[0]
	const s: Spelling = { ints: allNumbers(moves), name: first?.op === 'new' ? first.name : 'a', language }
	return moves.flatMap((m) => lines(m, s)).join('\n')
}
