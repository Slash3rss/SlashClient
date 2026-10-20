// The terms and the privacy policy: the print button, and the contents list folded on narrow screens
// (open beside the text on wide ones). The pages work without this script too.

document.getElementById('legal-print')?.addEventListener('click', () => window.print());

const toc = document.getElementById('legal-toc');
const narrow = window.matchMedia('(max-width: 860px)');
const fold = () => { if (toc) toc.open = !narrow.matches; };
fold();
narrow.addEventListener('change', fold);
// a jump from the folded list closes it again, so the section is not hidden under it
toc?.addEventListener('click', (e) => { if (narrow.matches && e.target instanceof HTMLAnchorElement) toc.open = false; });
