import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Bundles the MCP App view (src/ui) into one self-contained HTML file that the
// server serves as a ui:// resource.
export default defineConfig({
  root: 'src/ui',
  plugins: [viteSingleFile()],
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
    rollupOptions: { input: 'src/ui/view.html' },
  },
});
