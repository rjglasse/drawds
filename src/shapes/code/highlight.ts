// Syntax highlighting for the code box: a small tokenizer for C, Java and Python, enough to colour
// what a student reads in their IDE (keywords, types, strings, comments, numbers, the C
// preprocessor, Java annotations and Python decorators). It reads the whole code at once, so a
// comment or a string that runs over several lines is coloured on every one of them.

export type CodeLanguage = 'c' | 'java' | 'python'

export const CODE_LANGUAGES: readonly CodeLanguage[] = ['c', 'java', 'python']

/** What a piece of code is, which decides its colour. */
export type TokenKind = 'plain' | 'keyword' | 'type' | 'constant' | 'string' | 'number' | 'comment' | 'meta'

export interface Token {
	text: string
	kind: TokenKind
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean))

interface LanguageRules {
	keywords: Set<string>
	types: Set<string>
	constants: Set<string>
	/** Line comment start. */
	line: string
	/** Block comments (/* ... *\/). */
	block: boolean
	/** Capitalised names are classes (Java: String, Node) or typedefs (C as drawds writes it: Node, List, Graph). */
	capitalisedTypes: boolean
}

const RULES: Record<CodeLanguage, LanguageRules> = {
	c: {
		keywords: words(`auto break case const continue default do else enum extern for goto if inline register restrict
			return sizeof static struct switch typedef union volatile while`),
		types: words(`void char short int long float double signed unsigned bool size_t FILE int8_t int16_t int32_t
			int64_t uint8_t uint16_t uint32_t uint64_t`),
		constants: words('true false NULL'),
		line: '//',
		block: true,
		capitalisedTypes: true,
	},
	java: {
		keywords: words(`abstract assert break case catch class continue default do else enum extends final finally for
			if implements import instanceof interface native new package private protected public record return static
			super switch synchronized this throw throws transient try var volatile while yield`),
		types: words('void boolean byte char short int long float double'),
		constants: words('true false null'),
		line: '//',
		block: true,
		capitalisedTypes: true,
	},
	python: {
		keywords: words(`and as assert async await break case class continue def del elif else except finally for from
			global if import in is lambda match nonlocal not or pass raise return try while with yield`),
		types: words(`int float str bool list dict set tuple object print len range input open enumerate zip min max sum
			sorted reversed abs map filter isinstance type super`),
		constants: words('True False None self'),
		line: '#',
		block: false,
		capitalisedTypes: false,
	},
}

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y
const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)[lLfFdDuU]*/y

/** The code as tokens, in order: their texts joined are the code. */
export function tokenize(code: string, language: CodeLanguage): Token[] {
	const rules = RULES[language]
	const out: Token[] = []
	const push = (text: string, kind: TokenKind) => {
		const last = out[out.length - 1]
		if (last && last.kind === kind) last.text += text
		else out.push({ text, kind })
	}
	let i = 0
	let lineStart = true
	while (i < code.length) {
		const c = code[i]
		const rest = (n: number) => code.slice(i, i + n)
		// A comment, to the end of the line or of the block.
		if (rest(rules.line.length) === rules.line) {
			const end = code.indexOf('\n', i)
			const to = end < 0 ? code.length : end
			push(code.slice(i, to), 'comment')
			i = to
			continue
		}
		if (rules.block && rest(2) === '/*') {
			const end = code.indexOf('*/', i + 2)
			const to = end < 0 ? code.length : end + 2
			push(code.slice(i, to), 'comment')
			i = to
			continue
		}
		// The C preprocessor: a line starting with #, its <header> or "header" a string.
		if (language === 'c' && c === '#' && lineStart) {
			const m = /#\s*[A-Za-z_]+/y
			m.lastIndex = i
			const found = m.exec(code)
			if (found) {
				push(found[0], 'meta')
				i += found[0].length
				const header = /\s*(<[^>\n]*>)/y
				header.lastIndex = i
				const h = header.exec(code)
				if (h) {
					push(h[0].slice(0, h[0].length - h[1].length), 'plain')
					push(h[1], 'string')
					i += h[0].length
				}
				lineStart = false
				continue
			}
		}
		// Java annotations and Python decorators.
		if (c === '@' && language !== 'c') {
			IDENT.lastIndex = i + 1
			const m = IDENT.exec(code)
			if (m) {
				push('@' + m[0], 'meta')
				i += 1 + m[0].length
				lineStart = false
				continue
			}
		}
		// Strings: Python's triple-quoted ones (and f / r / b prefixes), then single-line ones.
		const prefix = language === 'python' ? /[rRbBfFuU]{0,2}/y : /(?:)/y
		prefix.lastIndex = i
		const pre = prefix.exec(code)?.[0] ?? ''
		const q = code[i + pre.length]
		if (q === '"' || q === "'") {
			const start = i + pre.length
			const triple = language === 'python' && code.slice(start, start + 3) === q.repeat(3)
			let j = start + (triple ? 3 : 1)
			while (j < code.length) {
				if (code[j] === '\\') j += 2
				else if (triple ? code.slice(j, j + 3) === q.repeat(3) : code[j] === q) {
					j += triple ? 3 : 1
					break
				} else if (!triple && code[j] === '\n') break
				else j++
			}
			j = Math.min(j, code.length)
			push(code.slice(i, j), 'string')
			i = j
			lineStart = false
			continue
		}
		IDENT.lastIndex = i
		const ident = IDENT.exec(code)
		if (ident) {
			const w = ident[0]
			const kind: TokenKind = rules.keywords.has(w)
				? 'keyword'
				: rules.constants.has(w)
					? 'constant'
					: rules.types.has(w) || (rules.capitalisedTypes && /^[A-Z][a-z0-9]/.test(w))
						? 'type'
						: 'plain'
			push(w, kind)
			i += w.length
			lineStart = false
			continue
		}
		if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1] ?? ''))) {
			NUMBER.lastIndex = i
			const m = NUMBER.exec(code)
			if (m && m[0]) {
				push(m[0], 'number')
				i += m[0].length
				lineStart = false
				continue
			}
		}
		push(c, 'plain')
		if (c === '\n') lineStart = true
		else if (!/\s/.test(c)) lineStart = false
		i++
	}
	return out
}

/** The tokens line by line (a token over several lines split at each newline; newlines dropped). */
export function highlightLines(code: string, language: CodeLanguage): Token[][] {
	const lines: Token[][] = [[]]
	for (const token of tokenize(code, language)) {
		token.text.split('\n').forEach((part, k) => {
			if (k > 0) lines.push([])
			if (part) lines[lines.length - 1].push({ text: part, kind: token.kind })
		})
	}
	return lines
}
