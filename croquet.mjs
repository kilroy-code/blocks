//import { Croquet } from '../croquet-in-memory/index.mjs';
const { Croquet } = (typeof window !== 'undefined') ? window : await import('../croquet-in-memory/index.mjs');

export { Croquet };
