import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, watchFile, Stats } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const __dirname = dirname(fileURLToPath(import.meta.url));

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json', // for source maps
};

// Store connected clients for hot reload
const clients = new Set<ServerResponse>();

// Hot reload script to inject into HTML
const hotReloadScript = `
<script>
(function() {
  const eventSource = new EventSource('/hot-reload');
  eventSource.onmessage = function(event) {
    if (event.data === 'reload') {
      console.log('🔄 Hot reloading...');
      window.location.reload();
    }
  };
  eventSource.onerror = function() {
    console.log('❌ Hot reload connection lost. Retrying...');
    setTimeout(() => window.location.reload(), 1000);
  };
  console.log('🔥 Hot reload connected');
})();
</script>
`;

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Add CORS headers for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const url = req.url || '/';

  // Handle hot reload endpoint
  if (url === '/hot-reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    res.write('data: connected\n\n');
    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  let filePath: string;

  // Route handling for the refactored structure
  if (url === '/') {
    // Serve public/index.html for root requests
    filePath = join(__dirname, 'public', 'index.html');
  } else if (url.startsWith('/src/')) {
    // Serve files from src/ directory
    filePath = join(__dirname, url);
  } else if (url.startsWith('/public/')) {
    // Serve files from public/ directory
    filePath = join(__dirname, url);
  } else {
    // Serve files from root directory (like app.js)
    filePath = join(__dirname, url);
  }

  try {
    let content: string | Buffer = readFileSync(filePath);
    const ext = filePath.substring(filePath.lastIndexOf('.'));

    // Inject hot reload script into HTML files
    if (ext === '.html') {
      content = content.toString().replace('</body>', `${hotReloadScript}</body>`);
    }

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Function to notify all clients to reload
function notifyReload() {
  console.log('📁 File changed, notifying clients to reload...');
  clients.forEach(client => {
    try {
      client.write('data: reload\n\n');
    } catch (err) {
      clients.delete(client);
    }
  });
}

// Watch for changes to built files
const appJsPath = join(__dirname, 'app.js');
const cssPath = join(__dirname, 'src', 'styles', 'main.css');

// Watch app.js for changes (esbuild output)
watchFile(appJsPath, { interval: 500 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    console.log('🔨 app.js changed');
    notifyReload();
  }
});

// Watch CSS for changes
watchFile(cssPath, { interval: 500 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    console.log('🎨 CSS changed');
    notifyReload();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Development server running at http://localhost:${PORT}`);
  console.log('🔥 Hot reload enabled');
  console.log('🗺️  Source maps enabled for debugging');
});
