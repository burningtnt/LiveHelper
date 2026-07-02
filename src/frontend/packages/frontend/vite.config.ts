import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import fs from "fs";

const isDocker = fs.existsSync("/.dockerenv");

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: isDocker,
    proxy: {
      "/api": {
        target: isDocker ? "http://host.docker.internal:23512/api" : "http://127.0.0.1:23512/api",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
