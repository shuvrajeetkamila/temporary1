import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const compilerPackage = '@ryoppippi/zig-linux-x64@0.14.0-dev.2456';
const temporary = join(root, '.tmp-windows-build');
const outputDirectory = join(root, 'release');
const output = join(outputDirectory, 'NauruCountryside-Windows-x64.exe');

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Keep the browser prototype continuously verified, but package the desktop edition as
// a true Win32/OpenGL executable rather than a local-server/browser launcher.
run('npm', ['run', 'build']);

let zig = process.env.ZIG || join(root, 'node_modules', '@ryoppippi', 'zig-linux-x64', 'zig');
if (!existsSync(zig)) {
  try { zig = execFileSync('sh', ['-c', 'command -v zig'], { encoding: 'utf8' }).trim(); }
  catch {
    console.log(`Zig was not found; fetching ${compilerPackage} for this build only…`);
    run('npm', ['install', '--no-save', '--package-lock=false', compilerPackage]);
  }
}
if (!existsSync(zig)) {
  console.error('A Zig 0.13+ compiler is required to cross-compile the Windows desktop build.');
  process.exit(1);
}

rmSync(temporary, { recursive: true, force: true });
mkdirSync(temporary, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });

// Reuse the original project mark as the executable icon without adding a native asset dependency.
const iconPng = readFileSync(join(root, 'public', 'app-icon.png'));
const iconHeader = Buffer.alloc(22);
iconHeader.writeUInt16LE(0, 0); iconHeader.writeUInt16LE(1, 2); iconHeader.writeUInt16LE(1, 4);
iconHeader[6] = 0; iconHeader[7] = 0;
iconHeader.writeUInt16LE(1, 10); iconHeader.writeUInt16LE(32, 12);
iconHeader.writeUInt32LE(iconPng.length, 14); iconHeader.writeUInt32LE(22, 18);
writeFileSync(join(temporary, 'app.ico'), Buffer.concat([iconHeader, iconPng]));
writeFileSync(join(temporary, 'app.rc'), '1 ICON "app.ico"\n');

run(zig, ['rc', '/fo', 'app.res', 'app.rc'], { cwd: temporary });
run(zig, [
  'cc', '-target', 'x86_64-windows-gnu', '-std=c11', '-O2',
  join(root, 'scripts', 'windows', 'native_game.c'), join(temporary, 'app.res'),
  '-lopengl32', '-lgdi32', '-luser32', '-lkernel32', '-lwinmm', '-lm',
  '-Wl,--subsystem,windows', '-o', output,
]);

rmSync(temporary, { recursive: true, force: true });
const executable = readFileSync(output);
const peOffset = executable.readUInt32LE(0x3c);
const subsystem = executable.readUInt16LE(peOffset + 24 + 68);
if (executable.subarray(peOffset, peOffset + 4).toString('ascii') !== 'PE\0\0' || subsystem !== 2) {
  console.error('The generated game is not a 64-bit Windows GUI executable.');
  process.exit(1);
}
console.log(`\nStandalone Windows GUI game ready: ${relative(root, output)} (${(executable.length / 1024 / 1024).toFixed(2)} MiB)`);
