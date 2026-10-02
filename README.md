# drawds

A tool for drawing data structures (lists, trees, graphs) for teaching and explanation, built on the
[tldraw SDK](https://tldraw.dev).

```bash
npm install
npm run dev
```

## Tools

- **Array** (`Shift+A`, or the first toolbar button): press and drag. A new cell appears each time the
  pointer moves one cell-width. Drag right, left, up or down; drag back to shrink.
- **Linked list** (`Shift+N`, the second toolbar button): press and drag. A `[value | next]` node appears each
  time the pointer moves one node + arrow length, with a `head` label on the first node and `null` after the last.
  The list runs the way you drag (right, left, up or down).

For both: Esc cancels while sketching, and one undo removes the whole shape. Colour, size (cell size) and font
come from the style panel.

### Adding and removing elements

Select an array or list and a small **+** grip appears just past its end (after the last cell, or after `null`).
Drag it outwards to add elements, one per cell or node length, or back to remove them. Values you typed stay;
new ones follow the shape's Fill mode (random values continue the same random sequence, ascending/descending
continue the run). One undo per drag; Esc cancels mid-drag.

Lists have more (with a mouse, a node's x and an arrow's + appear when you point at them; on touch screens they're
always shown):

- a second **+** grip before the head: drag it out to insert at the head (the `head` label moves to the new
  first node), or back to remove from the head. The rest of the list stays where it is.
- a **+** on each arrow: click it to insert a node after the arrow's source (on the arrow to `null`, that's
  after the tail). The new node opens for editing with a generated value selected: type to replace it, or press
  Enter / Esc to keep it. Sorted fills pick a value between the neighbours. Undo removes the typed value, then
  the node.
- an **x** on each node: click it to remove that node. Its predecessor now points to its successor and the
  list closes the gap; removing the head makes the next node the head. A list keeps at least one node (use
  Delete to remove the whole list). One undo per removal.

### Fill

The style panel's **Fill** picker chooses how values are generated: random integers (0-99, all different), random
with repeats allowed, empty, ascending, descending, nearly sorted, or letters (all different). New shapes use the last mode you picked. Changing the mode on a selected
shape regenerates its values from the same random draw, so switching from random to ascending sorts the same
numbers (this replaces values you typed; undo brings them back).

### Editing values

Double-click a cell or node (or select a shape and press Enter) to replace its value. Tab / Shift+Tab and the
arrow keys move between values, clicking another one jumps to it, Enter or clicking away finishes, and Esc reverts
the one you're on. Each edit is one undo step.

### Moving nodes

Select a linked list and drag the small handle under a node to move just that node; the arrows follow. Right-click
and choose **Re-layout** to put every node back in line.
