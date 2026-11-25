// Lê a resposta dos links de e-mail antes que o endereço seja limpo
const linkRecebido = new URLSearchParams(window.location.hash.slice(1));
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

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
}

const STATUS = { online: 'Online', problema: 'Com problema', offline: 'Fora do ar', invalido: 'Endereço inválido' };
let linhas = new Map(); // id do site -> elementos na tela

async function carregarSites() {
  const { data, error } = await banco.from('sites').select('id, url').order('id');
  if (error) {
    resumirSites('Indisponível', 0);
    return avisar('sites-aviso', 'Não foi possível carregar seus sites.', 'erro');
  }
  if (!data.length) {
    el('site-atualizar').hidden = true;
    resumirSites('Nenhum site vinculado', 0);
    return avisar('sites-aviso', 'Seus sites aparecerão aqui quando forem vinculados à conta.', 'info');
  }
  linhas = new Map(
    data.map((site) => {
      const item = criar('li', 'sites__item');
      const link = criar('a', '', site.url);
      link.href = site.url;
      link.target = '_blank';
      link.rel = 'noopener';
      const selo = criar('span', 'status');
      const detalhe = criar('p', 'sites__detalhe');
      const icone = criar('span', 'sites__icone', '</>');
      icone.setAttribute('aria-hidden', 'true');
      const texto = criar('div');
      texto.append(link, selo, detalhe);
      item.append(icone, texto);
      return [site.id, { item, selo, detalhe }];
    })
  );
  el('sites').replaceChildren(...[...linhas.values()].map((linha) => linha.item));
  el('site-atualizar').addEventListener('click', verificarSites);
  verificarSites();
}

function pintar(linha, texto, status, detalhe) {
  linha.selo.textContent = texto;
  linha.selo.className = status ? `status status--${status}` : 'status';
  linha.detalhe.textContent = detalhe || '';
}

async function verificarSites() {
  const botao = el('site-atualizar');
  botao.disabled = true;
  linhas.forEach((linha) => pintar(linha, 'Verificando...'));
  resumirSites('Verificando...', 0);
  try {
    const { data } = await banco.auth.getSession();
    const resposta = await fetch('/api/status', {
      headers: { authorization: `Bearer ${data.session.access_token}` },
    });
    if (!resposta.ok) throw new Error('falha');
    const { sites } = await resposta.json();
    const hora = new Date().toLocaleTimeString('pt-BR');
    linhas.forEach((linha, id) => {
      const site = sites.find((s) => s.id === id);
      if (!site) return pintar(linha, 'Não verificado');
      const extra = site.codigo ? ` · resposta ${site.codigo} em ${site.tempo} ms` : '';
      pintar(linha, STATUS[site.status], site.status, `Verificado às ${hora}${extra}`);
    });
    const online = sites.filter((s) => s.status === 'online' && linhas.has(s.id)).length;
    const frase = linhas.size === 1 ? 'site online' : 'sites online';
    resumirSites(`${online} de ${linhas.size} ${frase}`, online / linhas.size);
  } catch (erro) {
    linhas.forEach((linha) => pintar(linha, 'Não foi possível verificar'));
    resumirSites('Não foi possível verificar', 0);
  }
  botao.disabled = false;
}

// Recorta o centro da imagem e reduz para 256 x 256 antes de enviar
async function reduzirFoto(arquivo) {
  const imagem = await createImageBitmap(arquivo);
  const lado = Math.min(imagem.width, imagem.height);
  const tela = document.createElement('canvas');
  tela.width = tela.height = 256;
  const pincel = tela.getContext('2d');
  pincel.fillStyle = '#fff';
  pincel.fillRect(0, 0, 256, 256);
  pincel.drawImage(imagem, (imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado, 0, 0, 256, 256);
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error('imagem'))), 'image/jpeg', 0.85)
  );
}

function prepararFoto(id, cliente) {
  const caminho = `${id}/perfil.jpg`;
  const mostrar = () => {
    pintarAvatar(el('avatar'), banco, id, cliente);
    el('foto-remover').hidden = !cliente.foto_atualizada;
  };

  async function gravar(valor) {
    const { error } = await banco.from('clientes').update({ foto_atualizada: valor }).eq('id', id).select().single();
    if (error) throw error;
    cliente.foto_atualizada = valor;
    mostrar();
  }

  el('foto').addEventListener('change', async (evento) => {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    evento.target.disabled = true;
    avisar('foto-aviso', 'Enviando...', 'info');
    try {
      const foto = await reduzirFoto(arquivo);
      const { error } = await banco.storage
        .from('avatars')
        .upload(caminho, foto, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      await gravar(new Date().toISOString());
      avisar('foto-aviso', 'Foto atualizada.', 'sucesso');
    } catch (erro) {
      avisar('foto-aviso', 'Não foi possível enviar. Use uma imagem JPG, PNG ou WebP.', 'erro');
    }
    evento.target.value = '';
    evento.target.disabled = false;
  });

  el('foto-remover').addEventListener('click', async () => {
    avisar('foto-aviso', 'Removendo...', 'info');
    try {
      const { error } = await banco.storage.from('avatars').remove([caminho]);
      if (error) throw error;
      await gravar(null);
      avisar('foto-aviso', 'Foto removida.', 'sucesso');
    } catch (erro) {
      avisar('foto-aviso', 'Não foi possível remover.', 'erro');
    }
  });

  mostrar();
}

function prepararEmail(usuario) {
  if (linkRecebido.get('error')) {
    avisar('email-aviso', 'O link usado é inválido ou expirou. Peça a troca novamente.', 'erro');
  } else if (linkRecebido.get('message')) {
    avisar('email-aviso', 'Primeira confirmação recebida. Agora abra o link enviado ao outro e-mail.', 'sucesso');
  } else if (usuario.new_email) {
    avisar('email-aviso', `Troca para ${usuario.new_email} aguardando confirmação.`, 'info');
  }

  el('email-form').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const novo = el('novo-email').value.trim().toLowerCase();
    if (novo === usuario.email) return avisar('email-aviso', 'Esse já é o seu e-mail.', 'erro');
    const botao = evento.target.querySelector('button');
    botao.disabled = true;
    avisar('email-aviso', 'Enviando...', 'info');
    const { error } = await banco.auth.updateUser(
      { email: novo },
      { emailRedirectTo: `${window.location.origin}/dashboard` }
    );
    botao.disabled = false;
    if (error) {
      const textos = {
        email_exists: 'Não é possível usar esse e-mail.',
        over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos.',
      };
      return avisar('email-aviso', textos[error.code] || 'Não foi possível alterar o e-mail.', 'erro');
    }
    evento.target.reset();
    avisar('email-aviso', 'Enviamos a confirmação por e-mail. Abra os links recebidos no e-mail atual e no novo.', 'sucesso');
  });
}

function resumirSites(texto, proporcao) {
  el('geral-texto').textContent = texto;
  el('geral-barra').style.width = `${Math.round(proporcao * 100)}%`;
}

const dinheiro = (valor) => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (data) => data.split('-').reverse().join('/');

async function carregarFaturas() {
  const { data, error } = await banco.from('faturas').select('*').order('vencimento');
  if (error) {
    el('fatura-data').textContent = 'Não foi possível carregar as faturas.';
    return;
  }
  const proxima = data.find((fatura) => !fatura.pago_em);
  if (!proxima) {
    el('fatura-data').textContent = 'Nenhuma fatura em aberto.';
  } else {
    // "sv-SE" devolve a data local no formato AAAA-MM-DD
    const hoje = new Date().toLocaleDateString('sv-SE');
    const situacao = proxima.vencimento < hoje ? ['Vencida', 'offline']
      : proxima.vencimento === hoje ? ['Vence hoje', 'problema']
      : ['Em aberto', 'aberta'];
    el('fatura-valor').textContent = dinheiro(proxima.valor);
    el('fatura-data').textContent = `Vencimento: ${dataBR(proxima.vencimento)}`;
    el('fatura-status').textContent = situacao[0];
    el('fatura-status').className = `status status--${situacao[1]}`;
    el('fatura-status').hidden = false;
    if (proxima.link_pagamento && proxima.link_pagamento.startsWith('https://')) {
      el('fatura-pagar').href = proxima.link_pagamento;
      el('fatura-pagar').hidden = false;
    }
  }
  const pagas = data
    .filter((fatura) => fatura.pago_em)
    .sort((a, b) => b.pago_em.localeCompare(a.pago_em))
    .slice(0, 3);
  el('historico').hidden = !pagas.length;
  el('historico-lista').replaceChildren(
    ...pagas.map((fatura) => {
      const item = criar('li');
      item.append(criar('span', '', `Pago em ${dataBR(fatura.pago_em)}`), criar('strong', '', dinheiro(fatura.valor)));
      return item;
    })
  );
}

// Menu lateral e abas
function abrirAba(nome) {
  document.querySelectorAll('[data-aba]').forEach((botao) => {
    const ativa = botao.dataset.aba === nome;
    botao.setAttribute('aria-pressed', ativa);
    el(`aba-${botao.dataset.aba}`).hidden = !ativa;
  });
}

document.querySelectorAll('[data-aba]').forEach((botao) =>
  botao.addEventListener('click', () => abrirAba(botao.dataset.aba))
);

document.querySelectorAll('[data-ir]').forEach((botao) =>
  botao.addEventListener('click', () => {
    document.querySelectorAll('[data-ir]').forEach((outro) => outro.removeAttribute('aria-current'));
    botao.setAttribute('aria-current', 'page');
    document.body.dataset.visao = botao.dataset.ir;
    el('titulo').textContent = botao.textContent.trim();
    window.scrollTo(0, 0);
  })
);

// Quem chega por um link de troca de e-mail já vê a aba certa
if (linkRecebido.get('message') || linkRecebido.get('error')) abrirAba('email');

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
  carregarSites();
  carregarFaturas();
  prepararEmail(usuario);
  prepararFoto(usuario.id, cliente);

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
    Object.assign(cliente, novos);
    pintarAvatar(el('avatar'), banco, usuario.id, cliente);
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
