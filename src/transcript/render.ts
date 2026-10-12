import { algorithmCode } from '../shapes/code/algorithms'
import type { CodeLanguage } from '../shapes/code/highlight'
import type { ArrayMove, Fixed } from './array-moves'
import type { ListKind, ListMove } from './list-moves'
import type { TreeMove, TreeShape } from './tree-moves'
import type { GraphMove } from './graph-moves'
import type { HeapMove } from './heap-moves'
import { heapCode } from '../shapes/heap/code'
import type { HeapType } from '../shapes/heap/heap'
import type { HashMove, HashTable } from './hash-moves'
import type { MatrixMove } from './matrix-moves'
import { colsOf, rowsOf, type Grid } from '../shapes/matrix/model'
import { isSingletons, type UnionFindMove, type UnionFindState } from './union-find-moves'
import type { UnionBy } from '../shapes/union-find/union-find'
import { entriesOf, isTombstone } from '../shapes/hash/hash'
import { hashCodeId } from '../shapes/hash/code'

// An array's moves written out in a language, a line each (a call that can't be written out is its
// effect, under a comment naming it). Python: a list. Java: a List (an ArrayList, as a growing array
// is in Java). C: a list type with the operations a list has (append(&a, 7)), as C's own arrays
// can't grow; its elements are a.items, its length a.size, which C's algorithms take.

const numeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))

type AnyMove = ArrayMove | ListMove | TreeMove | HeapMove

/** Every value a tree holds. */
const treeValues = (t: TreeShape): string[] => (t ? [t.v, ...treeValues(t.l), ...treeValues(t.r)] : [])

/** Whether every value the moves speak of is a number (an int list), else text. */
function allNumbers(moves: readonly AnyMove[]): boolean {
	const of = (m: AnyMove): string[] =>
		'values' in m ? m.values : 'tree' in m ? treeValues(m.tree) : 'v' in m ? [m.v] : m.op === 'call' ? (m.effect as AnyMove[]).flatMap(of) : []
	const values = moves.flatMap(of)
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
 * the structure (an array's items in C), its length (n), its first and last indexes (lo, hi). A
 * method (Python's self, or Java code that doesn't take the structure: a list's) is called on it.
 * Undefined if any other parameter (a key, a position) has to be known.
 */
function call(
	algorithm: string,
	s: Spelling,
	kind: 'array' | 'list' | 'tree' | 'heap' | 'hash' | 'uf' = 'array',
	/** Other parameters, as what the operation did tells them (a tree's key, its node, a heap's value or index). */
	more: (param: string) => string | undefined = () => undefined
): string | undefined {
	const code = algorithmCode(algorithm, s.language)
	if (!code || code.language !== s.language) return undefined
	const head = code.text.split('\n')[0]
	const m = s.language === 'python' ? /^def (\w+)\((.*)\):/.exec(head) : /^\S.*?\b(\w+)\((.*)\)\s*\{/.exec(head)
	if (!m) return undefined
	const [, fn, params] = m
	const { name, language } = s
	const length = language === 'python' ? `len(${name})` : language === 'java' ? `${name}.size()` : `${name}.size`
	const all = params
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean)
	const names = all.map((p) => /(\w+)\s*(\[\])?$/.exec(p)?.[1] ?? p)
	const structure = kind === 'array' ? ['a', 'arr', 'nums', 'array'] : kind === 'list' ? ['list'] : kind === 'heap' ? ['h'] : kind === 'hash' ? ['t'] : kind === 'uf' ? ['u'] : ['t', 'tree']
	const method = names[0] === 'self' || (language === 'java' && !names.some((p) => structure.includes(p)))
	const args = names
		.filter((p) => p !== 'self')
		.map((param) => {
			if (structure.includes(param)) return language === 'c' && kind === 'array' ? `${name}.items` : name
			if (param === 'n') return length
			if (param === 'lo' || param === 'low') return '0'
			if (param === 'hi' || param === 'high') return `${length} - 1`
			return more(param)
		})
	if (args.includes(undefined)) return undefined
	return `${method ? `${name}.` : ''}${fn}(${args.join(', ')})${language === 'python' ? '' : ';'}`
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
		// An ArrayStack's and ArrayQueue's own (`fixedLines`).
		case 'push':
		case 'enqueue':
		case 'dequeue':
			return [`${note} ${move.op}`]
	}
}

/**
 * An ArrayStack's or ArrayQueue's moves (lecture 6's, `src/shapes/array/code.ts`): made with its
 * capacity and the values put in, bottom or front first (a buffer whose front has moved on, laid
 * out as it is); push and pop, enqueue and dequeue as its code calls them; a value typed straight
 * into its array, `a`.
 */
function fixedLines(move: ArrayMove, s: Spelling, fixed: Fixed): string[] {
	const { name: a, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const dot = py || java ? '.' : '->'
	const v = (x: string) => literal(x, s)
	const type = s.ints ? 'int' : java ? 'String' : 'const char *'
	const call = (fn: string, ...args: string[]) => (py || java ? `${a}.${fn}(${args.join(', ')})${end}` : `${fn}(${[a, ...args].join(', ')});`)
	const made = (values: readonly string[], f: Fixed, fresh: boolean): string[] => {
		const [cls, struct] = f.as === 'stack' ? ['ArrayStack', 'Stack'] : ['ArrayQueue', 'Queue']
		// Empty or not: where its front is decides where the next value goes.
		const layout = f.as === 'queue' && f.front !== 0
		const put = layout ? [] : values
		const items = list(put, s)
		const create = py
			? `${a} = ${cls}(${f.capacity}${put.length ? `, [${items}]` : ''})`
			: java
				? `${fresh ? `${cls} ` : ''}${a} = new ${cls}(${f.capacity}${put.length ? `, ${items}` : ''});`
				: `${fresh ? `${struct} *` : ''}${a} = new${struct}(${f.capacity}, ${put.length}, ${put.length ? `(${type}[]){${items}}` : 'NULL'});`
		if (!layout) return [create]
		// A circular buffer whose front has moved on: its array as it is, and where front and rear are.
		const spare = py ? 'None' : s.ints ? '0' : java ? 'null' : 'NULL'
		const slots = Array.from({ length: f.capacity }, (_, i) => values[(i - f.front + f.capacity) % f.capacity]).map((x) => (x === undefined ? spare : v(x)))
		const rear = (f.front + values.length) % f.capacity
		return [
			`${create}    ${py ? '#' : '//'} its front moved on: laid out as it is`,
			py ? `${a}.a = [${slots.join(', ')}]` : java ? `${a}.a = new ${type}[]{${slots.join(', ')}};` : `memcpy(${a}->a, (${type}[]){${slots.join(', ')}}, ${f.capacity} * sizeof(${type}));`,
			py ? `${a}.front, ${a}.rear, ${a}.size = ${f.front}, ${rear}, ${values.length}` : `${a}${dot}front = ${f.front}; ${a}${dot}rear = ${rear}; ${a}${dot}size = ${values.length};`,
		]
	}
	switch (move.op) {
		case 'new':
			return made(move.values, move.fixed ?? fixed, true)
		case 'assign':
			return made(move.values, move.fixed ?? fixed, false)
		case 'push':
			return [call('push', v(move.v))]
		case 'pop':
			return [call('pop')]
		case 'enqueue':
			return [call('enqueue', v(move.v))]
		case 'dequeue':
			return [call('dequeue')]
		case 'set':
			return [`${a}${dot}a[${move.i}] = ${v(move.v)}${end}`]
		// Its push and pop, enqueue and dequeue are the calls.
		case 'call':
			return move.effect.flatMap((m) => fixedLines(m, s, fixed))
		default:
			return [`${py ? '#' : '//'} ${move.op}`]
	}
}

/** An array's log written out in `language` (an ArrayStack or ArrayQueue as one, from where it is made one). */
export function renderArrayLog(moves: readonly ArrayMove[], language: CodeLanguage): string {
	const first = moves[0]
	const s: Spelling = { ints: allNumbers(moves), name: first?.op === 'new' ? first.name : 'a', language }
	let fixed: Fixed | undefined
	return moves
		.flatMap((m) => {
			if (m.op === 'new' || m.op === 'assign') fixed = m.fixed
			return fixed ? fixedLines(m, s, fixed) : lines(m, s)
		})
		.join('\n')
}

/** One list move's lines: drawds' own list methods (insert_at_head, insert_after, remove), node_at(i) naming a node. */
function listLines(move: ListMove, s: Spelling): string[] {
	const { name: l, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const note = py ? '#' : '//'
	const v = (x: string) => literal(x, s)
	const node = (i: number) => (py ? `${l}.node_at(${i})` : java ? `${l}.nodeAt(${i})` : `nodeAt(${l}, ${i})`)
	const made = (values: readonly string[]) =>
		py ? `LinkedList([${list(values, s)}])` : java ? `new LinkedList(${list(values, s)})` : `listOf(${values.length}, (${s.ints ? 'int' : 'const char *'}[]){${list(values, s)}})`
	const field = (n: string, f: string) => (py || java ? `${n}.${f}` : `${n}->${f}`)
	switch (move.op) {
		case 'new':
			return [py ? `${l} = ${made(move.values)}` : java ? `LinkedList ${l} = ${made(move.values)};` : `List *${l} = ${made(move.values)};`]
		case 'assign':
			return [`${l} = ${made(move.values)}${end}`]
		case 'set':
			return [`${field(node(move.i), 'value')} = ${v(move.v)}${end}`]
		case 'insertAtHead':
			return [py ? `${l}.insert_at_head(${v(move.v)})` : java ? `${l}.insertAtHead(${v(move.v)});` : `insertAtHead(${l}, ${v(move.v)});`]
		case 'append':
			return [py ? `${l}.append(${v(move.v)})` : java ? `${l}.append(${v(move.v)});` : `append(${l}, ${v(move.v)});`]
		case 'insert':
			return [py ? `${l}.insert_after(${node(move.i - 1)}, ${v(move.v)})` : java ? `${l}.insertAfter(${node(move.i - 1)}, ${v(move.v)});` : `insertAfter(${node(move.i - 1)}, ${v(move.v)});`]
		case 'remove':
			// remove(value) takes the first node holding it: a later one goes by its place.
			if (!move.first) return [py ? `${l}.remove_at(${move.i})` : java ? `${l}.removeAt(${move.i});` : `removeAt(${l}, ${move.i});`]
			return [py ? `${l}.remove(${v(move.v)})` : java ? `${l}.remove(${v(move.v)});` : `removeValue(${l}, ${v(move.v)});`]
		case 'reverse':
			return [py ? `${l}.reverse()` : java ? `${l}.reverse();` : `reverse(${l});`]
		case 'cycle': {
			const to = move.to === null ? (py ? 'None' : java ? 'null' : 'NULL') : node(move.to)
			return [`${field(node(move.last), 'next')} = ${to}${end}    ${note} ${move.to === null ? 'no cycle' : 'a cycle'}`]
		}
		case 'call': {
			const written = call(move.algorithm, s, 'list')
			if (written) return [written]
			return [`${note} ${move.label}, step by step:`, ...move.effect.flatMap((m) => listLines(m, s))]
		}
		// A linked stack's and queue's own (`linkedLines`).
		case 'push':
		case 'pop':
		case 'enqueue':
		case 'dequeue':
			return [`${note} ${move.op}`]
	}
}

/**
 * A linked stack's or queue's moves: a LinkedStack made from its values from the top (as drawn) or
 * a LinkedQueue from the front, push and pop, enqueue and dequeue as its code (`src/shapes/list/
 * code.ts`) calls them, a value typed into a node along from the top or front.
 */
function linkedLines(move: ListMove, s: Spelling, kind: 'stack' | 'queue'): string[] {
	const { name: l, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const note = py ? '#' : '//'
	const dot = py || java ? '.' : '->'
	const v = (x: string) => literal(x, s)
	const call = (fn: string, ...args: string[]) => (py || java ? `${l}.${fn}(${args.join(', ')})${end}` : `${fn}(${[l, ...args].join(', ')});`)
	const made = (values: readonly string[], k: ListKind, fresh: boolean): string[] => {
		const [cls, struct, of] = k === 'stack' ? ['LinkedStack', 'Stack', 'stackOf'] : ['LinkedQueue', 'Queue', 'queueOf']
		const items = list(values, s)
		const create = py
			? `${l} = ${cls}(${values.length ? `[${items}]` : ''})`
			: java
				? `${fresh ? `${cls} ` : ''}${l} = new ${cls}(${items});`
				: `${fresh ? `${struct} *` : ''}${l} = ${of}(${values.length}, ${values.length ? `(${s.ints ? 'int' : 'const char *'}[]){${items}}` : 'NULL'});`
		return [k === 'stack' && values.length > 1 ? `${create}    ${note} top first` : create]
	}
	switch (move.op) {
		case 'new':
			return made(move.values, move.kind ?? kind, true)
		case 'assign':
			return made(move.values, move.kind ?? kind, false)
		case 'push':
			return [call('push', v(move.v))]
		case 'pop':
			return [call('pop')]
		case 'enqueue':
			return [call('enqueue', v(move.v))]
		case 'dequeue':
			return [call('dequeue')]
		case 'set':
			return [`${l}${dot}${kind === 'stack' ? 'top' : 'front'}${`${dot}next`.repeat(move.i)}${dot}value = ${v(move.v)}${end}`]
		// Its push and pop, enqueue and dequeue are the calls.
		case 'call':
			return move.effect.flatMap((m) => linkedLines(m, s, kind))
		default:
			return [`${note} ${move.op}`]
	}
}

/** A linked list's log written out in `language` (a linked stack or queue as one, from where it is made one). */
export function renderListLog(moves: readonly ListMove[], language: CodeLanguage): string {
	const first = moves[0]
	const s: Spelling = { ints: allNumbers(moves), name: first?.op === 'new' ? first.name : 'a', language }
	let kind: ListKind = 'list'
	return moves
		.flatMap((m) => {
			if (m.op === 'new' || m.op === 'assign') kind = m.kind ?? 'list'
			return kind === 'list' ? listLines(m, s) : linkedLines(m, s, kind)
		})
		.join('\n')
}

/** A tree's moves, a line each: a node named by its path from the root, a BST's nodes with keys. */
function treeLines(move: TreeMove, s: Spelling, field: 'key' | 'value'): string[] {
	const { name: t, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const nil = py ? 'None' : java ? 'null' : 'NULL'
	const v = (x: string) => literal(x, s)
	const at = (path: string) => [py || java ? `${t}.root` : `${t}->root`, ...[...path].map((d) => (d === 'L' ? 'left' : 'right'))].join(py || java ? '.' : '->')
	const field_ = (path: string) => `${at(path)}${py || java ? '.' : '->'}${field}`
	const node = (n: TreeShape): string => {
		if (!n) return nil
		if (!n.l && !n.r) return py ? `Node(${v(n.v)})` : java ? `new Node(${v(n.v)})` : `newNode(${v(n.v)})`
		const kids = `${node(n.l)}, ${node(n.r)}`
		return py ? `Node(${v(n.v)}, ${kids})` : java ? `new Node(${v(n.v)}, ${kids})` : `node(${v(n.v)}, ${kids})`
	}
	switch (move.op) {
		case 'new': {
			const root = move.tree ? node(move.tree) : ''
			return [py ? `${t} = Tree(${root})` : java ? `Tree ${t} = new Tree(${root});` : `Tree *${t} = newTree(${root || 'NULL'});`]
		}
		case 'assign':
			return [`${at('')} = ${node(move.tree)}${end}`]
		case 'set':
			return [`${field_(move.path)} = ${v(move.v)}${end}`]
		case 'add':
			return [`${at(move.path)} = ${node({ v: move.v, l: null, r: null })}${end}`]
		case 'remove':
			return [`${at(move.path)} = ${nil}${end}    ${py ? '#' : '//'} ${move.v} and everything under it`]
		case 'swap':
			return [py ? `swap_children(${at(move.path)})` : `swapChildren(${at(move.path)});`]
		case 'mirror':
			return [`mirror(${at(move.path)})${end}`]
		case 'call': {
			const { args } = move
			const more = (param: string) =>
				(param === 'key' || param === 'value') && args?.key !== undefined ? v(args.key) : param === 'node' && args?.node !== undefined ? at(args.node) : undefined
			const written = call(move.algorithm, s, 'tree', more)
			if (written) return [written]
			return [`${py ? '#' : '//'} ${move.label}, step by step:`, ...move.effect.flatMap((m) => treeLines(m, s, field))]
		}
	}
}

/** A binary tree's log written out in `language` (a BST's nodes hold keys). */
export function renderTreeLog(moves: readonly TreeMove[], language: CodeLanguage, field: 'key' | 'value' = 'value'): string {
	const first = moves[0]
	const s: Spelling = { ints: allNumbers(moves), name: first?.op === 'new' ? first.name : 't', language }
	return moves.flatMap((m) => treeLines(m, s, field)).join('\n')
}

/**
 * A heap's moves, a line each: a MinHeap or MaxHeap made from its array as it is, a value typed
 * straight into that array, its operations called as the heap's own code (`src/shapes/heap/code.ts`)
 * declares them.
 */
function heapLines(move: HeapMove, s: Spelling): string[] {
	const { name: h, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const note = py ? '#' : '//'
	const made = (type: HeapType, values: readonly string[]) => {
		const cls = type === 'min' ? 'MinHeap' : 'MaxHeap'
		const items = list(values, s)
		return py ? `${cls}([${items}])` : java ? `new ${cls}(${items})` : `new${cls}(${values.length}, (${s.ints ? 'int' : 'const char *'}[]){${items}})`
	}
	// The heap's array, as its code names it.
	const array = py || java ? `${h}.heap` : `${h}->a`
	switch (move.op) {
		case 'new':
			return [`${py ? '' : java ? 'Heap ' : 'Heap *'}${h} = ${made(move.type, move.values)}${end}`]
		case 'assign':
			return [`${h} = ${made(move.type, move.values)}${end}`]
		case 'set':
			return [`${array}[${move.i}] = ${literal(move.v, s)}${end}`]
		case 'build':
			// A min heap's and a max heap's are called the same.
			return [call(heapCode('build', 'min'), s, 'heap') ?? `${note} build the heap`]
		case 'shuffle': {
			const shuffled = py ? `random.shuffle(${array})` : `shuffle(${array}, ${h}${java ? '.' : '->'}size)${end}`
			return [`${shuffled}    ${note} came out ${py ? '[' : '{'}${list(move.values, s)}${py ? ']' : '}'}`]
		}
		case 'call': {
			const { args } = move
			const more = (param: string) => (param === 'value' && args?.value !== undefined ? literal(args.value, s) : param === 'i' ? args?.i : undefined)
			const written = call(move.algorithm, s, 'heap', more)
			if (written) return [written]
			return [`${note} ${move.label}, step by step:`, ...move.effect.flatMap((m) => heapLines(m, s))]
		}
	}
}

/** A heap's log written out in `language`. */
export function renderHeapLog(moves: readonly HeapMove[], language: CodeLanguage): string {
	const first = moves[0]
	const s: Spelling = { ints: allNumbers(moves), name: first?.op === 'new' ? first.name : 'h', language }
	return moves.flatMap((m) => heapLines(m, s)).join('\n')
}

/** Whether a key is an integer, as a hash table takes it: its own hash code. */
const integer = (key: string) => /^-?\d+$/.test(key)

/** Every key a table holds. */
const tableKeys = (t: HashTable) => ('keys' in t ? t.keys : entriesOf(t.buckets))

/** How a table's index(key) works, if it isn't plain mod m: the hash code (text keys), the compression. */
function indexNote(t: HashTable): string | undefined {
	if (t.code === 'direct') return 'direct addressing: the key is the index'
	const ints = tableKeys(t).every(integer)
	const code = ints || t.code === 'sum' ? undefined : t.code === 'letters' ? 'the first three letters, A = 1' : "Java's hashCode"
	if (!code && t.compress === 'mod') return undefined
	return `index: ${code ?? (ints ? 'the key' : 'character codes added')}, ${t.compress === 'mad' ? 'MAD' : 'mod m'}`
}

/**
 * A hash table's moves, a line each: a ChainingHashTable or ProbingHashTable of m buckets with its
 * keys put in, in order (else laid out bucket by bucket), a key typed straight into a chain or slot,
 * its operations called as the table's own code (`src/shapes/hash/code.ts`) declares them.
 */
function hashLines(move: HashMove, s: Spelling, probing: boolean, classOf: HashClassOf): string[] {
	const { name: t, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const note = py ? '#' : '//'
	const nil = py ? 'None' : java ? 'null' : 'NULL'
	// Python takes each key as it is (an integer is its own hash code); Java and C, a table of one type.
	const key = (k: string) => (isTombstone(k) ? 'DELETED' : (py ? integer(k) : s.ints) ? String(Number(k)) : JSON.stringify(k))
	const dot = py || java ? '.' : '->'
	const node = (b: number, at: number) => `${t}${dot}table[${b}]${`${dot}next`.repeat(at)}`
	const slot = (b: number, k: string) =>
		py || java ? `${t}.table[${b}] = ${key(k)}${end}` : isTombstone(k) ? `${t}->slots[${b}].state = DELETED;` : `${t}->slots[${b}] = (Slot){FULL, ${key(k)}};`
	const chain = (keys: readonly string[]): string => {
		const [first, ...rest] = keys
		if (!rest.length) return py ? `Node(${key(first)})` : java ? `new Node(${key(first)})` : `newNode(${key(first)})`
		return py ? `Node(${key(first)}, ${chain(rest)})` : java ? `new Node(${key(first)}, ${chain(rest)})` : `node(${key(first)}, ${chain(rest)})`
	}
	const made = (table: HashTable, fresh: boolean): string[] => {
		const cls = classOf(table)
		const keys = 'keys' in table ? table.keys : []
		const items = keys.map(key).join(', ')
		const create = py
			? `${t} = ${cls}(${table.m}${keys.length ? `, [${items}]` : ''})`
			: java
				? `${fresh ? 'HashTable ' : ''}${t} = new ${cls}(${table.m}${keys.length ? `, ${items}` : ''});`
				: `${fresh ? 'Table *' : ''}${t} = newTable(${table.m}, ${keys.length}, ${keys.length ? `(${s.ints ? 'int' : 'const char *'}[]){${items}}` : 'NULL'});`
		const why = indexNote(table)
		if ('keys' in table) return [why ? `${create}    ${note} ${why}` : create]
		// No order of inserts gives it (a key typed into the wrong bucket, a deleted marker): as it is.
		return [
			`${create}    ${note} ${why ? `${why}; ` : ''}laid out as it is: no order of inserts gives it`,
			...table.buckets.flatMap((bucket, b) =>
				!bucket.length ? [] : table.strategy === 'probing' ? [slot(b, bucket[0])] : [`${node(b, 0)} = ${chain(bucket)}${end}`]
			),
		]
	}
	switch (move.op) {
		case 'new':
			return made(move.table, true)
		case 'assign':
			return made(move.table, false)
		case 'set':
			// A chained key: the node at its place in the chain; probing: the slot.
			return [probing ? slot(move.b, move.key) : `${node(move.b, move.at)}${dot}key = ${key(move.key)}${end}`]
		case 'clear': {
			if (probing) return [py || java ? `${t}.table[${move.b}] = ${nil}${end}` : `${t}->slots[${move.b}].state = EMPTY;`]
			// Whatever pointed at it (the bucket, or the key before) now points past it.
			const before = move.at ? `${node(move.b, move.at - 1)}${dot}next` : node(move.b, 0)
			return [`${before} = ${before}${dot}next${end}`]
		}
		case 'rehash':
			// Every table's rehash is called the same.
			return [call(hashCodeId('rehash', { strategy: 'chaining', ints: true, code: 'sum', compress: 'mod' }), s, 'hash') ?? `${note} rehash`]
		case 'call': {
			const [effect] = move.effect
			// drawds grows a table to at most 31 buckets: past that, not what rehash() would make.
			if (/^hash-rehash-/.test(move.algorithm) && effect?.op === 'assign') {
				return [`${note} rehash into ${effect.table.m} buckets, the most drawds draws (not ${py ? 'next_prime' : 'nextPrime'}(2 * m + 1)):`, ...made(effect.table, false)]
			}
			const { args } = move
			const written = call(move.algorithm, s, 'hash', (param) => (param === 'key' && args?.key !== undefined ? key(args.key) : undefined))
			if (written) return [written]
			return [`${note} ${move.label}, step by step:`, ...move.effect.flatMap((m) => hashLines(m, s, probing, classOf))]
		}
	}
}

/** The class a table is made of: by its strategy (a whole board's script tells schemes apart: `script.ts`). */
export type HashClassOf = (table: HashTable) => string

const hashClass: HashClassOf = (table) => (table.strategy === 'chaining' ? 'ChainingHashTable' : 'ProbingHashTable')

/** A hash table's log written out in `language`. */
export function renderHashLog(moves: readonly HashMove[], language: CodeLanguage, classOf: HashClassOf = hashClass): string {
	const first = moves[0]
	const keysOf = (m: HashMove): string[] =>
		m.op === 'new' || m.op === 'assign' ? tableKeys(m.table) : m.op === 'set' ? [m.key] : m.op === 'call' ? [...(m.args?.key ? [m.args.key] : []), ...m.effect.flatMap(keysOf)] : []
	const ints = moves.flatMap(keysOf).filter((k) => !isTombstone(k)).every(integer)
	const s: Spelling = { ints, name: first?.op === 'new' ? first.name : 't', language }
	// A key typed in or away reads as the table's strategy: that of the last table made.
	let probing = false
	return moves
		.flatMap((m) => {
			if (m.op === 'new' || m.op === 'assign') probing = m.table.strategy === 'probing'
			return hashLines(m, s, probing, classOf)
		})
		.join('\n')
}

/**
 * A matrix's moves, a line each. Python: a list of rows. Java: an int[][] (or String[][]), whose rows
 * and columns can't grow, so a change of shape makes a new one (insertRow, deleteCol..., named as
 * drawds' own matrix model names them). C: a matrix type, its cells a.cells[r][c].
 */
function matrixLines(move: MatrixMove, s: Spelling, empty: boolean): string[] {
	const { name: a, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const v = (x: string) => literal(x, s)
	const row = (values: readonly string[]) => `${py ? '[' : '{'}${list(values, s)}${py ? ']' : '}'}`
	const grid = (values: Grid) => `${py ? '[' : '{'}${values.map(row).join(', ')}${py ? ']' : '}'}`
	// Java's int[][] holds no empty cell: an Integer[][] does.
	const type = s.ints ? (java ? (empty ? 'Integer' : 'int') : 'int') : java ? 'String' : 'const char *'
	const made = (values: Grid) =>
		py ? grid(values) : java ? `new ${type}[][]${grid(values)}` : `matrixOf(${rowsOf(values)}, ${colsOf(values)}, (${type}[${rowsOf(values)}][${colsOf(values)}])${grid(values)})`
	const line = (values: readonly string[]) => (py ? row(values) : java ? `new ${type}[]${row(values)}` : `(${type}[])${row(values)}`)
	const change = (fn: string, ...args: string[]) => (java ? `${a} = ${fn}(${[a, ...args].join(', ')});` : `${fn}(${[`&${a}`, ...args].join(', ')});`)
	const [rows, cols] = java ? [`${a}.length`, `${a}[0].length`] : [`${a}.rows`, `${a}.cols`]
	switch (move.op) {
		case 'new':
			return [py ? `${a} = ${made(move.values)}` : java ? `${type}[][] ${a} = ${grid(move.values)};` : `${s.ints ? 'IntMatrix' : 'StrMatrix'} ${a} = ${made(move.values)};`]
		case 'assign':
			return [`${a} = ${made(move.values)}${py ? '' : ';'}`]
		case 'set':
			return [`${a}${py || java ? '' : '.cells'}[${move.r}][${move.c}] = ${v(move.v)}${py ? '' : ';'}`]
		case 'appendRow':
			return [py ? `${a}.append(${line(move.values)})` : change('insertRow', rows, line(move.values))]
		case 'insertRow':
			return [py ? `${a}.insert(${move.at}, ${line(move.values)})` : change('insertRow', String(move.at), line(move.values))]
		case 'deleteRow':
			return [py ? `del ${a}[${move.at}]` : change('deleteRow', String(move.at))]
		case 'appendCol':
			return [py ? `for row, v in zip(${a}, ${line(move.values)}): row.append(v)` : change('insertCol', cols, line(move.values))]
		case 'insertCol':
			return [py ? `for row, v in zip(${a}, ${line(move.values)}): row.insert(${move.at}, v)` : change('insertCol', String(move.at), line(move.values))]
		case 'deleteCol':
			return [py ? `for row in ${a}: del row[${move.at}]` : change('deleteCol', String(move.at))]
		case 'transpose':
			return [py ? `${a} = [list(row) for row in zip(*${a})]` : change('transpose')]
	}
}

/** A matrix's log written out in `language`. */
export function renderMatrixLog(moves: readonly MatrixMove[], language: CodeLanguage): string {
	const first = moves[0]
	const values = moves.flatMap((m) => ('values' in m ? (m.op === 'new' || m.op === 'assign' ? m.values.flat() : m.values) : 'v' in m ? [m.v] : []))
	const s: Spelling = { ints: values.every((v) => v === '' || numeric(v)), name: first?.op === 'new' ? first.name : 'm', language }
	return moves.flatMap((m) => matrixLines(m, s, values.includes(''))).join('\n')
}

/**
 * Union-find's moves, a line each: a UnionFind of n elements (union by size, with path compression,
 * unless `by` and `compress` say otherwise), its arrays as its code keeps them, union and find called
 * as its code (`src/shapes/union-find/code.ts`) declares them, the elements' names in a comment.
 */
function unionFindLines(move: UnionFindMove, s: Spelling, stale = false): string[] {
	const { name: u, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const end = py ? '' : ';'
	const note = py ? '#' : '//'
	const dot = py || java ? '.' : '->'
	const by = (b: UnionBy) => (py ? `'${b}'` : java ? `By.${b.toUpperCase()}` : `BY_${b.toUpperCase()}`)
	const off = (on: boolean) => `${u}${dot}compress = ${py ? (on ? 'True' : 'False') : on ? 'true' : 'false'}${end}`
	// C's arrays can't be assigned: copied in.
	const array = (field: string, values: readonly number[]) =>
		py || java
			? `${u}.${field} = ${py ? '' : 'new int[]'}${py ? '[' : '{'}${values.join(', ')}${py ? ']' : '}'}${end}`
			: `memcpy(${u}->${field}, (int[]){${values.join(', ')}}, ${values.length} * sizeof(int));`
	const arrays = (st: UnionFindState) => [array('parent', st.parent), array('size', st.sizes), array('rank', st.ranks)]
	const made = (st: UnionFindState, fresh: boolean) => [
		py ? `${u} = UnionFind(${st.parent.length})` : java ? `${fresh ? 'UnionFind ' : ''}${u} = new UnionFind(${st.parent.length});` : `${fresh ? 'UF *' : ''}${u} = newUF(${st.parent.length});`,
		...(st.by !== 'size' ? [`${u}${dot}by = ${by(st.by)}${end}`] : []),
		...(st.compress ? [] : [off(false)]),
		...(isSingletons(st) ? [] : arrays(st)),
	]
	switch (move.op) {
		case 'new':
			return made(move.state, true)
		case 'assign':
			// Every element on its own again: a new one; else (random unions) its arrays.
			return isSingletons(move.state) ? made(move.state, false) : arrays(move.state)
		case 'by':
			// Sizes a union by rank or naively left behind (their code doesn't add them up): the ones drawds kept.
			return [`${u}${dot}by = ${by(move.by)}${end}`, ...(stale && move.sizes ? [array('size', move.sizes)] : [])]
		case 'compress':
			return [off(move.on)]
		case 'makeSet':
			return [py ? `${u}.make_set()` : java ? `${u}.makeSet();` : `makeSet(${u});`]
		case 'parent':
			return [
				`${u}${dot}parent[${move.i}] = ${move.p}${end}`,
				...move.size.map(([k, v]) => `${u}${dot}size[${k}] = ${v}${end}`),
				...move.rank.map(([k, v]) => `${u}${dot}rank[${k}] = ${v}${end}`),
			]
		case 'call': {
			const args = move.args ?? {}
			const written = call(move.algorithm, s, 'uf', (param) => args[param])
			if (!written) return [`${note} ${move.label}, step by step:`, ...move.effect.flatMap((m) => unionFindLines(m, s))]
			// Elements with names: the call as the steps named it.
			const fn = move.algorithm.startsWith('uf-union') ? 'union' : move.algorithm.startsWith('uf-connected') ? 'connected' : 'find'
			const plain = move.label === `${fn}(${Object.values(args).join(', ')})`
			return [plain ? written : `${written}    ${note} ${move.label}`]
		}
	}
}

/** Union-find's log written out in `language`. */
export function renderUnionFindLog(moves: readonly UnionFindMove[], language: CodeLanguage): string {
	const first = moves[0]
	const s: Spelling = { ints: true, name: first?.op === 'new' ? first.name : 'u', language }
	// Whether a union by rank or naively has left the code's sizes behind drawds' since they were last written.
	let [by, stale] = ['size' as UnionBy, false]
	return moves
		.flatMap((m) => {
			const lines = unionFindLines(m, s, stale)
			if (m.op === 'new' || m.op === 'assign') [by, stale] = [m.state.by, false]
			if (m.op === 'by') [by, stale] = [m.by, stale && !m.sizes]
			if (m.op === 'call' && by !== 'size' && m.algorithm.startsWith('uf-union')) stale = true
			return lines
		})
		.join('\n')
}

/** How a graph's code reads: directed (a DiGraph) or not, its weights written or not (as the graph shows them). */
export interface GraphKind {
	directed: boolean
	weighted: boolean
}

/** A graph's moves, a line each: vertices by their labels, as the graph's code (BFS, DFS...) names them. */
function graphLines(move: GraphMove, s: Spelling, kind: GraphKind): string[] {
	const { name: g, language } = s
	const [py, java] = [language === 'python', language === 'java']
	const label = (x: string) => JSON.stringify(x)
	const callOn = (m: [string, string], ...args: string[]) =>
		py ? `${g}.${m[0]}(${args.join(', ')})` : java ? `${g}.${m[1]}(${args.join(', ')});` : `${m[1]}(${[g, ...args].join(', ')});`
	const edge = (from: string, to: string, weight: string) => callOn(['add_edge', 'addEdge'], label(from), label(to), ...(kind.weighted ? [literal(weight, { ...s, ints: true })] : []))
	const build = (vertices: string[], edges: [string, string, string][], fresh: boolean) => {
		const cls = kind.directed ? 'DiGraph' : 'Graph'
		const all = vertices.map(label).join(', ')
		const head = py
			? `${g} = ${cls}([${all}])`
			: java
				? `${fresh ? `${cls} ` : ''}${g} = new ${cls}(${all});`
				: `${fresh ? `${cls} *` : ''}${g} = new${cls}(${vertices.length}, (const char *[]){${all}});`
		return [head, ...edges.map(([from, to, weight]) => edge(from, to, weight))]
	}
	switch (move.op) {
		case 'new':
			return build(move.vertices, move.edges, true)
		case 'assign':
			return build(move.vertices, move.edges, false)
		case 'addVertex':
			return [callOn(['add_vertex', 'addVertex'], label(move.v))]
		case 'removeVertex':
			return [callOn(['remove_vertex', 'removeVertex'], label(move.v))]
		case 'rename':
			return [callOn(['rename_vertex', 'renameVertex'], label(move.from), label(move.to))]
		case 'addEdge':
			return [edge(move.from, move.to, move.weight)]
		case 'removeEdge':
			return [callOn(['remove_edge', 'removeEdge'], label(move.from), label(move.to))]
		case 'weight':
			return [callOn(['set_weight', 'setWeight'], label(move.from), label(move.to), literal(move.weight, { ...s, ints: true }))]
	}
}

/** A graph's log written out in `language`. */
export function renderGraphLog(moves: readonly GraphMove[], language: CodeLanguage, kind: GraphKind): string {
	const first = moves[0]
	const s: Spelling = { ints: false, name: first?.op === 'new' ? first.name : 'g', language }
	return moves.flatMap((m) => graphLines(m, s, kind)).join('\n')
}
