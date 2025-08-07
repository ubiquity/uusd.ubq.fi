import { generateDevtoolsJson } from "./src/utils/generate-devtools-json.ts";

const __dirname = new URL('.', import.meta.url).pathname;

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json', // for source maps
  '.svg': 'image/svg+xml',
};

// Store connected clients for hot reload
const clients = new Set<ReadableStreamDefaultController>();

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

function getFilePath(url: string): string {
  // Route handling for the refactored structure
  if (url === '/') {
    // Serve public/index.html for root requests
    return new URL('./public/index.html', import.meta.url).pathname;
  } else if (url === '/favicon.svg') {
    // Serve favicon from public directory
    return new URL('./public/favicon.svg', import.meta.url).pathname;
  } else if (url.startsWith('/.well-known/')) {
    // Serve .well-known files from public directory
    return new URL(`./public${url}`, import.meta.url).pathname;
  } else if (url.startsWith('/src/')) {
    // Serve files from src/ directory
    return new URL(`.${url}`, import.meta.url).pathname;
  } else if (url.startsWith('/public/')) {
    // Serve files from public/ directory
    return new URL(`.${url}`, import.meta.url).pathname;
  } else {
    // Serve files from root directory (like app.js)
    return new URL(`.${url}`, import.meta.url).pathname;
  }
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Add CORS headers for development
  const headers = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  // Handle hot reload endpoint
  if (url.pathname === '/hot-reload') {
    let controller: ReadableStreamDefaultController;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        clients.add(controller);
        controller.enqueue(new TextEncoder().encode('data: connected\n\n'));
      },
      cancel() {
        clients.delete(controller);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const filePath = getFilePath(url.pathname);

  try {
    let content: Uint8Array | string = await Deno.readFile(filePath);
    const ext = filePath.substring(filePath.lastIndexOf('.'));

    // Inject hot reload script into HTML files
    if (ext === '.html') {
      const textContent = new TextDecoder().decode(content);
      content = textContent.replace('</body>', `${hotReloadScript}</body>`);
    }

    headers.set('Content-Type', mimeTypes[ext] || 'text/plain');

    return new Response(content, { headers });
  } catch (err) {
    return new Response('Not found', { status: 404, headers });
  }
}

// Function to notify all clients to reload
function notifyReload() {
  console.log('📁 File changed, notifying clients to reload...');
  clients.forEach(client => {
    try {
      client.enqueue(new TextEncoder().encode('data: reload\n\n'));
    } catch (err) {
      clients.delete(client);
    }
  });
}

// Watch for changes to built files (excluding CSS for hot reload)
const appJsPath = new URL('./app.js', import.meta.url).pathname;

// Start file watchers with debouncing
async function startFileWatchers() {
  try {
    const watcher = Deno.watchFs([appJsPath]);
    let debounceTimer: number | null = null;

    for await (const event of watcher) {
      if (event.kind === 'modify') {
        // Clear existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // Set new timer with 100ms delay
        debounceTimer = setTimeout(() => {
          for (const path of event.paths) {
            if (path.endsWith('app.js')) {
              console.log('🔨 app.js changed');
              notifyReload();
              break; // Only notify once per event
            }
          }
          debounceTimer = null;
        }, 100);
      }
    }
  } catch (err) {
    console.log('⚠️  File watching not available:', err.message);
  }
}

const PORT = parseInt(Deno.env.get('PORT') || '3000');

// Generate devtools JSON if this is the main entry point
if (import.meta.main) {
  await generateDevtoolsJson();
}

console.log(`🚀 Development server running at http://localhost:${PORT}`);
console.log('🔥 Hot reload enabled');
console.log('🗺️  Source maps enabled for debugging');

// Start file watching in background
startFileWatchers();

await Deno.serve({ port: PORT }, handler);
