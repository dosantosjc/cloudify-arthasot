// Verificação anti-robô (Cloudflare Turnstile).
// Cole aqui a "Site Key". A "Secret Key" vai SOMENTE no painel do Supabase.
const TURNSTILE_SITE_KEY = '0x4AAAAAAGSZPnVx9c_CjejT';

window.captcha = (function () {
  const caixa = document.getElementById('captcha');
  let token = '';
  let id;

  if (window.turnstile) {
    id = window.turnstile.render(caixa, {
      sitekey: TURNSTILE_SITE_KEY,
      language: 'pt-br',
      size: caixa.clientWidth < 300 ? 'compact' : 'flexible',
      callback: (novo) => (token = novo),
      'expired-callback': () => (token = ''),
      'error-callback': () => {
        token = '';
      },
    });
  } else {
    caixa.textContent = 'A verificação de segurança não carregou. Atualize a página.';
  }

  return {
    token: () => token,
    // Cada token vale uma única vez
    reiniciar() {
      token = '';
      if (id !== undefined) window.turnstile.reset(id);
    },
  };
})();
