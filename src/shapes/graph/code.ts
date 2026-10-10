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
}
