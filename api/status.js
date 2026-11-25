// GET /api/status: verifica se o site do cliente logado está no ar
const config = require('../js/config.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const autorizacao = req.headers.authorization || '';
  if (!autorizacao.startsWith('Bearer ')) return res.status(401).json({ erro: 'Faça login.' });

  let url;
  try {
    // Com o token do cliente, o banco só devolve a ficha dele
    const consulta = await fetch(`${config.supabaseUrl}/rest/v1/clientes?select=site_url`, {
      headers: { apikey: config.supabaseKey, authorization: autorizacao },
      signal: AbortSignal.timeout(5000),
    });
    if (consulta.status === 401 || consulta.status === 403) {
      return res.status(401).json({ erro: 'Sessão inválida.' });
    }
    if (!consulta.ok) throw new Error(`Supabase respondeu ${consulta.status}`);
    const [cliente] = await consulta.json();
    if (!cliente || !cliente.site_url) return res.status(200).json({ status: 'sem-site' });
    url = new URL(cliente.site_url);
  } catch (erro) {
    console.error(erro.message);
    return res.status(502).json({ erro: 'Não foi possível consultar.' });
  }

  // Só endereços https com nome de domínio (nada de IPs ou endereços internos)
  const dominioValido = /^[a-z0-9.-]+\.[a-z][a-z0-9-]+$/i.test(url.hostname) &&
    !/\.(local|internal|localhost)$/i.test(url.hostname);
  if (url.protocol !== 'https:' || !dominioValido || url.port) {
    return res.status(200).json({ status: 'sem-site' });
  }

  const inicio = Date.now();
  try {
    const resposta = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(7000) });
    return res.status(200).json({
      status: resposta.status < 400 ? 'online' : 'problema',
      codigo: resposta.status,
      tempo: Date.now() - inicio,
    });
  } catch (erro) {
    return res.status(200).json({ status: 'offline' });
  }
};
