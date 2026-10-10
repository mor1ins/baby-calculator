const { build } = require('esbuild');
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
(async () => {
  process.chdir(__dirname);
  await build({entryPoints:['src/mobile-ui.jsx'], bundle:true, minify:true, format:'iife', outfile:'assets/mobile-ui.js', define:{'process.env.NODE_ENV':'"production"'}, legalComments:'linked'});
  execFileSync(process.execPath, [path.join(__dirname,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i','src/mobile.css','-o','assets/mobile-ui.css','--minify'],{stdio:'inherit'});
  // CSS is served from assets; local fonts remain in design/fonts.
  const css=readFileSync('assets/mobile-ui.css','utf8').replace(/url\((['"]?)fonts\//g, 'url($1../fonts/');
  writeFileSync('assets/mobile-ui.css',css);
  let html=readFileSync('index.html','utf8');
  for (const file of ['assets/mobile-ui.js','assets/mobile-ui.css','prototype.js','reporting.js','insights.js']) {
    const hash=createHash('sha256').update(readFileSync(file)).digest('hex').slice(0,12);
    html=html.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=[a-z0-9]+','g'), file+'?v='+hash);
  }
  writeFileSync('index.html',html);
})().catch(error=>{console.error(error);process.exit(1)});
