import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { presetArgs, recommendedMemoryMb } from '../src/main/jvm';

describe('JVM presets', () => {
  it('only uses ZGC where Java supports it', () => {
    assert.deepEqual(presetArgs('zgc', 25), ['-XX:+UseZGC']);
    assert.ok(presetArgs('zgc', 8).includes('-XX:+UseG1GC'), 'Java 8 falls back to G1');
    assert.deepEqual(presetArgs('default', 25), []);
  });
});

describe('memory recommendation', () => {
  it('scales with mods but leaves 4 GB for the system', () => {
    assert.equal(recommendedMemoryMb(16384, 'vanilla', 0), 4096);
    assert.equal(recommendedMemoryMb(16384, 'fabric', 20), 6144);
    assert.equal(recommendedMemoryMb(16384, 'fabric', 147), 8192);
    assert.equal(recommendedMemoryMb(32768, 'fabric', 300), 10240);
    assert.equal(recommendedMemoryMb(8192, 'fabric', 147), 4096); // only 8 GB in the computer
    assert.equal(recommendedMemoryMb(4096, 'vanilla', 0), 2048); // never below 2 GB
  });

  it("takes the modpack authors' recommendation when it is more", () => {
    assert.equal(recommendedMemoryMb(32768, 'forge', 40, 12288), 12288);
    assert.equal(recommendedMemoryMb(32768, 'forge', 300, 4096), 10240);
    assert.equal(recommendedMemoryMb(16384, 'forge', 40, 16384), 12288); // still 4 GB for the system
  });
});
