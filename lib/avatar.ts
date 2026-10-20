import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

// Pick a photo from the library, shrink it a little, upload it to the public
// avatars bucket (your own folder) and save the link on your profile.
// Returns the new link, or null if you backed out.
export async function chooseAvatar(userId: string): Promise<string | null> {
  if (!supabase) throw new Error('Sign in to add a picture.');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow photo access in Settings to add a picture.');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.6,
  });
  if (result.canceled || !result.assets[0]) return null;

  const bytes = await fetch(result.assets[0].uri).then((r) => r.arrayBuffer());
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const up = await supabase.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (up.error) throw new Error(up.error.message.includes('not found') ? "Profile pictures aren't set up yet. Run the newest files from supabase/migrations." : up.error.message);
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const saved = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (saved.error) throw new Error(saved.error.message);
  return url;
}

export async function removeAvatar(userId: string) {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (error) throw new Error(error.message);
}
