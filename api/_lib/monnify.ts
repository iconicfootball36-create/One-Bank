import type { IncomingMessage, ServerResponse } from 'http';

export interface MonnifyBankRecord {
  name: string;
  code: string;
  ussdTemplate?: string;
  baseUssdCode?: string;
  transferUssdTemplate?: string;
  bankId?: string;
  nipBankCode?: string;
}

export interface VercelRequestLike extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface VercelResponseLike extends ServerResponse {
  status?: (code: number) => VercelResponseLike;
  json?: (body: unknown) => void;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let cachedMonnifyBanks: MonnifyBankRecord[] = [];
let banksCacheExpiresAt = 0;

export const inFlightTransfers = new Set<string>();
export const processedIdempotencyKeys = new Map<
  string,
  {
    status: string;
    reference: string;
    responseBody: Record<string, unknown>;
    timestamp: number;
  }
>();

export function sendJson(res: VercelResponseLike, statusCode: number, payload: unknown): void {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
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

export function getQueryParams(req: VercelRequestLike): URLSearchParams {
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

export async function readJsonBody<T = Record<string, unknown>>(req: VercelRequestLike): Promise<T> {
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

  return new Promise<T>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        resolve({} as T);
      }
    });
    req.on('error', () => resolve({} as T));
  });
}

export function getMonnifyConfig() {
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

export function formatFriendlyMonnifyError(rawMessage?: string, fallback?: string): string {
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

export async function getMonnifyAccessToken(forceRefresh = false): Promise<string> {
  const { apiKey, secretKey, baseUrl, isConfigured } = getMonnifyConfig();
  if (!isConfigured) {
    throw new Error(
      'Monnify API credentials (MONNIFY_API_KEY and MONNIFY_SECRET_KEY) are not configured in the server environment.'
    );
  }

  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${apiKey}:${secretKey}`).toString('base64');
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });

  const data = (await response.json()) as {
    requestSuccessful?: boolean;
    responseMessage?: string;
    responseBody?: {
      accessToken: string;
      expiresIn: number;
    };
  };

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

export async function fetchMonnifyBankDirectory(
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

  const data = (await response.json()) as {
    requestSuccessful?: boolean;
    responseMessage?: string;
    responseBody?: MonnifyBankRecord[];
  };

  if (response.ok && data.requestSuccessful && Array.isArray(data.responseBody)) {
    cachedMonnifyBanks = data.responseBody;
    banksCacheExpiresAt = Date.now() + 15 * 60 * 1000;
    return cachedMonnifyBanks;
  }

  return cachedMonnifyBanks;
}

export async function resolveCandidateBankCodes(
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
