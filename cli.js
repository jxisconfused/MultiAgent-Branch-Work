#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');

const defaultApi = 'http://localhost:3000';

function usage() {
  console.log(`Snip CLI

Usage:
  snip add <url>    Create a short link
  snip ls           List links and hit counts
  snip open <code>  Open the destination in your browser
  snip help         Show this help

Set SNIP_API to change the backend origin (default: ${defaultApi}).`);
}

function getApiOrigin() {
  let apiUrl;
  try {
    apiUrl = new URL(process.env.SNIP_API || defaultApi);
  } catch {
    throw new Error('SNIP_API must be a valid URL.');
  }

  if (apiUrl.protocol !== 'http:' && apiUrl.protocol !== 'https:') {
    throw new Error('SNIP_API must use HTTP or HTTPS.');
  }

  return apiUrl.origin;
}

async function request(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach the Snip API at ${getApiOrigin()}: ${error.message}`);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The Snip API returned invalid JSON.');
  }
}

function responseError(payload, status) {
  if (typeof payload?.error === 'string') return payload.error;
  return `The Snip API returned HTTP ${status}.`;
}

async function addLink(args) {
  if (args.length !== 1) throw new Error('Usage: snip add <url>');

  let target;
  try {
    target = new URL(args[0]);
  } catch {
    throw new Error('Enter a valid HTTP or HTTPS URL.');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Enter a valid HTTP or HTTPS URL.');
  }

  const origin = getApiOrigin();
  const response = await request(`${origin}/api/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: target.toString() }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(responseError(payload, response.status));
  if (typeof payload?.shortUrl !== 'string') throw new Error('The Snip API returned an invalid link.');

  console.log(payload.shortUrl);
}

async function listLinks(args) {
  if (args.length) throw new Error('Usage: snip ls');

  const response = await request(`${getApiOrigin()}/api/links`);
  const payload = await readJson(response);
  if (!response.ok) throw new Error(responseError(payload, response.status));
  if (!Array.isArray(payload)) throw new Error('The Snip API returned an invalid link list.');
  if (!payload.length) {
    console.log('No links yet.');
    return;
  }

  const codeWidth = Math.max(4, ...payload.map((link) => String(link.code).length));
  const hitsWidth = Math.max(4, ...payload.map((link) => String(link.hits).length));
  console.log(`${'CODE'.padEnd(codeWidth)}  ${'HITS'.padStart(hitsWidth)}  URL`);
  for (const link of payload) {
    console.log(`${String(link.code).padEnd(codeWidth)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`);
  }
}

function openInBrowser(target) {
  let command;
  let args;
  if (process.platform === 'win32') {
    command = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/s', '/c', `start "" "${target.replace(/"/g, '""')}"`];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [target];
  } else {
    command = 'xdg-open';
    args = [target];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function openLink(args) {
  if (args.length !== 1 || !/^[A-Za-z0-9]{6}$/.test(args[0])) {
    throw new Error('Usage: snip open <6-character-code>');
  }

  const origin = getApiOrigin();
  const response = await request(`${origin}/${encodeURIComponent(args[0])}`, { redirect: 'manual' });
  if (response.status === 404) throw new Error(`Unknown short code: ${args[0]}`);
  if (response.status !== 302) throw new Error(`Expected a redirect, received HTTP ${response.status}.`);

  const location = response.headers.get('Location');
  if (!location) throw new Error('The Snip API returned a redirect without a destination.');

  let target;
  try {
    target = new URL(location, origin);
  } catch {
    throw new Error('The Snip API returned an invalid redirect destination.');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('The Snip API returned a non-HTTP redirect destination.');
  }

  await openInBrowser(target.toString());
  console.log(`Opening ${target.toString()}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'add') return addLink(args);
  if (command === 'ls') return listLinks(args);
  if (command === 'open') return openLink(args);
  throw new Error(`Unknown command: ${command}\n\nRun "snip help" for usage.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});