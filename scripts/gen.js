#!/usr/bin/env node
// scripts/gen.js
// Generate a bcryptjs hash from a provided string.

const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/gen.js <string> [-s saltRounds]');
  process.exit(2);
}

const input = args[0];
let saltRounds = 10;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '-s' || args[i] === '--salt') {
    const val = parseInt(args[i + 1], 10);
    if (!Number.isNaN(val)) saltRounds = val;
    i++;
  }
}

(async () => {
  try {
    const hash = await bcrypt.hash(input, saltRounds);
    console.log(hash);
  } catch (err) {
    console.error('Hash error:', err.message || err);
    process.exit(1);
  }
})();
