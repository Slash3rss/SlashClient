// The sign-in confirmation page ("Czy to Ty?"): a sign-in this browser started on the website itself
// (common.js signInWith saved its state) goes on without the extra click. A link someone else started
// and sent round has another state, so it stops at the question.
const link = document.querySelector('a[href^="/v1/auth/confirm"]');
try {
  const state = link && new URL(link.href).searchParams.get('state');
  if (state && localStorage.getItem('slashclient.login') === state) location.replace(link.href);
} catch {
  // no storage (private mode): the player clicks
}
