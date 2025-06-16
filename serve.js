import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const server = createServer((req, res) => {
  let filePath;

  // Route handling for the refactored structure
  if (req.url === '/') {
    // Serve public/index.html for root requests
    filePath = join(__dirname, 'public', 'index.html');
  } else if (req.url.startsWith('/src/')) {
    // Serve files from src/ directory
    filePath = join(__dirname, req.url);
  } else if (req.url.startsWith('/public/')) {
    // Serve files from public/ directory
    filePath = join(__dirname, req.url);
  } else {
    // Serve files from root directory (like app.js)
    filePath = join(__dirname, req.url);
  }

  try {
    const content = readFileSync(filePath);
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
