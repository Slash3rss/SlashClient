import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withClientJarIgnored } from '../src/main/launch';

describe('Forge launch arguments', () => {
  it('leaves the shared vanilla jar out by its own name, so Minecraft is not loaded twice', () => {
    const arg = '-DignoreList=bootstraplauncher,securejarhandler,client-extra,fmlcore,forge-,1.20.1-forge-47.4.23.jar';
    assert.equal(withClientJarIgnored(arg, '/home/a/.slashclient/versions/1.20.1/1.20.1.jar'), `${arg},1.20.1.jar`);
    assert.equal(withClientJarIgnored(arg, 'C:\\Users\\a\\versions\\1.20.1\\1.20.1.jar'), `${arg},1.20.1.jar`);
    // already there (a version without inheritsFrom): unchanged
    const own = '-DignoreList=client-extra,1.20.1.jar';
    assert.equal(withClientJarIgnored(own, '/v/1.20.1/1.20.1.jar'), own);
    // other arguments untouched
    assert.equal(withClientJarIgnored('-Xmx4G', '/v/1.20.1/1.20.1.jar'), '-Xmx4G');
  });
});
