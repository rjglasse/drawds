import type { CodeSource } from '../../code/algorithms'

// Lecture 6's ArrayStack and ArrayQueue (a fixed stack, a circular buffer), and what a stack is for. Part of ARRAY_CODE (../code.ts).

/** Lines of code, the tagged ones (`[line, tags]`) with their tags lined up after the longest. */
function tagged(...rows: (string | [string, string])[]) {
	const width = Math.max(...rows.map((row) => (typeof row === 'string' ? 0 : row[0].length)))
	return rows.map((row) => (typeof row === 'string' ? row : `${row[0].padEnd(width)}    ${row[1]}`)).join('\n')
}

/**
 * What a stack is for (`stack-uses.ts`): balanced brackets and a postfix expression's value. On a
 * stack that grows: Java's ArrayDeque, a Python list, in C an array as deep as the input could
 * need. With a fixed capacity: lecture 6's ArrayStack, whose push overflows (in C an array of
 * CAPACITY, checked before each push).
 */
function stackUses(fixed: boolean): Record<string, CodeSource> {
	const id = (name: string) => (fixed ? `${name}-fixed` : name)
	const overflow = (indent: string): [string, string][] =>
		fixed ? [[`${indent}if (top == CAPACITY - 1) { fprintf(stderr, "overflow\\n"); exit(1); }`, '@overflow']] : []
	const push = fixed ? '@push @overflow' : '@push'
	const made = fixed ? '@new $CAPACITY' : '@new'
	return {
		[id('stack-balanced')]: {
			c: tagged(
				['bool isBalanced(const char *text) {', '$text'],
				[`    char s[${fixed ? 'CAPACITY' : 'strlen(text) + 1'}];${fixed ? '' : '    // deep enough for the whole text'}`, made],
				'    int top = -1;',
				'    for (int i = 0; text[i] != \'\\0\'; i++) {',
				['        char c = text[i];', '$c'],
				"        if (c == '(' || c == '[' || c == '{') {",
				...overflow('            '),
				['            s[++top] = c;', '@push $top'],
				"        } else if (c == ')' || c == ']' || c == '}') {",
				['            if (top == -1)', '@empty'],
				'                return false;',
				['            char opener = s[top--];', '@pop $opener'],
				['            if (!matches(opener, c))', '@match @mismatch'],
				'                return false;',
				'        }',
				'    }',
				['    return top == -1;', '@end'],
				'}',
				'',
				'bool matches(char opener, char closer) {',
				"    return (opener == '(' && closer == ')')",
				"        || (opener == '[' && closer == ']')",
				"        || (opener == '{' && closer == '}');",
				'}'
			),
			java: tagged(
				['boolean isBalanced(String text) {', '$text'],
				[fixed ? '    ArrayStack<Character> s = new ArrayStack<>(CAPACITY);' : '    Deque<Character> s = new ArrayDeque<>();', made],
				['    for (char c : text.toCharArray()) {', '$c'],
				"        if (c == '(' || c == '[' || c == '{') {",
				['            s.push(c);', push],
				"        } else if (c == ')' || c == ']' || c == '}') {",
				['            if (s.isEmpty())', '@empty'],
				'                return false;',
				['            char opener = s.pop();', '@pop $opener'],
				['            if (!matches(opener, c))', '@match @mismatch'],
				'                return false;',
				'        }',
				'    }',
				['    return s.isEmpty();', '@end'],
				'}',
				'',
				'boolean matches(char opener, char closer) {',
				"    return opener == '(' && closer == ')'",
				"        || opener == '[' && closer == ']'",
				"        || opener == '{' && closer == '}';",
				'}'
			),
			python: tagged(
				['def is_balanced(text):', '$text'],
				[fixed ? '    s = ArrayStack(CAPACITY)' : '    s = []', made],
				['    for c in text:', '$c'],
				"        if c in '([{':",
				[fixed ? '            s.push(c)' : '            s.append(c)', push],
				"        elif c in ')]}':",
				[fixed ? '            if s.is_empty():' : '            if not s:', '@empty'],
				'                return False',
				['            opener = s.pop()', '@pop $opener'],
				['            if not matches(opener, c):', '@match @mismatch'],
				'                return False',
				[fixed ? '    return s.is_empty()' : '    return not s', '@end'],
				'',
				'def matches(opener, closer):',
				"    return opener + closer in ('()', '[]', '{}')"
			),
		},
		[id('stack-postfix')]: {
			c: tagged(
				['int evaluate(char *postfix) {', '$postfix'],
				[`    int s[${fixed ? 'CAPACITY' : 'strlen(postfix) + 1'}];${fixed ? '' : '    // deep enough for every number'}`, made],
				'    int top = -1;',
				['    char *token = strtok(postfix, " ");', '$token'],
				'    while (token != NULL) {',
				'        if (strlen(token) == 1 && strchr("+-*/", token[0])) {',
				['            if (top < 1) { fprintf(stderr, "too few operands\\n"); exit(1); }', '@few'],
				['            int b = s[top--];', '@pop-b $b'],
				['            int a = s[top--];', '@pop-a $a'],
				['            s[++top] = apply(token[0], a, b);', '@apply $top'],
				'        } else {',
				...overflow('            '),
				['            s[++top] = atoi(token);', '@push $top'],
				'        }',
				'        token = strtok(NULL, " ");',
				'    }',
				['    if (top != 0) { fprintf(stderr, "too many operands\\n"); exit(1); }', '@many'],
				['    return s[top];', '@result'],
				'}',
				'',
				'int apply(char op, int a, int b) {',
				'    switch (op) {',
				"        case '+': return a + b;",
				"        case '-': return a - b;",
				"        case '*': return a * b;",
				'        default:',
				// Java and Python throw; in C it is undefined.
				'            if (b == 0) { fprintf(stderr, "division by zero\\n"); exit(1); }',
				'            return a / b;',
				'    }',
				'}'
			),
			java: tagged(
				['int evaluate(String postfix) {', '$postfix'],
				[fixed ? '    ArrayStack<Integer> s = new ArrayStack<>(CAPACITY);' : '    Deque<Integer> s = new ArrayDeque<>();', made],
				['    for (String token : postfix.split(" ")) {', '$token'],
				'        if (isOperator(token)) {',
				['            if (s.size() < 2)', '@few'],
				'                throw new IllegalArgumentException("too few operands");',
				['            int b = s.pop();', '@pop-b $b'],
				['            int a = s.pop();', '@pop-a $a'],
				['            s.push(apply(token, a, b));', '@apply'],
				'        } else {',
				['            s.push(Integer.parseInt(token));', push],
				'        }',
				'    }',
				['    if (s.size() != 1)', '@many'],
				'        throw new IllegalArgumentException("too many operands");',
				['    return s.pop();', '@result'],
				'}',
				'',
				'boolean isOperator(String token) {',
				'    return token.length() == 1 && "+-*/".contains(token);',
				'}',
				'',
				'int apply(String op, int a, int b) {',
				'    switch (op) {',
				'        case "+": return a + b;',
				'        case "-": return a - b;',
				'        case "*": return a * b;',
				'        default:  return a / b;',
				'    }',
				'}'
			),
			python: tagged(
				['def evaluate(postfix):', '$postfix'],
				[fixed ? '    s = ArrayStack(CAPACITY)' : '    s = []', made],
				['    for token in postfix.split():', '$token'],
				"        if token in ('+', '-', '*', '/'):",
				['            if len(s) < 2:', '@few'],
				"                raise ValueError('too few operands')",
				['            b = s.pop()', '@pop-b $b'],
				['            a = s.pop()', '@pop-a $a'],
				[`            s.${fixed ? 'push' : 'append'}(apply(token, a, b))`, '@apply'],
				'        else:',
				[`            s.${fixed ? 'push' : 'append'}(int(token))`, push],
				['    if len(s) != 1:', '@many'],
				"        raise ValueError('too many operands')",
				['    return s.pop()', '@result'],
				'',
				'def apply(op, a, b):',
				"    if op == '+':",
				'        return a + b',
				"    if op == '-':",
				'        return a - b',
				"    if op == '*':",
				'        return a * b',
				'    return int(a / b)    # toward 0, as Java and C divide'
			),
		},
	}
}

export const STACK_QUEUE_CODE: Record<string, CodeSource> = {
	...stackUses(false),
	...stackUses(true),
	// Lecture 6's ArrayStack (a fixed array, top from -1), a method per operation.
	'stack-push': {
		c: String.raw`
			void push(Stack *s, int v) {                                                      $v
			    if (s->top == s->capacity - 1) { fprintf(stderr, "overflow\n"); exit(1); }    @overflow
			    s->top++;                                                                     @inc $top
			    s->a[s->top] = v;                                                             @store
			}`,
		java: String.raw`
			void push(int v) {                      $v
			    if (top == a.length - 1)            @overflow
			        throw new StackOverflowError();
			    top++;                              @inc $top
			    a[top] = v;                         @store
			}`,
		python: String.raw`
			def push(self, v):                      $v
			    if self.top == len(self.a) - 1:     @overflow
			        raise OverflowError('stack overflow')
			    self.top += 1                       @inc $top
			    self.a[self.top] = v                @store`,
	},
	'stack-pop': {
		c: String.raw`
			int pop(Stack *s) {
			    if (s->top == -1) { fprintf(stderr, "underflow\n"); exit(1); }    @underflow
			    int v = s->a[s->top];                                             @take $v
			    s->top--;                                                         @dec $top
			    return v;
			}`,
		java: String.raw`
			int pop() {
			    if (top == -1)                      @underflow
			        throw new EmptyStackException();
			    int v = a[top];                     @take $v
			    top--;                              @dec $top
			    return v;
			}`,
		python: String.raw`
			def pop(self):
			    if self.top == -1:                  @underflow
			        raise IndexError('pop from an empty stack')
			    v = self.a[self.top]                @take $v
			    self.top -= 1                       @dec $top
			    return v`,
	},
	'stack-peek': {
		c: String.raw`
			int peek(Stack *s) {
			    if (s->top == -1) { fprintf(stderr, "empty\n"); exit(1); }    @peek-empty
			    return s->a[s->top];                                          @peek $top
			}`,
		java: String.raw`
			int peek() {
			    if (top == -1)                      @peek-empty
			        throw new EmptyStackException();
			    return a[top];                      @peek $top
			}`,
		python: String.raw`
			def peek(self):
			    if self.top == -1:                  @peek-empty
			        raise IndexError('peek at an empty stack')
			    return self.a[self.top]             @peek $top`,
	},
	// Lecture 6's ArrayQueue, a circular buffer: rear and front wrap round, nothing moves.
	'queue-enqueue': {
		c: String.raw`
			void enqueue(Queue *q, int value) {                                        $value
			    if (q->size == q->capacity) { fprintf(stderr, "full\n"); exit(1); }    @full
			    q->a[q->rear] = value;                                                 @store $rear
			    q->rear = (q->rear + 1) % q->capacity;                                 @rear
			    q->size++;
			}`,
		java: String.raw`
			void enqueue(int value) {                                             $value
			    if (size == a.length) throw new IllegalStateException("full");    @full
			    a[rear] = value;                                                  @store $rear
			    rear = (rear + 1) % a.length;                                     @rear
			    size++;
			}`,
		python: String.raw`
			def enqueue(self, value):                        $value
			    if self.size == len(self.a):                 @full
			        raise IndexError("the queue is full")
			    self.a[self.rear] = value                    @store $rear
			    self.rear = (self.rear + 1) % len(self.a)    @rear
			    self.size += 1`,
	},
	// Dequeue: take a[front], then front moves on, round past the end.
	'queue-dequeue': {
		c: String.raw`
			int dequeue(Queue *q) {
			    if (q->size == 0) { fprintf(stderr, "empty\n"); exit(1); }    @empty
			    int v = q->a[q->front];                                       @take $front $v
			    q->front = (q->front + 1) % q->capacity;                      @front
			    q->size--;
			    return v;
			}`,
		java: String.raw`
			int dequeue() {
			    if (size == 0) throw new NoSuchElementException();    @empty
			    int v = a[front];                                     @take $front $v
			    front = (front + 1) % a.length;                       @front
			    size--;
			    return v;
			}`,
		python: String.raw`
			def dequeue(self):
			    if self.size == 0:                             @empty
			        raise IndexError("the queue is empty")
			    v = self.a[self.front]                         @take $front $v
			    self.front = (self.front + 1) % len(self.a)    @front
			    self.size -= 1
			    return v`,
	},
	// Peek at the front: nothing changes.
	'queue-peek': {
		c: String.raw`
			int peek(Queue *q) {
			    if (q->size == 0) { fprintf(stderr, "empty\n"); exit(1); }    @empty
			    return q->a[q->front];                                        @peek $front
			}`,
		java: String.raw`
			int peek() {
			    if (size == 0) throw new NoSuchElementException();    @empty
			    return a[front];                                      @peek $front
			}`,
		python: String.raw`
			def peek(self):
			    if self.size == 0:                            @empty
			        raise IndexError("the queue is empty")
			    return self.a[self.front]                     @peek $front`,
	},
}
