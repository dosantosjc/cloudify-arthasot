-- Aviso por e-mail quando o telefone muda (envio pela API do Resend)
-- Rode no SQL Editor DEPOIS de guardar a chave do Resend no Vault.

create extension if not exists pg_net with schema extensions;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- Registro dos envios, para limitar a 5 avisos por hora em cada conta
create table if not exists privado.avisos_telefone (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  enviado_em timestamptz not null default now()
);

-- Impede que o texto digitado pelo cliente vire HTML no e-mail
create or replace function privado.escapar(texto text)
returns text language sql immutable set search_path = ''
as $$
  select replace(replace(replace(replace(coalesce(texto, ''),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function privado.avisar_telefone()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  chave text;
  destino text;
  corpo text := $html$<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Seu telefone foi alterado - Cloudify</title>
<style>
  @media only screen and (max-width: 620px) {
    .caixa { width: 100% !important; }
    .espaco { padding-left: 24px !important; padding-right: 24px !important; }
    .titulo { font-size: 26px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f3f5f8;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">O telefone da sua conta mudou.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f5f8;">
<tr><td align="center" style="padding:32px 12px;">
  <table role="presentation" class="caixa" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:10px; overflow:hidden; font-family:Inter, Arial, Helvetica, sans-serif;">
    <tr><td align="center" bgcolor="#000000" style="background-color:#000000; padding:36px 40px;">
      <div style="font-size:32px; font-weight:700; color:#ffffff;">Cloud<span style="color:#00d9ff;">ify</span></div>
      <div style="font-size:14px; color:#b9c3cf; letter-spacing:1px; padding-top:8px;">Hospedagem de sites em nuvem</div>
    </td></tr>
    <tr><td height="6" bgcolor="#2584ff" style="background-color:#2584ff; background-image:linear-gradient(90deg,#2584ff,#00d9ff); font-size:0; line-height:6px;">&nbsp;</td></tr>
    <tr><td class="espaco" align="center" style="padding:44px 48px 12px;">
      <h1 class="titulo" style="margin:0 0 16px; font-size:30px; line-height:1.25; color:#1b0760;">Seu telefone foi alterado</h1>
      <p style="margin:0 0 12px; font-size:17px; line-height:1.6; color:#5c5577;">Olá, {{NOME}}!</p>
      <p style="margin:0 0 12px; font-size:17px; line-height:1.6; color:#5c5577;">O número de telefone da sua conta Cloudify foi alterado.</p>
    </td></tr>
    <tr><td class="espaco" style="padding:12px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f9fa; border-radius:8px;">
        <tr><td style="padding:20px 24px; font-size:15px; line-height:1.9; color:#1b0760;">
          Antes: <strong style="word-break:break-all;">{{ANTIGO}}</strong><br>
          Agora: <strong style="word-break:break-all;">{{NOVO}}</strong>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:24px 24px 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" bgcolor="#ff3400" style="background-color:#ff3400; border-radius:40px;">
          <a href="https://www.arthasot.com.br/dashboard" target="_blank" style="display:inline-block; padding:18px 44px; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; text-transform:uppercase; border-radius:40px;">Ver minha conta</a>
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="espaco" style="padding:12px 48px 36px; font-size:13px; line-height:1.6; color:#6f6985;">
      <p style="margin:0;">Se não foi você, <a href="https://www.arthasot.com.br/recuperar-senha" style="color:#2584ff;">redefina sua senha</a> imediatamente.</p>
    </td></tr>
    <tr><td align="center" bgcolor="#232323" style="background-color:#232323; padding:28px 40px; font-size:13px; line-height:1.8; color:#a0a0a0;">
      <a href="https://www.arthasot.com.br" style="color:#00d9ff; text-decoration:none;">arthasot.com.br</a><br>
      Copyright 2026 Cloudify
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
$html$;
begin
  select decrypted_secret into chave from vault.decrypted_secrets where name = 'resend_api_key';
  select email into destino from auth.users where id = new.id;
  if chave is null or destino is null then
    raise warning 'Aviso de telefone nao enviado: falta a chave ou o e-mail';
    return new;
  end if;
  if (select count(*) from privado.avisos_telefone
      where cliente_id = new.id and enviado_em > now() - interval '1 hour') >= 5 then
    return new;
  end if;

  corpo := replace(corpo, '{{NOME}}', privado.escapar(new.nome));
  corpo := replace(corpo, '{{ANTIGO}}', coalesce(nullif(privado.escapar(old.telefone), ''), 'não informado'));
  corpo := replace(corpo, '{{NOVO}}', coalesce(nullif(privado.escapar(new.telefone), ''), 'removido'));

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || chave),
    body := jsonb_build_object(
      'from', 'Cloudify <nao-responda@arthasot.com.br>',
      'to', jsonb_build_array(destino),
      'subject', 'O telefone da sua conta Cloudify foi alterado',
      'html', corpo
    )
  );
  insert into privado.avisos_telefone (cliente_id) values (new.id);
  return new;
exception when others then
  -- Uma falha no aviso nunca impede o cliente de salvar os dados
  raise warning 'Aviso de telefone falhou: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists ao_mudar_telefone on public.clientes;
create trigger ao_mudar_telefone
  after update of telefone on public.clientes
  for each row when (old.telefone is distinct from new.telefone)
  execute function privado.avisar_telefone();
