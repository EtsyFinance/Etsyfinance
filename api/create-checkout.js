export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://etsyfinance.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const origin = req.headers.origin || 'https://etsyfinance.com';

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'payment_method_types[]': 'card',
        // Use price_data inline — works with either a product ID (prod_...) or
        // a price ID (price_...). If STRIPE_PRICE_ID starts with "price_" we use
        // it directly; otherwise we treat it as a product ID and define the price inline.
        ...(process.env.STRIPE_PRICE_ID?.startsWith('price_')
          ? {
              'line_items[0][price]': process.env.STRIPE_PRICE_ID,
            }
          : {
              'line_items[0][price_data][currency]': 'usd',
              'line_items[0][price_data][unit_amount]': '900',  // $9.00 in cents
              'line_items[0][price_data][product]': process.env.STRIPE_PRICE_ID, // product ID
              'line_items[0][price_data][product_data][name]': 'EtsyFinance Pro',
              'line_items[0][price_data][product_data][description]': 'Unlock multi-month uploads, quarterly tax calculator, and PDF export',
            }),
        'line_items[0][quantity]': '1',
        'success_url': `${origin}/?session_id={CHECKOUT_SESSION_ID}&activated=true`,
        'cancel_url': `${origin}/`,
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'auto',
        'metadata[product]': 'etsyfinance_pro',
      }).toString(),
    });

    const session = await response.json();

    if (!response.ok) {
      console.error('Stripe error:', session);
      return res.status(400).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
