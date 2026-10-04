import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Push notifications. The phone side needs the expo-notifications package, which
// only exists in builds made after it was added. On an older build (or Expo Go)
// everything here quietly does nothing and the in-app inbox still works.

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;
function native(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

export const pushAvailable = () => native() !== null && Platform.OS !== 'web';

// What the four filters in Settings are called.
export type Category = 'challenges' | 'teams' | 'friends' | 'courts' | 'messages';

export const categories: { key: Category; column: string; title: string; detail: string }[] = [
  { key: 'challenges', column: 'notify_challenges', title: 'Challenges', detail: 'Someone challenges you, answers your challenge, or a score needs confirming' },
  { key: 'teams', column: 'notify_teams', title: 'Teams', detail: 'A friend puts you on their team, or a team is made with you' },
  { key: 'friends', column: 'notify_friends', title: 'Friend requests', detail: 'Someone sends you a friend request or accepts yours' },
  { key: 'courts', column: 'notify_courts', title: 'Court conditions', detail: 'A local court you play at gets a new condition report (wet, crowded, nets down)' },
  { key: 'messages', column: 'notify_messages', title: 'Messages', detail: 'A friend sends you a chat message' },
];

// How a notification shows while the app is open.
export function setupNotificationHandler() {
  const N = native();
  if (!N || Platform.OS === 'web') return;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export type PushStatus = 'unavailable' | 'on' | 'off' | 'blocked';

export async function pushStatus(): Promise<PushStatus> {
  const N = native();
  if (!N || Platform.OS === 'web') return 'unavailable';
  const perm = await N.getPermissionsAsync();
  if (perm.granted) return 'on';
  return perm.canAskAgain ? 'off' : 'blocked';
}

// Asks for permission if needed, gets this phone's token and saves it.
export async function enablePush(): Promise<PushStatus> {
  const N = native();
  if (!N || Platform.OS === 'web' || !supabase) return 'unavailable';
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'Sickle', importance: N.AndroidImportance.DEFAULT });
    }
    let perm = await N.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return perm.canAskAgain ? 'off' : 'blocked';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await supabase.rpc('save_push_token', { p_token: token, p_platform: Platform.OS });
    return 'on';
  } catch {
    return 'off';
  }
}

// Stops pushes to this phone (the inbox keeps working).
export async function disablePush() {
  const N = native();
  if (!N || !supabase) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await supabase.rpc('remove_push_token', { p_token: token });
  } catch {
    // Nothing to remove.
  }
}

function openFromData(data: unknown) {
  const path = (data as { path?: string } | null)?.path;
  if (typeof path !== 'string') return;
  if (path === '/challenges') router.navigate('/challenges');
  else if (path === '/profile') router.navigate('/profile');
  else if (path === '/friends') router.push('/my-friends');
  else if (path.startsWith('/court/')) router.push({ pathname: '/court/[id]', params: { id: path.slice('/court/'.length) } });
  else router.push('/notifications');
}

// Registers this phone while signed in, and opens the right screen when a
// notification is tapped.
export function usePushSetup(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const N = native();
    if (!N || Platform.OS === 'web') return;
    // Only re-save the token if they already allowed notifications. The first ask
    // happens from Settings or the welcome page, never out of the blue.
    N.getPermissionsAsync().then((p) => {
      if (p.granted) enablePush();
    });
    const sub = N.addNotificationResponseReceivedListener((r) => openFromData(r.notification.request.content.data));
    N.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        openFromData(r.notification.request.content.data);
        N.clearLastNotificationResponseAsync();
      }
    });
    return () => sub.remove();
  }, [enabled]);
}

export type InboxItem = {
  id: string;
  category: Category;
  title: string;
  body: string;
  data: { path?: string } | null;
  created_at: string;
  read_at: string | null;
};

export async function fetchInbox(): Promise<InboxItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: 50 });
  if (error) return [];
  return (data ?? []) as InboxItem[];
}

export async function markAllRead() {
  await supabase?.rpc('mark_notifications_read');
}

// Number of unread notifications, refreshed on focus and every minute.
export function useUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    if (!enabled || !supabase) return;
    const { data, error } = await supabase.rpc('unread_notification_count');
    if (!error) setCount(Number(data ?? 0));
  }, [enabled]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);
  return { count, reload: load };
}

export { openFromData };
