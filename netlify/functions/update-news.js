// netlify/functions/update-news.js
// Funzione schedulata: si esegue ogni ora automaticamente
// Richiede variabile d'ambiente: ANTHROPIC_API_KEY

const { getStore } = require("@netlify/blobs");

exports.handler = async function(event, context) {
  console.log("🔄 Avvio aggiornamento notizie:", new Date().toISOString());

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY non configurata");
    return { statusCode: 500, body: "API key mancante" };
  }

  const today = new Date().toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric"
  });

  const prompt = `Oggi è ${today}. Cerca le notizie più importanti italiane e internazionali di oggi.

LINEE GUIDA EDITORIALI OBBLIGATORIE:
- Scrivi in modo IMPARZIALE: nessun giudizio, nessuna opinione, nessun tono di parte
- Usa solo FATTI verificati e fonti autorevoli (ANSA, Reuters, AP, Corriere, Repubblica, TG1, ecc.)
- Titoli DESCRITTIVI e neutri: mai titoli sensazionalistici, clickbait o emotivi
- Sommari CHIARI e PRECISI: chi, cosa, quando, dove, perché — senza interpretazioni
- Se una notizia riguarda politica o temi divisivi, presenta i fatti senza favorire nessuno schieramento
- Evita aggettivi valutativi (es. "devastante", "incredibile", "scandaloso")
- In caso di eventi controversi, riporta le posizioni di entrambe le parti in modo equilibrato
- Preferisci notizie con impatto reale sulla vita delle persone

Rispondi SOLO con JSON valido (niente markdown, niente backtick), struttura esatta:
{
  "ticker": ["breaking 1","breaking 2","breaking 3","breaking 4","breaking 5"],
  "hero": {
    "emoji": "emoji appropriata",
    "categoria": "politica|economia|esteri|sport|tech|cronaca|cultura",
    "titolo": "titolo neutro e descrittivo (max 12 parole)",
    "sommario": "riassunto factual in 2-3 frasi: chi ha fatto cosa, quando, dove e perché. Nessuna opinione.",
    "ora": "fa X ore"
  },
  "evidenza": [
    {"emoji":"emoji","categoria":"categoria","titolo":"titolo neutro","ora":"tempo"},
    {"emoji":"emoji","categoria":"categoria","titolo":"titolo neutro","ora":"tempo"},
    {"emoji":"emoji","categoria":"categoria","titolo":"titolo neutro","ora":"tempo"}
  ],
  "economia": [
    {"emoji":"emoji","titolo":"notizia economica reale e neutrale","ora":"tempo"},
    {"emoji":"emoji","titolo":"notizia economica reale e neutrale","ora":"tempo"},
    {"emoji":"emoji","titolo":"notizia economica reale e neutrale","ora":"tempo"}
  ],
  "sport_tech": [
    {"emoji":"emoji","titolo":"notizia sport o tech reale e neutrale","ora":"tempo"},
    {"emoji":"emoji","titolo":"notizia sport o tech reale e neutrale","ora":"tempo"},
    {"emoji":"emoji","titolo":"notizia sport o tech reale e neutrale","ora":"tempo"}
  ]
}
Usa notizie REALI di oggi. Categorie variate. Solo JSON, nient'altro.`;

  try {
    // 1. Chiama Anthropic con web search
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const fullText = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    const cleaned = fullText.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Nessun JSON trovato nella risposta");

    const newsData = JSON.parse(jsonMatch[0]);
    newsData.lastUpdate = new Date().toISOString();

    // 2. Salva su Netlify Blobs (storage persistente)
    const store = getStore("news");
    await store.set("latest", JSON.stringify(newsData));

    console.log("✅ Notizie aggiornate con successo:", newsData.hero?.titolo);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, updated: newsData.lastUpdate })
    };

  } catch (err) {
    console.error("❌ Errore aggiornamento:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
