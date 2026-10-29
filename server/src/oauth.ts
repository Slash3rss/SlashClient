/**
 * Sign-in providers for the SlashClient account. Discord, Google and GitHub use the OAuth2
 * "authorization code" (a redirect back to the server); Microsoft uses a code the player types
 * on microsoft.com/link, like the launcher's Minecraft sign-in, so it needs no secret.
 */

export type ProviderId = 'discord' | 'microsoft' | 'google' | 'github';
export interface OAuthApp { clientId: string; clientSecret: string }
export interface Identity { subject: string; handle: string; name: string; avatar: string }

/** A started "type this code" sign-in. */
export interface DeviceStart { deviceCode: string; userCode: string; url: string; intervalMs: number; expiresMs: number }

export interface Provider {
  authorizeUrl(state: string, redirectUri: string): string;
  identityFromCode(code: string, redirectUri: string, fetchImpl: typeof fetch): Promise<Identity>;
  /** Sign-in with a code typed on the provider's page instead of a redirect. */
  device?: {
    start(fetchImpl: typeof fetch): Promise<DeviceStart>;
    /** Who signed in, or whether to keep waiting ("slow_down": wait longer between tries). */
    poll(deviceCode: string, fetchImpl: typeof fetch): Promise<Identity | 'pending' | 'slow_down'>;
  };
}

async function tokenRequest(url: string, form: Record<string, string>, fetchImpl: typeof fetch): Promise<Record<string, string>> {
  const res = await fetchImpl(url, {
    method: 'POST',
    // GitHub answers in form encoding unless asked for JSON
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

export function discord(app: OAuthApp): Provider {
  return {
    authorizeUrl: (state, redirectUri) =>
      `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: app.clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state })}`,
    async identityFromCode(code, redirectUri, fetchImpl) {
      const { access_token } = await tokenRequest('https://discord.com/api/oauth2/token', {
        client_id: app.clientId, client_secret: app.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      }, fetchImpl);
      const res = await fetchImpl('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Discord: HTTP ${res.status}`);
      const me = (await res.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null };
      return {
        subject: me.id,
        handle: me.username,
        name: me.global_name || me.username,
        avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : '',
      };
    },
  };
}

/**
 * Personal Microsoft accounts through OpenID Connect, with the device code: the player types a
 * short code on microsoft.com/link. This is only "who are you" for the SlashClient account; it
 * has nothing to do with the Minecraft accounts in the launcher. Only the app id is needed.
 */
export function microsoft(app: OAuthApp): Provider {
  const base = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
  const identity = (idToken: string): Identity => {
    const claims = idTokenClaims(idToken);
    if (!claims.sub) throw new Error('Microsoft: no subject');
    const name = claims.name || claims.preferred_username?.split('@')[0] || 'Gracz';
    return { subject: claims.sub, handle: name.replace(/\s+/g, ''), name, avatar: '' };
  };
  const post = (url: string, form: Record<string, string>, fetchImpl: typeof fetch) =>
    fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(10_000) });
  const unsupported = (): never => {
    throw new Error('Microsoft: sign-in with a code only');
  };
  return {
    authorizeUrl: unsupported,
    identityFromCode: unsupported,
    device: {
      async start(fetchImpl) {
        const res = await post(`${base}/devicecode`, { client_id: app.clientId, scope: 'openid profile' }, fetchImpl);
        if (!res.ok) throw new Error(`Microsoft devicecode: HTTP ${res.status}`);
        const d = (await res.json()) as { device_code: string; user_code: string; verification_uri: string; interval?: number; expires_in?: number };
        return { deviceCode: d.device_code, userCode: d.user_code, url: d.verification_uri, intervalMs: (d.interval ?? 5) * 1000, expiresMs: (d.expires_in ?? 900) * 1000 };
      },
      async poll(deviceCode, fetchImpl) {
        const res = await post(`${base}/token`, { client_id: app.clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode }, fetchImpl);
        const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
        if (body.error === 'authorization_pending') return 'pending';
        if (body.error === 'slow_down') return 'slow_down';
        if (!res.ok || !body.id_token) throw new Error(`Microsoft token: ${body.error ?? `HTTP ${res.status}`}`);
        return identity(body.id_token);
      },
    },
  };
}

/** Claims of an OpenID Connect id_token; it comes straight from the provider over TLS, so it is read as it is. */
function idTokenClaims(idToken: string): Record<string, string | undefined> {
  return JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8'));
}

export function google(app: OAuthApp): Provider {
  return {
    authorizeUrl: (state, redirectUri) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: app.clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'openid profile', state, prompt: 'select_account' })}`,
    async identityFromCode(code, redirectUri, fetchImpl) {
      const { id_token } = await tokenRequest('https://oauth2.googleapis.com/token', {
        client_id: app.clientId, client_secret: app.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      }, fetchImpl);
      const claims = idTokenClaims(id_token);
      if (!claims.sub) throw new Error('Google: no subject');
      const name = claims.name || claims.given_name || 'Gracz';
      // only Google's own picture host, so the launcher never loads images from elsewhere
      const avatar = claims.picture?.startsWith('https://lh3.googleusercontent.com/') ? claims.picture : '';
      return { subject: claims.sub, handle: name.replace(/\s+/g, ''), name, avatar };
    },
  };
}

export function github(app: OAuthApp): Provider {
  return {
    // no scope: only the public profile
    authorizeUrl: (state, redirectUri) =>
      `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, state, allow_signup: 'true' })}`,
    async identityFromCode(code, redirectUri, fetchImpl) {
      const { access_token } = await tokenRequest('https://github.com/login/oauth/access_token', {
        client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri,
      }, fetchImpl);
      if (!access_token) throw new Error('GitHub: no token');
      const res = await fetchImpl('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'SlashClient' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
      const me = (await res.json()) as { id: number; login: string; name?: string | null; avatar_url?: string };
      return {
        subject: String(me.id),
        handle: me.login,
        name: me.name || me.login,
        avatar: me.avatar_url?.startsWith('https://avatars.githubusercontent.com/') ? me.avatar_url : '',
      };
    },
  };
}

export const PROVIDERS: Record<ProviderId, (app: OAuthApp) => Provider> = { discord, microsoft, google, github };
