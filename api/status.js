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

async function verificar(endereco) {
  // Só endereços https com nome de domínio (nada de IPs ou endereços internos)
  let url;
  try {
    url = new URL(endereco);
  } catch (erro) {
    return { status: 'invalido' };
  }
  const dominioValido = /^[a-z0-9.-]+\.[a-z][a-z0-9-]+$/i.test(url.hostname) &&
    !/\.(local|internal|localhost)$/i.test(url.hostname);
  if (url.protocol !== 'https:' || !dominioValido || url.port) return { status: 'invalido' };

  const inicio = Date.now();
  try {
    const resposta = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7000) });
    return {
      status: resposta.status < 400 ? 'online' : 'problema',
      codigo: resposta.status,
      tempo: Date.now() - inicio,
    };
  } catch (erro) {
    return { status: 'offline' };
  }
}
