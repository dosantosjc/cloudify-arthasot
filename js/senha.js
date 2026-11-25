// "Esqueci minha senha" e criação da nova senha
const linkRecebido = new URLSearchParams(window.location.hash.slice(1));
const banco = window.supabase.createClient(CLOUDIFY.supabaseUrl, CLOUDIFY.supabaseKey);

const formulario = document.querySelector('form');
const botao = formulario.querySelector('button');
const aviso = document.getElementById('aviso');
const el = (id) => document.getElementById(id);

function avisar(texto, tipo) {
  aviso.textContent = texto;
  aviso.className = `aviso aviso--${tipo}`;
}

function pedirLink() {
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!captcha.token()) return avisar('Conclua a verificação de segurança.', 'erro');
    botao.disabled = true;
    avisar('Enviando...', 'info');
    const { error } = await banco.auth.resetPasswordForEmail(el('email').value, {
      redirectTo: `${window.location.origin}/nova-senha`,
      captchaToken: captcha.token(),
    });
    captcha.reiniciar();
    botao.disabled = false;
    if (error) {
      const muitas = error.status === 429;
      return avisar(muitas ? 'Muitas tentativas. Aguarde alguns minutos.' : 'Não foi possível enviar. Tente novamente.', 'erro');
    }
    formulario.reset();
    // Mensagem neutra: não revela se o e-mail tem conta
    avisar('Se houver uma conta com esse e-mail, você receberá o link em instantes.', 'sucesso');
  });
}

async function criarSenha() {
  const { data } = await banco.auth.getSession();
  if (linkRecebido.get('error') || !data.session) {
    formulario.hidden = true;
    el('link-invalido').hidden = false;
    return;
  }
  botao.disabled = false;
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (el('senha').value !== el('confirmar').value) {
      return avisar('As senhas não são iguais.', 'erro');
    }
    botao.disabled = true;
    avisar('Salvando...', 'info');
    const { error } = await banco.auth.updateUser({ password: el('senha').value });
    if (error) {
      botao.disabled = false;
      const textos = {
        same_password: 'A nova senha deve ser diferente da anterior.',
        weak_password: 'Escolha uma senha mais forte.',
      };
      return avisar(textos[error.code] || 'Não foi possível salvar. Peça um novo link.', 'erro');
    }
    // Encerra as sessões abertas e pede um novo login
    await banco.auth.signOut();
    avisar('Senha alterada! Redirecionando para o login...', 'sucesso');
    setTimeout(() => window.location.replace('/login'), 2000);
  });
}

if (formulario.id === 'recuperar-form') pedirLink();
else criarSenha();
