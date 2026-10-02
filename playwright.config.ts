import { defineConfig } from '@playwright/test'

const PORT = 5179

// Browser tests for gestures, editing and the UI. Uses the installed Google Chrome (no browser
// download) against the Vite dev server, which exposes `window.editor` for assertions.
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		channel: 'chrome',
		viewport: { width: 1400, height: 900 },
	},
	webServer: {
		command: `npm run dev -- --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: true,
	},
})
