function cjReadFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('We couldn’t read that file. Try once more?'));
    r.readAsDataURL(file);
  });
}

function cjForm(form, endpoint, onOk) {
  const msg = form.querySelector('.msg');
  const btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    const files = [];
    for (const [k, v] of new FormData(form).entries()) {
      if (typeof File !== 'undefined' && v instanceof File) { if (v.size) files.push([k, v]); } else if (k in data) data[k] = [].concat(data[k], v); else data[k] = v;
    }
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Sending…';
    try {
      for (const [k, file] of files) {
        if (file.size > 3 * 1024 * 1024) throw new Error('That file is over 3 MB. A smaller PDF works great.');
        data[k] = { name: file.name, type: file.type, data: await cjReadFile(file) };
      }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error(out.message || 'Something went wrong. Try once more?');
      msg.className = 'msg ok'; msg.textContent = out.message; form.reset();
      form.querySelectorAll('.file-name').forEach((n) => { n.textContent = ''; });
      if (onOk) onOk();
    } catch (err) {
      msg.className = 'msg err'; msg.textContent = err.message;
    } finally { btn.disabled = false; }
  });
}
