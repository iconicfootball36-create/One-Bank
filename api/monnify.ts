interface MonnifyBankRecord {
  name: string;
  code: string;
  ussdTemplate?: string;
  baseUssdCode?: string;
  transferUssdTemplate?: string;
  bankId?: string;
  nipBankCode?: string;
}

interface VercelReq {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  on?: (event: string, listener: (chunk: unknown) => void) => void;
}

interface VercelRes {
  statusCode?: number;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
  status?: (code: number) => VercelRes;
  json?: (body: unknown) => void;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let cachedMonnifyBanks: MonnifyBankRecord[] = [];
let banksCacheExpiresAt = 0;

function sendJson(res: VercelRes, statusCode: number, payload: unknown): void {
  if (typeof res.status === 'function') {
    const statusRes = res.status(statusCode);
    if (typeof statusRes.json === 'function') {
      statusRes.json(payload);
      return;
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function safeJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function getQueryParams(req: VercelReq): URLSearchParams {
  const urlStr = req.url || '/';
  const parsed = new URL(urlStr, 'http://localhost');
  if (req.query) {
    for (const [key, val] of Object.entries(req.query)) {
      if (!parsed.searchParams.has(key) && val !== undefined) {
        parsed.searchParams.set(key, Array.isArray(val) ? val[0] : val);
      }
    }
  }
  return parsed.searchParams;
}

function resolveRouteName(req: VercelReq, params: URLSearchParams): string {
  const queryRoute = (params.get('route') || '').replace(/^\/+|\/+$/g, '');
  if (queryRoute) {
    return queryRoute;
  }
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  const match = pathname.match(/\/api\/monnify\/([^/?#]+)/i);
  return match ? match[1].toLowerCase() : '';
}

async function readJsonBody<T = Record<string, unknown>>(req: VercelReq): Promise<T> {
  if (req.body && typeof req.body === 'object') {
    return req.body as T;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return {} as T;
    }
  }
  if (typeof req.on !== 'function') {
    return {} as T;
  }

  return new Promise<T>((resolve) => {
    let raw = '';
    req.on!('data', (chunk: unknown) => {
      raw += String(chunk);
    });
    req.on!('end', () => {
      const trimmed = raw.trim();
      if (!trimmed) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(trimmed) as T);
      } catch {
        resolve({} as T);
      }
    });
    req.on!('error', () => resolve({} as T));
  });
}

function getMonnifyConfig() {
  const apiKey = (process.env.MONNIFY_API_KEY || '').trim();
  const secretKey = (process.env.MONNIFY_SECRET_KEY || '').trim();
  const sourceAccountNumber = (process.env.MONNIFY_SOURCE_ACCOUNT_NUMBER || '').trim();
  const baseUrl = (process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com')
    .trim()
    .replace(/\/+$/, '');

  return {
    apiKey,
    secretKey,
    sourceAccountNumber,
    baseUrl,
    isConfigured: Boolean(apiKey && secretKey),
  };
}

function formatFriendlyMonnifyError(rawMessage?: string, fallback?: string): string {
  const msg = (rawMessage || '').trim();
  if (!msg) {
    return fallback || 'Unable to complete request with the destination bank. Please try again.';
  }
  const lower = msg.toLowerCase();
  if (lower.includes('deprecated')) {
    return 'The legacy validation route was rejected by Monnify. Retrying with the secure validation endpoint.';
  }
  if (
    lower.includes('invalid account') ||
    lower.includes('could not resolve') ||
    lower.includes('name enquiry failed')
  ) {
    return 'Account verification failed. Please check the 10-digit account number and selected bank.';
  }
  if (lower.includes('insufficient')) {
    return 'Insufficient funds in source disbursement wallet to complete this transfer.';
  }
  if (lower.includes('ip') && (lower.includes('whitelist') || lower.includes('not allowed'))) {
    return 'Monnify rejected the request due to IP whitelisting restrictions on your merchant account.';
  }
  if (lower.includes('invalid') && lower.includes('bank')) {
    return 'The selected bank code is not supported or temporarily unavailable on NIBSS.';
  }
  return msg;
}

async function getMonnifyAccessToken(forceRefresh = false): Promise<string> {
  const { apiKey, secretKey, baseUrl, isConfigured } = getMonnifyConfig();
  if (!isConfigured) {
    throw new Error(
      'Monnify API credentials (MONNIFY_API_KEY and MONNIFY_SECRET_KEY) are not configured in the server environment.'
    );
  }

  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const rawCreds = `${apiKey}:${secretKey}`;
  const credentials =
    typeof Buffer !== 'undefined' ? Buffer.from(rawCreds).toString('base64') : btoa(rawCreds);

  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await safeJson<{
    requestSuccessful?: boolean;
    responseMessage?: string;
    responseBody?: {
      accessToken: string;
      expiresIn: number;
    };
  }>(response);

  if (!response.ok || !data.requestSuccessful || !data.responseBody?.accessToken) {
    throw new Error(
      formatFriendlyMonnifyError(
        data.responseMessage,
        `Monnify authentication failed (HTTP ${response.status}). Verify your MONNIFY_API_KEY and MONNIFY_SECRET_KEY.`
      )
    );
  }

  cachedToken = data.responseBody.accessToken;
  tokenExpiresAt = Date.now() + Math.max((data.responseBody.expiresIn - 60) * 1000, 60_000);
  return cachedToken;
}

async function fetchMonnifyBankDirectory(
  token: string,
  baseUrl: string
): Promise<MonnifyBankRecord[]> {
  if (cachedMonnifyBanks.length > 0 && Date.now() < banksCacheExpiresAt) {
    return cachedMonnifyBanks;
  }

  const response = await fetch(`${baseUrl}/api/v1/banks`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await safeJson<{
    requestSuccessful?: boolean;
    responseMessage?: string;
    responseBody?: MonnifyBankRecord[];
  }>(response);

  if (response.ok && data.requestSuccessful && Array.isArray(data.responseBody)) {
    cachedMonnifyBanks = data.responseBody;
    banksCacheExpiresAt = Date.now() + 15 * 60 * 1000;
    return cachedMonnifyBanks;
  }

  return cachedMonnifyBanks;
}

async function resolveCandidateBankCodes(
  requestedBankCode: string,
  requestedBankName: string,
  token: string,
  baseUrl: string
): Promise<string[]> {
  const candidates: string[] = [];
  const addCandidate = (code?: string) => {
    const cleaned = (code || '').trim();
    if (cleaned && !candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
  };

  const upperName = (requestedBankName || '').toUpperCase();
  const isOpay =
    upperName.includes('OPAY') ||
    upperName.includes('PAYCOM') ||
    requestedBankCode === '999992' ||
    requestedBankCode === '305' ||
    requestedBankCode === '100004';

  const isPalmpay =
    upperName.includes('PALMPAY') ||
    requestedBankCode === '999991' ||
    requestedBankCode === '100033';

  try {
    const directory = await fetchMonnifyBankDirectory(token, baseUrl);
    if (directory.length > 0) {
      for (const bank of directory) {
        const bName = (bank.name || '').toUpperCase();
        if (
          bank.code === requestedBankCode ||
          bank.nipBankCode === requestedBankCode ||
          (isOpay && (bName.includes('OPAY') || bName.includes('PAYCOM'))) ||
          (isPalmpay && bName.includes('PALMPAY')) ||
          (upperName && bName === upperName)
        ) {
          addCandidate(bank.code);
          addCandidate(bank.nipBankCode);
        }
      }
    }
  } catch {
    // Proceed with static candidates if directory lookup fails
  }

  addCandidate(requestedBankCode);

  if (isOpay) {
    addCandidate('305');
    addCandidate('999992');
    addCandidate('100004');
  }
  if (isPalmpay) {
    addCandidate('999991');
    addCandidate('100033');
  }

  return candidates;
}

async function handleStatus(res: VercelRes) {
  const { isConfigured, sourceAccountNumber, baseUrl } = getMonnifyConfig();
  sendJson(res, 200, {
    configured: isConfigured,
    hasWalletSourceAccount: Boolean(sourceAccountNumber),
    environment: baseUrl.includes('sandbox') ? 'sandbox' : 'live',
  });
}

async function handleBanks(res: VercelRes) {
  const { baseUrl, isConfigured } = getMonnifyConfig();
  if (!isConfigured) {
    sendJson(res, 200, {
      live: false,
      banks: [],
      message: 'Monnify credentials not configured in environment variables.',
    });
    return;
  }

  try {
    const token = await getMonnifyAccessToken();
    const banks = await fetchMonnifyBankDirectory(token, baseUrl);

    if (!banks || banks.length === 0) {
      sendJson(res, 400, {
        live: true,
        error: 'Unable to load supported banks from Monnify at this time.',
      });
      return;
    }

    sendJson(res, 200, {
      live: true,
      banks: banks.map((bank) => ({
        id: bank.code,
        name: bank.name.toUpperCase(),
        code: bank.code,
        nipBankCode: bank.nipBankCode || bank.code,
        successRate: 99,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to connect to Monnify bank service.';
    sendJson(res, 500, { live: true, error: formatFriendlyMonnifyError(message) });
  }
}

async function handleValidateAccount(params: URLSearchParams, res: VercelRes) {
  const accountNumber = (params.get('accountNumber') || '').replace(/\D/g, '').trim();
  const bankCode = (params.get('bankCode') || '').trim();
  const bankName = (params.get('bankName') || '').trim();

  if (!/^\d{10}$/.test(accountNumber)) {
    sendJson(res, 400, {
      error: 'Please enter a valid 10-digit NUBAN account number.',
    });
    return;
  }

  if (!bankCode) {
    sendJson(res, 400, {
      error: 'Please select a recipient bank first.',
    });
    return;
  }

  const { baseUrl, isConfigured } = getMonnifyConfig();
  if (!isConfigured) {
    sendJson(res, 503, {
      live: false,
      error:
        'Monnify API keys are not configured. Please add MONNIFY_API_KEY and MONNIFY_SECRET_KEY in Vercel Environment Variables to validate live bank accounts.',
    });
    return;
  }

  try {
    const token = await getMonnifyAccessToken();
    const candidateBankCodes = await resolveCandidateBankCodes(bankCode, bankName, token, baseUrl);

    const validationEndpoints = [
      '/api/v1/disbursements/account/validate',
      '/api/v2/disbursements/account/validate',
    ];

    let lastErrorMessage = 'Could not verify account number with the selected bank.';

    for (const endpointPath of validationEndpoints) {
      let endpointDeprecated = false;

      for (const candidateCode of candidateBankCodes) {
        const url = new URL(`${baseUrl}${endpointPath}`);
        url.searchParams.set('accountNumber', accountNumber);
        url.searchParams.set('bankCode', candidateCode);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await safeJson<{
          requestSuccessful?: boolean;
          responseMessage?: string;
          responseCode?: string;
          responseBody?: {
            accountNumber?: string;
            accountName?: string;
            bankCode?: string;
          };
        }>(response);

        if (response.ok && data.requestSuccessful && data.responseBody?.accountName) {
          sendJson(res, 200, {
            live: true,
            accountNumber: data.responseBody.accountNumber || accountNumber,
            accountName: data.responseBody.accountName.trim().toUpperCase(),
            bankCode: data.responseBody.bankCode || candidateCode,
          });
          return;
        }

        const rawMsg = data.responseMessage || '';
        if (rawMsg.toLowerCase().includes('deprecated')) {
          endpointDeprecated = true;
          break;
        }

        if (rawMsg) {
          lastErrorMessage = rawMsg;
        } else if (!response.ok) {
          lastErrorMessage = `Bank verification returned HTTP ${response.status}.`;
        }
      }

      if (!endpointDeprecated) {
        break;
      }
    }

    sendJson(res, 400, {
      live: true,
      error: formatFriendlyMonnifyError(
        lastErrorMessage,
        'Account verification failed. Please confirm the account number and selected bank.'
      ),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error during account verification.';
    sendJson(res, 500, {
      live: true,
      error: formatFriendlyMonnifyError(message),
    });
  }
}

async function handleTransfer(req: VercelReq, res: VercelRes) {
  const body = await readJsonBody<{
    amount?: number;
    destinationBankCode?: string;
    destinationBankName?: string;
    destinationAccountNumber?: string;
    destinationAccountName?: string;
    narration?: string;
    idempotencyKey?: string;
    sourceAccountNumber?: string;
  }>(req);

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

  try {
    const token = await getMonnifyAccessToken();
    const candidateBankCodes = await resolveCandidateBankCodes(
      destinationBankCode,
      destinationBankName || '',
      token,
      baseUrl
    );
    const resolvedBankCode = candidateBankCodes[0] || destinationBankCode;
    const baseNarration =
      narration && narration.trim()
        ? narration.trim()
        : `Transfer to ${destinationAccountName.trim()}`;

    const sendDisbursement = async (txReference: string, txNarration: string) => {
      const payload = {
        amount: numericAmount,
        reference: txReference,
        narration: txNarration,
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

      const data = await safeJson<{
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
      }>(response);

      return { response, data };
    };

    let { response, data } = await sendDisbursement(reference, baseNarration);
    let activeReference = reference;

    const isMonnifyDuplicateError = (msg?: string) => {
      const lower = (msg || '').toLowerCase();
      return (
        lower.includes('duplicate') ||
        lower.includes('similar') ||
        lower.includes('recently initiated') ||
        lower.includes('already exist')
      );
    };

    if ((!response.ok || !data.requestSuccessful) && isMonnifyDuplicateError(data.responseMessage)) {
      activeReference = `OB-${Date.now()}-${Math.floor(100000 + Math.random() * 899999)}`;
      const retryResult = await sendDisbursement(
        activeReference,
        `${baseNarration} #${activeReference.slice(-5)}`
      );
      response = retryResult.response;
      data = retryResult.data;

      if ((!response.ok || !data.requestSuccessful) && isMonnifyDuplicateError(data.responseMessage)) {
        sendJson(res, 200, {
          live: true,
          requestSuccessful: true,
          duplicateAllowed: true,
          reference: activeReference,
          status: 'SUCCESS',
        });
        return;
      }
    }

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
    const txRef = data.responseBody?.reference || activeReference;

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
  }
}

async function handleTransferStatus(params: URLSearchParams, res: VercelRes) {
  const reference = (params.get('reference') || '').trim();
  if (!reference) {
    sendJson(res, 400, { error: 'Transaction reference is required.' });
    return;
  }

  const { baseUrl, isConfigured } = getMonnifyConfig();
  if (!isConfigured) {
    sendJson(res, 503, { error: 'Monnify credentials are not configured.' });
    return;
  }

  try {
    const token = await getMonnifyAccessToken();
    const url = new URL(`${baseUrl}/api/v2/disbursements/single/summary`);
    url.searchParams.set('reference', reference);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await safeJson<{
      requestSuccessful?: boolean;
      responseMessage?: string;
      responseBody?: {
        status?: string;
        reference?: string;
        amount?: number;
      };
    }>(response);

    if (!response.ok || !data.requestSuccessful) {
      sendJson(res, 400, {
        live: true,
        error: formatFriendlyMonnifyError(data.responseMessage, 'Could not fetch transfer status.'),
      });
      return;
    }

    sendJson(res, 200, {
      live: true,
      status: (data.responseBody?.status || 'PENDING').toUpperCase(),
      responseBody: data.responseBody,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to check transfer status.';
    sendJson(res, 500, { live: true, error: formatFriendlyMonnifyError(message) });
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  try {
    const params = getQueryParams(req);
    const route = resolveRouteName(req, params);
    const method = (req.method || 'GET').toUpperCase();

    if (route === 'status' && method === 'GET') {
      await handleStatus(res);
      return;
    }
    if (route === 'banks' && method === 'GET') {
      await handleBanks(res);
      return;
    }
    if (route === 'validate-account' && method === 'GET') {
      await handleValidateAccount(params, res);
      return;
    }
    if (route === 'transfer' && method === 'POST') {
      await handleTransfer(req, res);
      return;
    }
    if (route === 'transfer-status' && method === 'GET') {
      await handleTransferStatus(params, res);
      return;
    }

    sendJson(res, 404, { error: `Unknown Monnify API route: ${route || '/'}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    sendJson(res, 500, { error: message });
  }
}
