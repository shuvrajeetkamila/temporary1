import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '..');
const compilerPackage = '@ryoppippi/zig-linux-x64@0.14.0-dev.2456';

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

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
  console.error('A Zig 0.13+ compiler is required to cross-compile the Windows launcher.');
  process.exit(1);
}

const dist = join(root, 'dist');
const temporary = join(root, '.tmp-windows-build');
const outputDirectory = join(root, 'release');
rmSync(temporary, { recursive: true, force: true });
mkdirSync(temporary, { recursive: true });
mkdirSync(outputDirectory, { recursive: true });

function collect(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collect(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};
const files = collect(dist).filter((file) => !file.endsWith('.map'));
let generated = '#include <stddef.h>\n#include "resources.h"\n\n';
const table = [];
files.forEach((file, index) => {
  const data = readFileSync(file);
  const variable = `resource_${index}`;
  generated += `static const unsigned char ${variable}[] = {\n`;
  for (let offset = 0; offset < data.length; offset += 20) {
    generated += `  ${[...data.subarray(offset, offset + 20)].map((byte) => `0x${byte.toString(16).padStart(2, '0')}`).join(', ')},\n`;
  }
  generated += '};\n\n';
  const urlPath = `/${relative(dist, file).split('\\').join('/')}`;
  table.push(`  { ${JSON.stringify(urlPath)}, ${variable}, sizeof(${variable}), ${JSON.stringify(mimeTypes[extname(file).toLowerCase()] || 'application/octet-stream')} }`);
});
generated += `const struct EmbeddedResource g_resources[] = {\n${table.join(',\n')}\n};\n`;
generated += 'const size_t g_resource_count = sizeof(g_resources) / sizeof(g_resources[0]);\n';

const header = `#ifndef NAURU_RESOURCES_H\n#define NAURU_RESOURCES_H\n#include <stddef.h>\nstruct EmbeddedResource { const char *path; const unsigned char *data; size_t size; const char *mime; };\nextern const struct EmbeddedResource g_resources[];\nextern const size_t g_resource_count;\n#endif\n`;
writeFileSync(join(temporary, 'generated_resources.c'), generated);
writeFileSync(join(temporary, 'resources.h'), header);

// Wrap the original PNG mark in an ICO container for the Windows executable.
const iconPng = readFileSync(join(root, 'public', 'app-icon.png'));
const iconHeader = Buffer.alloc(22);
iconHeader.writeUInt16LE(0, 0); iconHeader.writeUInt16LE(1, 2); iconHeader.writeUInt16LE(1, 4);
iconHeader[6] = 0; iconHeader[7] = 0; // 256 × 256 is represented by zero in an ICO directory.
iconHeader.writeUInt16LE(1, 10); iconHeader.writeUInt16LE(32, 12);
iconHeader.writeUInt32LE(iconPng.length, 14); iconHeader.writeUInt32LE(22, 18);
writeFileSync(join(temporary, 'app.ico'), Buffer.concat([iconHeader, iconPng]));
writeFileSync(join(temporary, 'app.rc'), '1 ICON "app.ico"\n');

const output = join(outputDirectory, 'NauruCountryside-Windows-x64.exe');
const launcherObject = join(temporary, 'launcher.obj');
const resourcesObject = join(temporary, 'resources.obj');
const windowsResource = join(temporary, 'app.res');
run(zig, ['rc', '/fo', 'app.res', 'app.rc'], { cwd: temporary });
run(zig, [
  'cc', '-target', 'x86_64-windows-gnu', '-O2', '-fno-stack-protector',
  '-I', temporary, '-c', join(root, 'scripts', 'windows', 'launcher.c'), '-o', launcherObject,
]);
run(zig, [
  'cc', '-target', 'x86_64-windows-gnu', '-O2', '-fno-stack-protector',
  '-I', temporary, '-c', join(temporary, 'generated_resources.c'), '-o', resourcesObject,
]);
run(zig, [
  'build-exe', '-target', 'x86_64-windows-gnu', '-O', 'ReleaseSmall',
  '-fentry=WinMainCRTStartup', '--subsystem', 'windows', launcherObject, resourcesObject, windowsResource,
  '-lws2_32', '-lshell32', '-luser32', '-lkernel32', `-femit-bin=${output}`,
]);
rmSync(temporary, { recursive: true, force: true });
console.log(`\nWindows build ready: ${relative(root, output)} (${(readFileSync(output).length / 1024 / 1024).toFixed(2)} MiB)`);
