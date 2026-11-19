import {
  fetchMonnifyBankDirectory,
  formatFriendlyMonnifyError,
  getMonnifyAccessToken,
  getMonnifyConfig,
  sendJson,
  type VercelRequestLike,
  type VercelResponseLike,
} from '../_lib/monnify';

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

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
