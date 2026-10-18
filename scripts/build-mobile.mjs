import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'public/manifest.mobile.json');
const target = resolve(root, 'dist-mobile/manifest.json');

if (!existsSync(target)) throw new Error('dist-mobile/manifest.json not found; run the Vite build first');
copyFileSync(source, target);
rmSync(resolve(root, 'dist-mobile/manifest.mobile.json'), { force: true });
console.log('Mobile manifest applied to dist-mobile');
