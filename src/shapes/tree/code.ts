import type { CodeSource } from '../code/algorithms'

// The binary trees' code, as a code box beside the tree shows it while one plays (see
// `src/shapes/code/algorithms.ts`). The traversals are lecture 8's: "if there is a left child,
// recursively call in order; visit; if there is a right child, recursively call in order". The
// recursion that returns values checks for null, so a node with one child works too.

export const TREE_CODE: Record<string, CodeSource> = {
	'tree-pre': {
		java: String.raw`
			void preOrder(Node node) {                          @call $node
			    visit(node);                                    @visit
			    if (node.left != null) preOrder(node.left);     @left
			    if (node.right != null) preOrder(node.right);   @right
			}`,
		python: String.raw`
			def pre_order(node):                        @call $node
			    visit(node)                             @visit
			    if node.left is not None:               @left
			        pre_order(node.left)
			    if node.right is not None:              @right
			        pre_order(node.right)`,
	},
	'tree-in': {
		java: String.raw`
			void inOrder(Node node) {                           @call $node
			    if (node.left != null) inOrder(node.left);      @left
			    visit(node);                                    @visit
			    if (node.right != null) inOrder(node.right);    @right
			}`,
		python: String.raw`
			def in_order(node):                         @call $node
			    if node.left is not None:               @left
			        in_order(node.left)
			    visit(node)                             @visit
			    if node.right is not None:              @right
			        in_order(node.right)`,
	},
	'tree-post': {
		java: String.raw`
			void postOrder(Node node) {                         @call $node
			    if (node.left != null) postOrder(node.left);    @left
			    if (node.right != null) postOrder(node.right);  @right
			    visit(node);                                    @visit
			}`,
		python: String.raw`
			def post_order(node):                       @call $node
			    if node.left is not None:               @left
			        post_order(node.left)
			    if node.right is not None:              @right
			        post_order(node.right)
			    visit(node)                             @visit`,
	},
	'tree-level': {
		java: String.raw`
			void levelOrder(Node root) {
			    Queue<Node> queue = new ArrayDeque<>();
			    queue.add(root);                                    @start
			    while (!queue.isEmpty()) {
			        Node node = queue.remove();                     $node
			        visit(node);                                    @visit
			        if (node.left != null) queue.add(node.left);
			        if (node.right != null) queue.add(node.right);
			    }
			}`,
		python: String.raw`
			def level_order(root):
			    queue = deque([root])                   @start
			    while queue:
			        node = queue.popleft()              $node
			        visit(node)                         @visit
			        if node.left is not None:
			            queue.append(node.left)
			        if node.right is not None:
			            queue.append(node.right)`,
	},
	// Height with a leaf 0: an empty tree is -1 (lecture 8 counts edges).
	'tree-height': {
		java: String.raw`
			int height(Node node) {                     @call $node
			    if (node == null) return -1;            @base
			    int left = height(node.left);           $left
			    int right = height(node.right);         $right
			    return 1 + Math.max(left, right);       @return
			}`,
		python: String.raw`
			def height(node):                       @call $node
			    if node is None:                    @base
			        return -1
			    left = height(node.left)            $left
			    right = height(node.right)          $right
			    return 1 + max(left, right)         @return`,
	},
	// Height with a leaf 1: an empty tree is 0 (levels counted).
	'tree-height-levels': {
		java: String.raw`
			int height(Node node) {                     @call $node
			    if (node == null) return 0;             @base
			    int left = height(node.left);           $left
			    int right = height(node.right);         $right
			    return 1 + Math.max(left, right);       @return
			}`,
		python: String.raw`
			def height(node):                       @call $node
			    if node is None:                    @base
			        return 0
			    left = height(node.left)            $left
			    right = height(node.right)          $right
			    return 1 + max(left, right)         @return`,
	},
	'tree-leaves': {
		java: String.raw`
			int leaves(Node node) {                                     @call $node
			    if (node == null) return 0;                             @base
			    if (node.left == null && node.right == null) return 1;  @leaf
			    return leaves(node.left) + leaves(node.right);          @return $left $right
			}`,
		python: String.raw`
			def leaves(node):                                   @call $node
			    if node is None:                                @base
			        return 0
			    if node.left is None and node.right is None:
			        return 1                                    @leaf
			    return leaves(node.left) + leaves(node.right)   @return $left $right`,
	},
	'tree-size': {
		java: String.raw`
			int size(Node node) {                                   @call $node
			    if (node == null) return 0;                         @base
			    return 1 + size(node.left) + size(node.right);      @return $left $right
			}`,
		python: String.raw`
			def size(node):                                     @call $node
			    if node is None:                                @base
			        return 0
			    return 1 + size(node.left) + size(node.right)   @return $left $right`,
	},
	// Lecture 8b: the minimum is as far left as the tree goes (the maximum, right).
	'bst-min': {
		java: String.raw`
			Node min(Node node) {
			    while (node.left != null)       @loop $node
			        node = node.left;           @step
			    return node;                    @found
			}`,
		python: String.raw`
			def minimum(node):
			    while node.left is not None:    @loop $node
			        node = node.left            @step
			    return node                     @found`,
	},
	'bst-max': {
		java: String.raw`
			Node max(Node node) {
			    while (node.right != null)      @loop $node
			        node = node.right;          @step
			    return node;                    @found
			}`,
		python: String.raw`
			def maximum(node):
			    while node.right is not None:   @loop $node
			        node = node.right           @step
			    return node                     @found`,
	},
	// Lecture 8b's BST, walked as the steps walk it: search and insert go down from the root comparing.
	'bst-search': {
		java: String.raw`
			Node search(int key) {                          $key
			    Node curr = root;                           @start $curr
			    while (curr != null) {
			        if (key == curr.key) return curr;       @found
			        if (key < curr.key) curr = curr.left;   @left
			        else curr = curr.right;                 @right
			    }
			    return null;                                @missing
			}`,
		python: String.raw`
			def search(self, key):                  $key
			    curr = self.root                    @start $curr
			    while curr is not None:
			        if key == curr.key:
			            return curr                 @found
			        if key < curr.key:
			            curr = curr.left            @left
			        else:
			            curr = curr.right           @right
			    return None                         @missing`,
	},
	'bst-insert': {
		java: String.raw`
			void insert(int key) {                                  $key
			    Node curr = root;                                   $curr
			    while (true) {
			        if (key == curr.key) return;                    @found
			        if (key < curr.key) {                           @left
			            if (curr.left == null) {
			                curr.left = new Node(key); return;      @hang-left
			            }
			            curr = curr.left;
			        } else {                                        @right
			            if (curr.right == null) {
			                curr.right = new Node(key); return;     @hang-right
			            }
			            curr = curr.right;
			        }
			    }
			}`,
		python: String.raw`
			def insert(self, key):                      $key
			    curr = self.root                        $curr
			    while True:
			        if key == curr.key:                 @found
			            return
			        if key < curr.key:                  @left
			            if curr.left is None:
			                curr.left = Node(key)       @hang-left
			                return
			            curr = curr.left
			        else:                               @right
			            if curr.right is None:
			                curr.right = Node(key)      @hang-right
			                return
			            curr = curr.right`,
	},
	// Three cases; with two children the successor (the leftmost of the right subtree) is relinked
	// into the node's place, no key copied: 3.1 it is the right child, 3.2 it is deeper.
	// replace(x, y): x's parent (or the root) points at y instead.
	'bst-delete': {
		java: String.raw`
			void delete(Node node) {                                $node
			    if (node.left == null && node.right == null)        @leaf
			        replace(node, null);
			    else if (node.left == null || node.right == null)   @one
			        replace(node, node.left != null ? node.left : node.right);
			    else {                                              @two
			        Node s = node.right;                            @go-right $s
			        while (s.left != null) s = s.left;              @go-left
			        if (s != node.right) {                          @deep
			            replace(s, s.right);
			            s.right = node.right;
			        }
			        s.left = node.left;                             @move-up
			        replace(node, s);
			    }
			}`,
		python: String.raw`
			def delete(self, node):                             $node
			    if node.left is None and node.right is None:    @leaf
			        self.replace(node, None)
			    elif node.left is None or node.right is None:   @one
			        self.replace(node, node.left or node.right)
			    else:                                           @two
			        s = node.right                              @go-right $s
			        while s.left is not None:                   @go-left
			            s = s.left
			        if s is not node.right:                     @deep
			            self.replace(s, s.right)
			            s.right = node.right
			        s.left = node.left                          @move-up
			        self.replace(node, s)`,
	},
}
