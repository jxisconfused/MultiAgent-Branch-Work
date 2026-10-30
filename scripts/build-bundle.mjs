import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = ['backend', 'frontend', 'cli'];
const bundle = join(root, 'bundle');
const trailer = 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';

function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd} (exit ${result.status}).\n${result.stderr || ''}`);
  }
  return capture ? result.stdout.trim() : '';
}

function git(args, cwd = root) {
  return run('git', args, cwd, true);
}

function npm(args, cwd) {
  // Windows cannot spawn npm.cmd directly without a command interpreter.
  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], cwd);
  } else {
    run('npm', args, cwd);
  }
}

async function isInitialized(name) {
  try {
    await stat(join(root, name, '.git'));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function assertClean(cwd, label, ignoreSubmodules = false) {
  const args = ['status', '--porcelain', '--untracked-files=all'];
  if (ignoreSubmodules) args.push('--ignore-submodules=all');
  const changes = git(args, cwd);
  if (changes) throw new Error(`${label} has uncommitted changes. Commit or stash them first:\n${changes}`);
}

function commitStaged(cwd, label, message) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet', '--exit-code'], { cwd });
  if (result.error) throw result.error;
  if (result.status === 0) {
    console.log(`${label}: nothing to commit.`);
    return;
  }
  if (result.status !== 1) throw new Error(`Could not inspect staged changes in ${label} (exit ${result.status}).`);
  run('git', ['commit', '-m', message, '-m', trailer], cwd);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--push') || args.length > 1) {
    throw new Error('Usage: node scripts/build-bundle.mjs [--push]');
  }
  const push = args.includes('--push');
  if (git(['branch', '--show-current']) !== 'main') {
    throw new Error('Run the bundle generator from the main checkout.');
  }
  assertClean(root, 'main', true);
  if (git(['diff', '--cached', '--name-only'])) {
    throw new Error('main already has staged changes. Commit or unstage them first.');
  }
  for (const name of [...sources, 'bundle']) {
    if (await isInitialized(name)) assertClean(join(root, name), name);
  }

  run('git', ['submodule', 'update', '--init', '--remote', ...sources]);
  if (!(await isInitialized('bundle'))) {
    run('git', ['submodule', 'update', '--init', 'bundle']);
  }
  assertClean(bundle, 'bundle');

  const frontend = join(root, 'frontend');
  const browser = join(frontend, 'dist', 'snip-frontend', 'browser');
  // Remove only the expected build output, so a stale index cannot pass validation.
  await rm(browser, { recursive: true, force: true });
  npm(['install'], frontend);
  npm(['run', 'build', '--', '--configuration', 'production'], frontend);
  const index = join(browser, 'index.html');
  try {
    if (!(await stat(index)).isFile()) throw new Error('Not a regular file.');
  } catch (error) {
    throw new Error(`Frontend build did not produce the required ${index}`, { cause: error });
  }
  for (const name of sources) assertClean(join(root, name), name);

  const publicDir = join(bundle, 'public');
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(bundle, { recursive: true });
  await copyFile(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
  await copyFile(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
  await cp(browser, publicDir, { recursive: true });
  const readme = `# Generated Snip bundle

This branch contains generated output. Do not hand-edit it.
Run \`node scripts/build-bundle.mjs\` from the main checkout to regenerate it.

Run \`bun start\` here to serve the UI and API on port 3000.
Run \`node cli.js ls\` to list links (set SNIP_API for a remote server).
The committed .env contains only PUBLIC_DIR=./public; never add secrets to it.
Railway builds this branch using its Dockerfile.
`;
  const files = {
    'README.md': readme,
    '.env': 'PUBLIC_DIR=./public\n',
    '.gitignore': 'node_modules/\n.env.*\n!.env\n',
    'package.json': `${JSON.stringify({
      name: 'snip-bundle',
      version: '1.0.0',
      private: true,
      scripts: { start: 'bun server.js' },
    }, null, 2)}\n`,
    Dockerfile: 'FROM oven/bun:1-alpine\nWORKDIR /app\nCOPY . .\nENV PORT=3000\nEXPOSE 3000\nCMD ["bun", "server.js"]\n',
    '.dockerignore': '.git\nnode_modules\n.env.*\nnpm-debug.log*\n',
    'railway.json': `${JSON.stringify({
      $schema: 'https://railway.com/railway.schema.json',
      build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    }, null, 2)}\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    const path = join(bundle, name);
    // Avoid unnecessary writes to identical generated metadata.
    let existing;
    try {
      existing = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing !== content) await writeFile(path, content);
  }

  run('git', ['add', '-A', '--', ...Object.keys(files), 'server.js', 'cli.js', 'public'], bundle);
  commitStaged(bundle, 'bundle', 'Regenerate Snip release bundle');
  run('git', ['add', '--', ...sources, 'bundle']);
  commitStaged(root, 'main', 'Update source and generated bundle submodule pointers');

  if (push) {
    run('git', ['push', 'origin', 'HEAD:bundle'], bundle);
    run('git', ['push', 'origin', 'HEAD:main']);
  } else {
    console.log('Local commits only. Run again with --push to publish bundle and main.');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
