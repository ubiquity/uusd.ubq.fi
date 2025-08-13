import { generateDevtoolsJson } from "./src/utils/generate-devtools-json.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

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

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Add CORS headers for development
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  // Handle hot reload endpoint
  if (path === "/hot-reload") {
    let controller: ReadableStreamDefaultController;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        clients.add(controller);
        controller.enqueue(new TextEncoder().encode("data: connected\n\n"));
      },
      cancel() {
        clients.delete(controller);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Serve static files from the "public" directory first
  if (path === "/" || path.startsWith("/public/") || path === "/app.js" || path === "/favicon.svg" || path.startsWith("/styles/")) {
    const response = await serveDir(req, {
      fsRoot: "public",
      urlRoot: "",
      enableCors: true,
    });

    // Inject hot reload script into HTML files
    if (path === "/" && response.ok) {
      const textContent = await response.text();
      const modifiedContent = textContent.replace("</body>", `${hotReloadScript}</body>`);
      return new Response(modifiedContent, {
        headers: {
          "Content-Type": "text/html",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    return response;
  }

  // Serve files from the "src" directory for development
  if (path.startsWith("/src/")) {
    return serveDir(req, {
      fsRoot: "src",
      urlRoot: "src",
      enableCors: true,
    });
  }

  // For any other request, return a 404 response
  return new Response("Not Found", {
    status: 404,
    headers,
  });
}

// Function to notify all clients to reload
function notifyReload() {
  console.log("📁 File changed, notifying clients to reload...");
  clients.forEach((client) => {
    try {
      client.enqueue(new TextEncoder().encode("data: reload\n\n"));
    } catch (err: any) {
      console.error(`Hot reload client error: ${err.message}. Removing client.`);
      clients.delete(client);
    }
  });
}

// Watch for changes to built files
const appJsPath = new URL("./public/app.js", import.meta.url).pathname;

// Start file watchers with debouncing
async function startFileWatchers() {
  try {
    const watcher = Deno.watchFs([appJsPath]);
    let debounceTimer: number | null = null;

    for await (const event of watcher) {
      if (event.kind === "modify") {
        // Clear existing timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // Set new timer with 100ms delay
        debounceTimer = setTimeout(() => {
          for (const path of event.paths) {
            if (path.endsWith("app.js")) {
              console.log("🔨 app.js changed");
              notifyReload();
              break; // Only notify once per event
            }
          }
          debounceTimer = null;
        }, 100);
      }
    }
  } catch (err: any) {
    console.log("⚠️  File watching not available:", err.message);
  }
}

const PORT = parseInt(Deno.env.get("PORT") || "3000");

// Generate devtools JSON if this is the main entry point
if (import.meta.main) {
  await generateDevtoolsJson();
}

console.log(`🚀 Development server running at http://localhost:${PORT}`);
console.log("🔥 Hot reload enabled");
console.log("🗺️  Source maps enabled for debugging");

// Start file watching in background
startFileWatchers();

await Deno.serve({ port: PORT }, handler);
