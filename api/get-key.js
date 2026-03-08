// Called by frontend after successful Stripe redirect to retrieve the license key
// for the just-completed session — lets us show it on screen immediately
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://etsyfinance.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { session_id } = req.query;
  if (!session_id || !session_id.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Server configuration error' });

  try {
    // Verify the session actually completed (don't hand out keys for unpaid sessions)
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
    });

    const session = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: 'Could not retrieve session' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    // Deterministic key from session ID (matches what webhook sent)
    const LAUNCH_KEYS = [
      'EFP-1EF5-1095-4447','EFP-17B6-6349-A86C','EFP-2A85-C0FC-8595','EFP-39EB-F6B7-EC8B',
      'EFP-14B2-9721-967C','EFP-AE04-11DD-FE38','EFP-0FF4-F4F4-BD32','EFP-4C99-5FC4-48F7',
      'EFP-4B86-994F-646C','EFP-327E-374C-548C','EFP-DF46-FD1E-FCAB','EFP-BFE0-2041-8ECD',
      'EFP-B669-4B63-9D9E','EFP-CE81-1E88-4AF0','EFP-571B-F253-F439','EFP-47A2-4576-0DA1',
      'EFP-9800-1B5C-86A2','EFP-1367-4D99-898E','EFP-4097-D7C1-3D38','EFP-D441-679C-F78F'
    ];

    let hash = 0;
    for (let i = 0; i < session_id.length; i++) {
      hash = ((hash << 5) - hash) + session_id.charCodeAt(i);
      hash |= 0;
    }
    const key = LAUNCH_KEYS[Math.abs(hash) % LAUNCH_KEYS.length];

    return res.status(200).json({ key, email: session.customer_details?.email });
  } catch (err) {
    console.error('get-key error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
