function cjForm(form, endpoint, onOk) {
  const msg = form.querySelector('.msg');
  const btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.message || 'Something went wrong. Try once more?');
      msg.className = 'msg ok'; msg.textContent = out.message; form.reset();
      if (onOk) onOk();
    } catch (err) {
      msg.className = 'msg err'; msg.textContent = err.message;
    } finally { btn.disabled = false; }
  });
}
