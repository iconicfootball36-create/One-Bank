import {
  getMonnifyConfig,
  sendJson,
  type VercelRequestLike,
  type VercelResponseLike,
} from '../_lib/monnify';

export default function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const { isConfigured, sourceAccountNumber, baseUrl } = getMonnifyConfig();
  sendJson(res, 200, {
    configured: isConfigured,
    hasWalletSourceAccount: Boolean(sourceAccountNumber),
    environment: baseUrl.includes('sandbox') ? 'sandbox' : 'live',
  });
}
