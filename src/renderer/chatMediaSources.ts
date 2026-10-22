import { mediaLinks, pageOf, type MediaSource, type PanelItem, type PanelLink } from './chatMediaPanel';

/**
 * Where the Multimedia panel (chatMediaPanel.ts) gets a chat's pictures: a conversation with a
 * friend, a group or clan chat (both end-to-end encrypted: the main process opens the keys and
 * makes the thumbnails), or a community's channel (plain JPEGs). The chats only say who is who,
 * which messages are loaded (for the links) and how to show a message.
 */

interface Api {
  socialApi: (method: string, path: string, body?: unknown) => Promise<any>;
  socialImage?: (id: string) => Promise<string>;
  socialImageThumb?: (id: string) => Promise<string>;
  socialCommunityImage?: (communityId: string, id: string) => Promise<string>;
  socialCommunityImageThumb?: (communityId: string, id: string) => Promise<string>;
}
interface Line { id: number; from: string; at: number; text?: string; deleted?: boolean; image?: unknown; unreadable?: boolean }

const page = (before?: number) => `limit=40${before ? `&before=${before}` : ''}`;

/** Links to shared screenshots and clips in loaded messages, newest first. */
function linksIn(lines: Line[], name: (id: string) => string): PanelLink[] {
  const out: PanelLink[] = [];
  for (const m of [...lines].reverse()) {
    if (m.deleted || m.unreadable || !m.text) continue;
    for (const url of mediaLinks(m.text)) out.push({ id: m.id, from: m.from, name: name(m.from), at: m.at, url });
  }
  return out;
}

/** A new picture pushed in a chat, as the panel shows it. */
const itemOf = (m: any, name: (id: string) => string): PanelItem | undefined =>
  m?.image?.id && !m.image.expired && !m.image.removed ? { id: m.id, from: m.from, name: m.author?.name ?? name(m.from), at: m.at, image: m.image } : undefined;

/** Pictures of the conversation with a friend: each takes down only their own. */
export function directSource(o: {
  api: Api; friend: { id: string; name: string }; me: () => string | undefined; myName: () => string;
  messages: () => Line[]; jump: (id: number) => void;
}): MediaSource {
  const { api, friend } = o;
  const name = (id: string) => (id === friend.id ? friend.name : o.myName());
  const ours = (m: any) => !!m && (m.from === friend.id || m.to === friend.id);
  return {
    title: friend.name,
    load: async (before) => pageOf(await api.socialApi('GET', `/v1/messages/${friend.id}/media?${page(before)}`), name),
    thumb: (i) => (api.socialImageThumb ?? api.socialImage!)(i.image.id),
    full: (i) => api.socialImage!(i.image.id),
    canDelete: (i) => i.from === o.me(),
    remove: (ids) => api.socialApi('POST', `/v1/messages/${friend.id}/media/delete`, { messages: ids }),
    jump: o.jump,
    links: () => linksIn(o.messages(), name),
    onEvent: (e) => {
      if ((e.type === 'message-edit' || e.type === 'message-delete') && ours(e.message) && (e.message.imageRemoved || e.message.deleted)) return { removed: e.message.id };
      if (e.type === 'message' && ours(e.message)) {
        const added = itemOf(e.message, name);
        return added ? { added } : undefined;
      }
      return undefined;
    },
  };
}

/** Pictures of a group or clan chat: one's own, and others' for its moderators (`mayModerate` by the author). */
export function groupSource(o: {
  api: Api; group: { id: string; name: string }; me: () => string | undefined; name: (id: string) => string;
  mayModerate: (author: string) => boolean; messages: () => Line[]; jump: (id: number) => void;
}): MediaSource {
  const { api, group } = o;
  const ours = (m: any) => !!m && m.group === group.id;
  return {
    title: group.name,
    load: async (before) => pageOf(await api.socialApi('GET', `/v1/groups/${group.id}/media?${page(before)}`), o.name),
    thumb: (i) => (api.socialImageThumb ?? api.socialImage!)(i.image.id),
    full: (i) => api.socialImage!(i.image.id),
    canDelete: (i, moderator) => i.from === o.me() || (moderator && o.mayModerate(i.from)),
    remove: (ids) => api.socialApi('POST', `/v1/groups/${group.id}/media/delete`, { messages: ids }),
    saveLimits: async (raw) => {
      const res = await api.socialApi('POST', `/v1/groups/${group.id}/media/limits`, raw);
      return res?.limits ? { limits: res.limits, usage: res.usage, global: res.global, own: res.own } : undefined;
    },
    jump: o.jump,
    links: () => linksIn(o.messages(), o.name),
    onEvent: (e) => {
      if ((e.type === 'group-message-edit' || e.type === 'group-message-delete') && ours(e.message) && (e.message.imageRemoved || e.message.deleted)) return { removed: e.message.id };
      if (e.type === 'group-message' && ours(e.message)) {
        const added = itemOf(e.message, o.name);
        return added ? { added } : undefined;
      }
      return undefined;
    },
  };
}

/** Pictures of a community's channel: one's own, and others' for those who may delete their messages. */
export function communitySource(o: {
  api: Api; community: { id: string; name: string }; channel: { id: string; name: string }; me: () => string | undefined;
  mayModerate: (item: PanelItem & { author?: unknown }) => boolean; messages: () => (Line & { author?: { name: string } })[]; jump: (id: number) => void;
}): MediaSource {
  const { api, community, channel } = o;
  const base = `/v1/communities/${community.id}/channels/${channel.id}`;
  const names = () => new Map(o.messages().map((m) => [m.from, m.author?.name ?? '?']));
  const ours = (m: any) => !!m && m.community === community.id && m.channel === channel.id;
  return {
    title: `${community.name} · #${channel.name}`,
    load: async (before) => pageOf(await api.socialApi('GET', `${base}/media?${page(before)}`), (id) => names().get(id) ?? '?'),
    thumb: (i) => (api.socialCommunityImageThumb ?? api.socialCommunityImage!)(community.id, i.image.id),
    full: (i) => api.socialCommunityImage!(community.id, i.image.id),
    canDelete: (i) => i.from === o.me() || o.mayModerate(i),
    remove: (ids) => api.socialApi('POST', `${base}/media/delete`, { messages: ids }),
    saveLimits: async (raw) => {
      const res = await api.socialApi('POST', `/v1/communities/${community.id}/media/limits`, raw);
      return res?.limits ? { limits: res.limits, usage: res.usage, global: res.global, own: res.own } : undefined;
    },
    jump: o.jump,
    links: () => linksIn(o.messages(), (id) => names().get(id) ?? '?'),
    onEvent: (e) => {
      if ((e.type === 'community-message-edit' || e.type === 'community-message-delete') && ours(e.message) && (e.message.deleted || e.message.image?.removed || e.message.image?.expired)) return { removed: e.message.id };
      if (e.type === 'community-message' && ours(e.message)) {
        const added = itemOf(e.message, (id) => names().get(id) ?? '?');
        return added ? { added } : undefined;
      }
      return undefined;
    },
  };
}
