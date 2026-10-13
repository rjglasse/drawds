import type { CodeSource } from '../code/algorithms'

// The general trees' code, as a code box beside the tree shows it while one plays (see
// `src/shapes/code/algorithms.ts`): a node keeps its children in order (Java a List, Python a list, C
// an array and its count), and each recursive call is made from a loop over them. The calls a step
// arrives by are the loop's (@child), naming the child it is on.

export const GENERAL_TREE_CODE: Record<string, CodeSource> = {
	'general-tree-pre': {
		c: String.raw`
			void preOrder(Node *node) {                         @call $node
			    visit(node);                                    @visit
			    for (int i = 0; i < node->count; i++)           @child
			        preOrder(node->children[i]);
			}`,
		java: String.raw`
			void preOrder(Node node) {                  @call $node
			    visit(node);                            @visit
			    for (Node child : node.children)        @child $child
			        preOrder(child);
			}`,
		python: String.raw`
			def pre_order(node):                @call $node
			    visit(node)                     @visit
			    for child in node.children:     @child $child
			        pre_order(child)`,
	},
	'general-tree-post': {
		c: String.raw`
			void postOrder(Node *node) {                        @call $node
			    for (int i = 0; i < node->count; i++)           @child
			        postOrder(node->children[i]);
			    visit(node);                                    @visit
			}`,
		java: String.raw`
			void postOrder(Node node) {                 @call $node
			    for (Node child : node.children)        @child $child
			        postOrder(child);
			    visit(node);                            @visit
			}`,
		python: String.raw`
			def post_order(node):               @call $node
			    for child in node.children:     @child $child
			        post_order(child)
			    visit(node)                     @visit`,
	},
	'general-tree-level': {
		c: String.raw`
			void levelOrder(Node *root) {
			    Node *queue[MAX];
			    int front = 0, rear = 0;
			    queue[rear++] = root;                               @start
			    while (front < rear) {
			        Node *node = queue[front++];                    $node
			        visit(node);                                    @visit
			        for (int i = 0; i < node->count; i++)
			            queue[rear++] = node->children[i];
			    }
			}`,
		java: String.raw`
			void levelOrder(Node root) {
			    Queue<Node> queue = new ArrayDeque<>();
			    queue.add(root);                                    @start
			    while (!queue.isEmpty()) {
			        Node node = queue.remove();                     $node
			        visit(node);                                    @visit
			        for (Node child : node.children)
			            queue.add(child);
			    }
			}`,
		python: String.raw`
			def level_order(root):
			    queue = deque([root])                   @start
			    while queue:
			        node = queue.popleft()              $node
			        visit(node)                         @visit
			        for child in node.children:
			            queue.append(child)`,
	},
	// Lecture 8a's recursion that returns values, over any number of children: a leaf's loop never runs,
	// so h starts where a leaf ends up (-1 for a leaf 0, 0 for a leaf 1) and s at the node itself.
	'general-tree-height': heightCode(-1),
	'general-tree-height-levels': heightCode(0),
	'general-tree-size': {
		c: String.raw`
			int size(Node *node) {                              @call $node
			    int s = 1;
			    for (int i = 0; i < node->count; i++)
			        s += size(node->children[i]);               $s
			    return s;                                       @return
			}`,
		java: String.raw`
			int size(Node node) {                       @call $node
			    int s = 1;
			    for (Node child : node.children)        $child
			        s += size(child);                   $s
			    return s;                               @return
			}`,
		python: String.raw`
			def size(node):                     @call $node
			    s = 1
			    for child in node.children:     $child
			        s += size(child)            $s
			    return s                        @return`,
	},
	'general-tree-leaves': {
		c: String.raw`
			int leaves(Node *node) {                            @call $node
			    if (node->count == 0) return 1;                 @leaf
			    int n = 0;
			    for (int i = 0; i < node->count; i++)
			        n += leaves(node->children[i]);             $n
			    return n;                                       @return
			}`,
		java: String.raw`
			int leaves(Node node) {                         @call $node
			    if (node.children.isEmpty()) return 1;      @leaf
			    int n = 0;
			    for (Node child : node.children)            $child
			        n += leaves(child);                     $n
			    return n;                                   @return
			}`,
		python: String.raw`
			def leaves(node):                   @call $node
			    if not node.children:
			        return 1                    @leaf
			    n = 0
			    for child in node.children:     $child
			        n += leaves(child)          $n
			    return n                        @return`,
	},
}

/** Height over any number of children, `h` starting at `start`: -1 makes a leaf 0 (edges), 0 makes it 1 (levels). */
function heightCode(start: number): CodeSource {
	return {
		c: String.raw`
			int height(Node *node) {                            @call $node
			    int h = ${start};
			    for (int i = 0; i < node->count; i++) {
			        int below = height(node->children[i]);
			        if (below > h) h = below;                   $h
			    }
			    return 1 + h;                                   @return
			}`,
		java: String.raw`
			int height(Node node) {                     @call $node
			    int h = ${start};
			    for (Node child : node.children)        $child
			        h = Math.max(h, height(child));     $h
			    return 1 + h;                           @return
			}`,
		python: String.raw`
			def height(node):                   @call $node
			    h = ${start}
			    for child in node.children:     $child
			        h = max(h, height(child))   $h
			    return 1 + h                    @return`,
	}
}
