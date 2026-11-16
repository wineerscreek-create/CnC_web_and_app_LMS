import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // bind 0.0.0.0 so LAN / tunnel traffic can reach the dev server
    // When exposing this dev server through ngrok / Cloudflare Tunnel, Vite
    // rejects requests whose Host header it doesn't recognize. `true` trusts
    // any host -- fine for a quiz you're temporarily tunneling for testing.
    // For a real deployment, build the app (`npm run build`) and serve the
    // static output behind your real domain instead of using the dev server.
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:8000",
      "/socket.io": { target: "http://localhost:8000", ws: true },
    },
  },
});
