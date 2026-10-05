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
      error.code === 'PGRST202' ? "Chat isn't set up yet. Run the newest files in supabase/migrations." : error.message,
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

// Unread friend messages plus unread game chat messages.
export async function fetchUnreadCount(demoMode: boolean): Promise<number> {
  if (demoMode || !supabase) return 0;
  const [friends, groups] = await Promise.all([supabase.rpc('unread_message_count'), supabase.rpc('unread_group_count')]);
  return (friends.error ? 0 : Number(friends.data ?? 0)) + (groups.error ? 0 : Number(groups.data ?? 0));
}

// ---------------------------------------------------------------------------
// Quick chats. Nobody types in Sickle chats; they tap one of these.
// ---------------------------------------------------------------------------

export const quickChats = [
  'Free to play now?',
  'Free later?',
  'Free tonight?',
  'Free in an hour?',
  'Free in 2 hours?',
  'Good game',
  'Play again sometime?',
  'Team up?',
];

export const gameChats = ['On my way', 'Running late', 'See you there', 'Good game', 'Play again sometime?'];

// ---------------------------------------------------------------------------
// Game chats: the four players in an accepted doubles challenge.
// ---------------------------------------------------------------------------

export type GroupChat = {
  chat_id: string;
  challenge_id: string;
  title: string;
  court_name: string;
  proposed_time: string;
  challenge_status: string;
  members: string | null;
  last_body: string | null;
  last_at: string;
  last_sender: string | null;
  unread: number;
};
export type GroupMessage = { id: string; mine: boolean; sender_name: string; body: string; created_at: string };

export async function fetchGroupChats(demoMode: boolean): Promise<GroupChat[]> {
  if (demoMode || !supabase) return [];
  const { data, error } = await supabase.rpc('my_group_chats');
  if (error) return [];
  return ((data ?? []) as GroupChat[]).map((c) => ({ ...c, unread: Number(c.unread) }));
}

export async function fetchGroupConversation(demoMode: boolean, chatId: string): Promise<GroupMessage[]> {
  if (demoMode || !supabase) return [];
  const { data } = await supabase.rpc('group_conversation', { p_chat: chatId, p_limit: 100 });
  return (data ?? []) as GroupMessage[];
}

export async function sendGroupMessage(demoMode: boolean, chatId: string, body: string): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('send_group_message', { p_chat: chatId, p_body: body });
  if (error) throw new Error(error.message);
}

export async function markGroupRead(demoMode: boolean, chatId: string): Promise<void> {
  if (demoMode || !supabase) return;
  await supabase.rpc('mark_group_read', { p_chat: chatId });
}

export async function leaveGroupChat(demoMode: boolean, chatId: string): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('leave_group_chat', { p_chat: chatId });
  if (error) throw new Error(error.message);
}
