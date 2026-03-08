// Raw body needed for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe webhook signature verification (no SDK — raw crypto)
async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) throw new Error('Invalid signature header');

  // Check timestamp tolerance (5 minutes)
  const tolerance = 300;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) {
    throw new Error('Timestamp outside tolerance');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computed = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed !== sig) throw new Error('Signature mismatch');
  return true;
}

// The 20 launch keys (same as frontend — webhook picks from this pool)
// In production you'd want a DB to track which are used; for now we pick
// deterministically from the session ID so the same session always gets the same key
const LAUNCH_KEYS = [
  'EFP-1EF5-1095-4447','EFP-17B6-6349-A86C','EFP-2A85-C0FC-8595','EFP-39EB-F6B7-EC8B',
  'EFP-14B2-9721-967C','EFP-AE04-11DD-FE38','EFP-0FF4-F4F4-BD32','EFP-4C99-5FC4-48F7',
  'EFP-4B86-994F-646C','EFP-327E-374C-548C','EFP-DF46-FD1E-FCAB','EFP-BFE0-2041-8ECD',
  'EFP-B669-4B63-9D9E','EFP-CE81-1E88-4AF0','EFP-571B-F253-F439','EFP-47A2-4576-0DA1',
  'EFP-9800-1B5C-86A2','EFP-1367-4D99-898E','EFP-4097-D7C1-3D38','EFP-D441-679C-F78F'
];

function pickKey(sessionId) {
  // Deterministic: hash session ID characters to pick an index
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash) + sessionId.charCodeAt(i);
    hash |= 0;
  }
  return LAUNCH_KEYS[Math.abs(hash) % LAUNCH_KEYS.length];
}

async function sendKeyEmail(toEmail, licenseKey, customerName) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('Missing RESEND_API_KEY — key not emailed:', licenseKey);
    return; // Still succeed — key is also shown on return URL
  }

  const firstName = customerName ? customerName.split(' ')[0] : 'there';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EtsyFinance <hello@resend.dev>',  // pre-verified, no DNS setup needed
      to: [toEmail],
      subject: 'Your EtsyFinance Pro license key',
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1612;">
          <div style="background:#f1641e;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:white;margin:0;font-size:22px;">EtsyFinance Pro</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">Your license key is ready</p>
          </div>
          <div style="background:#faf8f3;padding:32px;border:1px solid #e0d9ce;border-top:none;border-radius:0 0 12px 12px;">
            <p style="font-size:16px;">Hi ${firstName}!</p>
            <p>Thanks for getting EtsyFinance Pro. Here's your license key:</p>
            <div style="background:#f5f0e8;border:1.5px solid #e0d9ce;border-radius:10px;padding:20px;text-align:center;margin:24px 0;">
              <div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:0.08em;color:#1a1612;">${licenseKey}</div>
            </div>
            <p style="font-size:14px;color:#4a4540;"><strong>To activate:</strong></p>
            <ol style="font-size:14px;color:#4a4540;line-height:1.8;">
              <li>Go to <a href="https://etsyfinance.com" style="color:#f1641e;">etsyfinance.com</a></li>
              <li>Upload any Etsy CSV to open the app</li>
              <li>Click <strong>"Unlock Pro →"</strong> below the upload zone</li>
              <li>Enter your key and hit <strong>Unlock</strong></li>
            </ol>
            <p style="font-size:13px;color:#8a8480;margin-top:24px;">
              Questions? Just reply to this email.<br>
              Not affiliated with Etsy, Inc.
            </p>
          </div>
        </div>
      `,
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return res.status(500).end();
  }

  const rawBody = await getRawBody(req);
  const payload = rawBody.toString('utf8');
  const sigHeader = req.headers['stripe-signature'];

  try {
    await verifyStripeSignature(payload, sigHeader, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(payload);
  console.log('Webhook event:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email;
    const name = session.customer_details?.name;
    const sessionId = session.id;

    if (email) {
      const key = pickKey(sessionId);
      console.log(`Sending key ${key} to ${email} for session ${sessionId}`);
      await sendKeyEmail(email, key, name);
    }
  }

  return res.status(200).json({ received: true });
}
