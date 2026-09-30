import { fileURLToPath } from 'node:url';
import { injectIWER } from '@iwsdk/vite-plugin-iwer';
import { defineConfig } from 'vite';
import { handleFlightsRequest } from './server/flights.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const repoSrc = (path) =>
  fileURLToPath(new URL(`../src/${path}`, import.meta.url));

/**
 * Serve the Vercel route from the dev and preview servers so `npm run dev`
 * behaves like the deployed site without the Vercel CLI.
 */
function flightsApiPlugin() {
  // No return value: Vite runs a function returned from configureServer as a
  // post-middleware hook.
  const install = (middlewares) => {
    middlewares.use('/api/flights', async (req, res) => {
      const response = await handleFlightsRequest(
        new Request(new URL(req.originalUrl, 'http://localhost'), {
          method: req.method,
        }),
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
  };
  return {
    name: 'gev-xr-flights-api',
    configureServer: ({ middlewares }) => {
      install(middlewares);
    },
    configurePreviewServer: ({ middlewares }) => {
      install(middlewares);
    },
  };
}

export default defineConfig({
  plugins: [
    // The public site exists so people without a headset can try it, so the
    // emulator ships in production too. Quest Browser is excluded by the
    // plugin's default user-agent exception and gets native WebXR.
    injectIWER({
      device: 'metaQuest3',
      injectOnBuild: true,
      activation: 'always',
    }),
    flightsApiPlugin(),
  ],
  resolve: {
    // Only declared, portable package exports of the parent app are reused
    // (see docs/CODE-BOUNDARIES.md): they carry no Cesium, DOM or Node code.
    alias: {
      'gods-eye-view/sources/live': repoSrc('sources/live/index.js'),
      'gods-eye-view/layers/earthquakes/source': repoSrc(
        'layers/earthquakes/source.js',
      ),
    },
  },
  server: {
    port: 4180,
    fs: { allow: [repoRoot] },
  },
  preview: { port: 4180 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
  },
});
