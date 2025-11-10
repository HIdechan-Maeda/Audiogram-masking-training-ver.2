// Vercel Serverless Function to proxy OpenAI requests
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured on server' });
    return;
  }

  try {
    const { model = 'gpt-4o-mini', messages = [], temperature = 0.7, max_tokens = 500 } = req.body || {};

    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });

    if (!oaiRes.ok) {
      const text = await oaiRes.text();
      return res.status(oaiRes.status).json({ error: 'OpenAI error', detail: text });
    }

    const data = await oaiRes.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content, raw: data });
  } catch (err) {
    return res.status(500).json({ error: 'Proxy error', detail: String(err) });
  }
}













