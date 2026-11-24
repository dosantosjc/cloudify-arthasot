// Função da Vercel: GET /api/dominio?nome=meusite
// Consulta o RDAP (serviço público dos registros) para saber se o domínio já existe.

const EXTENSOES = ['com', 'edu', 'br', 'com.br', 'net', 'xyz'];
const RESTRITAS = {
  edu: 'Restrito a instituições de ensino autorizadas.',
  br: 'Consulte no registro.br as regras para registro direto em .br.',
};

let listaServidores; // lista oficial da IANA, guardada entre chamadas

function buscar(url) {
  return fetch(url, {
    headers: { accept: 'application/rdap+json, application/json' },
    signal: AbortSignal.timeout(6000),
  });
}

async function servidorRdap(extensao) {
  if (extensao.endsWith('br')) return 'https://rdap.registro.br/';
  if (!listaServidores) {
    const resposta = await buscar('https://data.iana.org/rdap/dns.json');
    if (!resposta.ok) throw new Error('Lista da IANA indisponível');
    listaServidores = (await resposta.json()).services;
  }
  const servico = listaServidores.find(([tlds]) => tlds.includes(extensao));
  if (!servico) throw new Error('Extensão sem servidor RDAP');
  return servico[1].find((url) => url.startsWith('https://'));
}

async function consultar(nome, extensao) {
  const dominio = `${nome}.${extensao}`;
  if (RESTRITAS[extensao]) {
    return { dominio, status: 'restrito', aviso: RESTRITAS[extensao] };
  }
  try {
    const base = await servidorRdap(extensao);
    const resposta = await buscar(`${base.replace(/\/?$/, '/')}domain/${dominio}`);
    if (resposta.status === 200) return { dominio, status: 'registrado' };
    if (resposta.status === 404) return { dominio, status: 'disponivel' };
    return { dominio, status: 'erro' };
  } catch (erro) {
    console.error(dominio, erro.message);
    return { dominio, status: 'erro' };
  }
}

// Aceita "meusite", "meusite.com.br" ou "https://www.meusite.com"
function interpretar(texto) {
  const limpo = String(texto || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
  const partes = limpo.split('.');
  const nome = partes.shift();
  const extensao = partes.join('.');
  const nomeValido = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(nome) && nome.length >= 2;
  if (!nomeValido || (extensao && !EXTENSOES.includes(extensao))) return null;
  return { nome, extensao };
}

module.exports = async (req, res) => {
  const pedido = interpretar(req.query.nome);
  if (!pedido) {
    return res.status(400).json({
      erro: 'Digite um nome com 2 a 63 letras sem acento, números ou hífen. Extensões: .com, .edu, .br, .com.br, .net e .xyz.',
    });
  }
  // A extensão digitada aparece primeiro; as outras vêm como alternativas.
  const ordem = pedido.extensao
    ? [pedido.extensao, ...EXTENSOES.filter((e) => e !== pedido.extensao)]
    : EXTENSOES;
  const resultados = await Promise.all(ordem.map((e) => consultar(pedido.nome, e)));
  res.setHeader('Cache-Control', 's-maxage=60');
  return res.status(200).json({ resultados });
};
