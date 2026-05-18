import { describe, it, expect } from 'vitest';
import { buildBalanceTemplateCsv, parseBalanceCsv } from '../src/utils/csv';
import type { AssetAccount } from '../src/domain/types';

function makeAsset(overrides: Partial<AssetAccount> & { id: number }): AssetAccount {
  return {
    user_profile_id: 1,
    name: 'Test Asset',
    asset_type: 'Bank',
    opening_balance: 0,
    current_balance: 0,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const USD = 'USD';

describe('buildBalanceTemplateCsv', () => {
  it('produces correct header row', () => {
    const assets = [makeAsset({ id: 1, name: 'Checking', asset_type: 'Bank', current_balance: 0 })];
    const csv = buildBalanceTemplateCsv(assets, USD);
    const firstLine = csv.split(/\r?\n/)[0];
    expect(firstLine).toBe('asset_id,name,asset_type,balance');
  });

  it('emits header row even when there are no assets', () => {
    const csv = buildBalanceTemplateCsv([], USD);
    const firstLine = csv.split(/\r?\n/)[0];
    expect(firstLine).toBe('asset_id,name,asset_type,balance');
  });

  it('includes one row per asset with current balance as plain decimal', () => {
    const assets = [
      makeAsset({ id: 1, name: 'Checking', asset_type: 'Bank', current_balance: 185000 }),
      makeAsset({ id: 2, name: 'Savings', asset_type: 'Savings', current_balance: 500000 }),
    ];
    const csv = buildBalanceTemplateCsv(assets, USD);
    expect(csv).toContain('1,Checking,Bank,1850.00');
    expect(csv).toContain('2,Savings,Savings,5000.00');
  });

  it('quotes asset names containing commas', () => {
    const assets = [makeAsset({ id: 3, name: 'Smith, John Fund', asset_type: 'Investment', current_balance: 100000 })];
    const csv = buildBalanceTemplateCsv(assets, USD);
    expect(csv).toContain('"Smith, John Fund"');
  });

  it('handles zero-decimal currencies (JPY)', () => {
    const assets = [makeAsset({ id: 1, name: 'Cash', asset_type: 'Cash', current_balance: 50000 })];
    const csv = buildBalanceTemplateCsv(assets, 'JPY');
    expect(csv).toContain('1,Cash,Cash,50000');
  });

  it('handles negative balances', () => {
    const assets = [makeAsset({ id: 1, name: 'Overdraft', asset_type: 'Bank', current_balance: -25050 })];
    const csv = buildBalanceTemplateCsv(assets, USD);
    expect(csv).toContain('-250.50');
  });
});

describe('parseBalanceCsv', () => {
  const assets = [
    makeAsset({ id: 10, name: 'Checking', asset_type: 'Bank', current_balance: 100000 }),
    makeAsset({ id: 11, name: 'Savings', asset_type: 'Savings', current_balance: 200000 }),
  ];

  it('matches existing assets by id and parses balance', () => {
    const csv = 'asset_id,name,asset_type,balance\n10,Checking,Bank,1500.00\n11,Savings,Savings,3000.00';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(2);
    expect(result.matched[0]).toEqual({ assetId: 10, balance: 150000 });
    expect(result.matched[1]).toEqual({ assetId: 11, balance: 300000 });
    expect(result.newDrafts).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('preserves current value when balance cell is blank', () => {
    const csv = 'asset_id,name,asset_type,balance\n10,Checking,Bank,\n11,Savings,Savings,500.00';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toEqual({ assetId: 11, balance: 50000 });
    expect(result.warnings).toHaveLength(0);
  });

  it('treats unknown asset_id with full fields as new draft', () => {
    const csv = 'asset_id,name,asset_type,balance\n,New Fund,Investment,2500.00';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(0);
    expect(result.newDrafts).toHaveLength(1);
    expect(result.newDrafts[0]).toEqual({ name: 'New Fund', assetType: 'Investment', value: '2500.00' });
    expect(result.warnings).toHaveLength(0);
  });

  it('warns and treats stale asset_id as new asset', () => {
    const csv = 'asset_id,name,asset_type,balance\n999,Old Account,Cash,100.00';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.newDrafts).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('"999" not found');
  });

  it('silently skips fully blank rows', () => {
    const csv = 'asset_id,name,asset_type,balance\n10,Checking,Bank,100.00\n,,,';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(1);
    expect(result.newDrafts).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns and skips incomplete new asset rows', () => {
    const csv = 'asset_id,name,asset_type,balance\n,New Fund,,2500.00';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.newDrafts).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('incomplete new asset row');
  });

  it('warns and skips rows with invalid balance', () => {
    const csv = 'asset_id,name,asset_type,balance\n10,Checking,Bank,notanumber';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('invalid balance');
  });

  it('handles quoted field names containing commas', () => {
    const assetsWithComma = [
      makeAsset({ id: 20, name: 'Smith, John Fund', asset_type: 'Investment', current_balance: 0 }),
    ];
    const csv = 'asset_id,name,asset_type,balance\n20,"Smith, John Fund",Investment,500.00';
    const result = parseBalanceCsv(csv, assetsWithComma, USD);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toEqual({ assetId: 20, balance: 50000 });
  });

  it('strips UTF-8 BOM from Excel-saved files', () => {
    const csv = '﻿asset_id,name,asset_type,balance\n10,Checking,Bank,100.00';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].assetId).toBe(10);
  });

  it('throws on missing required column', () => {
    const csv = 'assetid,name,asset_type,balance\n10,Checking,Bank,100.00';
    expect(() => parseBalanceCsv(csv, assets, USD)).toThrowError(/Missing required column/);
  });

  it('handles comma-formatted balance input from user edits', () => {
    // User may type "1,500.00" in their spreadsheet if auto-formatted
    const csv = 'asset_id,name,asset_type,balance\n10,Checking,Bank,"1,500.00"';
    const result = parseBalanceCsv(csv, assets, USD);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toEqual({ assetId: 10, balance: 150000 });
  });
});
