import {
  formatFriendlyMonnifyError,
  getMonnifyAccessToken,
  getMonnifyConfig,
  getQueryParams,
  resolveCandidateBankCodes,
  sendJson,
  type VercelRequestLike,
  type VercelResponseLike,
} from '../_lib/monnify';

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const params = getQueryParams(req);
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

        const data = (await response.json()) as {
          requestSuccessful?: boolean;
          responseMessage?: string;
          responseCode?: string;
          responseBody?: {
            accountNumber?: string;
            accountName?: string;
            bankCode?: string;
          };
        };

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
