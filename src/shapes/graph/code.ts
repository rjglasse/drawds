import type { CodeSource } from '../code/algorithms'

// The graphs' code, as a code box beside the graph shows it while one plays (see
// `src/shapes/code/algorithms.ts`). Lecture 9's searches: visited[] an array of booleans, DFS
// marking a vertex on entry, BFS marking it as it is queued; components counted with a loop over
// the vertices, one search per component.

export const GRAPH_CODE: Record<string, CodeSource> = {
	'graph-dfs': {
		java: String.raw`
			void dfs(Graph graph, int v) {                  $v
			    visited[v] = true;                          @mark
			    for (int w : graph.neighbours(v))           @loop $w
			        if (!visited[w])                        @check
			            dfs(graph, w);
			}`,
		python: String.raw`
			def dfs(graph, v):                      $v
			    visited[v] = True                   @mark
			    for w in graph.neighbours(v):       @loop $w
			        if not visited[w]:              @check
			            dfs(graph, w)`,
	},
	'graph-bfs': {
		java: String.raw`
			void bfs(Graph graph, int s) {                  $s
			    Queue<Integer> queue = new LinkedList<>();
			    queue.add(s);                               @start
			    visited[s] = true;
			    while (!queue.isEmpty()) {
			        int v = queue.remove();                 @dequeue $v
			        for (int w : graph.neighbours(v)) {     $w
			            if (!visited[w]) {                  @check
			                visited[w] = true;              @mark
			                queue.add(w);
			            }
			        }
			    }
			}`,
		python: String.raw`
			def bfs(graph, s):                      $s
			    queue = deque([s])                  @start
			    visited[s] = True
			    while queue:
			        v = queue.popleft()             @dequeue $v
			        for w in graph.neighbours(v):   $w
			            if not visited[w]:          @check
			                visited[w] = True       @mark
			                queue.append(w)`,
	},
	'graph-components': {
		java: String.raw`
			int count = 0;                              $count
			for (int v : graph.vertices())              $v
			    if (!visited[v]) {                      @skip
			        dfs(graph, v);                      @search
			        count++;                            @count
			    }

			void dfs(Graph graph, int u) {              $u
			    visited[u] = true;                      @mark
			    for (int w : graph.neighbours(u))
			        if (!visited[w]) dfs(graph, w);
			}`,
		python: String.raw`
			count = 0                           $count
			for v in graph.vertices():          $v
			    if not visited[v]:              @skip
			        dfs(graph, v)               @search
			        count += 1                  @count

			def dfs(graph, u):                  $u
			    visited[u] = True               @mark
			    for w in graph.neighbours(u):
			        if not visited[w]:
			            dfs(graph, w)`,
	},
	// A path with the fewest edges: BFS noting each vertex's parent, then walking back from t.
	'graph-path': {
		java: String.raw`
			List<Integer> path(Graph graph, int s, int t) {     $s $t
			    Queue<Integer> queue = new LinkedList<>();
			    queue.add(s);                                   @start
			    visited[s] = true;
			    while (!queue.isEmpty()) {
			        int v = queue.remove();                     @dequeue $v
			        for (int w : graph.neighbours(v)) {         $w
			            if (!visited[w]) {                      @check
			                visited[w] = true;                  @mark
			                parent[w] = v;
			                if (w == t) return walkBack(s, t);  @found
			                queue.add(w);
			            }
			        }
			    }
			    return null;                                    @none
			}

			List<Integer> walkBack(int s, int t) {
			    LinkedList<Integer> path = new LinkedList<>();
			    for (int x = t; x != s; x = parent[x])          @walk $x
			        path.addFirst(x);
			    path.addFirst(s);
			    return path;                                    @done
			}`,
		python: String.raw`
			def path(graph, s, t):                  $s $t
			    queue = deque([s])                  @start
			    visited[s] = True
			    while queue:
			        v = queue.popleft()             @dequeue $v
			        for w in graph.neighbours(v):   $w
			            if not visited[w]:          @check
			                visited[w] = True       @mark
			                parent[w] = v
			                if w == t:              @found
			                    return walk_back(s, t)
			                queue.append(w)
			    return None                         @none

			def walk_back(s, t):
			    path = [t]
			    x = t
			    while x != s:                       @walk $x
			        x = parent[x]
			        path.append(x)
			    return path[::-1]                   @done`,
	},
	// Is there a cycle? (lecture 9's Task 18): DFS from every vertex not visited yet.
	'graph-cycle': {
		java: String.raw`
			boolean hasCycle(Graph graph) {
			    for (int s : graph.vertices())                  $s
			        if (!visited[s] && dfs(graph, s, -1))       @search
			            return true;                            @yes
			    return false;                                   @no
			}

			boolean dfs(Graph graph, int v, int parent) {       $v $parent
			    visited[v] = true;                              @mark
			    for (int w : graph.neighbours(v)) {             $w
			        if (!visited[w]) {
			            if (dfs(graph, w, v)) return true;
			        } else if (w != parent) {                   @parent
			            return true;                            @cycle
			        }
			    }
			    return false;                                   @none-here
			}`,
		python: String.raw`
			def has_cycle(graph):
			    for s in graph.vertices():                  $s
			        if not visited[s] and dfs(graph, s, None):  @search
			            return True                         @yes
			    return False                                @no

			def dfs(graph, v, parent):                  $v $parent
			    visited[v] = True                           @mark
			    for w in graph.neighbours(v):               $w
			        if not visited[w]:
			            if dfs(graph, w, v):
			                return True
			        elif w != parent:                       @parent
			            return True                         @cycle
			    return False                                @none-here`,
	},
	'graph-cycle-directed': {
		java: String.raw`
			boolean hasCycle(Graph graph) {
			    for (int s : graph.vertices())                  $s
			        if (!visited[s] && dfs(graph, s))           @search
			            return true;                            @yes
			    return false;                                   @no
			}

			boolean dfs(Graph graph, int v) {                   $v
			    visited[v] = true;                              @mark
			    onStack[v] = true;
			    for (int w : graph.neighbours(v)) {             $w
			        if (onStack[w]) return true;                @cycle
			        if (!visited[w] && dfs(graph, w))           @done
			            return true;
			    }
			    onStack[v] = false;
			    return false;                                   @none-here
			}`,
		python: String.raw`
			def has_cycle(graph):
			    for s in graph.vertices():                  $s
			        if not visited[s] and dfs(graph, s):    @search
			            return True                         @yes
			    return False                                @no

			def dfs(graph, v):                          $v
			    visited[v] = True                           @mark
			    on_stack[v] = True
			    for w in graph.neighbours(v):               $w
			        if on_stack[w]:                         @cycle
			            return True
			        if not visited[w] and dfs(graph, w):    @done
			            return True
			    on_stack[v] = False
			    return False                                @none-here`,
	},
}
