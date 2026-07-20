import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const db = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
});

export type Stream = {
  id: number;
  number: number;
  size: number;
  status: 'filling' | 'full' | 'started';
};

export type User = {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  state: 'new' | 'in_stream' | 'active' | 'between';
  stream_id: number | null;
  seat: number | null;
};

/** Текущий набирающийся поток; создаёт первый, если ни одного нет. */
export async function getOrCreateFillingStream(): Promise<Stream> {
  const { data } = await db
    .from('streams')
    .select('*')
    .eq('status', 'filling')
    .maybeSingle();
  if (data) return data as Stream;

  // номер = max(number) + 1
  const { data: last } = await db
    .from('streams')
    .select('number')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = (last?.number ?? 0) + 1;

  const { data: created, error } = await db
    .from('streams')
    .insert({ number, size: config.streamSize, status: 'filling' })
    .select('*')
    .single();
  if (error) throw error;
  return created as Stream;
}

/** Найти или создать пользователя по tg_id. */
export async function upsertUser(tg: {
  tg_id: number;
  username?: string;
  first_name?: string;
  referred_by?: number | null;
}): Promise<User> {
  const { data: existing } = await db
    .from('users')
    .select('*')
    .eq('tg_id', tg.tg_id)
    .maybeSingle();

  if (existing) {
    await db
      .from('users')
      .update({ username: tg.username, first_name: tg.first_name, last_active: new Date().toISOString() })
      .eq('id', existing.id);
    return existing as User;
  }

  const { data: created, error } = await db
    .from('users')
    .insert({
      tg_id: tg.tg_id,
      username: tg.username,
      first_name: tg.first_name,
      referred_by: tg.referred_by ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return created as User;
}

/** Атомарно занять место в потоке. */
export async function joinStream(userId: number, streamId: number) {
  const { data, error } = await db.rpc('join_stream', {
    p_user_id: userId,
    p_stream_id: streamId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { seat: number; became_full: boolean };
}

/** Все tg_id пользователей потока. */
export async function streamMembers(streamId: number): Promise<number[]> {
  const { data } = await db.from('users').select('tg_id').eq('stream_id', streamId);
  return (data ?? []).map((r) => r.tg_id as number);
}
