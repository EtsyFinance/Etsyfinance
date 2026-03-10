export default async function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email || email.indexOf('@') < 1 || email.indexOf('.') < 1) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const KIT_API_KEY = process.env.KIT_API_KEY;
  const KIT_FORM_ID = process.env.KIT_FORM_ID;

  if (!KIT_API_KEY || !KIT_FORM_ID) {
    console.error('Missing env vars:', { KIT_API_KEY: !!KIT_API_KEY, KIT_FORM_ID: !!KIT_FORM_ID });
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Subscribe email to Kit (ConvertKit) form
    const response = await fetch(
      `https://api.convertkit.com/v3/forms/${KIT_FORM_ID}/subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: KIT_API_KEY,
          email,
          tags: ['shopstally-waitlist'],
        }),
      }
    );

    const responseText = await response.text();
    console.log('Kit response:', response.status, responseText);

    if (response.ok) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(response.status).json({ error: 'Subscription failed', detail: responseText });
    }
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
