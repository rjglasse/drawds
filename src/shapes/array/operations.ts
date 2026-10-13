// Array algorithms, step by step. Each step is a line of the code a teacher writes on the board
// (mid = (lo + hi) / 2, swap(a[j], a[j + 1]), a[i] = a[i + 1]...), drawn as it happens: pointers
// slide along the array, the cells being compared light orange, values swap or shift in arcs,
// cells in their final place turn green and cells out of play fade. Marks travel with values.
//
// The core (an operation's types, the recorder) is in record.ts; the operations in families:
// searches.ts, sorts.ts, sums.ts, shifting.ts. Import them from here.

export * from './record'
export * from './searches'
export * from './sorts'
export * from './sums'
export * from './shifting'
