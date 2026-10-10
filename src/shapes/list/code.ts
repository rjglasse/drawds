import type { CodeSource } from '../code/algorithms'

// The linked list operations' code, as a code box beside the list shows it while one plays (see
// `src/shapes/code/algorithms.ts`): lecture 5's indexOf, curr walking the nodes as `e = e.next` does
// there. Tags at the ends of lines are the `line`s the steps in `operations.ts` name; `$tags` the
// variables shown (curr by its node's value).

export const LIST_CODE: Record<string, CodeSource> = {
	'list-find': {
		c: String.raw`
			int indexOf(List *list, int value) {    $value
			    Node *curr = list->head;            @start $curr
			    int i = 0;                          $i
			    while (curr != NULL) {
			        if (curr->value == value) return i;      @found
			        curr = curr->next;              @next
			        i++;
			    }
			    return -1;                          @missing
			}`,
		java: String.raw`
			int indexOf(int value) {                $value
			    Node curr = head;                   @start $curr
			    int i = 0;                          $i
			    while (curr != null) {
			        if (curr.value == value) return i;      @found
			        curr = curr.next;               @next
			        i++;
			    }
			    return -1;                          @missing
			}`,
		python: String.raw`
			def index_of(self, value):          $value
			    curr = self.head                @start $curr
			    i = 0                           $i
			    while curr is not None:
			        if curr.value == value:
			            return i                @found
			        curr = curr.next            @next
			        i += 1
			    return -1                       @missing`,
	},
	// Lecture 5's size, counted: O(n), where a size field kept by every add and remove is O(1).
	'list-count': {
		c: String.raw`
			int size(List *list) {
			    int count = 0;                      @start $count
			    Node *curr = list->head;            $curr
			    while (curr != NULL) {
			        count++;                        @count
			        curr = curr->next;
			    }
			    return count;                       @done
			}`,
		java: String.raw`
			int size() {
			    int count = 0;                      @start $count
			    Node curr = head;                   $curr
			    while (curr != null) {
			        count++;                        @count
			        curr = curr.next;
			    }
			    return count;                       @done
			}`,
		python: String.raw`
			def size(self):
			    count = 0                           @start $count
			    curr = self.head                    $curr
			    while curr is not None:
			        count += 1                      @count
			        curr = curr.next
			    return count                        @done`,
	},
	// Insert after curr.
	'list-insert': {
		c: String.raw`
			void insertAfter(Node *curr, int value) {    @call $curr $value
			    Node *node = newNode(value);             @new $node
			    node->next = curr->next;                 @link
			    curr->next = node;                       @point
			}`,
		java: String.raw`
			void insertAfter(Node curr, int value) {    @call $curr $value
			    Node node = new Node(value);            @new $node
			    node.next = curr.next;                  @link
			    curr.next = node;                       @point
			}`,
		python: String.raw`
			def insert_after(self, curr, value):    @call $curr $value
			    node = Node(value)                  @new $node
			    node.next = curr.next               @link
			    curr.next = node                    @point`,
	},
	// Insert at the head.
	'list-insert-head': {
		c: String.raw`
			void insertAtHead(List *list, int value) {    $value
			    Node *node = newNode(value);              @new $node
			    node->next = list->head;                  @link
			    list->head = node;                        @point
			}`,
		java: String.raw`
			void insertAtHead(int value) {      $value
			    Node node = new Node(value);    @new $node
			    node.next = head;               @link
			    head = node;                    @point
			}`,
		python: String.raw`
			def insert_at_head(self, value):    $value
			    node = Node(value)              @new $node
			    node.next = self.head           @link
			    self.head = node                @point`,
	},
	// Append without a tail: walk to the last node first, O(n).
	'list-append': {
		c: String.raw`
			void append(List *list, int value) {    $value
			    Node *curr = list->head;            @start $curr
			    while (curr->next != NULL)
			        curr = curr->next;              @walk
			    Node *node = newNode(value);        @new $node
			    curr->next = node;                  @point
			}`,
		java: String.raw`
			void append(int value) {            $value
			    Node curr = head;               @start $curr
			    while (curr.next != null)
			        curr = curr.next;           @walk
			    Node node = new Node(value);    @new $node
			    curr.next = node;               @point
			}`,
		python: String.raw`
			def append(self, value):            $value
			    curr = self.head                @start $curr
			    while curr.next is not None:
			        curr = curr.next            @walk
			    node = Node(value)              @new $node
			    curr.next = node                @point`,
	},
	// Remove a value: prev and curr walk to it, then the arrow before it goes round it.
	'list-delete': {
		c: String.raw`
			void removeValue(List *list, int value) {         $value
			    Node *prev = NULL, *curr = list->head;        @start $prev $curr
			    while (curr->value != value) {
			        prev = curr;
			        curr = curr->next;                        @walk
			    }
			    if (prev == NULL) list->head = curr->next;    @unlink-head
			    else prev->next = curr->next;                 @unlink
			    free(curr);
			}`,
		java: String.raw`
			void remove(int value) {                   $value
			    Node prev = null, curr = head;         @start $prev $curr
			    while (curr.value != value) {
			        prev = curr;
			        curr = curr.next;                  @walk
			    }
			    if (prev == null) head = curr.next;    @unlink-head
			    else prev.next = curr.next;            @unlink
			}`,
		python: String.raw`
			def remove(self, value):                $value
			    prev, curr = None, self.head        @start $prev $curr
			    while curr.value != value:
			        prev, curr = curr, curr.next    @walk
			    if prev is None:
			        self.head = curr.next           @unlink-head
			    else:
			        prev.next = curr.next           @unlink`,
	},
	// Reverse in place: each arrow turned round as prev and curr walk.
	'list-reverse': {
		c: String.raw`
			void reverse(List *list) {
			    Node *prev = NULL, *curr = list->head;    @start $prev $curr
			    while (curr != NULL) {
			        Node *next = curr->next;              @save $next
			        curr->next = prev;                    @turn
			        prev = curr;
			        curr = next;                          @move
			    }
			    list->head = prev;                        @head
			}`,
		java: String.raw`
			void reverse() {
			    Node prev = null, curr = head;    @start $prev $curr
			    while (curr != null) {
			        Node next = curr.next;        @save $next
			        curr.next = prev;             @turn
			        prev = curr;
			        curr = next;                  @move
			    }
			    head = prev;                      @head
			}`,
		python: String.raw`
			def reverse(self):
			    prev, curr = None, self.head    @start $prev $curr
			    while curr is not None:
			        next = curr.next            @save $next
			        curr.next = prev            @turn
			        prev, curr = curr, next     @move
			    self.head = prev                @head`,
	},
	// Insert after curr, a tail moving on when curr was the last.
	'list-insert-tail': {
		c: String.raw`
			void insertAfter(List *list, Node *curr, int value) {    @call $curr $value
			    Node *node = newNode(value);                         @new $node
			    node->next = curr->next;                             @link
			    curr->next = node;                                   @point
			    if (curr == list->tail) list->tail = node;           @tail
			}`,
		java: String.raw`
			void insertAfter(Node curr, int value) {    @call $curr $value
			    Node node = new Node(value);            @new $node
			    node.next = curr.next;                  @link
			    curr.next = node;                       @point
			    if (curr == tail) tail = node;          @tail
			}`,
		python: String.raw`
			def insert_after(self, curr, value):    @call $curr $value
			    node = Node(value)                  @new $node
			    node.next = curr.next               @link
			    curr.next = node                    @point
			    if curr is self.tail:               @tail
			        self.tail = node`,
	},
	// Insert at the head, the first node the tail too.
	'list-insert-head-tail': {
		c: String.raw`
			void insertAtHead(List *list, int value) {        $value
			    Node *node = newNode(value);                  @new $node
			    node->next = list->head;                      @link
			    list->head = node;                            @point
			    if (list->tail == NULL) list->tail = node;    @tail
			}`,
		java: String.raw`
			void insertAtHead(int value) {        $value
			    Node node = new Node(value);      @new $node
			    node.next = head;                 @link
			    head = node;                      @point
			    if (tail == null) tail = node;    @tail
			}`,
		python: String.raw`
			def insert_at_head(self, value):    $value
			    node = Node(value)              @new $node
			    node.next = self.head           @link
			    self.head = node                @point
			    if self.tail is None:           @tail
			        self.tail = node`,
	},
	// Append with a tail: O(1), no walk.
	'list-append-tail': {
		c: String.raw`
			void append(List *list, int value) {    @call $value
			    Node *node = newNode(value);        @new $node
			    list->tail->next = node;            @point
			    list->tail = node;                  @tail
			}`,
		java: String.raw`
			void append(int value) {            @call $value
			    Node node = new Node(value);    @new $node
			    tail.next = node;               @point
			    tail = node;                    @tail
			}`,
		python: String.raw`
			def append(self, value):     @call $value
			    node = Node(value)       @new $node
			    self.tail.next = node    @point
			    self.tail = node         @tail`,
	},
	// Remove a value: prev and curr walk to it, then the arrow before it goes round it; a tail on it moves back.
	'list-delete-tail': {
		c: String.raw`
			void removeValue(List *list, int value) {         $value
			    Node *prev = NULL, *curr = list->head;        @start $prev $curr
			    while (curr->value != value) {
			        prev = curr;
			        curr = curr->next;                        @walk
			    }
			    if (prev == NULL) list->head = curr->next;    @unlink-head
			    else prev->next = curr->next;                 @unlink
			    if (curr == list->tail) list->tail = prev;    @tail
			    free(curr);
			}`,
		java: String.raw`
			void remove(int value) {                   $value
			    Node prev = null, curr = head;         @start $prev $curr
			    while (curr.value != value) {
			        prev = curr;
			        curr = curr.next;                  @walk
			    }
			    if (prev == null) head = curr.next;    @unlink-head
			    else prev.next = curr.next;            @unlink
			    if (curr == tail) tail = prev;         @tail
			}`,
		python: String.raw`
			def remove(self, value):                $value
			    prev, curr = None, self.head        @start $prev $curr
			    while curr.value != value:
			        prev, curr = curr, curr.next    @walk
			    if prev is None:
			        self.head = curr.next           @unlink-head
			    else:
			        prev.next = curr.next           @unlink
			    if curr is self.tail:               @tail
			        self.tail = prev`,
	},
	// Reverse in place: each arrow turned round as prev and curr walk; the old head is the tail.
	'list-reverse-tail': {
		c: String.raw`
			void reverse(List *list) {
			    Node *prev = NULL, *curr = list->head;    @start $prev $curr
			    while (curr != NULL) {
			        Node *next = curr->next;              @save $next
			        curr->next = prev;                    @turn
			        prev = curr;
			        curr = next;                          @move
			    }
			    list->tail = list->head;
			    list->head = prev;                        @head
			}`,
		java: String.raw`
			void reverse() {
			    Node prev = null, curr = head;    @start $prev $curr
			    while (curr != null) {
			        Node next = curr.next;        @save $next
			        curr.next = prev;             @turn
			        prev = curr;
			        curr = next;                  @move
			    }
			    tail = head;
			    head = prev;                      @head
			}`,
		python: String.raw`
			def reverse(self):
			    prev, curr = None, self.head    @start $prev $curr
			    while curr is not None:
			        next = curr.next            @save $next
			        curr.next = prev            @turn
			        prev, curr = curr, next     @move
			    self.tail = self.head
			    self.head = prev                @head`,
	},
	// A linked stack (lecture 6): push and pop at the top, O(1).
	'linked-push': {
		c: String.raw`
			void push(Stack *s, int value) {    $value
			    Node *node = newNode(value);    @new $node
			    node->next = s->top;            @link
			    s->top = node;                  @point
			}`,
		java: String.raw`
			void push(int value) {              $value
			    Node node = new Node(value);    @new $node
			    node.next = top;                @link
			    top = node;                     @point
			}`,
		python: String.raw`
			def push(self, value):      $value
			    node = Node(value)      @new $node
			    node.next = self.top    @link
			    self.top = node         @point`,
	},
	// Pop: the top's value, then top moves on; an empty stack underflows.
	'linked-pop': {
		c: String.raw`
			int pop(Stack *s) {
			    if (s->top == NULL) { fprintf(stderr, "empty stack\n"); exit(1); }    @empty
			    int v = s->top->value;                                                @value $v
			    Node *old = s->top;
			    s->top = old->next;                                                   @unlink
			    free(old);
			    return v;                                                             @done
			}`,
		java: String.raw`
			int pop() {
			    if (top == null) throw new EmptyStackException();    @empty
			    int v = top.value;                                   @value $v
			    top = top.next;                                      @unlink
			    return v;                                            @done
			}`,
		python: String.raw`
			def pop(self):
			    if self.top is None:                               @empty
			        raise IndexError("pop from an empty stack")
			    v = self.top.value                                 @value $v
			    self.top = self.top.next                           @unlink
			    return v                                           @done`,
	},
	// Peek at the top: nothing changes.
	'linked-peek': {
		c: String.raw`
			int peek(Stack *s) {
			    if (s->top == NULL) { fprintf(stderr, "empty stack\n"); exit(1); }    @empty
			    return s->top->value;                                                 @peek
			}`,
		java: String.raw`
			int peek() {
			    if (top == null) throw new EmptyStackException();    @empty
			    return top.value;                                    @peek
			}`,
		python: String.raw`
			def peek(self):
			    if self.top is None:                              @empty
			        raise IndexError("peek at an empty stack")
			    return self.top.value                             @peek`,
	},
	// A linked queue: enqueue at the rear, dequeue at the front, O(1) both.
	'linked-enqueue': {
		c: String.raw`
			void enqueue(Queue *q, int value) {          $value
			    Node *node = newNode(value);             @new $node
			    if (q->rear == NULL) q->front = node;    @empty
			    else q->rear->next = node;               @link
			    q->rear = node;                          @rear
			}`,
		java: String.raw`
			void enqueue(int value) {              $value
			    Node node = new Node(value);       @new $node
			    if (rear == null) front = node;    @empty
			    else rear.next = node;             @link
			    rear = node;                       @rear
			}`,
		python: String.raw`
			def enqueue(self, value):        $value
			    node = Node(value)           @new $node
			    if self.rear is None:
			        self.front = node        @empty
			    else:
			        self.rear.next = node    @link
			    self.rear = node             @rear`,
	},
	// Dequeue: the front's value, front moves on; the last one out empties rear too.
	'linked-dequeue': {
		c: String.raw`
			int dequeue(Queue *q) {
			    if (q->front == NULL) { fprintf(stderr, "empty queue\n"); exit(1); }    @nothing
			    int v = q->front->value;                                                @value $v
			    Node *old = q->front;
			    q->front = old->next;                                                   @unlink
			    if (q->front == NULL) q->rear = NULL;                                   @tail
			    free(old);
			    return v;                                                               @done
			}`,
		java: String.raw`
			int dequeue() {
			    if (front == null) throw new NoSuchElementException();    @nothing
			    int v = front.value;                                      @value $v
			    front = front.next;                                       @unlink
			    if (front == null) rear = null;                           @tail
			    return v;                                                 @done
			}`,
		python: String.raw`
			def dequeue(self):
			    if self.front is None:                                 @nothing
			        raise IndexError("dequeue from an empty queue")
			    v = self.front.value                                   @value $v
			    self.front = self.front.next                           @unlink
			    if self.front is None:                                 @tail
			        self.rear = None
			    return v                                               @done`,
	},
	// Peek at the front: nothing changes.
	'linked-front': {
		c: String.raw`
			int peek(Queue *q) {
			    if (q->front == NULL) { fprintf(stderr, "empty queue\n"); exit(1); }    @nothing
			    return q->front->value;                                                 @peek
			}`,
		java: String.raw`
			int peek() {
			    if (front == null) throw new NoSuchElementException();    @nothing
			    return front.value;                                       @peek
			}`,
		python: String.raw`
			def peek(self):
			    if self.front is None:                            @nothing
			        raise IndexError("peek at an empty queue")
			    return self.front.value                           @peek`,
	},
}
