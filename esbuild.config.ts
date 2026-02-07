import esbuild from "esbuild";
import dotenv from "dotenv";

dotenv.config();

const isWatch = process.argv.includes("--watch");
const isDev = process.argv.includes("--dev");

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ["src/app.ts"],
  bundle: true,
  outfile: "public/app.js",
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  sourcemap: isDev ? "inline" : true,
  minify: !isDev,
  treeShaking: true,
  define: {
    // Inject at build time so browser code can read it from process.env.
    "process.env.REOWN_PROJECT_ID": JSON.stringify(process.env.REOWN_PROJECT_ID ?? ""),
    "process.env.NODE_ENV": JSON.stringify(isDev ? "development" : "production"),
  },
};

async function run(): Promise<void> {
  console.log(`esbuild: ${isDev ? "dev" : "prod"}${isWatch ? " (watch)" : ""}`);

  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      return;
    }

    await esbuild.build(buildOptions);
  } catch (err) {
    console.error("esbuild failed:", err);
    process.exit(1);
  }
}

void run();

