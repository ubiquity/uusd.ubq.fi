import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const port = parseInt(Deno.env.get("PORT") || "3000");

console.log(`HTTP web server running. Access it at: http://localhost:${port}/`);

Deno.serve({ port }, (req) => {
  return serveDir(req, {
    fsRoot: "public",
    urlRoot: "",
    enableCors: true,
  });
});
