-- HUGIN bot MVP schema
-- Поток (когорта): люди становятся в очередь, стартуют синхронно при наборе.

create table if not exists streams (
  id           bigint generated always as identity primary key,
  number       int         not null,                 -- «ПОТОК 2»
  size         int         not null default 30,       -- целевой размер когорты
  status       text        not null default 'filling' -- filling | full | started
                 check (status in ('filling', 'full', 'started')),
  created_at   timestamptz not null default now(),
  filled_at    timestamptz,
  started_at   timestamptz
);

-- Один активный набирающийся поток за раз (частичный уникальный индекс)
create unique index if not exists streams_one_filling
  on streams (status) where status = 'filling';

create table if not exists users (
  id            bigint generated always as identity primary key,
  tg_id         bigint      not null unique,           -- telegram chat/user id
  username      text,
  first_name    text,
  state         text        not null default 'new'     -- new | in_stream | active | between
                  check (state in ('new', 'in_stream', 'active', 'between')),
  stream_id     bigint      references streams (id),
  seat          int,                                   -- место в потоке (#N)
  referred_by   bigint      references users (id),      -- кто пригласил
  last_active   timestamptz not null default now(),
  last_nudge_at timestamptz,                            -- когда слали напоминалку
  created_at    timestamptz not null default now()
);

create index if not exists users_stream_idx on users (stream_id);
create index if not exists users_state_idx  on users (state);

-- Атомарная запись в поток: занимает следующее свободное место,
-- при заполнении помечает поток full. Возвращает seat и признак заполнения.
create or replace function join_stream(p_user_id bigint, p_stream_id bigint)
returns table (seat int, became_full boolean)
language plpgsql
as $$
declare
  v_size   int;
  v_taken  int;
  v_seat   int;
  v_full   boolean := false;
begin
  select size into v_size from streams where id = p_stream_id for update;
  select count(*) into v_taken from users where stream_id = p_stream_id;

  if v_taken >= v_size then
    raise exception 'stream_full';
  end if;

  v_seat := v_taken + 1;

  update users
     set stream_id = p_stream_id,
         seat      = v_seat,
         state     = 'in_stream',
         last_active = now()
   where id = p_user_id;

  if v_seat >= v_size then
    update streams set status = 'full', filled_at = now() where id = p_stream_id;
    v_full := true;
  end if;

  return query select v_seat, v_full;
end;
$$;
