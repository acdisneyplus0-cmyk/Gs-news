// netlify/functions/get-news.js
// Endpoint pubblico: restituisce le ultime notizie salvate

const { getStore } = require("@netlify/blobs");

exports.handler = async function(event, context) {
  try {
    const store = getStore("news");
    const raw = await store.get("latest");

    if (!raw) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Notizie non ancora disponibili. Riprova tra qualche minuto." })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300" // cache 5 min
      },
      body: raw
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
