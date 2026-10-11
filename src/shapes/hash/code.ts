import type { CodeSource } from '../code/algorithms'
import type { CodeLanguage } from '../code/highlight'
import { MAD, type HashCode, type HashCompression, type HashStrategy } from './hash-shape-types'

// The hash table operations' code, as a code box beside the table shows it while one plays: insert,
// find (contains) and delete (remove) for separate chaining (a chain of nodes per bucket, a new key
// chained on at the end) and linear probing (a slot each, at most m tried, a delete leaving a DELETED
// marker), and rehash; under each, index(key): the table's hash code compressed to a bucket, as the
// shape's scheme says (an integer key is its own hash code, as Java's Integer.hashCode; direct
// addressing, the key is the index). Keys only: a value carried as key:value rides along with its
// key. Tags as in `src/shapes/code/algorithms.ts`.

export type HashOp = 'insert' | 'find' | 'delete' | 'rehash'

/** What decides the code: the strategy, whether the keys are integers, the hash code and compression. */
export interface HashCodeOptions {
	strategy: HashStrategy
	ints: boolean
	code: HashCode
	compress: HashCompression
}

/** The code id for an operation on a table like this. */
export function hashCodeId(op: HashOp, o: HashCodeOptions): string {
	// Integer keys are their own hash code: only the compression differs (direct addressing has none).
	const hash = o.code === 'direct' ? 'direct' : o.ints ? `int-${o.compress}` : `${o.code}-${o.compress}`
	return `hash-${op}-${o.strategy}-${hash}`
}

const intKeys = (o: HashCodeOptions) => o.ints || o.code === 'direct'

/** index(key): the hash code, compressed. */
function indexFn(language: CodeLanguage, o: HashCodeOptions): string[] {
	const { a, b, p } = MAD
	const [java, py] = [language === 'java', language === 'python']
	const keyType = intKeys(o) ? 'int ' : java ? 'String ' : 'const char *'
	const m = java ? 'm' : py ? 'self.m' : 't->m'
	// Java's floorMod and Python's % never give a negative index; C's % can, so floorMod folds it back.
	const wrap = (x: string) => (x.includes(' ') ? `(${x})` : x)
	const mod = (x: string, n: string) => (py ? `${wrap(x)} % ${n}` : java ? `Math.floorMod(${x}, ${n})` : `floorMod(${x}, ${n})`)
	const end = py ? '' : ';'
	const L = [py ? 'def index(self, key):' : java ? `int index(${keyType}key) {` : `int indexOf(Table *t, ${keyType}key) {`]
	if (o.code === 'direct') L.push(`    return key${end}    ${py ? '#' : '//'} the key is the index`)
	else {
		let h = 'key'
		if (!o.ints) {
			h = 'h'
			if (o.code === 'sum') {
				if (py) L.push('    h = sum(ord(ch) for ch in key)    # character codes added')
				else if (java) L.push('    int h = 0;', '    for (char ch : key.toCharArray()) h += ch;    // character codes added')
				else L.push('    int h = 0;', '    for (const char *ch = key; *ch; ch++) h += *ch;    // character codes added')
			} else if (o.code === 'letters') {
				if (py) L.push("    letters = [ch for ch in key.upper() if ch.isalpha()][:3]", "    h = sum(ord(ch) - ord('A') + 1 for ch in letters)    # A = 1")
				else if (java)
					L.push(
						'    int h = 0, letters = 0;',
						'    for (char ch : key.toUpperCase().toCharArray())',
						"        if (Character.isLetter(ch) && letters++ < 3) h += ch - 'A' + 1;    // A = 1"
					)
				else
					L.push(
						'    int h = 0, letters = 0;',
						'    for (const char *ch = key; *ch && letters < 3; ch++)',
						"        if (isalpha(*ch)) { h += toupper(*ch) - 'A' + 1; letters++; }    // A = 1"
					)
			} else if (py)
				// Java's String.hashCode, in 32-bit ints: it can wrap negative.
				L.push('    h = 0', '    for ch in key:', '        h = (31 * h + ord(ch)) & 0xFFFFFFFF', '    if h >= 1 << 31:', '        h -= 1 << 32    # a negative int, as in Java')
			else if (java) L.push('    int h = key.hashCode();    // h = 31·h + c, character by character')
			else L.push('    unsigned h = 0;    // wraps round, as Java\'s int does', '    for (const char *ch = key; *ch; ch++) h = 31 * h + *ch;')
			if (!py && !java && o.code === 'java') h = '(int) h'
		}
		// a·h can pass an int's range (a hashCode near 2^31): Java and C work it out in a long.
		const times = py ? `${a} * ${h}` : java ? `${a}L * ${h}` : `${a}LL * ${h}`
		L.push(`    return ${o.compress === 'mad' ? mod(mod(`${times} + ${b}`, String(p)), m) : mod(h, m)}${end}${o.compress === 'mad' ? `    ${py ? '#' : '//'} MAD` : ''}`)
	}
	if (!py) L.push('}')
	// C's % keeps the sign of what it divides.
	if (!py && !java && o.code !== 'direct') L.push('', 'int floorMod(long long a, int n) {', '    return (int) ((a % n + n) % n);', '}')
	return L
}

/** The operation's own lines, Java's. */
function java(op: HashOp, o: HashCodeOptions): string[] {
	const K = intKeys(o) ? 'int' : 'String'
	const same = (a: string) => (intKeys(o) ? `${a} == key` : `${a}.equals(key)`)
	if (o.strategy === 'chaining') {
		if (op === 'insert')
			return [
				`void insert(${K} key) {    $key`,
				'    int i = index(key);    @hash $i',
				'    Node prev = null;',
				'    for (Node x = table[i]; x != null; x = x.next) {',
				`        if (${same('x.key')}) return;    @compare @found`,
				'        prev = x;',
				'    }',
				'    Node node = new Node(key);',
				'    if (prev == null) table[i] = node;    @first',
				'    else prev.next = node;    @append',
				'}',
			]
		if (op === 'find')
			return [
				`boolean contains(${K} key) {    $key`,
				'    int i = index(key);    @hash $i',
				'    for (Node x = table[i]; x != null; x = x.next)',
				`        if (${same('x.key')}) return true;    @compare @found`,
				'    return false;    @missing',
				'}',
			]
		if (op === 'delete')
			return [
				`void remove(${K} key) {    $key`,
				'    int i = index(key);    @hash $i',
				'    Node prev = null;',
				'    for (Node x = table[i]; x != null; x = x.next) {',
				`        if (${same('x.key')}) {    @compare @found`,
				'            if (prev == null) table[i] = x.next;    @unlink-first',
				'            else prev.next = x.next;    @unlink',
				'            return;',
				'        }',
				'        prev = x;',
				'    }',
				'    // not in the table    @missing',
				'}',
			]
		return [
			'void rehash() {',
			'    Node[] old = table;',
			'    m = nextPrime(2 * m + 1);',
			'    table = new Node[m];    @grow',
			'    for (Node chain : old)',
			'        for (Node x = chain; x != null; x = x.next)',
			'            insert(x.key);    @move',
			'}',
		]
	}
	// table: Object[], null for never used, DELETED for a deleted key.
	const slotIs = same('table[i]').replace('table[i] == key', '(int) table[i] == key')
	if (op === 'insert')
		return [
			`void insert(${K} key) {    $key`,
			'    int i = index(key);    @hash $i',
			'    int tomb = -1;',
			'    for (int k = 0; k < m && table[i] != null; k++) {    @probe',
			'        if (table[i] == DELETED) { if (tomb < 0) tomb = i; }    @deleted',
			`        else if (${slotIs}) return;    @found`,
			'        i = (i + 1) % m;    @next',
			'    }',
			'    if (tomb >= 0) i = tomb;    @reuse',
			'    else if (table[i] != null) throw new IllegalStateException("table full");    @full',
			'    table[i] = key;    @place',
			'}',
		]
	if (op === 'find')
		return [
			`boolean contains(${K} key) {    $key`,
			'    int i = index(key);    @hash $i',
			'    for (int k = 0; k < m && table[i] != null; k++) {    @probe',
			`        if (table[i] != DELETED && ${slotIs}) return true;    @found`,
			'        i = (i + 1) % m;    @next',
			'    }',
			'    return false;    @missing',
			'}',
		]
	if (op === 'delete')
		return [
			`void remove(${K} key) {    $key`,
			'    int i = index(key);    @hash $i',
			'    for (int k = 0; k < m && table[i] != null; k++) {    @probe',
			`        if (table[i] != DELETED && ${slotIs}) {    @found`,
			'            table[i] = DELETED;    @mark',
			'            return;',
			'        }',
			'        i = (i + 1) % m;    @next',
			'    }',
			'    // not in the table    @missing',
			'}',
		]
	return [
		'void rehash() {',
		'    Object[] old = table;',
		'    m = nextPrime(2 * m + 1);',
		'    table = new Object[m];    @grow',
		'    for (Object key : old)',
		`        if (key != null && key != DELETED) insert((${intKeys(o) ? 'int' : 'String'}) key);    @move`,
		'}',
	]
}

/** The operation's own lines, C's. */
function c(op: HashOp, o: HashCodeOptions): string[] {
	const K = intKeys(o) ? 'int ' : 'const char *'
	const same = (a: string) => (intKeys(o) ? `${a} == key` : `strcmp(${a}, key) == 0`)
	if (o.strategy === 'chaining') {
		if (op === 'insert')
			return [
				`void insert(Table *t, ${K}key) {    $key`,
				'    int i = indexOf(t, key);    @hash $i',
				'    Node *prev = NULL;',
				'    for (Node *x = t->table[i]; x != NULL; x = x->next) {',
				`        if (${same('x->key')}) return;    @compare @found`,
				'        prev = x;',
				'    }',
				'    Node *node = newNode(key);',
				'    if (prev == NULL) t->table[i] = node;    @first',
				'    else prev->next = node;    @append',
				'}',
			]
		if (op === 'find')
			return [
				`bool contains(Table *t, ${K}key) {    $key`,
				'    int i = indexOf(t, key);    @hash $i',
				'    for (Node *x = t->table[i]; x != NULL; x = x->next)',
				`        if (${same('x->key')}) return true;    @compare @found`,
				'    return false;    @missing',
				'}',
			]
		if (op === 'delete')
			return [
				`void removeKey(Table *t, ${K}key) {    $key`,
				'    int i = indexOf(t, key);    @hash $i',
				'    Node *prev = NULL;',
				'    for (Node *x = t->table[i]; x != NULL; x = x->next) {',
				`        if (${same('x->key')}) {    @compare @found`,
				'            if (prev == NULL) t->table[i] = x->next;    @unlink-first',
				'            else prev->next = x->next;    @unlink',
				'            free(x);',
				'            return;',
				'        }',
				'        prev = x;',
				'    }',
				'    // not in the table    @missing',
				'}',
			]
		return [
			'void rehash(Table *t) {',
			'    Node **old = t->table;',
			'    int oldM = t->m;',
			'    t->m = nextPrime(2 * t->m + 1);',
			'    t->table = calloc(t->m, sizeof(Node *));    @grow',
			'    for (int b = 0; b < oldM; b++)',
			'        for (Node *x = old[b]; x != NULL; x = x->next)',
			'            insert(t, x->key);    @move',
			'}',
		]
	}
	// Slots with a state: EMPTY (never used), FULL, DELETED.
	const slot = 't->slots[i]'
	if (op === 'insert')
		return [
			`void insert(Table *t, ${K}key) {    $key`,
			'    int i = indexOf(t, key);    @hash $i',
			'    int tomb = -1;',
			`    for (int k = 0; k < t->m && ${slot}.state != EMPTY; k++) {    @probe`,
			`        if (${slot}.state == DELETED) { if (tomb < 0) tomb = i; }    @deleted`,
			`        else if (${same(`${slot}.key`)}) return;    @found`,
			'        i = (i + 1) % t->m;    @next',
			'    }',
			'    if (tomb >= 0) i = tomb;    @reuse',
			`    else if (${slot}.state != EMPTY) { fprintf(stderr, "table full\\n"); exit(1); }    @full`,
			`    ${slot}.state = FULL;    @place`,
			`    ${slot}.key = key;`,
			'}',
		]
	if (op === 'find')
		return [
			`bool contains(Table *t, ${K}key) {    $key`,
			'    int i = indexOf(t, key);    @hash $i',
			`    for (int k = 0; k < t->m && ${slot}.state != EMPTY; k++) {    @probe`,
			`        if (${slot}.state == FULL && ${same(`${slot}.key`)}) return true;    @found`,
			'        i = (i + 1) % t->m;    @next',
			'    }',
			'    return false;    @missing',
			'}',
		]
	if (op === 'delete')
		return [
			`void removeKey(Table *t, ${K}key) {    $key`,
			'    int i = indexOf(t, key);    @hash $i',
			`    for (int k = 0; k < t->m && ${slot}.state != EMPTY; k++) {    @probe`,
			`        if (${slot}.state == FULL && ${same(`${slot}.key`)}) {    @found`,
			`            ${slot}.state = DELETED;    @mark`,
			'            return;',
			'        }',
			'        i = (i + 1) % t->m;    @next',
			'    }',
			'    // not in the table    @missing',
			'}',
		]
	return [
		'void rehash(Table *t) {',
		'    Slot *old = t->slots;',
		'    int oldM = t->m;',
		'    t->m = nextPrime(2 * t->m + 1);',
		'    t->slots = calloc(t->m, sizeof(Slot));    @grow',
		'    for (int s = 0; s < oldM; s++)',
		'        if (old[s].state == FULL) insert(t, old[s].key);    @move',
		'}',
	]
}

/** The operation's own lines, Python's. */
function python(op: HashOp, o: HashCodeOptions): string[] {
	if (o.strategy === 'chaining') {
		if (op === 'insert')
			return [
				'def insert(self, key):    $key',
				'    i = self.index(key)    @hash $i',
				'    prev, x = None, self.table[i]',
				'    while x is not None:',
				'        if x.key == key:    @compare @found',
				'            return',
				'        prev, x = x, x.next',
				'    node = Node(key)',
				'    if prev is None:',
				'        self.table[i] = node    @first',
				'    else:',
				'        prev.next = node    @append',
			]
		if (op === 'find')
			return [
				'def contains(self, key):    $key',
				'    i = self.index(key)    @hash $i',
				'    x = self.table[i]',
				'    while x is not None:',
				'        if x.key == key:    @compare @found',
				'            return True',
				'        x = x.next',
				'    return False    @missing',
			]
		if (op === 'delete')
			return [
				'def remove(self, key):    $key',
				'    i = self.index(key)    @hash $i',
				'    prev, x = None, self.table[i]',
				'    while x is not None:',
				'        if x.key == key:    @compare @found',
				'            if prev is None:',
				'                self.table[i] = x.next    @unlink-first',
				'            else:',
				'                prev.next = x.next    @unlink',
				'            return',
				'        prev, x = x, x.next',
				'    # not in the table    @missing',
			]
		return [
			'def rehash(self):',
			'    old = self.table',
			'    self.m = next_prime(2 * self.m + 1)',
			'    self.table = [None] * self.m    @grow',
			'    for chain in old:',
			'        x = chain',
			'        while x is not None:',
			'            self.insert(x.key)    @move',
			'            x = x.next',
		]
	}
	// table: None for never used, DELETED (an object of its own) for a deleted key.
	if (op === 'insert')
		return [
			'def insert(self, key):    $key',
			'    i = self.index(key)    @hash $i',
			'    tomb = None',
			'    for _ in range(self.m):',
			'        if self.table[i] is None:    @probe',
			'            break',
			'        if self.table[i] is DELETED:',
			'            if tomb is None:',
			'                tomb = i    @deleted',
			'        elif self.table[i] == key:    @found',
			'            return',
			'        i = (i + 1) % self.m    @next',
			'    if tomb is not None:',
			'        i = tomb    @reuse',
			'    elif self.table[i] is not None:',
			"        raise RuntimeError('table full')    @full",
			'    self.table[i] = key    @place',
		]
	if (op === 'find')
		return [
			'def contains(self, key):    $key',
			'    i = self.index(key)    @hash $i',
			'    for _ in range(self.m):',
			'        if self.table[i] is None:    @probe',
			'            break',
			'        if self.table[i] is not DELETED and self.table[i] == key:    @found',
			'            return True',
			'        i = (i + 1) % self.m    @next',
			'    return False    @missing',
		]
	if (op === 'delete')
		return [
			'def remove(self, key):    $key',
			'    i = self.index(key)    @hash $i',
			'    for _ in range(self.m):',
			'        if self.table[i] is None:    @probe',
			'            break',
			'        if self.table[i] is not DELETED and self.table[i] == key:    @found',
			'            self.table[i] = DELETED    @mark',
			'            return',
			'        i = (i + 1) % self.m    @next',
			'    # not in the table    @missing',
		]
	return [
		'def rehash(self):',
		'    old = self.table',
		'    self.m = next_prime(2 * self.m + 1)',
		'    self.table = [None] * self.m    @grow',
		'    for key in old:',
		'        if key is not None and key is not DELETED:',
		'            self.insert(key)    @move',
	]
}

const BODY = { java, c, python } as const

/** The code for one operation on one kind of table: the operation, then index(key) under it. */
function source(op: HashOp, o: HashCodeOptions): CodeSource {
	const out: Partial<Record<CodeLanguage, string>> = {}
	for (const language of ['java', 'c', 'python'] as const) out[language] = '\n' + [...BODY[language](op, o), '', ...indexFn(language, o)].join('\n')
	return out as CodeSource
}

/** The kinds of table: integer keys (mod or MAD, or direct addressing), or text keys by each hash code. */
const KINDS: Omit<HashCodeOptions, 'strategy'>[] = [
	{ ints: true, code: 'sum', compress: 'mod' },
	{ ints: true, code: 'sum', compress: 'mad' },
	{ ints: true, code: 'direct', compress: 'mod' },
	...(['sum', 'letters', 'java'] as const).flatMap((code) => (['mod', 'mad'] as const).map((compress) => ({ ints: false, code, compress }))),
]

/** Every kind of table's code, for every operation. */
export const HASH_CODE: Record<string, CodeSource> = (() => {
	const all: Record<string, CodeSource> = {}
	for (const strategy of ['chaining', 'probing'] as const)
		for (const op of ['insert', 'find', 'delete', 'rehash'] as const)
			for (const kind of KINDS) {
				const o = { strategy, ...kind }
				all[hashCodeId(op, o)] ??= source(op, o)
			}
	return all
})()
