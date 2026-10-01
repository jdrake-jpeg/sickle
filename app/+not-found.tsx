import { Link, Stack } from 'expo-router';
import { View } from 'react-native';

import { Body, Heading, Screen } from '@/components/ui';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen scroll={false}>
        <View style={{ gap: 12, paddingTop: 40 }}>
          <Heading size={22}>THIS SCREEN DOESN&apos;T EXIST.</Heading>
          <Link href="/">
            <Body tone="accent" weight="bold">
              Back to Play
            </Body>
          </Link>
        </View>
      </Screen>
    </>
  );
}
