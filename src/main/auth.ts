import { createHash, randomUUID } from 'node:crypto';
import { fetchJson, httpMessage, netFetch } from './download';
import { secrets, type MicrosoftAccount, type OfflineAccount } from './store';
import { t } from '../shared/i18n';

const MS_AUTHORITY = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const SCOPE = 'XboxLive.signin offline_access';

// ---------- Offline ----------

/** Same UUID the vanilla server assigns in offline mode: UUID.nameUUIDFromBytes("OfflinePlayer:" + name). */
export function offlineUuid(name: string): string {
  const md5 = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createOfflineAccount(name: string): OfflineAccount {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('Nick musi mieć 3–16 znaków: litery, cyfry lub podkreślnik.');
  }
  return { id: randomUUID(), type: 'offline', name, uuid: offlineUuid(name) };
}

// ---------- Microsoft (device code flow) ----------

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

interface MsTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await netFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const body = (await res.json()) as T & { error?: string; error_description?: string };
  if (!res.ok) throw Object.assign(new Error(body.error_description ?? body.error ?? httpMessage(res.status, url)), { code: body.error });
  return body;
}

function requireClientId(clientId: string): void {
  if (!clientId) {
    throw new Error('Brak identyfikatora aplikacji Microsoft, logowanie kontem Microsoft jest niedostępne.');
  }
}

export async function startDeviceCode(clientId: string): Promise<DeviceCode> {
  requireClientId(clientId);
  return postForm<DeviceCode>(`${MS_AUTHORITY}/devicecode`, { client_id: clientId, scope: SCOPE });
}

/** Polls until the user finishes signing in in the browser, the code expires, or `signal` aborts. */
export async function pollDeviceCode(clientId: string, code: DeviceCode, signal?: AbortSignal): Promise<MsTokens> {
  let interval = code.interval * 1000;
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    if (signal?.aborted) throw new Error('Logowanie anulowane');
    try {
      return await postForm<MsTokens>(`${MS_AUTHORITY}/token`, {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: clientId,
        device_code: code.device_code,
      });
    } catch (err) {
      const errCode = (err as { code?: string }).code;
      if (errCode === 'authorization_pending') continue;
      if (errCode === 'slow_down') {
        interval += 5000;
        continue;
      }
      throw err;
    }
  }
  throw new Error('Kod logowania wygasł. Spróbuj ponownie.');
}

const XSTS_ERRORS: Record<number, string> = {
  2148916233: 'To konto Microsoft nie ma profilu Xbox. Zaloguj się raz na minecraft.net, aby go utworzyć.',
  2148916235: 'Xbox Live jest niedostępny w Twoim kraju.',
  2148916236: 'Konto wymaga weryfikacji wieku na xbox.com.',
  2148916237: 'Konto wymaga weryfikacji wieku na xbox.com.',
  2148916238: 'Konto dziecka musi zostać dodane do rodziny przez osobę dorosłą.',
};

/** Xbox Live → XSTS → Minecraft services. Returns a ready-to-store account (without id/refresh token). */
async function minecraftLogin(msAccessToken: string): Promise<Omit<MicrosoftAccount, 'id' | 'refreshToken'>> {
  const xbl = await fetchJson<{ Token: string; DisplayClaims: { xui: { uhs: string }[] } }>(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      }),
    },
  );

  const xstsRes = await netFetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    }),
  });
  const xsts = (await xstsRes.json()) as { Token: string; DisplayClaims: { xui: { uhs: string }[] }; XErr?: number };
  if (!xstsRes.ok) throw new Error(XSTS_ERRORS[xsts.XErr ?? 0] ? t(XSTS_ERRORS[xsts.XErr ?? 0]) : t('Błąd XSTS ({0})', xsts.XErr ?? xstsRes.status));

  const mc = await fetchJson<{ access_token: string; expires_in: number }>(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${xsts.DisplayClaims.xui[0].uhs};${xsts.Token}` }),
    },
  );

  const profileRes = await netFetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mc.access_token}` },
  });
  if (profileRes.status === 404) throw new Error('To konto nie posiada Minecraft: Java Edition.');
  if (!profileRes.ok) throw new Error(t('Nie udało się pobrać profilu Minecraft (HTTP {0})', profileRes.status));
  const profile = (await profileRes.json()) as { id: string; name: string };

  return {
    type: 'msa',
    name: profile.name,
    uuid: profile.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
    xuid: jwtClaim(mc.access_token, 'xuid') ?? '0',
    accessToken: mc.access_token,
    // Refresh a few minutes early so a token never expires mid-launch.
    expiresAt: Date.now() + (mc.expires_in - 300) * 1000,
  };
}

function jwtClaim(jwt: string, claim: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    return payload[claim] === undefined ? undefined : String(payload[claim]);
  } catch {
    return undefined;
  }
}

export async function completeMicrosoftLogin(tokens: MsTokens): Promise<MicrosoftAccount> {
  const account = await minecraftLogin(tokens.access_token);
  return { id: randomUUID(), ...account, refreshToken: secrets.encrypt(tokens.refresh_token) };
}

/** Returns the account with a valid Minecraft token, refreshing it through Microsoft if needed. */
export async function ensureFreshAccount(account: MicrosoftAccount, clientId: string): Promise<MicrosoftAccount> {
  if (Date.now() < account.expiresAt) return account;
  requireClientId(clientId);
  const tokens = await postForm<MsTokens>(`${MS_AUTHORITY}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: secrets.decrypt(account.refreshToken),
    scope: SCOPE,
  }).catch((err: Error) => {
    throw new Error(t('Sesja Microsoft wygasła — zaloguj się ponownie. ({0})', err.message));
  });
  const fresh = await minecraftLogin(tokens.access_token);
  return { ...account, ...fresh, refreshToken: secrets.encrypt(tokens.refresh_token) };
}
