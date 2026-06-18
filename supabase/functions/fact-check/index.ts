// Edge function: fact-check
// Receives { pdf_base64 } and returns { claims: [{ claim, status, explanation, correct_fact, source }] }
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdf_base64 } = await req.json();
    if (!pdf_base64 || typeof pdf_base64 !== "string") {
      return new Response(JSON.stringify({ error: "Missing pdf_base64" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip data URL prefix if present
    const base64 = pdf_base64.includes(",") ? pdf_base64.split(",")[1] : pdf_base64;

    const systemPrompt = `You are TruthLayer, an expert fact-checker. You will be given a PDF document.
Extract the most important factual claims (up to 12), then verify each one using your knowledge of real-world facts and reputable sources.
For each claim, return:
- claim: the exact factual statement from the document
- status: one of "Verified" (true and well-supported), "Inaccurate" (partially wrong or misleading), or "False" (clearly incorrect)
- explanation: a 1-2 sentence reason for the verdict
- correct_fact: the accurate fact (for Verified, restate the supporting fact)
- source: a real, reputable source URL (Wikipedia, gov sites, major news, scientific orgs)

Return ONLY valid JSON in this exact shape, no markdown, no prose:
{"claims":[{"claim":"...","status":"Verified|Inaccurate|False","explanation":"...","correct_fact":"...","source":"https://..."}]}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Fact-check this document. Return only the JSON object." },
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${base64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content ?? "{}";

    let parsed: { claims?: unknown[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // try to extract JSON
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const claims = Array.isArray(parsed.claims) ? parsed.claims : [];

    return new Response(JSON.stringify({ claims }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fact-check error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
