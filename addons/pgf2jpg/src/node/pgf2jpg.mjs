
// Wrapper pgf2jpg wrapper for ES6

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pgf2jpg_addon = require('../../build/Release/pgf2jpg.node');
//const pgf2jpg_addon = require('../../build/Debug/pgf2jpg.node');

export const { pgf2jpg } = pgf2jpg_addon;
export default pgf2jpg_addon;
 