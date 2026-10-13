import type { CodeSource } from '../code/algorithms'

// A trie's code, as a code box beside it shows it while one plays (see `src/shapes/code/algorithms.ts`):
// a node has a child for each letter (Java and C an array of 26, a letter c at c - 'a'; Python a dict)
// and says whether a word ends at it. Insert, contains and startsWith walk down a word's letters;
// delete is recursive, each call saying on its way back whether its node can go.

export const TRIE_CODE: Record<string, CodeSource> = {
	'trie-insert': {
		c: String.raw`
			void insert(Trie *t, const char *word) {
			    Node *node = t->root;                               @start
			    for (const char *c = word; *c; c++) {               @letter $c
			        if (node->children[*c - 'a'] == NULL)           @missing
			            node->children[*c - 'a'] = newNode();       @add
			        node = node->children[*c - 'a'];                @down $node
			    }
			    node->isWord = true;                                @mark
			}`,
		java: String.raw`
			void insert(String word) {
			    Node node = root;                                   @start
			    for (char c : word.toCharArray()) {                 @letter $c
			        if (node.children[c - 'a'] == null)             @missing
			            node.children[c - 'a'] = new Node();        @add
			        node = node.children[c - 'a'];                  @down $node
			    }
			    node.isWord = true;                                 @mark
			}`,
		python: String.raw`
			def insert(self, word):
			    node = self.root                        @start
			    for c in word:                          @letter $c
			        if c not in node.children:          @missing
			            node.children[c] = Node()       @add
			        node = node.children[c]             @down $node
			    node.is_word = True                     @mark`,
	},
	'trie-contains': {
		c: String.raw`
			bool contains(Trie *t, const char *word) {
			    Node *node = t->root;                               @start
			    for (const char *c = word; *c; c++) {               @letter $c
			        node = node->children[*c - 'a'];                @down $node
			        if (node == NULL) return false;                 @missing
			    }
			    return node->isWord;                                @end
			}`,
		java: String.raw`
			boolean contains(String word) {
			    Node node = root;                                   @start
			    for (char c : word.toCharArray()) {                 @letter $c
			        node = node.children[c - 'a'];                  @down $node
			        if (node == null) return false;                 @missing
			    }
			    return node.isWord;                                 @end
			}`,
		python: String.raw`
			def contains(self, word):
			    node = self.root                        @start
			    for c in word:                          @letter $c
			        node = node.children.get(c)         @down $node
			        if node is None:                    @missing
			            return False
			    return node.is_word                     @end`,
	},
	'trie-prefix': {
		c: String.raw`
			void startsWith(Trie *t, const char *prefix) {
			    Node *node = t->root;                               @start
			    for (const char *c = prefix; *c; c++) {             @letter $c
			        node = node->children[*c - 'a'];                @down $node
			        if (node == NULL) return;                       @missing
			    }
			    char word[64];
			    strcpy(word, prefix);
			    collect(node, word, strlen(prefix));                @collect
			}

			void collect(Node *node, char *word, int n) {           $word
			    word[n] = '\0';
			    if (node->isWord) printf("%s\n", word);             @word
			    for (int c = 0; c < 26; c++)
			        if (node->children[c] != NULL) {                @child
			            word[n] = 'a' + c;
			            collect(node->children[c], word, n + 1);
			        }
			}`,
		java: String.raw`
			List<String> startsWith(String prefix) {
			    Node node = root;                                   @start
			    for (char c : prefix.toCharArray()) {               @letter $c
			        node = node.children[c - 'a'];                  @down $node
			        if (node == null) return new ArrayList<>();     @missing
			    }
			    List<String> words = new ArrayList<>();
			    collect(node, prefix, words);                       @collect
			    return words;
			}

			void collect(Node node, String word, List<String> words) {      $word
			    if (node.isWord) words.add(word);                           @word
			    for (char c = 'a'; c <= 'z'; c++)
			        if (node.children[c - 'a'] != null)                     @child
			            collect(node.children[c - 'a'], word + c, words);
			}`,
		python: String.raw`
			def starts_with(self, prefix):
			    node = self.root                        @start
			    for c in prefix:                        @letter $c
			        node = node.children.get(c)         @down $node
			        if node is None:                    @missing
			            return []
			    words = []
			    collect(node, prefix, words)            @collect
			    return words

			def collect(node, word, words):             $word
			    if node.is_word:                        @word
			        words.append(word)
			    for c in sorted(node.children):         @child
			        collect(node.children[c], word + c, words)`,
	},
	'trie-delete': {
		c: String.raw`
			void delete(Trie *t, const char *word) {
			    deleteFrom(t->root, word);
			}

			bool deleteFrom(Node *node, const char *word) {                 $node
			    if (*word == '\0') {
			        node->isWord = false;                                   @unmark
			    } else {
			        Node *child = node->children[*word - 'a'];
			        if (child == NULL) return false;                        @missing
			        if (deleteFrom(child, word + 1)) {                      @down
			            free(child);
			            node->children[*word - 'a'] = NULL;                 @prune
			        }
			    }
			    return !node->isWord && isEmpty(node);                      @keep
			}

			bool isEmpty(Node *node) {
			    for (int c = 0; c < 26; c++)
			        if (node->children[c] != NULL) return false;
			    return true;
			}`,
		java: String.raw`
			void delete(String word) {
			    delete(root, word, 0);
			}

			boolean delete(Node node, String word, int d) {         $node
			    if (d == word.length()) {
			        node.isWord = false;                            @unmark
			    } else {
			        int c = word.charAt(d) - 'a';
			        Node child = node.children[c];
			        if (child == null) return false;                @missing
			        if (delete(child, word, d + 1))                 @down
			            node.children[c] = null;                    @prune
			    }
			    return !node.isWord && isEmpty(node);               @keep
			}

			boolean isEmpty(Node node) {
			    for (Node child : node.children)
			        if (child != null) return false;
			    return true;
			}`,
		python: String.raw`
			def delete(self, word):
			    delete_from(self.root, word, 0)

			def delete_from(node, word, d):                     $node
			    if d == len(word):
			        node.is_word = False                        @unmark
			    else:
			        child = node.children.get(word[d])
			        if child is None:                           @missing
			            return False
			        if delete_from(child, word, d + 1):         @down
			            del node.children[word[d]]              @prune
			    return not node.is_word and not node.children   @keep`,
	},
}
