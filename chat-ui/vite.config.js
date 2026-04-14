import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api to Express backend when running vite dev server locally
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
