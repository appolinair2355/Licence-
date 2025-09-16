// server.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 10000;

// --- Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// --- OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Fichiers & constantes
const LICENSE_FILE = path.join(__dirname, "licenses.json");
const CATEGORIES = ["histoire", "poeme", "lecon", "proverbe", "bible"];

if (!fs.existsSync(LICENSE_FILE)) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({}, null, 2));
}

// --- Génération de licence
function generateLicense(category) {
  const now = new Date();
  const heure = String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0");
  const lettres = Array.from({ length: 5 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ".charAt(Math.floor(Math.random() * 26))
  ).join("");
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return `${heure}${lettres}${date}-${category}`;
}

// Charger licences
function loadLicenses() {
  return JSON.parse(fs.readFileSync(LICENSE_FILE, "utf-8"));
}
function saveLicenses(data) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2));
}

// --- Générer au moins 5 licences par catégorie
function ensureLicenses() {
  const data = loadLicenses();
  CATEGORIES.forEach((cat) => {
    if (!data[cat]) data[cat] = [];
    while (data[cat].length < 5) {
      data[cat].push(generateLicense(cat));
    }
  });
  saveLicenses(data);
}
ensureLicenses();

// --- Endpoint pour obtenir une licence
app.get("/api/license/:category", (req, res) => {
  const { category } = req.params;
  const data = loadLicenses();
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Catégorie invalide" });
  }
  if (!data[category] || data[category].length === 0) {
    return res.status(404).json({ error: "Pas de licence dispo" });
  }

  const license = data[category].shift(); // Retire une licence dispo
  saveLicenses(data);
  // Licence valide 15 minutes
  const expires = Date.now() + 15 * 60 * 1000;
  res.json({ license, expires });
});

// --- Endpoint IA
app.post("/api/ai", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt requis" });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es une IA qui génère histoires, poèmes, leçons, proverbes et versets bibliques." },
        { role: "user", content: prompt },
      ],
    });

    const output = completion.choices[0].message.content;
    res.json({ result: output });
  } catch (err) {
    console.error("Erreur OpenAI:", err);
    res.json({ error: "Erreur OpenAI." });
  }
});

// --- Serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur le port ${PORT}`);
});
