import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { clearNatives, hostLibrary } from '../src/main/install';

describe('libraries for Linux on ARM', () => {
  const lwjgl = { name: 'org.lwjgl:lwjgl-glfw:3.3.1:natives-linux', rules: [{ action: 'allow' as const, os: { name: 'linux' } }], downloads: { artifact: { path: 'org/lwjgl/lwjgl-glfw/3.3.1/lwjgl-glfw-3.3.1-natives-linux.jar', url: 'https://libraries.minecraft.net/x' } } };

  it('takes the arm64 LWJGL natives from Maven Central there, and changes nothing elsewhere', () => {
    const arm = hostLibrary(lwjgl, 'linux', 'arm64');
    assert.equal(arm.name, 'org.lwjgl:lwjgl-glfw:3.3.1:natives-linux-arm64');
    assert.equal(arm.downloads?.artifact?.url, 'https://repo1.maven.org/maven2/org/lwjgl/lwjgl-glfw/3.3.1/lwjgl-glfw-3.3.1-natives-linux-arm64.jar');
    assert.deepEqual(arm.rules, lwjgl.rules);
    assert.equal(hostLibrary(lwjgl, 'linux', 'x64'), lwjgl);
    const other = { name: 'io.netty:netty-transport-native-epoll:4.2.16.Final:linux-x86_64' };
    assert.equal(hostLibrary(other, 'linux', 'arm64'), other);
  });
});

describe('natives folder before a launch', () => {
  it('empties what it can and does not fail on a file a running game keeps open', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'natives-'));
    await fs.mkdir(path.join(dir, 'jna'));
    await fs.writeFile(path.join(dir, 'lwjgl.dll'), 'x');
    // read-only stands in for a DLL loaded by the other game: Windows refuses to delete it (EPERM)
    const held = path.join(dir, 'jna', 'jna123.dll');
    await fs.writeFile(held, 'x');
    await fs.chmod(held, 0o444);
    await clearNatives(dir);
    assert.equal(existsSync(path.join(dir, 'lwjgl.dll')), false);
    await fs.chmod(held, 0o644).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  });
});
