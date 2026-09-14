-- ============================================================================
--  NOLA LABS · TABLERO FINANCIERO — Configuración de la nube (Supabase)
--  Ejecutá este script una sola vez en:  Supabase → SQL Editor → New query → Run
--  Crea la tabla de datos y la seguridad por usuario (Row Level Security).
-- ============================================================================

-- 1) Tabla donde vive tu tablero. Una fila por usuario (owner).
create table if not exists public.tableros (
  owner       uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 2) Activar Row Level Security: nadie ve filas ajenas.
alter table public.tableros enable row level security;

-- 3) Políticas: cada usuario solo lee / escribe SU propia fila.
drop policy if exists "leer propio tablero"   on public.tableros;
drop policy if exists "crear propio tablero"  on public.tableros;
drop policy if exists "editar propio tablero" on public.tableros;

create policy "leer propio tablero"
  on public.tableros for select
  using (auth.uid() = owner);

create policy "crear propio tablero"
  on public.tableros for insert
  with check (auth.uid() = owner);

create policy "editar propio tablero"
  on public.tableros for update
  using (auth.uid() = owner)
  with check (auth.uid() = owner);

-- 4) Sincronización en vivo (realtime) para que el celular y el computador
--    se actualicen solos cuando editás en cualquiera.
alter publication supabase_realtime add table public.tableros;

-- ============================================================================
--  Listo. Después de correr esto (y el bloque de endurecimiento de abajo):
--   • Authentication → Users → Add user: tu correo + una contraseña larga y única
--     (mínimo 12 caracteres). El registro desde la app está cerrado.
--   • Authentication → Sign In / Providers: desactivá "Allow new users to sign up";
--     activá "Leaked password protection" y mínimo 12 caracteres (Attack protection).
--   • (Opcional) Providers → Google: Client ID + Secret de Google Cloud; URL Configuration:
--     Site URL y Redirect URLs con la dirección del tablero.
--   • Settings → API Keys: copiá la publishable key en DEFAULT_CLOUD (app.js) o en
--     la pestaña "Nube · Ajustes". Si tu proyecto es otro, ajustá connect-src en la
--     CSP de index.html.
--   • Desde el tablero: Nube · Ajustes → Seguridad → activar dos pasos (TOTP).
-- ============================================================================

-- ============================================================================
--  v2 (sep 2026) · Documentos adjuntos (cuentas de cobro, planillas PILA,
--  comprobantes, declaración de renta). Bucket privado + RLS por carpeta de usuario:
--  cada archivo vive en  <uid>/<módulo>/<año>/<archivo>  y solo su dueño lo ve.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos', 'documentos', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "documentos: leer propios"    on storage.objects;
drop policy if exists "documentos: subir propios"   on storage.objects;
drop policy if exists "documentos: editar propios"  on storage.objects;
drop policy if exists "documentos: borrar propios"  on storage.objects;

create policy "documentos: leer propios" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documentos: subir propios" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documentos: editar propios" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "documentos: borrar propios" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
--  Endurecimiento (auditoría 14 sep 2026) — aplicado como migración tablero_v2_hardening
-- ============================================================================

-- Bucket: solo tipos permitidos y máximo 10 MB
update storage.buckets
   set allowed_mime_types = array['application/pdf','image/png','image/jpeg','image/webp',
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                  'text/csv'],
       file_size_limit = 10485760
 where id = 'documentos';

-- Tope del JSON y updated_at fijado por el servidor
alter table public.tableros drop constraint if exists tableros_data_size;
alter table public.tableros add  constraint tableros_data_size check (pg_column_size(data) < 2000000);
create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.set_updated_at() from public, anon;
grant execute on function public.set_updated_at() to authenticated, service_role;
drop trigger if exists tableros_set_updated_at on public.tableros;
create trigger tableros_set_updated_at before insert or update on public.tableros
  for each row execute function public.set_updated_at();

-- MFA: con un factor verificado, solo entran sesiones aal2 (código del autenticador)
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = auth, public as $$
  select coalesce(
    (select auth.jwt()->>'aal') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    false);
$$;
revoke all on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;   -- las políticas RLS lo evalúan con este rol

drop policy if exists "leer propio tablero"   on public.tableros;
drop policy if exists "crear propio tablero"  on public.tableros;
drop policy if exists "editar propio tablero" on public.tableros;
create policy "leer propio tablero"   on public.tableros for select using (auth.uid() = owner and public.mfa_ok());
create policy "crear propio tablero"  on public.tableros for insert with check (auth.uid() = owner and public.mfa_ok());
create policy "editar propio tablero" on public.tableros for update using (auth.uid() = owner and public.mfa_ok()) with check (auth.uid() = owner and public.mfa_ok());

drop policy if exists "documentos: leer propios"    on storage.objects;
drop policy if exists "documentos: subir propios"   on storage.objects;
drop policy if exists "documentos: editar propios"  on storage.objects;
drop policy if exists "documentos: borrar propios"  on storage.objects;
create policy "documentos: leer propios" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text and public.mfa_ok());
create policy "documentos: subir propios" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text and public.mfa_ok());
create policy "documentos: editar propios" on storage.objects for update to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text and public.mfa_ok());
create policy "documentos: borrar propios" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text and public.mfa_ok());

-- Registro cerrado a nivel de base (además del switch del dashboard).
-- Para dar de alta un usuario nuevo: drop trigger block_signups on auth.users; crear el usuario; volver a crear el trigger.
create or replace function public.block_signups()
returns trigger language plpgsql security invoker set search_path = public as $$
begin raise exception 'Registro cerrado: este tablero es de un solo usuario.' using errcode = 'P0001'; end $$;
revoke all on function public.block_signups() from public, anon, authenticated;
grant execute on function public.block_signups() to supabase_auth_admin, service_role;
drop trigger if exists block_signups on auth.users;
create trigger block_signups before insert on auth.users
  for each row execute function public.block_signups();
