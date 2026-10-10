import { describe, expect, it } from 'vitest'
import { guessLanguage } from './convert'
import { applyEdit, closeBraceEdit, indentEdit, newlineEdit } from './editing'
import { highlightLines, tokenize, type CodeLanguage, type TokenKind } from './highlight'
import { getCodeLayout, getCodeMetrics, offsetOf } from './layout'

/** The tokens of a kind, in order. */
const of = (code: string, language: CodeLanguage, kind: TokenKind) =>
	tokenize(code, language)
		.filter((t) => t.kind === kind)
		.map((t) => t.text)

describe('highlighting', () => {
	it('gives back the code it was given, token by token', () => {
		const code = 'int main(void) {\n\tprintf("%d\\n", 42); /* done */\n}\n'
		expect(tokenize(code, 'c').map((t) => t.text).join('')).toBe(code)
	})

	it('Java: keywords, primitive and class types, literals, comments, annotations', () => {
		const code = '@Override\npublic static int sum(int[] a, String s) {\n    // add\n    return a.length + 0x1F + 3.5e2 + (s == null ? 0 : 1); /* end */\n}'
		expect(of(code, 'java', 'keyword')).toEqual(['public', 'static', 'return'])
		expect(of(code, 'java', 'type')).toEqual(['int', 'int', 'String'])
		expect(of(code, 'java', 'constant')).toEqual(['null'])
		expect(of(code, 'java', 'number')).toEqual(['0x1F', '3.5e2', '0', '1'])
		expect(of(code, 'java', 'comment')).toEqual(['// add', '/* end */'])
		expect(of(code, 'java', 'meta')).toEqual(['@Override'])
		expect(of('char c = \'"\'; String t = "a \\" b";', 'java', 'string')).toEqual(["'\"'", '"a \\" b"'])
	})

	it('C: the preprocessor and its header, keywords, types', () => {
		const code = '#include <stdio.h>\n#define MAX 10\nstruct node *next = NULL;\nunsigned long n = sizeof(int);'
		expect(of(code, 'c', 'meta')).toEqual(['#include', '#define'])
		expect(of(code, 'c', 'string')).toEqual(['<stdio.h>'])
		expect(of(code, 'c', 'keyword')).toEqual(['struct', 'sizeof'])
		expect(of(code, 'c', 'type')).toEqual(['unsigned', 'long', 'int'])
		expect(of(code, 'c', 'constant')).toEqual(['NULL'])
		// A # that isn't first on its line isn't the preprocessor.
		expect(of('x = a # b;', 'c', 'meta')).toEqual([])
	})

	it('Python: # comments, decorators, builtins, f-strings and triple-quoted strings over lines', () => {
		const code = '@cache\ndef fib(n):  # slow\n    """Return the\n    nth one."""\n    if n < 2: return n\n    print(f"{n}")\n    return fib(n - 1) + fib(n - 2) if n is not None else 0'
		expect(of(code, 'python', 'meta')).toEqual(['@cache'])
		expect(of(code, 'python', 'comment')).toEqual(['# slow'])
		expect(of(code, 'python', 'keyword')).toEqual(['def', 'if', 'return', 'return', 'if', 'is', 'not', 'else'])
		expect(of(code, 'python', 'type')).toEqual(['print'])
		expect(of(code, 'python', 'constant')).toEqual(['None'])
		expect(of(code, 'python', 'string')).toEqual(['"""Return the\n    nth one."""', 'f"{n}"'])
		// for, from and format aren't string prefixes.
		expect(of('for x in xs: format(x)', 'python', 'string')).toEqual([])
	})

	it('splits into lines: a block comment over three lines is a comment on each', () => {
		const lines = highlightLines('a = 1; /* one\ntwo\nthree */ b = 2;', 'java')
		expect(lines).toHaveLength(3)
		expect(lines[1]).toEqual([{ text: 'two', kind: 'comment' }])
		expect(lines[2][0]).toEqual({ text: 'three */', kind: 'comment' })
		expect(lines[2].map((t) => t.text).join('')).toBe('three */ b = 2;')
		expect(highlightLines('', 'c')).toEqual([[]])
	})
})

describe('code box layout', () => {
	const m = getCodeMetrics('m')

	it('is sized to its longest line and its lines, never narrower than a short line', () => {
		const layout = getCodeLayout('for (;;) {\n    x++;\n}', m)
		expect(layout.lines).toBe(3)
		expect(layout.box.h).toBeCloseTo(m.padY * 2 + 3 * m.lineH)
		expect(getCodeLayout('', m).box.w).toBe(layout.box.w)
		const long = 'x'.repeat(40)
		expect(getCodeLayout(long, m).box.w).toBeCloseTo(m.padX * 2 + 40 * m.charW)
		// Line numbers take a gutter.
		expect(getCodeLayout(long, m, { lineNumbers: true }).textX).toBeGreaterThan(getCodeLayout(long, m).textX)
		// Room for pointers on the left moves everything right, the box no wider.
		const roomy = getCodeLayout(long, m, { left: 30 })
		expect([roomy.box.x, roomy.box.w, roomy.textX]).toEqual([30, getCodeLayout(long, m).box.w, getCodeLayout(long, m).textX + 30])
	})

	it('finds the line and column under a point, and their offset in the code', () => {
		const code = 'int a;\n    b++;\n}'
		const layout = getCodeLayout(code, m)
		const at = layout.lineAt(1)
		expect(layout.caretAt({ x: at.x + 4 * m.charW + 1, y: at.y })).toEqual({ line: 1, column: 4 })
		expect(layout.caretAt({ x: 9999, y: 9999 })).toEqual({ line: 2, column: 1 })
		expect(offsetOf(code, { line: 1, column: 4 })).toBe(11)
	})
})

describe('code editing keys', () => {
	const run = (text: string, edit: ReturnType<typeof indentEdit>) => ({ text: applyEdit(text, edit), sel: [edit.selStart, edit.selEnd] })

	it('Tab indents at the caret; with a selection, every line it touches; Shift+Tab takes one indent off', () => {
		expect(run('ab', indentEdit('ab', 1, 1, false))).toEqual({ text: 'a    b', sel: [5, 5] })
		const text = 'a\nb\nc'
		expect(run(text, indentEdit(text, 0, 3, false)).text).toBe('    a\n    b\nc')
		// A selection ending at a line's start leaves that line be.
		expect(run(text, indentEdit(text, 0, 2, false)).text).toBe('    a\nb\nc')
		const indented = '    a\n      b'
		expect(run(indented, indentEdit(indented, 0, indented.length, true)).text).toBe('a\n  b')
		expect(run('  x', indentEdit('  x', 3, 3, true))).toEqual({ text: 'x', sel: [1, 1] })
	})

	it('Enter keeps the indent, one more after an opening line; } on a blank line steps out', () => {
		const java = '    if (x) {'
		expect(run(java, newlineEdit(java, java.length, java.length, 'java'))).toEqual({ text: java + '\n        ', sel: [21, 21] })
		const braces = 'f() {}'
		expect(run(braces, newlineEdit(braces, 5, 5, 'java')).text).toBe('f() {\n    \n}')
		const py = 'def f(n):  # recursive'
		expect(run(py, newlineEdit(py, py.length, py.length, 'python')).text).toBe(py + '\n    ')
		expect(run('  x = 1', newlineEdit('  x = 1', 7, 7, 'python')).text).toBe('  x = 1\n  ')
		const blank = 'f() {\n        '
		expect(run(blank, closeBraceEdit(blank, blank.length, blank.length)!).text).toBe('f() {\n    }')
		expect(closeBraceEdit('a = b', 5, 5)).toBeUndefined()
	})
})

describe('guessing the language of a text box', () => {
	it('goes by the telltale signs of each, else the fallback', () => {
		expect(guessLanguage('def fib(n):\n    if n < 2:\n        return n\n    return fib(n-1) + fib(n-2)', 'java')).toBe('python')
		expect(guessLanguage('for x in xs:\n    print(x)', 'c')).toBe('python')
		expect(guessLanguage('public static int max(int[] a) {\n    int m = a[0];\n}', 'c')).toBe('java')
		expect(guessLanguage('System.out.println(new Node(3));', 'python')).toBe('java')
		expect(guessLanguage('#include <stdio.h>\nint main(void) {\n    printf("hi");\n}', 'java')).toBe('c')
		expect(guessLanguage('node->next = NULL;', 'java')).toBe('c')
		// Nothing tells (pseudocode a C, Java or Python teacher could write): the fallback.
		expect(guessLanguage('x = x + 1', 'java')).toBe('java')
		expect(guessLanguage('while (lo <= hi) {\n    mid = (lo + hi) / 2;\n}', 'c')).toBe('c')
	})
})
