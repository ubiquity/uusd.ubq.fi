import esbuild from 'esbuild';
import config from './esbuild.config.json' assert { type: 'json' };

async function build() {
  const buildConfig = {
    ...config,
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