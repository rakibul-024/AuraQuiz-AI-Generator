module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'The AI service is not configured. Please contact the site owner.' });
  }

  const models = new Map();
  let pageToken = '';
  let pageCount = 0;

  try {
    do {
      pageCount++;
      if (pageCount > 50) {
        return res.status(502).json({ error: 'The AI service returned too many model pages.' });
      }

      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('key', apiKey);
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetch(url);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error?.message || `Google AI returned HTTP ${response.status}.`;
        if (/api key not valid|api_key_invalid|invalid api key|api key expired/i.test(message)) {
          return res.status(503).json({ error: 'The AI service key is invalid. Please contact the site owner.' });
        }
        return res.status(response.status >= 500 ? 502 : response.status).json({ error: message });
      }

      (data?.models || [])
        .filter(model => model.name && model.supportedGenerationMethods?.includes('generateContent'))
        .forEach(model => {
          const name = model.name.replace(/^models\//, '');
          models.set(name, {
            name,
            displayName: model.displayName || name
          });
        });

      pageToken = data?.nextPageToken || '';
    } while (pageToken);
  } catch (error) {
    console.error('Gemini model discovery failed:', error);
    return res.status(502).json({ error: 'Could not connect to the AI service. Please try again.' });
  }

  if (!models.size) {
    return res.status(503).json({ error: 'The AI service has no models available for quiz generation.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ models: [...models.values()] });
};
