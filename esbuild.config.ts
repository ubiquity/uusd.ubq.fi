import esbuild from 'esbuild';
import { config } from 'dotenv';

config();

async function build() {
  const buildConfig = {
    entryPoints: ['src/app.ts'],
    bundle: true,
    outfile: 'public/app.js',
    format: 'esm',
    platform: 'browser',
    sourcemap: true,
    logOverride: {
      'empty-glob': 'silent'
    },
    banner: {
      js: `globalThis.REOWN_PROJECT_ID = "${process.env.REOWN_PROJECT_ID}";`
    },    
    define: {
      'process.env.REOWN_PROJECT_ID': JSON.stringify(process.env.REOWN_PROJECT_ID),
      'globalThis.REOWN_PROJECT_ID': JSON.stringify(process.env.REOWN_PROJECT_ID),
    },
    minify: process.argv.includes('--minify')
  };

  if (process.argv.includes('--watch')) {
    const ctx = await esbuild.context(buildConfig);
    await ctx.watch();
  } else {
    await esbuild.build(buildConfig);
  }
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});