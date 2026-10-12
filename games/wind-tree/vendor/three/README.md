# Three.js r160 (0.160.0)

MIT licensed; the original notice is preserved in `LICENSE` and the module header.

Source: https://registry.npmjs.org/three/-/three-0.160.0.tgz

npm package integrity (SHA-512):
`sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==`

- `three.module.js`: unchanged `build/three.module.js` from this package.
- `OrbitControls.js`: `examples/jsm/controls/OrbitControls.js` from the same
  package, with only `from 'three'` changed to `from './three.module.js'`.

All WIND LAB modules use this single local Three.js instance. No import map,
runtime CDN access, or bundler is needed. Relative paths also work under the
GitHub Pages `/kaze-ni-tatsu-playground/` prefix.
