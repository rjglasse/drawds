import type { CodeSource } from '../code/algorithms'
import type { CodeLanguage } from '../code/highlight'

// The list variants' code: doubly linked, circular and sentinel lists (any mix, with a tail or not),
// whose operations narrate the extra assignments each variant needs. Each operation is written once,
// against a language (Java, C, Python: how each spells a field, null, a declaration, a loop), with
// the variant's flags deciding its lines as they decide its steps in `operations.ts`; the plain
// singly linked list's code is written out by hand in `code.ts`. Tags as there: `@line` for the
// steps' `line`, `$name` for the values shown.

export interface ListFlags {
	doubly: boolean
	circular: boolean
	sentinel: boolean
	tail: boolean
}

const FLAGS = ['doubly', 'circular', 'sentinel', 'tail'] as const

/** An operation's code id for a variant: the base, then the flags that change its code (`list-insert-doubly-tail`). */
export function variantId(base: string, flags: ListFlags, relevant: readonly (keyof ListFlags)[]): string {
	return base + FLAGS.filter((f) => relevant.includes(f) && flags[f]).map((f) => `-${f}`).join('')
}

/** How a language spells the pieces of list code. */
interface Lang {
	id: CodeLanguage
	nil: string
	/** A node's field: curr.next, curr->next. */
	at(obj: string, field: string): string
	/** The list's own field: head, list->head, self.head. */
	own(field: 'head' | 'tail'): string
	/** A statement as written: with a semicolon, or not. */
	st(s: string): string
	/** A node variable declared and set (one, or several with their values). */
	nodes(...pairs: [string, string][]): string
	/** Several node variables set to the same node. */
	same2(a: string, b: string, value: string): string
	int(name: string, value: string): string
	newNode(value: string): string
	/** The same node, or not. */
	is(a: string, b: string): string
	isNot(a: string, b: string): string
	/** Values compared. */
	eq(a: string, b: string): string
	and(a: string, b: string): string
	print(x: string): string
	ret(x: string): string
	inc(x: string): string
	braces: boolean
}

const java: Lang = {
	id: 'java',
	nil: 'null',
	at: (o, f) => `${o}.${f}`,
	own: (f) => f,
	st: (s) => `${s};`,
	nodes: (...pairs) => `Node ${pairs.map(([n, v]) => `${n} = ${v}`).join(', ')};`,
	same2: (a, b, v) => `Node ${a} = ${v}, ${b} = ${v};`,
	int: (n, v) => `int ${n} = ${v};`,
	newNode: (v) => `new Node(${v})`,
	is: (a, b) => `${a} == ${b}`,
	isNot: (a, b) => `${a} != ${b}`,
	eq: (a, b) => `${a} == ${b}`,
	and: (a, b) => `${a} && ${b}`,
	print: (x) => `System.out.println(${x});`,
	ret: (x) => `return ${x};`,
	inc: (x) => `${x}++;`,
	braces: true,
}

const c: Lang = {
	...java,
	id: 'c',
	nil: 'NULL',
	at: (o, f) => `${o}->${f}`,
	own: (f) => `list->${f}`,
	nodes: (...pairs) => `Node ${pairs.map(([n, v]) => `*${n} = ${v}`).join(', ')};`,
	same2: (a, b, v) => `Node *${a} = ${v}, *${b} = ${v};`,
	newNode: (v) => `newNode(${v})`,
	print: (x) => `printf("%d\\n", ${x});`,
}

const python: Lang = {
	id: 'python',
	nil: 'None',
	at: (o, f) => `${o}.${f}`,
	own: (f) => `self.${f}`,
	st: (s) => s,
	nodes: (...pairs) => `${pairs.map(([n]) => n).join(', ')} = ${pairs.map(([, v]) => v).join(', ')}`,
	same2: (a, b, v) => `${a} = ${b} = ${v}`,
	int: (n, v) => `${n} = ${v}`,
	newNode: (v) => `Node(${v})`,
	is: (a, b) => `${a} is ${b}`,
	isNot: (a, b) => `${a} is not ${b}`,
	eq: (a, b) => `${a} == ${b}`,
	and: (a, b) => `${a} and ${b}`,
	print: (x) => `print(${x})`,
	ret: (x) => `return ${x}`,
	inc: (x) => `${x} += 1`,
	braces: false,
}

const LANGS = [java, c, python]

/** Lines of code as they are written, block by block, then laid out with their tags. */
class Writer {
	private lines: [number, string, string?][] = []
	private depth = 0
	constructor(readonly L: Lang) {}

	line(text: string, tags?: string) {
		this.lines.push([this.depth, text, tags])
	}
	/** A signature (or any line opening a block): `{` after it, or `:` in Python. */
	open(text: string, tags?: string) {
		this.line(this.L.braces ? `${text} {` : `${text}:`, tags)
		this.depth++
	}
	close() {
		this.depth--
		if (this.L.braces) this.line('}')
	}
	loop(kind: 'while' | 'if', cond: string, tags?: string) {
		this.open(this.L.braces ? `${kind} (${cond})` : `${kind} ${cond}`, tags)
	}
	orElse() {
		this.depth--
		this.line(this.L.braces ? '} else {' : 'else:')
		this.depth++
	}
	/** `if (cond) s;` on one line, as the hand-written code has it; Python's body under its if, tagged. */
	ifThen(cond: string, s: string, tags?: string) {
		if (this.L.braces) return this.line(`if (${cond}) ${this.L.st(s)}`, tags)
		this.line(`if ${cond}:`)
		this.depth++
		this.line(s, tags)
		this.depth--
	}
	/** if / else with one statement each, each its tag. */
	ifElse(cond: string, a: string, aTags: string, b: string, bTags: string) {
		if (this.L.braces) {
			this.line(`if (${cond}) ${this.L.st(a)}`, aTags)
			return this.line(`else ${this.L.st(b)}`, bTags)
		}
		this.line(`if ${cond}:`)
		this.depth++
		this.line(a, aTags)
		this.depth--
		this.line('else:')
		this.depth++
		this.line(b, bTags)
		this.depth--
	}
	/** `while (cond)` with a one-statement body under it, tagged. */
	whileOne(cond: string, s: string, tags?: string) {
		this.line(this.L.braces ? `while (${cond})` : `while ${cond}:`)
		this.depth++
		this.line(this.L.st(s), tags)
		this.depth--
	}
	/** A loop whose test comes after its body (round a circle: `do { ... } while (curr != head)`); Python breaks out. */
	doWhile(body: () => void, goOn: string, stop: string) {
		this.line(this.L.braces ? 'do {' : 'while True:')
		this.depth++
		body()
		if (this.L.braces) {
			this.depth--
			this.line(`} while (${goOn});`)
		} else {
			this.line(`if ${stop}:`)
			this.depth++
			this.line('break')
			this.depth -= 2
		}
	}
	st(s: string, tags?: string) {
		this.line(this.L.st(s), tags)
	}
	text() {
		return '\n' + this.lines.map(([d, t, tags]) => '    '.repeat(d) + t + (tags ? `  ${tags}` : '')).join('\n')
	}
}

/** A signature per language. */
type Sig = Record<CodeLanguage, string>

/** Written once, for every language. */
function write(build: (w: Writer, L: Lang) => void): CodeSource {
	const out: Partial<Record<CodeLanguage, string>> = {}
	for (const L of LANGS) {
		const w = new Writer(L)
		build(w, L)
		out[L.id] = w.text()
	}
	return out as CodeSource
}

const sig = (w: Writer, s: Sig, tags?: string) => w.open(s[w.L.id], tags)

/** Where a walk from the first value stops: null, or round a circle at the head (the sentinel, with one). */
const ends = (L: Lang, f: ListFlags) => (f.circular ? L.own('head') : L.nil)
/** The first value: head, or past the sentinel. */
const first = (L: Lang, f: ListFlags) => (f.sentinel ? L.at(L.own('head'), 'next') : L.own('head'))

/**
 * A walk over every value: `body` for each, then curr = curr.next; round a circle with no sentinel
 * a do-while, its test after the body, or it would stop before it started.
 */
function walk(w: Writer, f: ListFlags, body: () => void, step = 'next') {
	const L = w.L
	const next = () => w.st(`curr = ${L.at('curr', step)}`)
	if (f.circular && !f.sentinel) {
		w.doWhile(
			() => {
				body()
				next()
			},
			L.isNot('curr', L.own('head')),
			L.is('curr', L.own('head'))
		)
		return
	}
	w.loop('while', L.isNot('curr', ends(L, f)))
	body()
	next()
	w.close()
}

// The operations, each for one variant.

const find = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'int indexOf(int value)', c: 'int indexOf(List *list, int value)', python: 'def index_of(self, value)' }, '$value')
		w.line(L.nodes(['curr', first(L, f)]), '@start $curr')
		w.line(L.int('i', '0'), '$i')
		const body = () => {
			w.ifThen(L.eq(L.at('curr', 'value'), 'value'), L.ret('i').replace(/;$/, ''), '@found')
		}
		if (f.circular && !f.sentinel) {
			w.doWhile(
				() => {
					body()
					w.st(`curr = ${L.at('curr', 'next')}`, '@next')
					w.line(L.inc('i'))
				},
				L.isNot('curr', L.own('head')),
				L.is('curr', L.own('head'))
			)
		} else {
			w.loop('while', L.isNot('curr', ends(L, f)))
			body()
			w.st(`curr = ${L.at('curr', 'next')}`, '@next')
			w.line(L.inc('i'))
			w.close()
		}
		w.line(L.ret('-1'), '@missing')
		w.close()
	})

const count = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'int size()', c: 'int size(List *list)', python: 'def size(self)' })
		w.line(L.int('count', '0'), '@start $count')
		w.line(L.nodes(['curr', first(L, f)]), '$curr')
		walk(w, f, () => w.line(L.inc('count'), '@count'))
		w.line(L.ret('count'), '@done')
		w.close()
	})

const print = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void print()', c: 'void print(List *list)', python: 'def print_list(self)' })
		w.line(L.nodes(['curr', first(L, f)]), '@start $curr')
		walk(w, f, () => w.line(L.print(L.at('curr', 'value')), '@print'))
		w.close()
	})

/** Back to front (doubly linked): from the tail, from head.prev round a circle, or walking to the end first. */
const printBackwards = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void printBackwards()', c: 'void printBackwards(List *list)', python: 'def print_backwards(self)' })
		const head = L.own('head')
		const last = f.tail ? L.own('tail') : L.at(head, 'prev')
		if (f.tail || f.circular) w.line(L.nodes(['curr', last]), '@start $curr')
		else {
			w.line(L.nodes(['curr', first(L, f)]), '@start $curr')
			w.whileOne(L.isNot(L.at('curr', 'next'), L.nil), `curr = ${L.at('curr', 'next')}`, '@walk')
		}
		const body = () => {
			w.line(L.print(L.at('curr', 'value')), '@print')
			w.st(`curr = ${L.at('curr', 'prev')}`)
		}
		if (f.sentinel) {
			// Back at the sentinel, before the first value.
			w.loop('while', L.isNot('curr', head))
			body()
			w.close()
		} else if (f.circular) {
			w.doWhile(body, L.isNot('curr', last), L.is('curr', last))
		} else {
			w.loop('while', L.isNot('curr', L.nil))
			body()
			w.close()
		}
		w.close()
	})

/** The middle, with a sentinel: the walk starts past it. */
const middle = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'Node middle()', c: 'Node *middle(List *list)', python: 'def middle(self)' })
		w.line(L.same2('slow', 'fast', first(L, f)), '@start $slow $fast')
		w.loop('while', L.and(L.isNot('fast', L.nil), L.isNot(L.at('fast', 'next'), L.nil)))
		w.st(`slow = ${L.at('slow', 'next')}`, '@step')
		w.st(`fast = ${L.at(L.at('fast', 'next'), 'next')}`)
		w.close()
		w.line(L.ret('slow'), '@done')
		w.close()
	})

/** Floyd's cycle start, with a sentinel: slow and fast start past it, and slow starts there again. */
const floyd = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'Node cycleStart()', c: 'Node *cycleStart(List *list)', python: 'def cycle_start(self)' })
		w.line(L.same2('slow', 'fast', first(L, f)), '@start $slow $fast')
		w.loop('while', L.and(L.isNot('fast', L.nil), L.isNot(L.at('fast', 'next'), L.nil)))
		w.st(`slow = ${L.at('slow', 'next')}`, '@step')
		w.st(`fast = ${L.at(L.at('fast', 'next'), 'next')}`)
		w.loop('if', L.is('slow', 'fast'), '@meet')
		w.st(`slow = ${first(L, f)}`, '@restart')
		w.loop('while', L.isNot('slow', 'fast'))
		w.st(`slow = ${L.at('slow', 'next')}`, '@walk')
		w.st(`fast = ${L.at('fast', 'next')}`)
		w.close()
		w.line(L.ret('slow'), '@found')
		w.close()
		w.close()
		w.line(L.ret(L.nil), '@none')
		w.close()
	})

/**
 * The lines after curr, in insertAfter's order: the new node, its next (and prev), the node after
 * it pointing back (doubly), curr pointing at it, a tail moving on when curr was the last.
 */
function linkAfter(w: Writer, f: ListFlags) {
	const L = w.L
	w.line(L.nodes(['node', L.newNode('value')]), '@new $node')
	w.st(`${L.at('node', 'next')} = ${L.at('curr', 'next')}`, '@link')
	if (f.doubly) {
		w.st(`${L.at('node', 'prev')} = curr`, '@link-prev')
		const back = `${L.at(L.at('curr', 'next'), 'prev')} = node`
		// Round a circle there is always a node after.
		if (f.circular) w.st(back, '@back')
		else w.ifThen(L.isNot(L.at('curr', 'next'), L.nil), back, '@back')
	}
	w.st(`${L.at('curr', 'next')} = node`, '@point')
	if (f.tail) w.ifThen(L.is('curr', L.own('tail')), `${L.own('tail')} = node`, '@tail')
}

const insertAfter = (f: ListFlags) =>
	write((w) => {
		sig(
			w,
			{
				java: 'void insertAfter(Node curr, int value)',
				c: f.tail ? 'void insertAfter(List *list, Node *curr, int value)' : 'void insertAfter(Node *curr, int value)',
				python: 'def insert_after(self, curr, value)',
			},
			'@call $curr $value'
		)
		linkAfter(w, f)
		w.close()
	})

/**
 * Round a circle without a sentinel, the last node, which must point at a new first one: head.prev
 * (doubly), the tail, or found by walking round.
 */
function findLast(w: Writer, f: ListFlags) {
	const L = w.L
	const head = L.own('head')
	if (f.doubly) return w.line(L.nodes(['last', L.at(head, 'prev')]), '@find-last $last')
	if (f.tail) return w.line(L.nodes(['last', L.own('tail')]), '@find-last $last')
	w.line(L.nodes(['last', head]), '@find-last $last')
	w.whileOne(L.isNot(L.at('last', 'next'), head), `last = ${L.at('last', 'next')}`, '@walk-last')
}

/**
 * Insert at the head. With a sentinel, the front is after it: insertAfter's lines with curr at the
 * sentinel, no special case. Without one, head moves; round a circle the last node points at the
 * new first one (found before head.prev changes), and doubly the new node points back at it.
 */
const insertHead = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void insertAtHead(int value)', c: 'void insertAtHead(List *list, int value)', python: 'def insert_at_head(self, value)' }, '$value')
		const head = L.own('head')
		if (f.sentinel) {
			w.line(L.nodes(['curr', head]), '@call $curr')
			linkAfter(w, f)
			return w.close()
		}
		w.line(L.nodes(['node', L.newNode('value')]), '@new $node')
		if (f.circular) findLast(w, f)
		w.st(`${L.at('node', 'next')} = ${head}`, '@link')
		if (f.doubly) {
			const back = `${L.at(head, 'prev')} = node`
			if (f.circular) w.st(back, '@back')
			else w.ifThen(L.isNot(head, L.nil), back, '@back')
		}
		if (f.circular) {
			w.st(`${L.at('last', 'next')} = node`, '@last')
			if (f.doubly) w.st(`${L.at('node', 'prev')} = last`, '@last-prev')
		}
		w.st(`${head} = node`, '@point')
		if (f.tail) w.ifThen(L.is(L.own('tail'), L.nil), `${L.own('tail')} = node`, '@tail')
		w.close()
	})

/**
 * Insert in order: prev and curr walk until curr's value isn't smaller, then the node goes between
 * them. With a sentinel prev starts at it, so there is no special case at the front (and round a
 * circle the walk stops back at it). Round a circle without one it isn't written: the front, which
 * also moves the last node's next, makes it another algorithm.
 */
const insertSorted = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void insertSorted(int value)', c: 'void insertSorted(List *list, int value)', python: 'def insert_sorted(self, value)' }, '$value')
		const head = L.own('head')
		const end = ends(L, f)
		w.line(f.sentinel ? L.nodes(['prev', head], ['curr', L.at(head, 'next')]) : L.nodes(['prev', L.nil], ['curr', head]), '@start $prev $curr')
		w.loop('while', L.and(L.isNot('curr', end), `${L.at('curr', 'value')} < value`))
		if (L.braces) {
			w.st('prev = curr')
			w.st(`curr = ${L.at('curr', 'next')}`, '@walk')
		} else w.line('prev, curr = curr, curr.next', '@walk')
		w.close()
		w.line(L.nodes(['node', L.newNode('value')]), '@new $node')
		w.st(`${L.at('node', 'next')} = curr`, '@link')
		if (f.doubly) {
			w.st(`${L.at('node', 'prev')} = prev`, '@link-prev')
			if (f.circular) w.st(`${L.at('curr', 'prev')} = node`, '@back')
			else w.ifThen(L.isNot('curr', L.nil), `${L.at('curr', 'prev')} = node`, '@back')
		}
		if (f.sentinel) w.st(`${L.at('prev', 'next')} = node`, '@point')
		else w.ifElse(L.is('prev', L.nil), `${head} = node`, '@point-head', `${L.at('prev', 'next')} = node`, '@point')
		if (f.tail) w.ifThen(L.is('curr', end), `${L.own('tail')} = node`, '@tail')
		w.close()
	})

/**
 * Append: from the tail, or walking to the last node (from the head: the sentinel, if there is one).
 * Round a circle the new last node points back at the head (and doubly, the head back at it).
 */
const append = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void append(int value)', c: 'void append(List *list, int value)', python: 'def append(self, value)' }, f.tail ? '@call $value' : '$value')
		const head = L.own('head')
		const at = f.tail ? L.own('tail') : 'curr'
		if (!f.tail) {
			w.line(L.nodes(['curr', head]), '@start $curr')
			w.whileOne(L.isNot(L.at('curr', 'next'), ends(L, f)), `curr = ${L.at('curr', 'next')}`, '@walk')
		}
		w.line(L.nodes(['node', L.newNode('value')]), '@new $node')
		if (f.circular) w.st(`${L.at('node', 'next')} = ${L.at(at, 'next')}`, '@link')
		if (f.doubly) w.st(`${L.at('node', 'prev')} = ${at}`, '@link-prev')
		w.st(`${L.at(at, 'next')} = node`, '@point')
		if (f.doubly && f.circular) w.st(`${L.at(head, 'prev')} = node`, '@back')
		if (f.tail) w.st(`${L.own('tail')} = node`, '@tail')
		w.close()
	})

/**
 * Remove a value: prev and curr walk to it, then the arrow before it goes round it. With a sentinel
 * prev starts at it: no special case for the first value. Without one, the head moves, and round a
 * circle the last node (found first) points at the new head. Doubly, the node after points back
 * past it; a tail on it moves back.
 */
const remove = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void remove(int value)', c: 'void removeValue(List *list, int value)', python: 'def remove(self, value)' }, '$value')
		const head = L.own('head')
		w.line(f.sentinel ? L.nodes(['prev', head], ['curr', L.at(head, 'next')]) : L.nodes(['prev', L.nil], ['curr', head]), '@start $prev $curr')
		w.loop('while', `${L.at('curr', 'value')} != value`)
		if (L.braces) {
			w.st('prev = curr')
			w.st(`curr = ${L.at('curr', 'next')}`, '@walk')
		} else w.line('prev, curr = curr, curr.next', '@walk')
		w.close()
		const back = `${L.at(L.at('curr', 'next'), 'prev')} = prev`
		const pointBack = () => {
			if (!f.doubly) return
			if (f.circular) w.st(back, '@back')
			else w.ifThen(L.isNot(L.at('curr', 'next'), L.nil), back, '@back')
		}
		if (f.sentinel) {
			w.st(`${L.at('prev', 'next')} = ${L.at('curr', 'next')}`, '@unlink')
			pointBack()
		} else if (f.circular) {
			// The head goes: the last node must point at the next one.
			w.loop('if', L.is('prev', L.nil))
			findLast(w, f)
			w.st(`${head} = ${L.at('curr', 'next')}`, '@unlink-head')
			if (f.doubly) w.st(`${L.at(head, 'prev')} = last`, '@back-head')
			w.st(`${L.at('last', 'next')} = ${head}`, '@last')
			w.orElse()
			w.st(`${L.at('prev', 'next')} = ${L.at('curr', 'next')}`, '@unlink')
			pointBack()
			w.close()
		} else {
			w.ifElse(L.is('prev', L.nil), `${head} = ${L.at('curr', 'next')}`, '@unlink-head', `${L.at('prev', 'next')} = ${L.at('curr', 'next')}`, '@unlink')
			pointBack()
		}
		if (f.tail) w.ifThen(L.is('curr', L.own('tail')), `${L.own('tail')} = prev`, '@tail')
		if (L.id === 'c') w.line('free(curr);')
		w.close()
	})

/** The last node of a doubly linked list with a tail: no walk, tail.prev is the node before it. */
const removeLast = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void removeLast()', c: 'void removeLast(List *list)', python: 'def remove_last(self)' })
		w.line(L.nodes(['curr', L.own('tail')]), '@jump $curr')
		w.line(L.nodes(['prev', L.at('curr', 'prev')]), '$prev')
		w.st(`${L.at('prev', 'next')} = ${L.at('curr', 'next')}`, '@unlink')
		// Round a circle the head points back past it.
		if (f.circular) w.st(`${L.at(L.at('curr', 'next'), 'prev')} = prev`, '@back')
		w.st(`${L.own('tail')} = prev`, '@tail')
		if (L.id === 'c') w.line('free(curr);')
		w.close()
	})

/**
 * Reverse in place. Singly: each arrow turned round as prev and curr walk. Doubly: each node's next
 * and prev swapped, curr moving on to the old next, the last node visited the new first. With a
 * sentinel the values start after it, and it points at the new first one (and doubly, the new last
 * one's next is null again, not the sentinel). A tail ends on the old first value.
 */
const reverse = (f: ListFlags) =>
	write((w, L) => {
		sig(w, { java: 'void reverse()', c: 'void reverse(List *list)', python: 'def reverse(self)' })
		const head = L.own('head')
		const start = first(L, f)
		const newFirst = f.doubly ? 'last' : 'prev'
		if (f.doubly) {
			w.line(L.nodes(['curr', start], ['last', L.nil]), '@start $curr')
			w.loop('while', L.isNot('curr', L.nil))
			w.line(L.nodes(['next', L.at('curr', 'next')]), '@swap $next')
			w.st(`${L.at('curr', 'next')} = ${L.at('curr', 'prev')}`)
			w.st(`${L.at('curr', 'prev')} = next`)
			w.st('last = curr')
			w.st('curr = next', '@move')
			w.close()
		} else {
			w.line(L.nodes(['prev', L.nil], ['curr', start]), '@start $prev $curr')
			w.loop('while', L.isNot('curr', L.nil))
			w.line(L.nodes(['next', L.at('curr', 'next')]), '@save $next')
			w.st(`${L.at('curr', 'next')} = prev`, '@turn')
			if (L.braces) {
				w.st('prev = curr')
				w.st('curr = next', '@move')
			} else w.line('prev, curr = curr, next', '@move')
			w.close()
		}
		if (f.tail) w.st(`${L.own('tail')} = ${start}`)
		if (f.sentinel) {
			if (f.doubly) {
				// The old first value's prev was the sentinel: swapped, it became its next.
				w.st(`${L.at(start, 'next')} = ${L.nil}`, '@fix')
				w.st(`${L.at(newFirst, 'prev')} = ${head}`)
			}
			w.st(`${L.at(head, 'next')} = ${newFirst}`, '@head')
		} else w.st(`${head} = ${newFirst}`, '@head')
		w.close()
	})

/** Each operation: how it is built, the flags that change its code, and which variants it is offered for. */
const OPERATIONS: Record<string, { build: (f: ListFlags) => CodeSource; relevant: readonly (keyof ListFlags)[]; for?: (f: ListFlags) => boolean }> = {
	'list-find': { build: find, relevant: ['circular', 'sentinel'] },
	'list-count': { build: count, relevant: ['circular', 'sentinel'] },
	'list-print': { build: print, relevant: ['circular', 'sentinel'] },
	'list-print-backwards': { build: printBackwards, relevant: ['circular', 'sentinel', 'tail'], for: (f) => f.doubly },
	'list-middle': { build: middle, relevant: ['sentinel'], for: (f) => !f.circular },
	'list-floyd': { build: floyd, relevant: ['sentinel'] },
	'list-insert': { build: insertAfter, relevant: ['doubly', 'circular', 'tail'] },
	'list-insert-head': { build: insertHead, relevant: ['doubly', 'circular', 'sentinel', 'tail'] },
	'list-insert-sorted': { build: insertSorted, relevant: ['doubly', 'circular', 'sentinel', 'tail'], for: (f) => !f.circular || f.sentinel },
	'list-append': { build: append, relevant: ['doubly', 'circular', 'sentinel', 'tail'] },
	'list-delete': { build: remove, relevant: ['doubly', 'circular', 'sentinel', 'tail'] },
	'list-delete-last': { build: removeLast, relevant: ['circular', 'sentinel'], for: (f) => f.doubly && f.tail },
	'list-reverse': { build: reverse, relevant: ['doubly', 'sentinel', 'tail'], for: (f) => !f.circular },
}

/** Every variant's code, for the operations above; the plain lists' own (hand-written in `code.ts`) left out. */
export const LIST_VARIANT_CODE: Record<string, CodeSource> = (() => {
	const all: Record<string, CodeSource> = {}
	for (let bits = 0; bits < 16; bits++) {
		const f: ListFlags = { doubly: !!(bits & 1), circular: !!(bits & 2), sentinel: !!(bits & 4), tail: !!(bits & 8) }
		for (const [base, op] of Object.entries(OPERATIONS)) {
			if (op.for && !op.for(f)) continue
			const id = variantId(base, f, op.relevant)
			// The plain list's code is hand-written (removeLast and print backwards have no plain version).
			const plain = !op.relevant.some((r) => r !== 'tail' && f[r])
			if (plain && base !== 'list-delete-last' || all[id]) continue
			all[id] = op.build(f)
		}
	}
	return all
})()

/** The code id an operation shows for a list of these flags, if it has code for them. */
export function listCodeId(base: string, f: ListFlags, cycle = false): string | undefined {
	const op = OPERATIONS[base]
	// A list with a cycle has no end to stop at: the walks' code never ends (Floyd's is the one that copes).
	if (cycle && base !== 'list-floyd') return undefined
	if (!op) return undefined
	if (op.for && !op.for(f)) return undefined
	return variantId(base, f, op.relevant)
}
