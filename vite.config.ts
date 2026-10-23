import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  if (mode === 'background' || mode === 'content') {
    return {
      build: {
        emptyOutDir: false,
        lib: {
          entry: resolve(__dirname, `src/${mode}/index.ts`),
          name: mode === 'background' ? 'ArticleReaderBackground' : 'ArticleReaderContent',
          formats: ['iife'],
          fileName: () => `${mode}.js`
        },
        rollupOptions: { output: { inlineDynamicImports: true } }
      }
    };
  }
  return {
    build: {
      rollupOptions: {
        input: {
          reader: resolve(__dirname, 'reader.html'),
          popup: resolve(__dirname, 'popup.html'),
          options: resolve(__dirname, 'options.html'),
          library: resolve(__dirname, 'library.html')
        }
      }
    }
  };
});
