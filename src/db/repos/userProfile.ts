import { supabase } from '../../lib/supabase';
import type { UserProfile } from '../../domain/types';

export async function getProfile(): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .order('id')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as UserProfile | null) ?? null;
}

export async function createProfile(name: string, defaultCurrency: string): Promise<UserProfile> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const authUserId = userData.user?.id;
  if (!authUserId) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('user_profile')
    .insert({
      auth_user_id: authUserId,
      name,
      default_currency: defaultCurrency.toUpperCase(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function updateProfile(
  id: number,
  name: string,
  defaultCurrency: string,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profile')
    .update({ name, default_currency: defaultCurrency.toUpperCase() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as UserProfile;
}
