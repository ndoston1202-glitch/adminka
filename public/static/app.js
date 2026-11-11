document.addEventListener('submit', (e) => {
  const msg = e.target.dataset && e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => {
    const t = btn.textContent; btn.textContent = 'Nusxalandi ✓'; setTimeout(() => { btn.textContent = t; }, 1500);
  });
});
