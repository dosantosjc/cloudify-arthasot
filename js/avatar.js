// Mostra a foto do cliente ou, se não houver, a inicial do nome
function pintarAvatar(elemento, banco, id, cliente) {
  const inicial = ((cliente && cliente.nome) || '').trim().charAt(0).toUpperCase() || '?';
  elemento.textContent = inicial;
  elemento.hidden = false;
  if (!cliente || !cliente.foto_atualizada) return;

  const { data } = banco.storage.from('avatars').getPublicUrl(`${id}/perfil.jpg`);
  const imagem = new Image();
  imagem.alt = '';
  imagem.onload = () => elemento.replaceChildren(imagem);
  // O "v" faz o navegador buscar a foto nova depois de uma troca
  imagem.src = `${data.publicUrl}?v=${encodeURIComponent(cliente.foto_atualizada)}`;
}
