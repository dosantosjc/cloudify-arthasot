// Login e cadastro
const banco = window.supabase.createClient(CLOUDIFY.supabaseUrl, CLOUDIFY.supabaseKey);

const formulario = document.querySelector('form');
const botao = formulario.querySelector('button');
const aviso = document.getElementById('aviso');
const ehCadastro = formulario.id === 'cadastro-form';
const valor = (id) => document.getElementById(id).value;

function avisar(texto, tipo) {
  aviso.textContent = texto;
  aviso.className = `aviso aviso--${tipo}`;
}

function traduzir(erro) {
  const mensagens = {
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.',
    user_already_exists: 'Não foi possível criar a conta. Se você já tem uma, use Entrar.',
    weak_password: 'Escolha uma senha mais forte.',
    over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos.',
    over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
  };
  return mensagens[erro.code] || 'Não foi possível concluir. Tente novamente.';
}

// Quem já está logado vai direto para o painel
banco.auth.getSession().then(({ data }) => {
  if (data.session) window.location.replace('/dashboard');
});

if (ehCadastro) {
  const senha = document.getElementById('senha');
  const confirmar = document.getElementById('confirmar');
  const conferir = () =>
    confirmar.setCustomValidity(confirmar.value === senha.value ? '' : 'As senhas não são iguais.');
  senha.addEventListener('input', conferir);
  confirmar.addEventListener('input', conferir);
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  botao.disabled = true;
  avisar('Aguarde...', 'info');
  const dados = { email: valor('email'), password: valor('senha') };
  try {
    const { data, error } = ehCadastro
      ? await banco.auth.signUp({
          ...dados,
          options: {
            data: { nome: valor('nome').trim() },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        })
      : await banco.auth.signInWithPassword(dados);
    if (error) throw error;
    if (data.session) return window.location.assign('/dashboard');
    formulario.reset();
    avisar('Quase lá! Enviamos um link de confirmação para o seu e-mail.', 'sucesso');
  } catch (erro) {
    avisar(traduzir(erro), 'erro');
  }
  botao.disabled = false;
});
