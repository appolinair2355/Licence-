require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 10000;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

app.use(cors());
app.use(express.json());
app.use(express.static('public', { maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0', etag: true }));

const LICENSE_FILE = path.resolve(process.env.LICENSES_PATH || './licenses.json');
const CATEGORIES = (process.env.CATEGORIES || '10,25,60,120').split(',').map(d => ({ name: `${d}min`, duration: parseInt(d, 10) }));

const loadLicenses = () => fs.existsSync(LICENSE_FILE) ? JSON.parse(fs.readFileSync(LICENSE_FILE)) : [];
const saveLicenses = (data) => fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));

const generateKey = () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const letters = 'abcdefghijklmnopqrstuvwxyzàâäéèêëîïôöùûüç';
  const randLetters = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const randDigits = Math.floor(1000 + Math.random() * 9000);
  return `${hh}${randLetters}${dd}${mm}${yyyy}${randDigits}`;
};

const createLicense = (category, duration) => {
  const now = Date.now();
  return {
    key: generateKey(),
    category,
    duration,
    createdAt: now,
    expiresAt: now + duration * 60 * 1000,
    used: false,
  };
};

const maintainLicenses = () => {
  const licenses = loadLicenses();
  const now = Date.now();
  const valid = licenses.filter(l => l.expiresAt > now);
  const byCategory = {};

  CATEGORIES.forEach(cat => {
    byCategory[cat.name] = valid.filter(l => l.category === cat.name);
    while (byCategory[cat.name].length < (process.env.LICENCES_PER_CAT || 5))
      byCategory[cat.name].push(createLicense(cat.name, cat.duration));
  });

  saveLicenses(Object.values(byCategory).flat());
};

app.post('/api/verify', (req, res) => {
  const { key } = req.body;
  const licenses = loadLicenses();
  const lic = licenses.find(l => l.key === key);
  if (!lic) return res.json({ valid: false, message: 'Licence invalide.' });
  if (lic.used) return res.json({ valid: false, message: 'Licence déjà utilisée.' });
  if (Date.now() > lic.expiresAt) return res.json({ valid: false, message: 'Licence expirée.' });
  lic.used = true;
  saveLicenses(licenses);
  res.json({ valid: true, remainingMs: lic.expiresAt - Date.now() });
});

app.get('/api/remaining/:key', (req, res) => {
  const licenses = loadLicenses();
  const lic = licenses.find(l => l.key === req.params.key && l.used);
  if (!lic) return res.json({ valid: false });
  const left = Math.max(0, lic.expiresAt - Date.now());
  res.json({ valid: left > 0, remainingMs: left });
});

app.post('/api/admin/licenses', (req, res) => {
  if (req.body.password !== (process.env.ADMIN_PWD || 'kouame2025'))
    return res.status(403).json({ error: 'Accès refusé.' });
  maintainLicenses();
  const now = Date.now();
  const licenses = loadLicenses();
  const result = {};
  CATEGORIES.forEach(cat => {
    result[cat.name] = licenses
      .filter(l => l.category === cat.name)
      .map(l => {
        const left = l.used ? Math.max(0, l.expiresAt - now) : l.duration * 60 * 1000;
        const h = String(Math.floor(left / 3600000)).padStart(2, '0');
        const m = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0');
        const s = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
        let status = 'valide';
        if (l.used) status = 'utilisée';
        else if (Date.now() > l.expiresAt) status = 'expirée';
        const remainingText = l.used ? `${h}:${m}:${s}` : `${String(l.duration).padStart(2, '0')}:00:00 ✅`;
        return { key: l.key, duration: l.duration, remaining: remainingText, status };
      });
  });
  res.json(result);
});

/* ===== IA OPENAI – STREAMING (comme chat.html) ===== */
app.post('/api/ai', async (req, res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(501).json({ error: 'Clé API absente.' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt manquant.' });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 800,
      temperature: 0.7
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) res.write(delta);
    }
    res.end();

  } catch (err) {
    console.error('OpenAI error :', err.message);
    res.status(500).json({ error: 'Erreur OpenAI.' });
  }
});

maintainLicenses();
setInterval(maintainLicenses, 30_000);

app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));
        
