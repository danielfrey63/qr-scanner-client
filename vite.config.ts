import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

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
