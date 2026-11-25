// GET /api/status: verifica se os sites do cliente logado estão no ar
const config = require('../js/config.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const autorizacao = req.headers.authorization || '';
  if (!autorizacao.startsWith('Bearer ')) return res.status(401).json({ erro: 'Faça login.' });

  let sites;
  try {
    // Com o token do cliente, o banco só devolve os sites dele
    const consulta = await fetch(
      `${config.supabaseUrl}/rest/v1/sites?select=id,url&order=id&limit=20`,
      {
        headers: { apikey: config.supabaseKey, authorization: autorizacao },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (consulta.status === 401 || consulta.status === 403) {
      return res.status(401).json({ erro: 'Sessão inválida.' });
    }
    if (!consulta.ok) throw new Error(`Supabase respondeu ${consulta.status}`);
    sites = await consulta.json();
  } catch (erro) {
    console.error(erro.message);
    return res.status(502).json({ erro: 'Não foi possível consultar.' });
  }

  // Verifica todos ao mesmo tempo
  const resultados = await Promise.all(
    sites.map(async (site) => ({ id: site.id, ...(await verificar(site.url)) }))
  );
  return res.status(200).json({ sites: resultados });
};

// Só endereços https com nome de domínio (nada de IPs ou endereços internos)
function enderecoSeguro(endereco, base) {
  let url;
  try {
    url = new URL(endereco, base);
  } catch (erro) {
    return null;
  }
  const dominioValido = /^[a-z0-9.-]+\.[a-z][a-z0-9-]+$/i.test(url.hostname) &&
    !/\.(local|internal|localhost)$/i.test(url.hostname);
  return url.protocol === 'https:' && dominioValido && !url.port ? url : null;
}

function acessar(url) {
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7000) });
}

async function verificar(endereco) {
  const url = enderecoSeguro(endereco);
  if (!url) return { status: 'invalido' };

  const inicio = Date.now();
  try {
    const resposta = await acessar(url);
    const tempo = Date.now() - inicio;
    return {
      status: resposta.status < 400 ? 'online' : 'problema',
      codigo: resposta.status,
      tempo,
      icone: await buscarIcone(resposta, url),
    };
  } catch (erro) {
    return { status: 'offline' };
  }
}

// Descobre o ícone da aba do site. Uma falha aqui não muda o status.
async function buscarIcone(resposta, url) {
  try {
    // Segue até 3 redirecionamentos, validando cada destino
    for (let i = 0; i < 3 && resposta.status >= 300 && resposta.status < 400; i += 1) {
      const destino = enderecoSeguro(resposta.headers.get('location'), url);
      if (!destino) break;
      url = destino;
      resposta = await acessar(url);
    }
    const tipo = resposta.headers.get('content-type') || '';
    if (resposta.ok && tipo.includes('text/html')) {
      const html = await lerInicio(resposta, 200000);
      const achado = extrairIcone(html);
      const icone = achado && enderecoSeguro(achado, url);
      if (icone) return icone.href;
    }
  } catch (erro) {
    console.error('icone', url.hostname, erro.message);
  }
  // Endereço padrão usado pelos navegadores
  return new URL('/favicon.ico', url).href;
}

// Lê só o começo da página, onde ficam os ícones
async function lerInicio(resposta, limite) {
  const partes = [];
  let total = 0;
  for await (const parte of resposta.body) {
    partes.push(parte);
    total += parte.length;
    if (total >= limite) break;
  }
  return Buffer.concat(partes).toString('utf8');
}

function extrairIcone(html) {
  const atributo = (tag, nome) => {
    const achado = tag.match(new RegExp(`\\s${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return achado ? achado[1] || achado[2] || achado[3] || '' : '';
  };
  const icones = (html.match(/<link\b[^>]*>/gi) || [])
    .map((tag) => ({
      rel: atributo(tag, 'rel').toLowerCase().split(/\s+/),
      href: atributo(tag, 'href').replace(/&amp;/g, '&'),
    }))
    .filter((link) => link.href && !link.href.startsWith('data:'));
  const escolhido =
    icones.find((link) => link.rel.includes('icon')) ||
    icones.find((link) => link.rel.includes('apple-touch-icon'));
  return escolhido ? escolhido.href : null;
}
