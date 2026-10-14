// Re-bundle with: npx esbuild vendor-entry.js --bundle --format=esm --minify --legal-comments=eof --outfile=three.bundle.js
// (three@0.186.1 from npm). Bundled locally so the game loads without a CDN.
export * from 'three';
export { Sky } from 'three/addons/objects/Sky.js';
export { Water } from 'three/addons/objects/Water.js';
export { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
