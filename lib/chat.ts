import { supabase } from '@/lib/supabase';

// Chat with friends. Only friends can message each other (the database checks).

export type Message = { id: string; mine: boolean; body: string; created_at: string; read_at: string | null };
export type Conversation = { friend_id: string; last_body: string; last_at: string; last_mine: boolean; unread: number };

// Demo mode keeps messages in memory.
const demoMessages = new Map<string, Message[]>();

export async function fetchConversation(demoMode: boolean, friendId: string): Promise<Message[]> {
  if (demoMode || !supabase) return demoMessages.get(friendId) ?? [];
  const { data } = await supabase.rpc('conversation', { p_friend: friendId, p_limit: 100 });
  return (data ?? []) as Message[];
}

export async function sendMessage(demoMode: boolean, friendId: string, body: string): Promise<void> {
  if (demoMode || !supabase) {
    const list = demoMessages.get(friendId) ?? [];
    demoMessages.set(friendId, [...list, { id: String(Date.now()), mine: true, body: body.trim(), created_at: new Date().toISOString(), read_at: null }]);
    return;
  }
  const { error } = await supabase.rpc('send_message', { p_to: friendId, p_body: body });
  if (error) {
    throw new Error(
      error.code === 'PGRST202' ? "Chat isn't in the database yet. Run the newest files from supabase/migrations in the Supabase SQL Editor." : error.message,
    );
  }
}

export async function markConversationRead(demoMode: boolean, friendId: string): Promise<void> {
  if (demoMode || !supabase) return;
  await supabase.rpc('mark_conversation_read', { p_friend: friendId });
}

export async function fetchConversations(demoMode: boolean): Promise<Conversation[]> {
  if (demoMode || !supabase) {
    return [...demoMessages.entries()].map(([friend_id, list]) => {
      const last = list[list.length - 1];
      return { friend_id, last_body: last.body, last_at: last.created_at, last_mine: last.mine, unread: 0 };
    });
  }
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) return [];
  return ((data ?? []) as Conversation[]).map((c) => ({ ...c, unread: Number(c.unread) }));
}

export async function fetchUnreadCount(demoMode: boolean): Promise<number> {
  if (demoMode || !supabase) return 0;
  const { data, error } = await supabase.rpc('unread_message_count');
  return error ? 0 : Number(data ?? 0);
}
