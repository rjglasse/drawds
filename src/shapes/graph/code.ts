import type { CodeSource } from '../code/algorithms'

// The graphs' code, as a code box beside the graph shows it while one plays (see
// `src/shapes/code/algorithms.ts`). Lecture 9's searches: visited[] an array of booleans, DFS
// marking a vertex on entry, BFS marking it as it is queued; components counted with a loop over
// the vertices, one search per component.

export const GRAPH_CODE: Record<string, CodeSource> = {
	'graph-dfs': {
		c: String.raw`
			void dfs(Graph *g, int v) {                     $v
			    visited[v] = true;                          @mark
			    for (int k = 0; k < g->degree[v]; k++) {    @loop $w
			        int w = g->adj[v][k];
			        if (!visited[w])                        @check
			            dfs(g, w);
			    }
			}`,
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
		c: String.raw`
			void bfs(Graph *g, int s) {                         $s
			    int queue[MAX];
			    int front = 0, rear = 0;
			    queue[rear++] = s;                              @start
			    visited[s] = true;
			    while (front < rear) {
			        int v = queue[front++];                     @dequeue $v
			        for (int k = 0; k < g->degree[v]; k++) {    $w
			            int w = g->adj[v][k];
			            if (!visited[w]) {                      @check
			                visited[w] = true;                  @mark
			                queue[rear++] = w;
			            }
			        }
			    }
			}`,
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
		c: String.raw`
			int count = 0;                              $count
			for (int v = 0; v < g->n; v++)              $v
			    if (!visited[v]) {                      @skip
			        dfs(g, v);                          @search
			        count++;                            @count
			    }

			void dfs(Graph *g, int u) {                 $u
			    visited[u] = true;                      @mark
			    for (int k = 0; k < g->degree[u]; k++) {
			        int w = g->adj[u][k];
			        if (!visited[w]) dfs(g, w);
			    }
			}`,
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
		c: String.raw`
			int path(Graph *g, int s, int t, int out[]) {               $s $t
			    int queue[MAX];
			    int front = 0, rear = 0;
			    queue[rear++] = s;                                      @start
			    visited[s] = true;
			    while (front < rear) {
			        int v = queue[front++];                             @dequeue $v
			        for (int k = 0; k < g->degree[v]; k++) {            $w
			            int w = g->adj[v][k];
			            if (!visited[w]) {                              @check
			                visited[w] = true;                          @mark
			                parent[w] = v;
			                if (w == t) return walkBack(s, t, out);     @found
			                queue[rear++] = w;
			            }
			        }
			    }
			    return 0;                                               @none
			}

			int walkBack(int s, int t, int path[]) {
			    int n = 0;
			    for (int x = t; x != s; x = parent[x])                  @walk $x
			        path[n++] = x;
			    path[n++] = s;
			    for (int i = 0, j = n - 1; i < j; i++, j--) {
			        int tmp = path[i]; path[i] = path[j]; path[j] = tmp;
			    }
			    return n;                                               @done
			}`,
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
		c: String.raw`
			bool hasCycle(Graph *g) {
			    for (int s = 0; s < g->n; s++)                  $s
			        if (!visited[s] && dfs(g, s, -1))           @search
			            return true;                            @yes
			    return false;                                   @no
			}

			bool dfs(Graph *g, int v, int parent) {             $v $parent
			    visited[v] = true;                              @mark
			    for (int k = 0; k < g->degree[v]; k++) {        $w
			        int w = g->adj[v][k];
			        if (!visited[w]) {
			            if (dfs(g, w, v)) return true;
			        } else if (w != parent) {                   @parent
			            return true;                            @cycle
			        }
			    }
			    return false;                                   @none-here
			}`,
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
		c: String.raw`
			bool hasCycle(Graph *g) {
			    for (int s = 0; s < g->n; s++)                  $s
			        if (!visited[s] && dfs(g, s))               @search
			            return true;                            @yes
			    return false;                                   @no
			}

			bool dfs(Graph *g, int v) {                         $v
			    visited[v] = true;                              @mark
			    onStack[v] = true;
			    for (int k = 0; k < g->degree[v]; k++) {        $w
			        int w = g->adj[v][k];
			        if (onStack[w]) return true;                @cycle
			        if (!visited[w] && dfs(g, w))               @done
			            return true;
			    }
			    onStack[v] = false;
			    return false;                                   @none-here
			}`,
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
	// Weighted graphs and DAGs (not in lecture 9; CLRS's), each as its steps run it. Dijkstra keeps one
	// entry per vertex in its priority queue, as the steps' queue shows: a shorter distance takes the
	// vertex out and puts it back (C picks the closest unfinished vertex by a scan). An unweighted
	// graph's edges each weigh 1.
	'graph-dijkstra': {
		c: String.raw`
			void dijkstra(Graph *g, int s) {                            $s
			    for (int v = 0; v < g->n; v++) dist[v] = INT_MAX;
			    dist[s] = 0;                                            @init
			    for (;;) {
			        int u = closest(g);                                 @take $u
			        if (u == -1) return;
			        done[u] = true;
			        for (int k = 0; k < g->degree[u]; k++) {            $v
			            int v = g->adj[u][k], w = g->weight[u][k];
			            if (done[v]) continue;                          @finished
			            if (dist[u] + w < dist[v]) {                    @relax
			                dist[v] = dist[u] + w;                      @update
			                via[v] = u;
			            }
			        }
			    }
			}

			// The unfinished vertex with the least distance, or -1 if none is reached.
			int closest(Graph *g) {
			    int best = -1;
			    for (int v = 0; v < g->n; v++)
			        if (!done[v] && dist[v] != INT_MAX && (best == -1 || dist[v] < dist[best]))
			            best = v;
			    return best;
			}`,
		java: String.raw`
			void dijkstra(Graph graph, int s) {                         $s
			    Arrays.fill(dist, Integer.MAX_VALUE);
			    dist[s] = 0;                                            @init
			    PriorityQueue<Integer> pq = new PriorityQueue<>((a, b) -> dist[a] - dist[b]);
			    pq.add(s);
			    while (!pq.isEmpty()) {
			        int u = pq.remove();                                @take $u
			        done[u] = true;
			        for (Edge e : graph.edges(u)) {                     $v
			            int v = e.to, w = e.weight;
			            if (done[v]) continue;                          @finished
			            if (dist[u] + w < dist[v]) {                    @relax
			                pq.remove(v);
			                dist[v] = dist[u] + w;                      @update
			                via[v] = u;
			                pq.add(v);
			            }
			        }
			    }
			}`,
		python: String.raw`
			def dijkstra(graph, s):                             $s
			    for v in graph.vertices():
			        dist[v] = math.inf
			    dist[s] = 0                                     @init
			    pq = {s}
			    while pq:
			        u = min(pq, key=lambda x: dist[x])          @take $u
			        pq.remove(u)
			        done[u] = True
			        for e in graph.edges(u):                    $v
			            v, w = e.v, e.weight
			            if done[v]:                             @finished
			                continue
			            if dist[u] + w < dist[v]:               @relax
			                dist[v] = dist[u] + w               @update
			                via[v] = u
			                pq.add(v)`,
	},
	// Prim, as its steps grow the tree: each round, the cheapest edge with one end in the tree.
	'graph-prim': {
		c: String.raw`
			void prim(Graph *g, int s) {                                $s
			    inTree[s] = true;                                      @init
			    for (;;) {
			        int best = -1;
			        for (int k = 0; k < g->m; k++) {                    @cheapest
			            Edge e = g->edges[k];
			            if (inTree[e.from] != inTree[e.to])
			                if (best == -1 || e.weight < g->edges[best].weight) best = k;
			        }
			        if (best == -1) return;
			        Edge e = g->edges[best];
			        int v = inTree[e.from] ? e.to : e.from;
			        inTree[v] = true;                                  @add $v
			        tree[count++] = e;
			        total += e.weight;
			    }
			}`,
		java: String.raw`
			void prim(Graph graph, int s) {                             $s
			    inTree[s] = true;                                       @init
			    while (true) {
			        Edge best = null;
			        for (Edge e : graph.edges())                        @cheapest
			            if (inTree[e.from] != inTree[e.to])
			                if (best == null || e.weight < best.weight) best = e;
			        if (best == null) return;
			        int v = inTree[best.from] ? best.to : best.from;
			        inTree[v] = true;                                   @add $v
			        tree.add(best);
			        total += best.weight;
			    }
			}`,
		python: String.raw`
			def prim(graph, s):                                         $s
			    in_tree[s] = True                                       @init
			    tree, total = [], 0
			    while True:
			        best = None
			        for e in graph.edges():                             @cheapest
			            if in_tree[e.u] != in_tree[e.v]:
			                if best is None or e.weight < best.weight:
			                    best = e
			        if best is None:
			            return tree, total
			        v = best.v if in_tree[best.u] else best.u
			        in_tree[v] = True                                   @add $v
			        tree.append(best)
			        total += best.weight`,
	},
	// Kruskal, the edges cheapest first, a union-find keeping the trees: find walks up to a root, union
	// by size puts the smaller tree under the bigger root (the steps' union-find beside the graph).
	'graph-kruskal': {
		c: String.raw`
			void kruskal(Graph *g) {
			    qsort(g->edges, g->m, sizeof(Edge), byWeight);         @init
			    for (int v = 0; v < g->n; v++) { parent[v] = v; size[v] = 1; }
			    for (int k = 0; k < g->m && count < g->n - 1; k++) {
			        Edge e = g->edges[k];
			        int ru = find(e.from), rv = find(e.to);
			        if (ru == rv) continue;                             @skip
			        unite(ru, rv);                                      @take
			        tree[count++] = e;
			        total += e.weight;
			    }
			}

			int find(int x) {
			    while (parent[x] != x) x = parent[x];
			    return x;
			}

			void unite(int ra, int rb) {
			    if (size[ra] > size[rb]) { int t = ra; ra = rb; rb = t; }
			    parent[ra] = rb;
			    size[rb] += size[ra];
			}

			int byWeight(const void *a, const void *b) {
			    return ((const Edge *) a)->weight - ((const Edge *) b)->weight;
			}`,
		java: String.raw`
			void kruskal(Graph graph) {
			    List<Edge> edges = new ArrayList<>(graph.edges());
			    edges.sort(Comparator.comparingInt(e -> e.weight));     @init
			    for (int v = 0; v < graph.n; v++) { parent[v] = v; size[v] = 1; }
			    for (Edge e : edges) {
			        if (tree.size() == graph.n - 1) break;
			        int ru = find(e.from), rv = find(e.to);
			        if (ru == rv) continue;                             @skip
			        union(ru, rv);                                      @take
			        tree.add(e);
			        total += e.weight;
			    }
			}

			int find(int x) {
			    while (parent[x] != x) x = parent[x];
			    return x;
			}

			void union(int ra, int rb) {
			    if (size[ra] > size[rb]) { int t = ra; ra = rb; rb = t; }
			    parent[ra] = rb;
			    size[rb] += size[ra];
			}`,
		python: String.raw`
			def kruskal(graph):
			    edges = sorted(graph.edges(), key=lambda e: e.weight)   @init
			    for v in graph.vertices():
			        parent[v], size[v] = v, 1
			    tree, total = [], 0
			    for e in edges:
			        if len(tree) == len(graph.vertices()) - 1:
			            break
			        ru, rv = find(e.u), find(e.v)
			        if ru == rv:                                        @skip
			            continue
			        union(ru, rv)                                       @take
			        tree.append(e)
			        total += e.weight
			    return tree, total

			def find(x):
			    while parent[x] != x:
			        x = parent[x]
			    return x

			def union(ra, rb):
			    if size[ra] > size[rb]:
			        ra, rb = rb, ra
			    parent[ra] = rb
			    size[rb] += size[ra]`,
	},
	// Kahn's topological sort: in-degrees counted, the vertices with none queued, each taken off
	// removing its out-edges, a vertex queued once its last incoming edge goes.
	'graph-topological-sort': {
		c: String.raw`
			void topologicalSort(Graph *g) {
			    for (int u = 0; u < g->n; u++)
			        for (int k = 0; k < g->degree[u]; k++)
			            indegree[g->adj[u][k]]++;                       @count
			    int queue[MAX], front = 0, rear = 0;
			    for (int v = 0; v < g->n; v++)
			        if (indegree[v] == 0) queue[rear++] = v;            @queue
			    while (front < rear) {
			        int u = queue[front++];                             @dequeue $u
			        order[count++] = u;
			        for (int k = 0; k < g->degree[u]; k++) {            $v
			            int v = g->adj[u][k];
			            if (--indegree[v] == 0)                         @remove
			                queue[rear++] = v;                          @free
			        }
			    }
			}`,
		java: String.raw`
			void topologicalSort(Graph graph) {
			    for (int u : graph.vertices())
			        for (int v : graph.neighbours(u))
			            indegree[v]++;                                  @count
			    Queue<Integer> queue = new LinkedList<>();
			    for (int v : graph.vertices())
			        if (indegree[v] == 0) queue.add(v);                 @queue
			    while (!queue.isEmpty()) {
			        int u = queue.remove();                             @dequeue $u
			        order.add(u);
			        for (int v : graph.neighbours(u))                   $v
			            if (--indegree[v] == 0)                         @remove
			                queue.add(v);                               @free
			    }
			}`,
		python: String.raw`
			def topological_sort(graph):
			    for u in graph.vertices():
			        for v in graph.neighbours(u):
			            indegree[v] += 1                                @count
			    queue = deque(v for v in graph.vertices() if indegree[v] == 0)     @queue
			    while queue:
			        u = queue.popleft()                                 @dequeue $u
			        order.append(u)
			        for v in graph.neighbours(u):                       $v
			            indegree[v] -= 1                                @remove
			            if indegree[v] == 0:
			                queue.append(v)                             @free`,
	},
}
