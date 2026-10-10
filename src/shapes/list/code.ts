import type { CodeSource } from '../code/algorithms'

// The linked list operations' code, as a code box beside the list shows it while one plays (see
// `src/shapes/code/algorithms.ts`): lecture 5's indexOf, curr walking the nodes as `e = e.next` does
// there. Tags at the ends of lines are the `line`s the steps in `operations.ts` name; `$tags` the
// variables shown (curr by its node's value).

export const LIST_CODE: Record<string, CodeSource> = {
	'list-find': {
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
}
