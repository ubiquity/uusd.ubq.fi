import esbuild from 'esbuild';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();


// Parse command line arguments
const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev');

// Build configuration
const buildOptions = {
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'public/app.js',
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  
  // Define environment variables for the bundle
  define: {
    'process.env.REOWN_PROJECT_ID': JSON.stringify(process.env.REOWN_PROJECT_ID),
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
  },
  
  // Development vs Production settings
  sourcemap: isDev ? 'inline' : true,
  minify: !isDev,
  
  // Tree shaking
  treeShaking: true,
};

// Build function
async function build() {
  console.log(`Building in ${isDev ? 'development' : 'production'} mode...`);
  
  try {
    if (isWatch) {
      // Watch mode for development
      console.log('Starting watch mode...');
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watching for changes. Press Ctrl+C to stop.\n');
    } else {
      // One-time build for production
      const result = await esbuild.build(buildOptions);
      console.log('Build completed successfully!\n');
      
      // Show build stats if available
      if (result.metafile) {
        const text = await esbuild.analyzeMetafile(result.metafile);
        console.log('Build analysis:');
        console.log(text);
      }
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run build
build();