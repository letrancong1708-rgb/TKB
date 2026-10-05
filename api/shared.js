// Vercel serverless function: lưu / đọc TKB dùng chung cho mọi người
// GET  /api/shared -> 200 {label,time,b64} | 204 nếu chưa có
// POST /api/shared  body JSON {label, b64} -> lưu bản mới (ghi đè bản cũ)
// Cần Upstash Redis (Vercel > Storage > Marketplace > Upstash Redis), biến môi trường tự được thêm.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'tkb:current';
const MAX_B64 = 3 * 1024 * 1024; // ~2.2MB file xlsx

const redis = async cmd => {
  if (!URL_ || !TOKEN) throw new Error('Chưa gắn Upstash Redis cho project');
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'Redis ' + r.status);
  return j.result;
};

module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const v = await redis(['GET', KEY]);
      if (!v) return res.status(204).end();
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(v);
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body);
      const b64 = body && body.b64;
      if (typeof b64 !== 'string' || !b64 || b64.length > MAX_B64) throw new Error('Dữ liệu không hợp lệ hoặc quá lớn');
      // file xlsx là file zip: 2 byte đầu "PK"
      if (Buffer.from(b64.slice(0, 8), 'base64').toString('latin1').slice(0, 2) !== 'PK') throw new Error('Không phải file Excel');
      const time = Date.now();
      const label = String((body && body.label) || '').slice(0, 200);
      await redis(['SET', KEY, JSON.stringify({ label, time, b64 })]);
      return res.status(200).json({ ok: true, time });
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
