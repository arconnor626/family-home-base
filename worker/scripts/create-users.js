#!/usr/bin/env node
/**
 * Step 1 of 2 for user setup.
 *
 * Prompts for each user's password, hashes it with PBKDF2, and writes the
 * records to scripts/seed-output.json. It does NOT call wrangler — Claude
 * Code handles the wrangler KV writes in step 2.
 *
 * Usage (from the worker/ directory):
 *   node scripts/create-users.js
 */

const readline = require('readline');
const { webcrypto } = require('crypto');
const fs = require('fs');
const path = require('path');

const crypto = webcrypto;

const USERS = [
  { id: 'user:alex', name: 'Alex', role: 'admin' },
  { id: 'user:jen',  name: 'Jen',  role: 'parent' },
];

const ITERATIONS = 100_000;
const DIGEST = 'SHA-256';
const KEY_BYTES = 32;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuf = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: DIGEST },
    keyMaterial, KEY_BYTES * 8
  );
  return {
    salt: toHex(salt),
    hash: toHex(new Uint8Array(hashBuf)),
    iterations: ITERATIONS,
    digest: DIGEST,
  };
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\nConnor Family Hub — user password setup');
  console.log('========================================');
  console.log('Passwords are hashed locally. The plaintext is never stored.\n');

  const records = [];

  for (const user of USERS) {
    const password = await prompt(rl, `Password for ${user.name} (${user.role}): `);
    if (!password || password.length < 8) {
      console.error(`\nError: password for ${user.name} must be at least 8 characters.`);
      rl.close();
      process.exit(1);
    }
    const passwordHash = await hashPassword(password);
    records.push({ ...user, passwordHash });
    console.log(`  Hashed.\n`);
  }

  rl.close();

  const outFile = path.join(__dirname, 'seed-output.json');
  fs.writeFileSync(outFile, JSON.stringify(records, null, 2), 'utf8');

  console.log(`Records written to scripts/seed-output.json`);
  console.log(`Tell Claude Code "seed output is ready" to complete the setup.\n`);
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
