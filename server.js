const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const LICENSE_FILE = path.join(__dirname, 'licenses.json');
const CATEGORIES = [
  { name: '10min', duration: 10 },
  { name: '25min', duration: 25 },
  { name: '60min', duration: 60 },
  { name: '120min', duration: 120 },
];

function loadLicenses() {
  if (!fs.existsSync(LICENSE_FILE)) return [];
  return JSON.parse(fs.readFileSync(LICENSE_FILE));
}

function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
}

function generateKey() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const letters = 'abcdefghijklmnopqrstuvwxyzàâäéèêëîïôöùûüç';
  const randLetters = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  const randDigits = Math.floor(1000 + Math.random() * 9000);
  return `${hh}${randLetters}${dd}${mm}${yyyy}${randDigits}`;
}

function createLicense(category, duration) {
  const now = Date.now();
  return {
    key: generateKey(),
    category,
    duration,
    createdAt: now,
    expiresAt: now + duration * 60 * 1000,
    used: false,
  };
}

function maintainLicenses() {
  const licenses = loadLicenses();
  const now = Date.now();

  const valid = licenses.filter(l => l.expiresAt > now);
  const byCategory = {};

  CATEGORIES.forEach(cat => {
    byCategory[cat.name] = valid.filter(l => l.category === cat.name);
    while (byCategory[cat.name].length < 5) {
      const newLicense = createLicense(cat.name, cat.duration);
      byCategory[cat.name].push(newLicense);
    }
  });

  const all = Object.values(byCategory).flat();
  saveLicenses(all);
}

// Routes
app.post('/api/verify', (req, res) => {
  const { key } = req.body;
  const licenses = loadLicenses();
  const license = licenses.find(l => l.key === key);

  if (!license) return res.json({ valid: false, message: 'Licence invalide.' });
  if (license.used) return res.json({ valid: false, message: 'Licence déjà utilisée.' });
  if (Date.now() > license.expiresAt) return res.json({ valid: false, message: 'Licence expirée.' });

  license.used = true;
  saveLicenses(licenses);

  const remaining = license.expiresAt - Date.now();
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  res.json({
    valid: true,
    message: `Licence valide. Temps restant : ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  });
});

app.post('/api/admin/licenses', (req, res) => {
  const { password } = req.body;
  if (password !== 'kouame2025') return res.status(403).json({ error: 'Accès refusé.' });

  maintainLicenses();
  const licenses = loadLicenses();
  const now = Date.now();

  const result = {};

  CATEGORIES.forEach(cat => {
    result[cat.name] = licenses
      .filter(l => l.category === cat.name)
      .map(l => {
        const remaining = Math.max(0, l.expiresAt - now);
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        let status = 'valide';
        if (l.used) status = 'utilisée';
        else if (remaining <= 0) status = 'expirée';
        return {
          key: l.key,
          duration: l.duration,
          remaining: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
          status,
        };
      });
  });

  res.json(result);
});

// Démarrage
maintainLicenses();
setInterval(maintainLicenses, 30000); // toutes les 30s
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
                               
