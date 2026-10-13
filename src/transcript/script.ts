import type { Editor, TLShape } from 'tldraw'
import { boardFileName } from '../files/names'
import { algorithmCode } from '../shapes/code/algorithms'
import { hashCodeId } from '../shapes/hash/code'
import type { HashScheme } from '../shapes/hash/hash'
import type { ArrayMove } from './array-moves'
import type { HashMove, HashTable } from './hash-moves'
import type { HeapMove } from './heap-moves'
import type { ListMove } from './list-moves'
import { isLogged, logOrStart, type Move } from './log'
import { renderLog } from './transcript'

// The board's code as one Python script that runs (dds-2tt.10): every structure's code beside it, in
// turn, after the classes and functions those call, made of drawds' own code (`algorithmCode`: what
// the code boxes show), only what the board uses. Then what the board shows now is printed, so a class
// can check the script leaves the structures as drawn. Java and C stay as the code boxes show them.

/** A structure on the board and its log. */
export interface Logged {
	shape: Pick<TLShape, 'type' | 'props'>
	log: readonly Move[]
}

const py = (id: string) => algorithmCode(id, 'python')?.text ?? ''

/** Python's top-level defs, by name, in order; a name's first def wins (helpers repeat across algorithms). */
function defsOf(texts: readonly string[]): Map<string, string> {
	const defs = new Map<string, string>()
	for (const text of texts) {
		for (const block of text.trim().split(/\n(?=def )/)) {
			const name = /^def (\w+)/.exec(block)?.[1]
			if (name && !defs.has(name)) defs.set(name, block.trimEnd())
		}
	}
	return defs
}

const indent = (text: string) =>
	text
		.split('\n')
		.map((line) => (line.trim() ? `    ${line}` : ''))
		.join('\n')

/** A class: its head, its own lines (an __init__, a __repr__), then methods from drawds' code. */
const klass = (head: string, own: readonly string[], methods: Iterable<string> = []) =>
	`class ${head}:\n${[...own, ...methods].map(indent).join('\n\n')}`

/** Every algorithm a log calls (an operation played and put in), nested ones too. */
function called(log: readonly Move[]): string[] {
	const out: string[] = []
	const walk = (m: Move) => {
		if (m.op !== 'call') return
		out.push(m.algorithm)
		for (const e of m.effect as Move[]) walk(e)
	}
	log.forEach(walk)
	return out
}

/** A list operation's plain singly linked version: the script's LinkedList has no tail, prev or sentinel. */
const plainList = (id: string) => id.replace(/(-doubly|-circular|-sentinel|-tail)+$/, '')

const NODE_REPR = `def __repr__(self):
    if self.left is None and self.right is None:
        return f'Node({self.value!r})'
    return f'Node({self.value!r}, {self.left!r}, {self.right!r})'`

/** The node every structure here makes: a list's (next), a tree's (left, right); a BST's and a hash chain's code call its value key. */
function nodeClass({ children, key }: { children: boolean; key: boolean }): string {
	const init = children
		? `def __init__(self, value, left=None, right=None):
    self.value = value
    self.left, self.right = left, right
    self.next = None`
		: `def __init__(self, value, next=None):
    self.value = value
    self.next = next`
	const alias = `@property
def key(self):
    return self.value

@key.setter
def key(self, key):
    self.value = key`
	return klass('Node', [init, ...(key ? [alias] : []), ...(children ? [NODE_REPR] : [])])
}

/** The values from a node on, along next: a cycle's once, then where it goes back to. */
const VALUES_FROM = `def values_from(node):
    out, seen = [], set()
    while node is not None and id(node) not in seen:
        seen.add(id(node))
        out.append(node.value)
        node = node.next
    return out if node is None else out + [f'... back to {node.value!r}']`

const LIST_OPS = ['list-insert-head', 'list-append', 'list-insert', 'list-delete', 'list-reverse']

function linkedList(calls: readonly string[]): string {
	const own = [
		`def __init__(self, values=()):
    self.head = None
    for value in reversed(list(values)):
        node = Node(value)
        node.next = self.head
        self.head = node`,
		`def node_at(self, i):
    curr = self.head
    for _ in range(i):
        curr = curr.next
    return curr`,
		`def remove_at(self, i):
    if i == 0:
        self.head = self.head.next
    else:
        prev = self.node_at(i - 1)
        prev.next = prev.next.next`,
		`def __repr__(self):
    return f'LinkedList({values_from(self.head)!r})'`,
	]
	const ops = [...LIST_OPS, ...calls.filter((id) => id.startsWith('list-')).map(plainList)]
	return klass('LinkedList', own, defsOf(ops.map(py)).values())
}

const linkedStack = (calls: readonly string[]) =>
	klass(
		'LinkedStack',
		[
			`def __init__(self, values=()):    # top first
    self.top = None
    for value in reversed(list(values)):
        self.push(value)`,
			`def __repr__(self):
    return f'LinkedStack({values_from(self.top)!r})'`,
		],
		defsOf(['linked-push', 'linked-pop', 'linked-peek', ...calls.filter((id) => /^linked-(push|pop|peek)$/.test(id))].map(py)).values()
	)

const linkedQueue = (calls: readonly string[]) =>
	klass(
		'LinkedQueue',
		[
			`def __init__(self, values=()):    # front first
    self.front = self.rear = None
    for value in values:
        self.enqueue(value)`,
			`def __repr__(self):
    return f'LinkedQueue({values_from(self.front)!r})'`,
		],
		defsOf(['linked-enqueue', 'linked-dequeue', 'linked-front', ...calls.filter((id) => /^linked-(enqueue|dequeue|front)$/.test(id))].map(py)).values()
	)

const arrayStack = klass(
	'ArrayStack',
	[
		`def __init__(self, capacity, values=()):
    self.a = [None] * capacity
    self.top = -1
    for value in values:
        self.push(value)`,
		`def __repr__(self):
    return f'ArrayStack({len(self.a)}, {self.a[:self.top + 1]!r})'`,
	],
	defsOf(['stack-push', 'stack-pop', 'stack-peek'].map(py)).values()
)

const arrayQueue = klass(
	'ArrayQueue',
	[
		`def __init__(self, capacity, values=()):
    self.a = [None] * capacity
    self.front = self.rear = self.size = 0
    for value in values:
        self.enqueue(value)`,
		`def __repr__(self):
    n = len(self.a)
    return f'ArrayQueue({n}, {[self.a[(self.front + k) % n] for k in range(self.size)]!r})'`,
	],
	defsOf(['queue-enqueue', 'queue-dequeue', 'queue-peek'].map(py)).values()
)

const tree = (calls: readonly string[]) =>
	klass(
		'Tree',
		[
			`def __init__(self, root=None):
    self.root = root`,
			// bst-delete's helper: what takes a node's place under its parent.
			`def replace(self, node, new):
    parent = self.parent_of(node)
    if parent is None:
        self.root = new
    elif parent.left is node:
        parent.left = new
    else:
        parent.right = new`,
			`def parent_of(self, node):
    stack = [self.root]
    while stack:
        p = stack.pop()
        if p is not None:
            if p.left is node or p.right is node:
                return p
            stack += [p.left, p.right]
    return None`,
			`def __repr__(self):
    return f'Tree({self.root!r})'`,
		],
		defsOf(['bst-insert', 'bst-delete', 'bst-search', ...calls.filter((id) => id.startsWith('bst-'))].map(py)).values()
	)

const TREE_FUNCTIONS = `def swap_children(node):
    node.left, node.right = node.right, node.left

def mirror(node):
    if node is None:
        return
    node.left, node.right = node.right, node.left
    mirror(node.left)
    mirror(node.right)`

/** A general tree's node: its value and a list of children, in order (named TreeNode beside other nodes). */
const generalNode = (name: string) =>
	klass(name, [
		`def __init__(self, value, children=()):
    self.value = value
    self.children = list(children)`,
		`def __repr__(self):
    if not self.children:
        return f'${name}({self.value!r})'
    return f'${name}({self.value!r}, {self.children!r})'`,
	])

/**
 * A trie, of drawds' own code: its methods in the class (those taking self), its helpers (collect,
 * delete_from) as functions after it, its node class TrieNode (the other structures' Node holds a value).
 */
function trie(): string {
	const defs = [...defsOf(['trie-insert', 'trie-contains', 'trie-prefix', 'trie-delete'].map(py)).values()].map((d) =>
		d.replace(/\bNode\(\)/g, 'TrieNode()')
	)
	const isMethod = (d: string) => /^def \w+\(self\b/.test(d)
	return [
		klass('TrieNode', [
			`def __init__(self):
    self.children = {}
    self.is_word = False`,
		]),
		klass(
			'Trie',
			[
				`def __init__(self, words=()):
    self.root = TrieNode()
    for word in words:
        self.insert(word)`,
				`def __repr__(self):
    return f'Trie({self.starts_with("")!r})'`,
			],
			defs.filter(isMethod)
		),
		...defs.filter((d) => !isMethod(d)),
	].join('\n\n')
}

const heap = (type: 'min' | 'max') =>
	klass(
		type === 'min' ? 'MinHeap' : 'MaxHeap',
		[
			`def __init__(self, values=()):
    self.heap = list(values)`,
			`def __repr__(self):
    return f'${type === 'min' ? 'MinHeap' : 'MaxHeap'}({self.heap!r})'`,
		],
		defsOf(['insert', 'extract', 'remove', 'build'].map((op) => py(`heap-${op}-${type}`))).values()
	)

const GRAPH = `class Graph:
    """Undirected: an edge goes both ways. adj[u][v] is its weight (None if it has none)."""
    directed = False

    def __init__(self, vertices=()):
        self.adj = {v: {} for v in vertices}

    def add_vertex(self, v):
        self.adj[v] = {}

    def remove_vertex(self, v):
        del self.adj[v]
        for edges in self.adj.values():
            edges.pop(v, None)

    def add_edge(self, u, v, weight=None):
        self.adj[u][v] = weight
        if not self.directed:
            self.adj[v][u] = weight

    def remove_edge(self, u, v):
        del self.adj[u][v]
        if not self.directed:
            del self.adj[v][u]

    def set_weight(self, u, v, weight):
        self.add_edge(u, v, weight)

    def rename_vertex(self, old, new):
        self.adj[new] = self.adj.pop(old)
        for edges in self.adj.values():
            if old in edges:
                edges[new] = edges.pop(old)

    def edges(self):
        pairs = [(u, v, w) for u in self.adj for v, w in self.adj[u].items() if self.directed or u <= v]
        return sorted((u, v) if w is None else (u, v, w) for u, v, w in pairs)

    def __repr__(self):
        return f'{type(self).__name__}({sorted(self.adj)!r}, edges={self.edges()!r})'


class DiGraph(Graph):
    """Directed: an edge goes from u to v."""
    directed = True`

const UNION_FIND = `class UnionFind:
    """by: union by 'size', 'rank' or 'naive'; compress: path compression in find. drawds' code for each below."""

    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n
        self.rank = [0] * n
        self.by = 'size'
        self.compress = True

    def make_set(self):
        self.parent.append(len(self.parent))
        self.size.append(1)
        self.rank.append(0)

    def find(self, i):
        return self.find_compress(i) if self.compress else self.find_plain(i)

    def union(self, a, b):
        return {'size': self.union_by_size, 'rank': self.union_by_rank, 'naive': self.union_naive}[self.by](a, b)

    def __repr__(self):
        return f'UnionFind(parent={self.parent!r})'`

const unionFind = () => {
	const own = (id: string) => (id.startsWith('uf-find') ? 'find' : id.startsWith('uf-connected') ? 'connected' : 'union')
	const renamed = (id: string, to: string) => defsOf([py(id)]).get(own(id))!.replace(/^def \w+/, `def ${to}`)
	return [
		UNION_FIND,
		...[
			renamed('uf-find', 'find_plain'),
			renamed('uf-find-compress', 'find_compress'),
			renamed('uf-union-size', 'union_by_size'),
			renamed('uf-union-rank', 'union_by_rank'),
			renamed('uf-union-naive', 'union_naive'),
			// Same set?: both finds (as the kind finds), the roots compared.
			renamed('uf-connected', 'connected'),
		].map(indent),
	].join('\n\n')
}

const DELETED = `class Deleted:
    """A probing table's deleted marker: probes go past it."""

    def __repr__(self):
        return 'DELETED'


DELETED = Deleted()`

const NEXT_PRIME = `def next_prime(n):
    def prime(p):
        return p >= 2 and all(p % d for d in range(2, int(p ** 0.5) + 1))
    while not prime(n):
        n += 1
    return n`

const schemeKey = (t: HashScheme) => `${t.strategy}-${t.code}-${t.compress}`

/** A hash table's class for one scheme: its operations and index(key) (an integer key is its own hash code). */
function hashClass(name: string, scheme: HashScheme): string {
	const id = (op: 'insert' | 'find' | 'delete' | 'rehash', ints: boolean) => hashCodeId(op, { ...scheme, ints })
	const ops = defsOf((['insert', 'find', 'delete', 'rehash'] as const).map((op) => py(id(op, true))))
	ops.delete('index')
	const index = (ints: boolean, as: string) => defsOf([py(id('insert', ints))]).get('index')!.replace(/^def index/, `def ${as}`)
	const direct = scheme.code === 'direct'
	const indexes = direct
		? [index(true, 'index')]
		: [
				index(true, 'index_int'),
				index(false, 'index_text'),
				`def index(self, key):
    return self.index_int(key) if isinstance(key, int) else self.index_text(key)`,
			]
	const chaining = scheme.strategy === 'chaining'
	const repr = chaining
		? `def __repr__(self):
    return f'${name}({self.m}, {[values_from(x) for x in self.table]!r})'`
		: `def __repr__(self):
    return f'${name}({self.m}, {self.table!r})'`
	return klass(
		name,
		[
			`def __init__(self, m, keys=()):
    self.m = m
    self.table = [None] * m
    for key in keys:
        self.insert(key)`,
			repr,
		],
		[...ops.values(), ...indexes]
	)
}

/** The tables a hash table's log makes, in order. */
function tablesOf(log: readonly Move[]): HashTable[] {
	const out: HashTable[] = []
	const walk = (m: HashMove) => {
		if (m.op === 'new' || m.op === 'assign') out.push(m.table)
		if (m.op === 'call') m.effect.forEach(walk)
	}
	;(log as HashMove[]).forEach(walk)
	return out
}

/** A random shuffle can't run the same twice: the script shuffles, then puts the order the board got. */
const shuffled = (text: string) =>
	text.replace(/^(\s*)random\.shuffle\((.+?)\) {4}# came out (\[.*\])$/gm, '$1random.shuffle($2)\n$1$2[:] = $3    # as it came out on the board')

/** What a structure is, for the comment over its code. */
function titleOf({ type, props }: Logged['shape']): string {
	const kind = (props as { kind?: string }).kind
	if (type === 'array' && (kind === 'stack' || kind === 'queue')) return `a ${kind}`
	if (type === 'linked-list' && (kind === 'stack' || kind === 'queue')) return `a linked ${kind}`
	if (type === 'binary-tree' && kind === 'bst') return 'a binary search tree'
	return TITLES[type] ?? type
}

const TITLES: Record<string, string> = {
	array: 'an array',
	'linked-list': 'a linked list',
	'binary-tree': 'a binary tree',
	'general-tree': 'a general tree',
	trie: 'a trie',
	graph: 'a graph',
	heap: 'a heap',
	'hash-table': 'a hash table',
	matrix: 'a matrix',
	'union-find': 'union-find',
}

/** The name a log gives its structure. */
const nameOf = (log: readonly Move[]) => (log[0] && 'name' in log[0] ? log[0].name : undefined)

/**
 * The board's structures as one Python script: the classes and functions their code calls, each
 * structure's code in turn (each under a name of its own), then each printed.
 */
export function boardScript(structures: readonly Logged[]): string {
	// Names apart: two structures with no log yet may have been given the same one.
	const taken = new Set<string>()
	const named = structures.map(({ shape, log }) => {
		const want = nameOf(log) ?? 'a'
		let name = want
		for (let k = 2; taken.has(name); k++) name = `${want}${k}`
		taken.add(name)
		const renamed = name === want ? log : ([{ ...log[0], name }, ...log.slice(1)] as Move[])
		return { shape, log: renamed, name }
	})

	const kinds = (type: string) => named.filter((s) => s.shape.type === type)
	const allCalls = named.flatMap((s) => called(s.log))
	const lists = kinds('linked-list')
	const listKind = (k: string) =>
		lists.some(({ log }) =>
			(log as ListMove[]).some((m) => (m.op === 'new' || m.op === 'assign') && (m.kind ?? 'list') === k)
		)
	const fixed = (as: 'stack' | 'queue') =>
		kinds('array').some(({ log }) => (log as ArrayMove[]).some((m) => (m.op === 'new' || m.op === 'assign') && m.fixed?.as === as))
	const heaps = (type: 'min' | 'max') =>
		kinds('heap').some(({ log }) => (log as HeapMove[]).some((m) => (m.op === 'new' || m.op === 'assign') && m.type === type))
	const trees = kinds('binary-tree')
	const tables = kinds('hash-table')

	// A class per hash scheme: named for its strategy, numbered if the board has more than one scheme of it.
	const schemes = new Map<string, { name: string; scheme: HashScheme }>()
	for (const t of tables.flatMap(({ log }) => tablesOf(log))) {
		const key = schemeKey(t)
		if (schemes.has(key)) continue
		const base = t.strategy === 'chaining' ? 'ChainingHashTable' : 'ProbingHashTable'
		const same = [...schemes.values()].filter((s) => s.scheme.strategy === t.strategy).length
		schemes.set(key, { name: same ? `${base}${same + 1}` : base, scheme: { strategy: t.strategy, code: t.code, compress: t.compress } })
	}
	const classOf = (table: HashTable) => schemes.get(schemeKey(table))!.name

	const chains = [...schemes.values()].some((s) => s.scheme.strategy === 'chaining')
	const nodes = lists.length > 0 || chains || trees.length > 0
	const generalTrees = kinds('general-tree')
	// A general tree's Node(value, [children]) beside the other nodes' Node: a class of its own.
	const generalClass = nodes ? 'TreeNode' : 'Node'

	const bodies = named.map(({ shape, log, name }) => {
		let text = shuffled(renderLog(shape as TLShape, log, 'python', classOf))
		// A chain laid out node by node, Node(key, next), beside a tree's Node(value, left, right).
		if (shape.type === 'hash-table' && trees.length) text = text.replace(/\bNode\(/g, 'ChainNode(')
		if (shape.type === 'general-tree' && nodes) text = text.replace(/\bNode\(/g, 'TreeNode(')
		return `# ${name}: ${titleOf(shape)}\n${text}`
	})
	const code = bodies.join('\n\n')

	const parts: string[] = [
		...(/\brandom\./.test(code) ? ['import random'] : []),
		...(nodes ? [nodeClass({ children: trees.length > 0, key: chains || trees.length > 0 })] : []),
		...(lists.length || chains ? [VALUES_FROM] : []),
		...(chains && trees.length && /\bChainNode\(/.test(code)
			? [
					`class ChainNode(Node):
    def __init__(self, key, next=None):
        super().__init__(key)
        self.next = next`,
				]
			: []),
		...(listKind('list') ? [linkedList(allCalls)] : []),
		...(listKind('stack') ? [linkedStack(allCalls)] : []),
		...(listKind('queue') ? [linkedQueue(allCalls)] : []),
		...(fixed('stack') ? [arrayStack] : []),
		...(fixed('queue') ? [arrayQueue] : []),
		...(trees.length ? [tree(allCalls), TREE_FUNCTIONS] : []),
		...(generalTrees.length ? [generalNode(generalClass)] : []),
		...(kinds('trie').length ? [trie()] : []),
		...(heaps('min') ? [heap('min')] : []),
		...(heaps('max') ? [heap('max')] : []),
		...(kinds('graph').length ? [GRAPH] : []),
		...(kinds('union-find').length ? [unionFind()] : []),
		...(schemes.size ? [...([...schemes.values()].some((s) => s.scheme.strategy === 'probing') ? [DELETED] : []), NEXT_PRIME] : []),
		...[...schemes.values()].map(({ name, scheme }) => hashClass(name, scheme)),
		// The arrays' algorithms called (bubble_sort(a)...), each as drawds shows it.
		...defsOf(kinds('array').flatMap(({ log }) => called(log)).map(py)).values(),
	]
	const header = [
		'# The board in drawds, as Python: python3 this-file.py',
		'# Each structure is made and changed as the board was, in the code beside it. The classes',
		"# and functions first are drawds' own code (as its code boxes show it).",
	].join('\n')
	const printed = named.map(({ name }) => `print(${JSON.stringify(`${name} =`)}, ${name})`)
	return [header, ...parts, code, `# What the board shows now:\n${printed.join('\n')}`].join('\n\n\n') + '\n'
}

/** The board's structures, top to bottom then left to right, each with its log. */
export function boardStructures(editor: Editor): Logged[] {
	return editor
		.getCurrentPageShapes()
		.filter(isLogged)
		.map((shape) => ({ shape, box: editor.getShapePageBounds(shape) }))
		.sort((a, b) => (a.box?.y ?? 0) - (b.box?.y ?? 0) || (a.box?.x ?? 0) - (b.box?.x ?? 0))
		.map(({ shape }) => ({ shape, log: logOrStart(editor, shape) }))
}

/** Download the board's code as a Python script, named after the board. */
export function downloadBoardScript(editor: Editor) {
	const script = boardScript(boardStructures(editor))
	const name = boardFileName(editor.getDocumentSettings().name || 'board').replace(/\.tldr$/, '.py')
	const doc = editor.getContainer().ownerDocument
	const url = URL.createObjectURL(new Blob([script], { type: 'text/x-python' }))
	const a = doc.createElement('a')
	a.href = url
	a.download = name
	a.click()
	setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
