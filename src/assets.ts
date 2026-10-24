export type AssetCode = 'XLM' | 'USDC';
export const ASSET_CODES: readonly AssetCode[] = ['XLM', 'USDC'];

export interface AssetRef {
  code: AssetCode;
  /** null for native XLM. */
  issuer: string | null;
}

export function assetRef(code: AssetCode, usdcIssuer: string): AssetRef {
  return code === 'XLM' ? { code, issuer: null } : { code, issuer: usdcIssuer };
}

export const pairFor = (code: AssetCode) => `${code}/USD` as const;
