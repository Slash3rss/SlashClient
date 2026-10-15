/** Discord sign-in (OAuth2 "authorization code", scope `identify`). */

export interface DiscordConfig { clientId: string; clientSecret: string; redirectUri: string }
export interface DiscordUser { id: string; username: string; name: string; avatar: string }

export function authorizeUrl(cfg: DiscordConfig, state: string): string {
  const q = new URLSearchParams({ client_id: cfg.clientId, response_type: 'code', redirect_uri: cfg.redirectUri, scope: 'identify', state, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${q}`;
}

/** Trades the code from the redirect for the Discord user who signed in. */
export async function userFromCode(cfg: DiscordConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<DiscordUser> {
  const tokenRes = await fetchImpl('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`Discord: HTTP ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetchImpl('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
  if (!meRes.ok) throw new Error(`Discord: HTTP ${meRes.status}`);
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null; avatar?: string | null };
  return {
    id: me.id,
    username: me.username,
    name: me.global_name || me.username,
    avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : '',
  };
}
