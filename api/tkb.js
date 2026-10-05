// Vercel serverless function: lấy file TKB từ website trường (Google Sheets đã xuất bản)
// /api/tkb            -> tuần mới nhất
// /api/tkb?url=<link> -> link bài của trường hoặc link Google Sheets
const BASE = 'http://thptchauphong.agg.edu.vn';
const toXlsx = u => u.replace(/\/pubhtml.*$/, '/pub?output=xlsx').replace(/\/pub\?(?!output=xlsx).*$/, '/pub?output=xlsx');

module.exports = async (req, res) => {
  try {
    let target = req.query && req.query.url ? String(req.query.url).trim() : '';
    let host = '';
    if (target) {
      try { host = new URL(target).hostname; } catch (e) { throw new Error('Link không hợp lệ'); }
      if (host !== 'thptchauphong.agg.edu.vn' && host !== 'docs.google.com') {
        throw new Error('Chỉ hỗ trợ link của trường hoặc Google Sheets');
      }
    }

    let sheetUrl = '', source = '';
    if (host === 'docs.google.com') {
      sheetUrl = target; source = target;
    } else {
      let postUrl = target;
      if (!postUrl) {
        const list = await (await fetch(BASE + '/thoi-khoa-bieu')).text();
        const re = /href="(?:https?:\/\/thptchauphong\.agg\.edu\.vn)?(\/thoi-khoa-bieu\/[^"#?]+-(\d+))"/gi;
        let best = null, m;
        while ((m = re.exec(list))) {
          const id = Number(m[2]);
          if (!best || id > best.id) best = { id, path: m[1] };
        }
        if (!best) throw new Error('Không tìm thấy bài thời khóa biểu');
        postUrl = BASE + best.path;
      }
      const post = await (await fetch(postUrl)).text();
      const all = [...new Set(post.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[^"'\s<>)\]]+/g) || [])];
if (!all.length) throw new Error('Bài không có link Google Sheets');
// Ưu tiên link nằm sau chữ "TKB lớp"; không có thì lấy link cuối cùng
const idx = post.search(/TKB\s*l[ớo]p/i);
const pick = (idx >= 0 && all.find(u => post.indexOf(u, idx) !== -1)) || all[all.length - 1];
sheetUrl = pick; source = postUrl;
    }
    const r = await fetch(toXlsx(sheetUrl));
    if (!r.ok) throw new Error('Google trả về ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.setHeader('X-Source', encodeURI(source));
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
};
