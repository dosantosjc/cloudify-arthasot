const banco = window.supabase.createClient(CLOUDIFY.supabaseUrl, CLOUDIFY.supabaseKey);

const PLANOS = {
  basico: { nome: 'Básico', preco: 'R$160', itens: ['Sites ilimitados', 'Tráfego ilimitado', '100 GB Armazenamento', '3 GB RAM'] },
  ideal: { nome: 'Ideal', preco: 'R$250', itens: ['Sites ilimitados', 'Tráfego ilimitado', '250 GB Armazenamento', '6 GB RAM'] },
  pro: { nome: 'PRO', preco: 'R$380', itens: ['Sites ilimitados', 'Tráfego ilimitado', '500 GB Armazenamento', '16 GB RAM'] },
};

const el = (id) => document.getElementById(id);

function avisar(id, texto, tipo) {
  el(id).textContent = texto;
  el(id).className = `aviso aviso--${tipo}`;
}

function mostrarNome(nome) {
  el('saudacao').textContent = nome ? `Olá, ${nome}` : 'Olá!';
}

function mostrarPlano(cliente) {
  const plano = PLANOS[cliente.plano];
  if (!plano) return;
  el('plano-nome').textContent = `Plano ${plano.nome}`;
  el('plano-preco').textContent = `${plano.preco}/mês`;
  el('plano-desde').textContent = cliente.plano_desde
    ? `Contratado em ${cliente.plano_desde.split('-').reverse().join('/')}`
    : '';
  el('plano-itens').replaceChildren(
    ...plano.itens.map((texto) => {
      const item = document.createElement('li');
      item.className = 'list__item';
      item.textContent = texto;
      return item;
    })
  );
  el('plano-link').hidden = true;
}

async function verificarSite() {
  const selo = el('site-status');
  const botao = el('site-atualizar');
  botao.disabled = true;
  selo.textContent = 'Verificando...';
  selo.className = 'status';
  try {
    const { data } = await banco.auth.getSession();
    const resposta = await fetch('/api/status', {
      headers: { authorization: `Bearer ${data.session.access_token}` },
    });
    if (!resposta.ok) throw new Error('falha');
    const site = await resposta.json();
    const textos = { online: 'Online', problema: 'Com problema', offline: 'Fora do ar', 'sem-site': 'Nenhum site vinculado' };
    selo.textContent = textos[site.status];
    selo.className = `status status--${site.status}`;
    el('site-detalhe').textContent = site.status === 'sem-site'
      ? 'Seu site aparecerá aqui quando for vinculado à conta.'
      : `Verificado às ${new Date().toLocaleTimeString('pt-BR')}` +
        (site.codigo ? ` · resposta ${site.codigo} em ${site.tempo} ms` : '');
  } catch (erro) {
    selo.textContent = 'Não foi possível verificar';
    el('site-detalhe').textContent = '';
  }
  botao.disabled = false;
}

async function iniciar() {
  const { data, error } = await banco.auth.getUser();
  if (error || !data.user) return window.location.replace('/login');
  const usuario = data.user;

  const consulta = await banco.from('clientes').select('*').eq('id', usuario.id).single();
  document.body.classList.remove('carregando');
  if (consulta.error) {
    el('painel').textContent = 'Não foi possível carregar seus dados. Atualize a página.';
    return;
  }
  const cliente = consulta.data;

  mostrarNome(cliente.nome);
  ['nome', 'telefone', 'empresa'].forEach((campo) => (el(campo).value = cliente[campo]));
  el('email').value = usuario.email;
  mostrarPlano(cliente);
  if (cliente.site_url) {
    el('site-link').textContent = cliente.site_url;
    el('site-link').href = cliente.site_url;
  }
  verificarSite();
  el('site-atualizar').addEventListener('click', verificarSite);

  el('dados-form').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const novos = {
      nome: el('nome').value.trim(),
      telefone: el('telefone').value.trim(),
      empresa: el('empresa').value.trim(),
    };
    avisar('dados-aviso', 'Salvando...', 'info');
    const { error: falha } = await banco.from('clientes').update(novos).eq('id', usuario.id).select().single();
    if (falha) return avisar('dados-aviso', 'Não foi possível salvar.', 'erro');
    mostrarNome(novos.nome);
    avisar('dados-aviso', 'Dados salvos.', 'sucesso');
  });

  el('senha-form').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (el('nova-senha').value !== el('confirmar-senha').value) {
      return avisar('senha-aviso', 'As senhas não são iguais.', 'erro');
    }
    avisar('senha-aviso', 'Salvando...', 'info');
    const { error: falha } = await banco.auth.updateUser({ password: el('nova-senha').value });
    if (falha) {
      const texto = falha.code === 'same_password'
        ? 'A nova senha deve ser diferente da atual.'
        : 'Não foi possível alterar. Saia, entre de novo e tente outra vez.';
      return avisar('senha-aviso', texto, 'erro');
    }
    evento.target.reset();
    avisar('senha-aviso', 'Senha alterada.', 'sucesso');
  });
}

el('sair').addEventListener('click', async () => {
  await banco.auth.signOut({ scope: 'local' });
  window.location.replace('/login');
});

iniciar();
