/**
 * Primary-sale accounting is calculated in integer settlement-token units.
 * The contract uses the same floor division, so the persisted projection can
 * be reconciled byte-for-byte with PrimaryMintSettled.
 */
export const BPS_DENOMINATOR = 10000n;
export const PRIMARY_FEE_BPS = 500n;

function integer(value, field) {
  try {
    const parsed = typeof value === 'bigint' ? value : BigInt(String(value ?? ''));
    if (parsed < 0n) throw new Error(`${field}_MUST_BE_NON_NEGATIVE`);
    return parsed;
  } catch (error) {
    if (error.message?.endsWith('_MUST_BE_NON_NEGATIVE')) throw error;
    throw new Error(`${field}_MUST_BE_INTEGER`);
  }
}

function required(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field}_REQUIRED`);
  return text;
}

export function calculatePrimarySale({
  grossAmountUsdg,
  quantity = 1,
  feeBps = PRIMARY_FEE_BPS,
  referralObligationUsdg = 0,
  paymentToken,
  network,
  chainId,
  txHash,
  blockNumber,
  eventIndex,
  editionId = null,
  editionAddress = null,
  termsHash = null,
  builderId = null,
  builderAccountId = null,
  buyerAddress = null,
  recipientAddress = null,
  firstTokenId = null,
  status = 'CONFIRMED',
  evidence = {}
} = {}) {
  const gross = integer(grossAmountUsdg, 'GROSS_AMOUNT_USDG');
  const count = integer(quantity, 'QUANTITY');
  const feeRate = integer(feeBps, 'FEE_BPS');
  const referral = integer(referralObligationUsdg, 'REFERRAL_OBLIGATION_USDG');
  if (gross <= 0n) throw new Error('GROSS_AMOUNT_USDG_MUST_BE_POSITIVE');
  if (count <= 0n) throw new Error('QUANTITY_MUST_BE_POSITIVE');
  if (feeRate > BPS_DENOMINATOR) throw new Error('FEE_BPS_OUT_OF_RANGE');
  const fee = gross * feeRate / BPS_DENOMINATOR;
  const proceeds = gross - fee;
  const normalizedStatus = String(status).toUpperCase();
  if (!['CONFIRMED', 'FAILED', 'REORGED'].includes(normalizedStatus)) throw new Error('PRIMARY_SALE_STATUS_INVALID');
  const numericChainId = Number(chainId);
  if (!Number.isInteger(numericChainId) || numericChainId <= 0) throw new Error('CHAIN_ID_REQUIRED');
  if (eventIndex == null) throw new Error('EVENT_INDEX_REQUIRED');
  return {
    chainId: numericChainId,
    network: required(network, 'NETWORK'),
    txHash: required(txHash, 'TX_HASH').toLowerCase(),
    blockNumber: blockNumber == null ? null : Number(integer(blockNumber, 'BLOCK_NUMBER')),
    eventIndex: eventIndex == null ? null : Number(integer(eventIndex, 'EVENT_INDEX')),
    editionId,
    editionAddress: editionAddress ? String(editionAddress).toLowerCase() : null,
    termsHash,
    builderId,
    builderAccountId,
    buyerAddress: buyerAddress ? String(buyerAddress).toLowerCase() : null,
    recipientAddress: recipientAddress ? String(recipientAddress).toLowerCase() : null,
    firstTokenId: firstTokenId == null ? null : String(integer(firstTokenId, 'FIRST_TOKEN_ID')),
    quantity: Number(count),
    grossAmountUsdg: gross.toString(),
    nexmarketsFeeUsdg: fee.toString(),
    builderProceedsUsdg: proceeds.toString(),
    referralObligationUsdg: referral.toString(),
    paymentToken: required(paymentToken, 'PAYMENT_TOKEN').toLowerCase(),
    status: normalizedStatus,
    evidence: structuredClone(evidence ?? {})
  };
}

export function primarySaleEventKey({ chainId, txHash, eventIndex }) {
  if (eventIndex == null) throw new Error('EVENT_INDEX_REQUIRED');
  return `${Number(chainId)}:${String(txHash).toLowerCase()}:${Number(eventIndex)}`;
}

export function aggregatePrimarySales(rows = []) {
  return rows.reduce((total, row) => {
    if (String(row.status ?? 'CONFIRMED').toUpperCase() !== 'CONFIRMED') return total;
    return {
      grossAmountUsdg: (BigInt(total.grossAmountUsdg) + BigInt(row.grossAmountUsdg ?? row.gross_amount_usdg ?? 0)).toString(),
      nexmarketsFeeUsdg: (BigInt(total.nexmarketsFeeUsdg) + BigInt(row.nexmarketsFeeUsdg ?? row.nexmarkets_fee_usdg ?? 0)).toString(),
      builderProceedsUsdg: (BigInt(total.builderProceedsUsdg) + BigInt(row.builderProceedsUsdg ?? row.builder_proceeds_usdg ?? 0)).toString(),
      referralObligationUsdg: (BigInt(total.referralObligationUsdg) + BigInt(row.referralObligationUsdg ?? row.referral_obligation_usdg ?? 0)).toString(),
      salesCount: total.salesCount + 1,
      unitsSold: total.unitsSold + Number(row.quantity ?? 0)
    };
  }, { grossAmountUsdg: '0', nexmarketsFeeUsdg: '0', builderProceedsUsdg: '0', referralObligationUsdg: '0', salesCount: 0, unitsSold: 0 });
}
