// A friend's invite page (/z/<code>, made by the server: referrals.ts): the copy button puts the code
// on the clipboard, so the new player only pastes it into the launcher after signing in.

const button = document.getElementById('ref-copy');
const code = document.getElementById('ref-code');
if (button && code) {
  const label = button.querySelector('span');
  const original = label?.textContent ?? '';
  button.addEventListener('click', async () => {
    const text = code.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no clipboard (an old browser, a page not served over https): the code selected, ready for Ctrl+C
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    if (label) label.textContent = button.dataset.copied || original;
    button.classList.add('done');
    setTimeout(() => {
      if (label) label.textContent = original;
      button.classList.remove('done');
    }, 2000);
  });
}
