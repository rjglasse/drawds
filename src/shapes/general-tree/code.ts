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
}
