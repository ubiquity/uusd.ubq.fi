import esbuild from 'esbuild';

const config = {
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'public/app.js',
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  minify: process.argv.includes('--minify'),
  logOverride: {
    'empty-glob': 'silent'
  }
};

// Para watch
if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
} else {
  await esbuild.build(config);
}