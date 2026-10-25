// The Suggest a Saint form: send it without leaving the page, and show the answer. Without this script the form
// still works: it posts to /suggest.php, which sends the visitor back to this page with a thank-you.
export function initSuggest() {
  const form = document.querySelector<HTMLFormElement>('[data-suggest]');
  if (!form) return;
  const thanks = document.querySelector<HTMLElement>('[data-thanks]')!;
  const problem = document.querySelector<HTMLElement>('[data-problem]')!;
  const send = form.querySelector<HTMLButtonElement>('[data-send]')!;
  const stamp = form.querySelector<HTMLInputElement>('[data-t]')!;
  stamp.value = String(Date.now());
  document.documentElement.classList.add('js');

  // The thank-you is only shown after a send (the address ends #thanks) or by this script.
  const showThanks = () => { thanks.classList.add('is-shown'); thanks.scrollIntoView({ behavior: 'smooth', block: 'center' }); thanks.focus({ preventScroll: true }); };
  if (location.hash === '#thanks') showThanks();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    problem.hidden = true;
    const name = form.elements.namedItem('name') as HTMLInputElement;
    const why = form.elements.namedItem('why') as HTMLTextAreaElement;
    if (!name.value.trim() || why.value.trim().length < 20) {
      problem.textContent = !name.value.trim() ? 'Please tell us the saint’s name.' : 'Please say a little more about who this saint was (at least a sentence).';
      problem.hidden = false;
      (!name.value.trim() ? name : why).focus();
      return;
    }
    send.disabled = true; send.textContent = 'Sending…';
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const out = await res.json().catch(() => ({ ok: false, message: '' }));
      if (res.ok && out.ok) {
        form.reset(); stamp.value = String(Date.now());
        showThanks();
      } else {
        problem.textContent = out.message || 'Sorry, that did not go through. Please try again in a moment, or write to josh@jwjeffery.org.';
        problem.hidden = false;
      }
    } catch {
      problem.textContent = 'Sorry, that did not go through. Please check your connection and try again, or write to josh@jwjeffery.org.';
      problem.hidden = false;
    } finally {
      send.disabled = false; send.textContent = 'Send suggestion';
    }
  });
}
