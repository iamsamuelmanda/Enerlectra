create table if not exists public.channel_identities (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    channel text not null,
    external_id text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint channel_identities_channel_external_id_unique
        unique (channel, external_id)
);

create index if not exists idx_channel_identities_user_id
    on public.channel_identities(user_id);

create index if not exists idx_channel_identities_channel_external_id
    on public.channel_identities(channel, external_id);
