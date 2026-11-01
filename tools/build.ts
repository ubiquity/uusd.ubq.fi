import * as esbuild from "esbuild";

const isWatching = Deno.args.includes("--watch");
const options: esbuild.BuildOptions = {
  entryPoints: ["src/app.ts"],
  bundle: true,
  outfile: "public/app.js",
  minify: !isWatching,
  format: "esm",
  platform: "browser",
  sourcemap: isWatching ? "inline" : true,
  define: {
    __REOWN_PROJECT_ID__: JSON.stringify(Deno.env.get("NEXT_PUBLIC_PROJECT_ID") ?? ""),
  },
};

if (isWatching) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  try {
    await esbuild.build(options);
  } finally {
    esbuild.stop();
  }
}
