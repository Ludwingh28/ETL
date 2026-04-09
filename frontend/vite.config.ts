import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/sistemabi/' : '/',
  plugins: [react(), tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  optimizeDeps: {
    include: ['react-pivottable', 'plotly.js-dist-min'],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
}));
