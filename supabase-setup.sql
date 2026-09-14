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
--  Listo. Después de correr esto:
--   • Authentication → Providers → Email: dejá "Confirm email" en OFF
--     (sos un solo usuario; evita el paso de confirmación por correo).
--   • Authentication → Users → Add user:
--       email: <tu-correo>   ·   password: [redactado]
--     (o creá la cuenta desde la pantalla de login del tablero la primera vez).
--   • Copiá Project URL y la anon public key (Settings → API) y pegalas
--     en el tablero, pestaña "Nube · Ajustes".
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
