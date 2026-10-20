import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, Pressable, View } from 'react-native';

import { Avatar, Body, Button, Card, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { AdminReport, fetchAdminReports, resolveReport } from '@/lib/reports';
import { useTheme } from '@/lib/theme';

// Reports from players, newest first, the same way new court requests reach
// admins. A report about a profile picture can take the picture down.
export default function AdminReportsScreen() {
  const { demoMode } = useAuth();
  const { colors } = useTheme();
  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => fetchAdminReports(demoMode).then(setRows), [demoMode]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const close = async (r: AdminReport, removeAvatar: boolean) => {
    setBusy(r.report_id);
    try {
      await resolveReport(demoMode, r.report_id, removeAvatar);
      await load();
    } catch (e) {
      Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      {rows === null ? <Body tone="muted">Loading…</Body> : null}
      {rows && rows.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">No open reports.</Body>
        </Card>
      ) : null}
      {(rows ?? []).map((r) => (
        <Card key={r.report_id} style={{ padding: 16, gap: 10 }}>
          <Heading size={14} style={{ letterSpacing: 1 }}>
            {r.kind === 'avatar' ? 'PROFILE PICTURE' : 'PROFILE'}
          </Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar initials={initialsOf(r.reported_name ?? '?')} size={56} uri={r.reported_avatar} />
            <View style={{ flex: 1 }}>
              {r.reported_id ? (
                <Link href={{ pathname: '/player/[id]', params: { id: r.reported_id } }} asChild>
                  <Pressable accessibilityRole="link">
                    <Body weight="bold" style={{ color: colors.accentText }}>
                      {r.reported_name}
                    </Body>
                  </Pressable>
                </Link>
              ) : (
                <Body weight="bold">Unknown</Body>
              )}
              <Body size={13} tone="muted">
                reported by {r.reporter_name}
              </Body>
            </View>
          </View>
          <Body size={14} tone="subtle">
            {r.reason}
          </Body>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {r.kind === 'avatar' && r.reported_avatar ? (
              <Button label="Remove picture" variant="danger" style={{ flex: 1 }} disabled={busy === r.report_id} onPress={() => close(r, true)} />
            ) : null}
            <Button label="Dismiss" variant="outline" style={{ flex: 1 }} disabled={busy === r.report_id} onPress={() => close(r, false)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
