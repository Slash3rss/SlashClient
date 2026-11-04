/**
 * The social 'state' event comes often: on (re)connecting, but also when the status changes, when /v1/me
 * answers and on a disconnect. What should be asked once per connection (invites, the party, the sparks
 * paid while away) uses this to tell "just connected (or another account connected)" from the rest.
 */
export function connectedFlip() {
  /** The account connected now, '' while offline or signed out. */
  let online = '';
  return (state: { user?: { id?: string } | unknown; connected?: boolean } | undefined): boolean => {
    const id = (state?.user as { id?: string } | undefined)?.id;
    const now = id && state?.connected ? id : '';
    const flipped = !!now && now !== online;
    online = now;
    return flipped;
  };
}
