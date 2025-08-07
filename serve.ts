const __dirname = new URL('.', import.meta.url).pathname;

const mimeTypes: { [key: string]: string } = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

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
  } else if (url === '/src/styles/main.css') {
    // Serve CSS from src directory
    return new URL('./src/styles/main.css', import.meta.url).pathname;
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
  const filePath = getFilePath(url.pathname);

  try {
    const content = await Deno.readFile(filePath);
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    const contentType = mimeTypes[ext] || 'text/plain';

    return new Response(content, {
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    return new Response('Not found', { status: 404 });
  }
}

const PORT = parseInt(Deno.env.get('PORT') || '3000');

console.log(`Server running at http://localhost:${PORT}`);
await Deno.serve({ port: PORT }, handler);
