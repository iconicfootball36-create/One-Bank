import {
  formatFriendlyMonnifyError,
  getMonnifyAccessToken,
  getMonnifyConfig,
  inFlightTransfers,
  processedIdempotencyKeys,
  readJsonBody,
  resolveCandidateBankCodes,
  sendJson,
  type VercelRequestLike,
  type VercelResponseLike,
} from '../_lib/monnify';

interface TransferBody {
  amount?: number;
  destinationBankCode?: string;
  destinationBankName?: string;
  destinationAccountNumber?: string;
  destinationAccountName?: string;
  narration?: string;
  idempotencyKey?: string;
  sourceAccountNumber?: string;
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody<TransferBody>(req);
  const {
    amount,
    destinationBankCode,
    destinationBankName,
    destinationAccountNumber,
    destinationAccountName,
    narration,
    idempotencyKey,
    sourceAccountNumber: customSourceAccount,
  } = body;

  const numericAmount = Number(amount);
  const cleanAccount = String(destinationAccountNumber || '').replace(/\D/g, '').trim();

  if (!numericAmount || isNaN(numericAmount) || numericAmount <= 0) {
    sendJson(res, 400, {
      error: 'Please enter a valid transfer amount greater than ₦0.00.',
    });
    return;
  }

  if (!/^\d{10}$/.test(cleanAccount) || !destinationBankCode) {
    sendJson(res, 400, {
      error: 'A valid 10-digit recipient account number and bank selection are required.',
    });
    return;
  }

  if (!destinationAccountName || !destinationAccountName.trim()) {
    sendJson(res, 400, {
      error: 'Recipient account must be verified before initiating a transfer.',
    });
    return;
  }

  const dedupeKey =
    idempotencyKey || `${cleanAccount}-${destinationBankCode}-${numericAmount.toFixed(2)}`;

  if (inFlightTransfers.has(dedupeKey)) {
    sendJson(res, 409, {
      error: 'This transfer is already being processed. Please wait.',
    });
    return;
  }

  const existingProcessed = processedIdempotencyKeys.get(dedupeKey);
  if (existingProcessed && Date.now() - existingProcessed.timestamp < 60_000) {
    sendJson(res, 200, {
      live: true,
      requestSuccessful: true,
      duplicatePrevented: true,
      reference: existingProcessed.reference,
      status: existingProcessed.status,
      responseBody: existingProcessed.responseBody,
    });
    return;
  }

  const { baseUrl, isConfigured, sourceAccountNumber } = getMonnifyConfig();
  const walletAccount = (customSourceAccount || sourceAccountNumber || '').trim();

  if (!isConfigured) {
    sendJson(res, 503, {
      live: false,
      requestSuccessful: false,
      error:
        'Monnify API credentials are not configured. Please set MONNIFY_API_KEY, MONNIFY_SECRET_KEY, and MONNIFY_SOURCE_ACCOUNT_NUMBER in Vercel Environment Variables.',
    });
    return;
  }

  if (!walletAccount) {
    sendJson(res, 400, {
      live: true,
      requestSuccessful: false,
      error:
        'MONNIFY_SOURCE_ACCOUNT_NUMBER (your Monnify Wallet Account Number) is not configured in Environment Variables.',
    });
    return;
  }

  const reference = `OB-${Date.now()}-${Math.floor(100000 + Math.random() * 899999)}`;
  inFlightTransfers.add(dedupeKey);

  try {
    const token = await getMonnifyAccessToken();
    const candidateBankCodes = await resolveCandidateBankCodes(
      destinationBankCode,
      destinationBankName || '',
      token,
      baseUrl
    );
    const resolvedBankCode = candidateBankCodes[0] || destinationBankCode;

    const payload = {
      amount: numericAmount,
      reference,
      narration:
        narration && narration.trim()
          ? narration.trim()
          : `Transfer to ${destinationAccountName.trim()}`,
      destinationBankCode: resolvedBankCode,
      destinationAccountNumber: cleanAccount,
      destinationAccountName: destinationAccountName.trim(),
      currency: 'NGN',
      sourceAccountNumber: walletAccount,
      async: false,
    };

    const response = await fetch(`${baseUrl}/api/v2/disbursements/single`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as {
      requestSuccessful?: boolean;
      responseMessage?: string;
      responseCode?: string;
      responseBody?: {
        amount?: number;
        reference?: string;
        transactionReference?: string;
        status?: string;
        dateCreated?: string;
        totalFee?: number;
        destinationAccountName?: string;
        destinationBankName?: string;
        destinationAccountNumber?: string;
        destinationBankCode?: string;
      };
    };

    if (!response.ok || !data.requestSuccessful) {
      sendJson(res, 400, {
        live: true,
        requestSuccessful: false,
        error: formatFriendlyMonnifyError(
          data.responseMessage,
          `Transfer could not be completed (HTTP ${response.status}).`
        ),
        responseCode: data.responseCode,
      });
      return;
    }

    const rawStatus = (data.responseBody?.status || 'PENDING').toUpperCase();
    const txRef = data.responseBody?.reference || reference;

    if (rawStatus === 'FAILED' || rawStatus === 'REVERSED' || rawStatus === 'EXPIRED') {
      sendJson(res, 400, {
        live: true,
        requestSuccessful: false,
        status: 'FAILED',
        reference: txRef,
        error: formatFriendlyMonnifyError(
          data.responseMessage,
          `Transfer was declined by destination bank (Status: ${rawStatus}).`
        ),
      });
      return;
    }

    const normalizedStatus: 'SUCCESS' | 'PENDING' =
      rawStatus === 'SUCCESS' || rawStatus === 'COMPLETED' || rawStatus === 'PAID'
        ? 'SUCCESS'
        : 'PENDING';

    processedIdempotencyKeys.set(dedupeKey, {
      status: normalizedStatus,
      reference: txRef,
      responseBody: (data.responseBody || {}) as Record<string, unknown>,
      timestamp: Date.now(),
    });

    sendJson(res, 200, {
      live: true,
      requestSuccessful: true,
      reference: txRef,
      status: normalizedStatus,
      rawMonnifyStatus: rawStatus,
      responseBody: data.responseBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error while processing transfer.';
    sendJson(res, 500, {
      live: true,
      requestSuccessful: false,
      error: formatFriendlyMonnifyError(message),
    });
  } finally {
    inFlightTransfers.delete(dedupeKey);
  }
}
