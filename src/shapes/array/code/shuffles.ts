import type { CodeSource } from '../../code/algorithms'

// Lecture 2's shuffles: the unfair one and Fisher-Yates. Part of ARRAY_CODE (../code.ts).

export const SHUFFLE_CODE: Record<string, CodeSource> = {
	'unfair-shuffle': {
		c: String.raw`
			void shuffleArray(int numbers[], int len) {
			    for (int i = 0; i < len; i++) {        $i
			        int n = rand() % len;              @pick $n
			        swap(&numbers[i], &numbers[n]);    @swap
			    }
			}`,
		java: String.raw`
			public void shuffleArray(int[] numbers) {
			    for (int i = 0; i < numbers.length; i++) {      $i
			        int n = rand.nextInt(numbers.length);       @pick $n
			        swap(numbers, i, n);                        @swap
			    }
			}`,
		python: String.raw`
			def shuffle_array(numbers):
			    for i in range(len(numbers)):                   $i
			        n = random.randint(0, len(numbers) - 1)     @pick $n
			        numbers[i], numbers[n] = numbers[n], numbers[i]     @swap`,
	},
	'fisher-yates': {
		c: String.raw`
			void shuffleArray(int numbers[], int len) {
			    for (int i = len - 1; i > 0; i--) {    $i
			        int n = rand() % (i + 1);          @pick $n
			        swap(&numbers[i], &numbers[n]);    @swap
			    }
			}`,
		java: String.raw`
			public void shuffleArray(int[] numbers) {
			    for (int i = numbers.length - 1; i > 0; i--) {  $i
			        int n = rand.nextInt(i + 1);                @pick $n
			        swap(numbers, i, n);                        @swap
			    }
			}`,
		python: String.raw`
			def shuffle_array(numbers):
			    for i in range(len(numbers) - 1, 0, -1):        $i
			        n = random.randint(0, i)                    @pick $n
			        numbers[i], numbers[n] = numbers[n], numbers[i]     @swap`,
	},
}
