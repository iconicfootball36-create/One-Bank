import {
  formatFriendlyMonnifyError,
  getMonnifyAccessToken,
  getMonnifyConfig,
  getQueryParams,
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

    const data = (await response.json()) as {
      requestSuccessful?: boolean;
      responseMessage?: string;
      responseBody?: {
        status?: string;
        reference?: string;
        amount?: number;
      };
    };

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
