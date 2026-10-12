import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const workspace = resolve(root, '..');
const outputDirectory = join(root, 'release');
const output = join(outputDirectory, 'Nauru-The-Countryside-Fresh-Standalone-Windows-x64.exe');
const zigPackage = '@ryoppippi/zig-linux-x64@0.14.0-dev.2456';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

mkdirSync(outputDirectory, { recursive: true });
let zig = process.env.ZIG || join(workspace, 'node_modules', '@ryoppippi', 'zig-linux-x64', 'zig');
if (!existsSync(zig)) {
  try { zig = execFileSync('sh', ['-c', 'command -v zig'], { encoding: 'utf8' }).trim(); }
  catch { run('npm', ['install', '--no-save', '--package-lock=false', zigPackage]); }
}
if (!existsSync(zig)) throw new Error('Zig 0.13+ is required to compile the Windows standalone executable.');

run(zig, [
  'cc', '-target', 'x86_64-windows-gnu', '-std=c11', '-O2',
  join(root, 'src', 'nauru_standalone.c'),
  '-lopengl32', '-lgdi32', '-luser32', '-lkernel32', '-lwinmm', '-lm',
  '-Wl,--subsystem,windows', '-o', output,
]);

const image = readFileSync(output);
const peOffset = image.readUInt32LE(0x3c);
const valid = image.subarray(peOffset, peOffset + 4).toString('ascii') === 'PE\0\0'
  && image.readUInt16LE(peOffset + 4) === 0x8664
  && image.readUInt16LE(peOffset + 24 + 68) === 2;
if (!valid) throw new Error('Build did not produce a 64-bit Windows GUI executable.');
console.log(`Fresh standalone EXE: ${output} (${image.length} bytes)`);
