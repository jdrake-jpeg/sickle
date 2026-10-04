import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { Platform, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { fetchUnreadCount } from '@/lib/chat';
import { fetchFriends } from '@/lib/friends';
import { needsMe, useChallengePolling, useChallenges } from '@/lib/matches';
import { useTheme } from '@/lib/theme';

function TabIcon({ name, color }: { name: SymbolViewProps['name']; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color} size={24} />;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  useChallengePolling(demoMode, session?.user.id);
  const waiting = (useChallenges(demoMode) ?? []).filter(needsMe).length;

  // New messages and friend requests, for the Friends tab badge.
  const [friendBadge, setFriendBadge] = useState(0);
  useEffect(() => {
    if (!session && !demoMode) return;
    let alive = true;
    const check = async () => {
      const [unread, friends] = await Promise.all([fetchUnreadCount(demoMode), fetchFriends(demoMode)]);
      if (alive) setFriendBadge(unread + friends.filter((f) => f.relation === 'incoming').length);
    };
    check();
    const timer = setInterval(check, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [demoMode, session]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          // Web has no safe-area inset, so give the labels room explicitly.
          ...Platform.select({ web: { height: 64, paddingBottom: 8 } }),
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemibold, fontSize: 11, lineHeight: 14 },
        tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.onDanger },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Play',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'dot.radiowaves.left.and.right', android: 'radar', web: 'radar' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenges"
        options={{
          title: 'Challenges',
          tabBarBadge: waiting || undefined,
          tabBarIcon: ({ color }) => <TabIcon name={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="courts"
        options={{
          title: 'Courts',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarBadge: friendBadge || undefined,
          tabBarIcon: ({ color }) => <TabIcon name={{ ios: 'person.2.fill', android: 'group', web: 'group' }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
