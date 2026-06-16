// netlify/functions/update-news.js
// Funzione schedulata: si esegue ogni ora automaticamente
// Richiede variabili d'ambiente: ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_REPO (es. "tuonome/gs-news")

exports.handler = async function(event, context) {
  console.log("Avvio aggiornamento notizie:", new Date().toISOString());

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO; // formato: "utente/repo"

  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY mancante" }) };
  }
  if (!githubToken || !githubRepo) {
    return { statusCode: 500, body: JSON.stringify({ error: "GITHUB_TOKEN o GITHUB_REPO mancanti" }) };
  }

  const today = new Date().toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric"
  });

  const prompt = `Oggi e ${today}. Cerca le notizie piu importanti italiane e internazionali di oggi.

LINEE GUIDA EDITORIALI OBBLIGATORIE:
- Scrivi in modo IMPARZIALE: nessun giudizio, nessuna opinione, nessun tono di parte
- Usa solo FATTI verificati e fonti autorevoli (ANSA, Reuters, AP, Corriere, Repubblica, TG1, ecc.)
- Titoli DESCRITTIVI e neutri: mai titoli sensazionalistici, clickbait o emotivi
- Sommari CHIARI e PRECISI: chi, cosa, quando, dove, perche senza interpretazioni
- Se una notizia riguarda politica o temi divisivi, presenta i fatti senza favorire nessuno schieramento
- Evita aggettivi valutativi
- In caso di eventi controversi, riporta le posizioni di entrambe le parti in modo equilibrato

Rispondi SOLO con JSON valido (niente markdown, niente backtick), struttura esatta:
{
  "ticker": ["breaking 1","breaking 2","breaking 3","breaking 4","breaking 5"],
  "hero": {
    "emoji": "emoji appropriata",
    "categoria": "politica|economia|esteri|sport|tech|cronaca|cultura",
    "titolo": "titolo neutro e descrittivo (max 12 parole)",
    "sommario": "riassunto factual in 2-3 frasi: chi ha fatto cosa, quando, dove e perche. Nessuna opinione.",
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
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const fullText = data.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    const cleaned = fullText.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Nessun JSON trovato nella risposta di Anthropic");

    const newsData = JSON.parse(jsonMatch[0]);
    newsData.lastUpdate = new Date().toISOString();

    // 2. Scrive il file news.json direttamente su GitHub via API
    const githubApiUrl = `https://api.github.com/repos/${githubRepo}/contents/news.json`;

    // Recupera lo SHA del file esistente (richiesto da GitHub per aggiornare)
    const getResp = await fetch(githubApiUrl, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "gs-news-bot"
      }
    });

    if (!getResp.ok) {
      const errText = await getResp.text();
      throw new Error(`GitHub GET error: ${getResp.status} - ${errText}`);
    }

    const fileInfo = await getResp.json();
    const sha = fileInfo.sha;

    const contentEncoded = Buffer.from(JSON.stringify(newsData, null, 2)).toString("base64");

    const putResp = await fetch(githubApiUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "gs-news-bot"
      },
      body: JSON.stringify({
        message: `Aggiornamento automatico notizie - ${new Date().toISOString()}`,
        content: contentEncoded,
        sha: sha
      })
    });

    if (!putResp.ok) {
      const errText = await putResp.text();
      throw new Error(`GitHub PUT error: ${putResp.status} - ${errText}`);
    }

    console.log("Notizie aggiornate e salvate su GitHub:", newsData.hero && newsData.hero.titolo);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, updated: newsData.lastUpdate, titolo: newsData.hero && newsData.hero.titolo })
    };

  } catch (err) {
    console.error("Errore aggiornamento:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
