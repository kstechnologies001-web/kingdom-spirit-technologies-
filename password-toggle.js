(() => {
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-password-toggle]');
    if (!toggle) return;
    const inputId = toggle.getAttribute('data-password-toggle');
    const input = inputId ? document.getElementById(inputId) : null;
    if (!input || input.tagName !== 'INPUT') return;

    const shouldShow = input.type === 'password';
    input.type = shouldShow ? 'text' : 'password';
    toggle.textContent = shouldShow ? 'Hide' : 'Show';
    toggle.setAttribute('aria-pressed', String(shouldShow));
    toggle.setAttribute('aria-label', shouldShow ? 'Hide password' : 'Show password');
  });
})();
