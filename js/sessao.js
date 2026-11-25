// Página principal: ajusta o menu para quem já está logado
(function () {
  const banco = window.supabase.createClient(CLOUDIFY.supabaseUrl, CLOUDIFY.supabaseKey);
  const item = document.querySelector('.nav__item--login');
  const link = item.querySelector('a');
  const avatar = item.querySelector('.avatar');
  const convite = document.querySelector('.hero__signup');

  async function atualizar() {
    const { data } = await banco.auth.getSession();
    const usuario = data.session && data.session.user;

    link.textContent = usuario ? 'Dashboard' : 'Entrar';
    link.href = usuario ? '/dashboard' : '/login';
    convite.hidden = Boolean(usuario);
    if (!usuario) {
      avatar.hidden = true;
      return;
    }
    const consulta = await banco
      .from('clientes')
      .select('nome, foto_atualizada')
      .eq('id', usuario.id)
      .single();
    pintarAvatar(avatar, banco, usuario.id, consulta.data);
  }

  atualizar();
  // Atualiza também ao voltar pelo botão "Voltar" do navegador
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) atualizar();
  });
})();
