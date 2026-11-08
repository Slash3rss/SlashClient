// electron-builder's Windows sign hook (win.signtoolOptions.sign): signs SlashClient.exe, the installer and
// the uninstaller with the code signing certificate, so Windows' Smart App Control and SmartScreen let
// players start the launcher instead of blocking it as an app from an unknown publisher.
//
// It signs only when WIN_CERT_SHA1 (the certificate's thumbprint) is set, which the release workflow does
// after scripts/certum-login.ps1 has logged in to Certum's SimplySign and the certificate is in the
// Windows certificate store. Without it (local builds, a release without the secrets) the files stay
// unsigned, as before.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TIMESTAMP = process.env.WIN_SIGN_TIMESTAMP || 'http://time.certum.pl';

/** signtool.exe from SIGNTOOL or the newest Windows SDK (GitHub's Windows runners have one). */
function signtool() {
  if (process.env.SIGNTOOL) return process.env.SIGNTOOL;
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  const found = (fs.existsSync(kits) ? fs.readdirSync(kits) : [])
    .filter((v) => /^10\./.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((v) => path.join(kits, v, 'x64', 'signtool.exe'))
    .find((f) => fs.existsSync(f));
  if (!found) throw new Error('win-sign: no signtool.exe (install the Windows SDK or set SIGNTOOL)');
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.default = async function sign(configuration) {
  const thumbprint = (process.env.WIN_CERT_SHA1 || '').replace(/\s/g, '');
  if (!thumbprint) return;
  const file = configuration.path;
  const tool = signtool();
  const args = ['sign', '/sha1', thumbprint, '/fd', 'sha256', '/tr', TIMESTAMP, '/td', 'sha256',
    '/d', 'SlashClient', '/du', 'https://slashclient.pl', file];
  // the timestamp server and the cloud key now and then fail once, so a few tries before giving up
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(tool, args, { stdio: 'inherit' });
      execFileSync(tool, ['verify', '/pa', file], { stdio: 'inherit' });
      console.log(`  • win-sign  ${path.basename(file)}`);
      return;
    } catch (e) {
      if (attempt >= 4) throw new Error(`win-sign: could not sign ${file}: ${e.message}`);
      console.log(`  • win-sign  ${path.basename(file)} failed (try ${attempt}), again in ${attempt * 5} s`);
      await sleep(attempt * 5000);
    }
  }
};
