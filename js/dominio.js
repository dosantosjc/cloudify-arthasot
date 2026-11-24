const formulario = document.getElementById('busca-dominio');
const campo = formulario.querySelector('input');
const botao = formulario.querySelector('button');
const saida = document.getElementById('resultado-dominio');

const TEXTOS = {
  disponivel: 'Parece disponível',
  registrado: 'Já registrado',
  restrito: 'Uso restrito',
  erro: 'Não foi possível consultar',
};

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto) elemento.textContent = texto;
  return elemento;
}

function mostrar(resultados) {
  const lista = criar('ul', 'list domain-results__list');
  resultados.forEach((item) => {
    const linha = criar('li', `domain-results__item domain-results__item--${item.status}`);
    linha.append(criar('strong', '', item.dominio));
    linha.append(criar('span', 'domain-results__status', item.aviso || TEXTOS[item.status]));
    if (item.status === 'disponivel') {
      const link = criar('a', 'domain-results__link', 'Cadastre-se');
      link.href = '/cadastro';
      linha.append(link);
    }
    lista.append(linha);
  });
  const nota = criar('p', 'domain-results__note', 'A disponibilidade só é confirmada no momento do registro.');
  saida.replaceChildren(lista, nota);
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  botao.disabled = true;
  saida.replaceChildren(criar('p', 'domain-results__note', 'Consultando...'));
  try {
    const resposta = await fetch(`/api/dominio?nome=${encodeURIComponent(campo.value)}`);
    const dados = await resposta.json();
    if (!resposta.ok) {
      saida.replaceChildren(criar('p', 'domain-results__note', dados.erro));
    } else {
      mostrar(dados.resultados);
    }
  } catch (erro) {
    saida.replaceChildren(criar('p', 'domain-results__note', 'A busca falhou. Tente novamente em instantes.'));
  } finally {
    botao.disabled = false;
  }
});
