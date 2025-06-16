import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

  console.log('Requested URL:', req.url);
  console.log('Resolved file path:', filePath);

  try {
    const content = readFileSync(filePath);
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    console.log('Successfully serving:', filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  } catch (err) {
    console.log('File not found:', filePath);
    console.log('Error:', err.message);
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
