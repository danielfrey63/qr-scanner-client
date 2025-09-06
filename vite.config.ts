import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'fs'
import path from 'path'

// Vite plugin to accept POST requests at /log and print them to the server console
const serverLogPlugin = (): Plugin => ({
  name: 'server-log',
  configureServer(server) {
    server.middlewares.use('/log', (req, res, next) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const logPayload = JSON.parse(body);
            // Format the log message on the server using received structured data
            const { clientId, source, level, component, message, dataString } = logPayload;
            const timestamp = new Date().toISOString(); // Add timestamp on server receive time
            // Format: "[Timestamp - Client id - Level]: [Source - Component] Message OptionalDataString"
            const finalMessage = `[${timestamp} - ${clientId || 'UNKNOWN'} - ${level || 'INFO'}]: [${source || 'Unknown'} - ${component || 'Unknown'}] ${message || ''}${dataString || ''}`;
            console.log(finalMessage); // Log the fully formatted string
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'logged' }));
          } catch (e) {
            console.error('[Server Log] Error parsing log data:', e);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
          }
        });
      } else {
        next(); // Pass other requests along
      }
    });

    // Endpoint to receive screenshots as dataURL JSON and save to disk
    server.middlewares.use('/upload-screenshot', (req, res, next) => {
      if (req.method !== 'POST') return next();

      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const { clientId, source, component, note, dataURL } = JSON.parse(body || '{}');
          if (typeof dataURL !== 'string' || !dataURL.startsWith('data:image/')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'error', message: 'dataURL (data:image/*;base64,...) required' }));
            return;
          }

          // Prepare output directory
          const OUTPUT_DIR = path.resolve(process.cwd(), 'debug_uploads');
          if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
          }

          // Extract mime and base64 payload
          const commaIdx = dataURL.indexOf(',');
          const header = dataURL.substring(0, commaIdx);
          const base64 = dataURL.substring(commaIdx + 1);
          const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/png';
          const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1] || 'png';
          const buffer = Buffer.from(base64, 'base64');

          // Build filename with timestamp and client info
          const ts = new Date().toISOString().replace(/[:]/g, '-');
          const safeClient = (clientId || 'UNKNOWN').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
          const safeSource = (source || 'Unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
          const safeComponent = (component || 'Unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
          const baseName = `${ts}__${safeClient}__${safeSource}__${safeComponent}`;
          const filename = `${baseName}.${ext}`;
          const filepath = path.join(OUTPUT_DIR, filename);

          fs.writeFileSync(filepath, buffer);

          // Optional sidecar metadata
          if (note) {
            const meta = { clientId, source, component, note, mime, size: buffer.length, createdAt: ts };
            fs.writeFileSync(path.join(OUTPUT_DIR, `${baseName}.json`), JSON.stringify(meta, null, 2));
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'saved', file: filename, dir: OUTPUT_DIR }));
        } catch (err) {
          console.error('[Upload Screenshot] Error:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Invalid request body' }));
        }
      });
    });
  }
});


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    serverLogPlugin() // Plugin for receiving remote logs
  ],
})
