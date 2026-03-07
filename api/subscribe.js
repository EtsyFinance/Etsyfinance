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

  const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
  const BEEHIIV_PUB_ID = process.env.BEEHIIV_PUB_ID;

  if (!BEEHIIV_API_KEY || !BEEHIIV_PUB_ID) {
    console.error('Missing env vars:', { BEEHIIV_API_KEY: !!BEEHIIV_API_KEY, BEEHIIV_PUB_ID: !!BEEHIIV_PUB_ID });
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const response = await fetch(
      `https://api.beehiiv.com/v2/publications/${BEEHIIV_PUB_ID}/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
        },
        body: JSON.stringify({
          email,
          reactivate_existing: false,
          send_welcome_email: true,
          utm_source: 'etsyfinance_website',
          utm_medium: 'waitlist_form',
        }),
      }
    );

    const responseText = await response.text();
    console.log('Beehiiv response:', response.status, responseText);

    if (response.ok || response.status === 201) {
      return res.status(200).json({ success: true });
    } else {
      return res.status(response.status).json({ error: 'Subscription failed', detail: responseText });
    }
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
