// Finds the plan a double-click (or "Open with") handed to the app on its command line.
const path = require('path');

const PLAN_EXTENSION = '.mimar';

/**
 * The first argument naming a .mimar file, as a full path, or null. Switches (--something) and anything
 * else are passed over; a relative path counts from the folder the app was started in.
 */
function planPathFromArgs(args, cwd) {
  for (const arg of Array.isArray(args) ? args : []) {
    if (typeof arg !== 'string' || !arg || arg.startsWith('-')) continue;
    if (path.extname(arg).toLowerCase() !== PLAN_EXTENSION) continue;
    return path.resolve(cwd || '.', arg);
  }
  return null;
}

module.exports = { planPathFromArgs };
