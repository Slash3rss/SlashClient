import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gameVersion, joinLinkIn, joinPageUrl, parseJoinLink, publicServer } from '../src/main/joinLink';

describe('"Dołącz do gry" links', () => {
  it('offers only servers on the internet', () => {
    assert.equal(publicServer('SkyUp.pl:25565'), 'skyup.pl');
    assert.equal(publicServer('mc.example.com:25566'), 'mc.example.com:25566');
    assert.equal(publicServer('51.77.1.2'), '51.77.1.2');
    for (const local of ['localhost', '127.0.0.1:51234', '192.168.1.5', '10.0.0.2', '172.20.1.1', 'minecraft', 'pc.local', '', undefined, 'evil.com/x?y'])
      assert.equal(publicServer(local), undefined, String(local));
  });

  it('builds the website page and reads the launcher link back', () => {
    assert.equal(joinPageUrl('https://slashclient.pl/', { server: 'skyup.pl', version: '26.3' }), 'https://slashclient.pl/dolacz?serwer=skyup.pl&wersja=26.3');
    assert.equal(gameVersion('26.3 · Fabric'), '26.3');
    assert.equal(gameVersion(undefined), undefined);
    assert.deepEqual(parseJoinLink('slashclient://join?server=skyup.pl&version=26.3'), { server: 'skyup.pl', version: '26.3' });
    assert.deepEqual(parseJoinLink('SLASHCLIENT://join/?server=SkyUp.pl'), { server: 'skyup.pl' });
    assert.deepEqual(joinLinkIn(['SlashClient.exe', '--', 'slashclient://join?server=skyup.pl&version=bad version']), { server: 'skyup.pl' });
    // nothing else through this door: other actions, local servers, other addresses
    assert.equal(parseJoinLink('slashclient://delete?server=skyup.pl'), undefined);
    assert.equal(parseJoinLink('slashclient://join?server=127.0.0.1'), undefined);
    assert.equal(parseJoinLink('https://join?server=skyup.pl'), undefined);
    assert.equal(joinLinkIn(['SlashClient.exe']), undefined);
  });
});
