// Deno Deploy entrypoint for serving static files
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.'));
  return mimeTypes[ext] || 'text/plain';
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let pathname = url.pathname;

  // Default to public/index.html for root requests
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Map file paths - prioritize public directory structure
  let filePath: string;
  if (pathname.startsWith('/src/')) {
    // Serve source files directly (for development CSS/assets)
    filePath = `.${pathname}`;
  } else if (pathname === '/app.js') {
    // Serve bundled app.js from root
    filePath = './app.js';
  } else {
    // Default: serve from public directory
    filePath = `./public${pathname}`;
  }

  try {
    // Read the file
    const fileContent = await Deno.readFile(filePath);

    return new Response(fileContent, {
      status: 200,
      headers: {
        'Content-Type': getMimeType(filePath),
        'Cache-Control': pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
      },
    });
  } catch (error) {
    // File not found - log and try fallbacks
    console.log(`File not found: ${filePath}`);

    // For SPA routing, serve index.html for any non-file requests
    if (!pathname.includes('.')) {
      try {
        const indexContent = await Deno.readFile('./public/index.html');
        return new Response(indexContent, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      } catch {
        // Fallback 404
      }
    }

    return new Response('404 Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// Start the server
serve(handleRequest, { port: 8000 });
console.log('🚀 Server running on port 8000');
