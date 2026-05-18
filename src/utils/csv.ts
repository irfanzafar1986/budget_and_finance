import Papa from 'papaparse';
import { decimalsForCurrency, parseAmount } from './money';
import type { AssetAccount } from '../domain/types';

const REQUIRED_HEADERS = ['asset_id', 'name', 'asset_type', 'balance'];

function minorToDecimalString(minor: number, currency: string): string {
  const decimals = decimalsForCurrency(currency);
  const factor = 10 ** decimals;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / factor);
  const fraction = abs - whole * factor;
  const sign = minor < 0 ? '-' : '';
  if (decimals === 0) return sign + String(whole);
  return sign + String(whole) + '.' + String(fraction).padStart(decimals, '0');
}

export interface ParsedBulkUpload {
  matched: { assetId: number; balance: number }[];
  newDrafts: { name: string; assetType: string; value: string }[];
  warnings: string[];
}

export function buildBalanceTemplateCsv(assets: AssetAccount[], currency: string): string {
  const data = assets.map((asset) => [
    asset.id,
    asset.name,
    asset.asset_type,
    minorToDecimalString(asset.current_balance, currency),
  ]);
  // {fields, data} form always emits the header row, even when data is empty
  // (papaparse's columns option drops headers if the rows array is empty).
  return Papa.unparse({ fields: [...REQUIRED_HEADERS], data });
}

export function parseBalanceCsv(
  text: string,
  activeAssets: AssetAccount[],
  currency: string,
): ParsedBulkUpload {
  // Strip UTF-8 BOM (Excel often adds this when saving UTF-8 CSV)
  const clean = text.startsWith('﻿') ? text.slice(1) : text;

  const result = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  });

  const fields = result.meta.fields ?? [];
  for (const req of REQUIRED_HEADERS) {
    if (!fields.includes(req)) {
      throw new Error(
        `Missing required column: "${req}". Expected columns: asset_id, name, asset_type, balance.`,
      );
    }
  }

  const activeById = new Map(activeAssets.map((a) => [a.id, a]));
  const matched: ParsedBulkUpload['matched'] = [];
  const newDrafts: ParsedBulkUpload['newDrafts'] = [];
  const warnings: string[] = [];

  for (const [idx, row] of result.data.entries()) {
    const rowNum = idx + 2; // 1-indexed; header is row 1
    const rawId = (row['asset_id'] ?? '').trim();
    const name = (row['name'] ?? '').trim();
    const assetType = (row['asset_type'] ?? '').trim();
    const rawBalance = (row['balance'] ?? '').trim();

    const numericId = rawId !== '' ? Number(rawId) : NaN;
    const knownAsset =
      Number.isFinite(numericId) && Number.isInteger(numericId)
        ? activeById.get(numericId)
        : undefined;

    if (knownAsset) {
      if (rawBalance === '') continue; // blank = preserve current value
      const balance = parseAmount(rawBalance, currency);
      if (balance === null) {
        warnings.push(
          `Row ${rowNum} (${knownAsset.name}): invalid balance "${rawBalance}" — skipped.`,
        );
        continue;
      }
      matched.push({ assetId: knownAsset.id, balance });
    } else {
      // Unknown or blank asset_id — treat as new asset
      if (!name && !assetType && !rawBalance) continue; // silently skip blank trailing rows
      if (!name || !assetType || !rawBalance) {
        warnings.push(
          `Row ${rowNum}: incomplete new asset row — name, asset_type, and balance are all required — skipped.`,
        );
        continue;
      }
      const balance = parseAmount(rawBalance, currency);
      if (balance === null) {
        warnings.push(
          `Row ${rowNum} (${name}): invalid balance "${rawBalance}" — skipped.`,
        );
        continue;
      }
      if (rawId !== '') {
        warnings.push(
          `Row ${rowNum}: asset_id "${rawId}" not found among active assets — treated as new asset.`,
        );
      }
      newDrafts.push({ name, assetType, value: rawBalance });
    }
  }

  return { matched, newDrafts, warnings };
}
