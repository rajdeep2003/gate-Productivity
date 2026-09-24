// tsx asks Node for the OS username when choosing its temporary directory.
// Some sandboxed Windows environments fail that native lookup; keep normal
// system behavior and add a fallback only when the native call throws.
const os = require('node:os');
try {
  os.userInfo();
} catch {
  os.userInfo = () => ({ username: process.env.USERNAME || 'gate-productivity' });
}
