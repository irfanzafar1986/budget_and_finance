import { supabase } from '../../lib/supabase';
import type { AssetAccount } from '../../domain/types';

export async function listAssets(
  profileId: number,
  includeInactive = false,
): Promise<AssetAccount[]> {
  let query = supabase
    .from('asset_account')
    .select('*')
    .eq('user_profile_id', profileId);
  if (!includeInactive) {
    query = query.eq('is_active', true);
  }
  const { data, error } = includeInactive
    ? await query.order('is_active', { ascending: false }).order('name', { ascending: true })
    : await query.order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AssetAccount[];
}

export async function getAssetById(id: number): Promise<AssetAccount | null> {
  const { data, error } = await supabase
    .from('asset_account')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetAccount | null) ?? null;
}

export interface CreateAssetArgs {
  userProfileId: number;
  name: string;
  assetType: string;
  openingBalance: number;
}

export async function createAsset(args: CreateAssetArgs): Promise<AssetAccount> {
  const { data, error } = await supabase
    .from('asset_account')
    .insert({
      user_profile_id: args.userProfileId,
      name: args.name.trim(),
      asset_type: args.assetType.trim(),
      opening_balance: args.openingBalance,
      current_balance: args.openingBalance,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AssetAccount;
}

export interface UpdateAssetArgs {
  id: number;
  name: string;
  assetType: string;
  openingBalance: number;
}

export async function updateAsset(args: UpdateAssetArgs): Promise<AssetAccount> {
  const { data, error } = await supabase
    .from('asset_account')
    .update({
      name: args.name.trim(),
      asset_type: args.assetType.trim(),
      opening_balance: args.openingBalance,
    })
    .eq('id', args.id)
    .select()
    .single();
  if (error) throw error;
  return data as AssetAccount;
}

export async function setActive(id: number, active: boolean): Promise<AssetAccount> {
  const { data, error } = await supabase
    .from('asset_account')
    .update({ is_active: active })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as AssetAccount;
}

export async function setCurrentBalance(id: number, balance: number): Promise<void> {
  const { error } = await supabase
    .from('asset_account')
    .update({ current_balance: balance })
    .eq('id', id);
  if (error) throw error;
}
