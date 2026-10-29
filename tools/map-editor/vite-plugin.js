import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const EDITS_DIR = fileURLToPath(new URL('../../public/data/edits/', import.meta.url));
const KOKTOKAY_EDITS_DIR = fileURLToPath(new URL('../../public/data/koktokay/edits/', import.meta.url));
const EDIT_FILES = new Set(['edits.json', 'detail.u16']);

// The map editor (/tools/map-editor/) saves through the dev server:
//   PUT    /__editor/edits/<file>  writes public/data/edits/<file>
//   DELETE /__editor/edits         removes the folder (back to the baked map)
// The folder is left out of Vite's file watching (so a save doesn't reload the
// open pages), which also keeps it out of Vite's public-file list, so it is
// served from here, fresh from disk, with an empty 204 when there's nothing saved.
export function mapEditorSaves() {
  const TYPES = { '.json': 'application/json', '.u16': 'application/octet-stream' };
  return {
    name: 'map-editor-saves',
    apply: 'serve',
    // Saving from the editor shouldn't reload the open pages.
    config: () => ({ server: { watch: { ignored: ['**/public/data/edits/**', '**/public/data/koktokay/edits/**'] } } }),
    configureServer(server) {
      function register(route, writeRoute, dir) {
        server.middlewares.use('/' + route, async (req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next();
          const name = decodeURIComponent((req.url || '/').split('?')[0].slice(1));
          if (!EDIT_FILES.has(name)) return next();
          try {
            const body = await fs.readFile(path.join(dir, name));
            res.setHeader('Content-Type', TYPES[path.extname(name)]);
            res.setHeader('Cache-Control', 'no-store');
            res.end(req.method === 'HEAD' ? undefined : body);
          } catch {
            res.statusCode = 204; // nothing saved; quieter in the console than a 404
            res.end();
          }
        });
        server.middlewares.use('/__editor/' + writeRoute, async (req, res) => {
          try {
            const name = decodeURIComponent((req.url || '/').split('?')[0].slice(1));
            if (req.method === 'PUT' && EDIT_FILES.has(name)) {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              await fs.mkdir(dir, { recursive: true });
              await fs.writeFile(path.join(dir, name), Buffer.concat(chunks));
            } else if (req.method === 'DELETE' && !name) {
              await fs.rm(dir, { recursive: true, force: true });
            } else {
              res.statusCode = 404;
              return res.end();
            }
            res.statusCode = 204;
            res.end();
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      }
      register('data/edits', 'edits', EDITS_DIR);
      register('data/koktokay/edits', 'koktokay/edits', KOKTOKAY_EDITS_DIR);
    },
  };
}
