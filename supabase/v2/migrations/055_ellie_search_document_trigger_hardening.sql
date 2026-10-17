-- Enerlectra convergence — Migration 055: restore Ellie search-document trigger
-- Migration 052 owns search_document as a trigger-maintained tsvector column.
-- Keep it as a normal column so the trigger remains writable.

alter table public.intelligence_memories
  drop column if exists search_document;

alter table public.intelligence_memories
  add column search_document tsvector;

create or replace function public.refresh_intelligence_memory_search_document()
returns trigger
language plpgsql
immutable
set search_path = public
as $$
begin
  new.search_document :=
    to_tsvector(
      'simple',
      coalesce(new.scope_key, '') || ' ' ||
      coalesce(new.statement, '') || ' ' ||
      coalesce(new.knowledge_type, '') || ' ' ||
      coalesce(new.memory_type, '')
    );
  return new;
end;
$$;

drop trigger if exists intelligence_memories_search_document on public.intelligence_memories;

create trigger intelligence_memories_search_document
before insert or update of scope_key, statement, knowledge_type, memory_type
on public.intelligence_memories
for each row execute function public.refresh_intelligence_memory_search_document();

update public.intelligence_memories
set search_document = to_tsvector(
  'simple',
  coalesce(scope_key, '') || ' ' ||
  coalesce(statement, '') || ' ' ||
  coalesce(knowledge_type, '') || ' ' ||
  coalesce(memory_type, '')
);

create index if not exists intelligence_memories_search_document_idx
  on public.intelligence_memories using gin(search_document);
