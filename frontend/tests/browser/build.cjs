// Membundel GamePage ASLI + store untuk dijalankan di browser dengan zustand/router/socket palsu.
// Membutuhkan esbuild dan react/react-dom (mis. dari node_modules proyek): ESBUILD_PATH / NODE_PATH dapat diatur lewat env.
const path = require('path')
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild')
esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.jsx')], bundle: true, outfile: path.join(__dirname, 'app.js'), format: 'iife', jsx: 'transform', loader: { '.js': 'jsx' },
  nodePaths: (process.env.NODE_PATH || path.join(__dirname, '../../node_modules')).split(path.delimiter),
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^zustand$/ }, () => ({ path: path.join(__dirname, 'zustand.js') }))
    b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: path.join(__dirname, 'router.js') }))
    b.onResolve({ filter: /hooks\/useSocket$/ }, () => ({ path: path.join(__dirname, 'socket.js') }))
  } }],
}).then(() => console.log('bundle OK')).catch(e => { console.error(e.message); process.exit(1) })
