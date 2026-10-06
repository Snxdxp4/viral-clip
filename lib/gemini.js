/**
 * Gemini AI integration for analyzing transcript chunks
 * using the 5-Step "Illusion of Novelty" Content Framework.
 * Model: gemini-2.5-flash with extended thinking enabled.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const getAvailableKeys = () => {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GEMINI_API_KEY_') && value) {
      keys.push(value);
    }
  }
  return [...new Set(keys)]; // Unique keys
};

let currentKeyIndex = 0;

async function executeWithKeyRotation(operation) {
  const keys = getAvailableKeys();
  if (keys.length === 0) {
    throw new Error('No GEMINI API key found in environment variables.');
  }

  let attempts = 0;
  while (attempts < keys.length) {
    const key = keys[currentKeyIndex];
    const client = new GoogleGenerativeAI(key);
    
    try {
      return await operation(client);
    } catch (err) {
      if (err.status === 429 || (err.message && (err.message.includes('429') || err.message.includes('Quota exceeded')))) {
        console.warn(`Key ${currentKeyIndex + 1}/${keys.length} hit rate limit. Switching to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        attempts++;
      } else {
        throw err;
      }
    }
  }
  
  throw new Error('All available Gemini API keys have exceeded their rate limits. Please wait or add more keys.');
}

/**
 * Analyzes transcript chunks and returns viral clip candidates.
 *
 * @param {Array} chunks - Array of { start, end, text } objects
 * @param {string} videoTitle - YouTube video title for context
 * @param {string} modelId - Gemini model ID to use
 * @param {number} thinkingBudget - Token budget for extended thinking (0 = disabled)
 * @returns {Array} - Array of clip candidates with scores and analysis
 */
export async function analyzeForViralClips(chunks, videoTitle, modelId = 'gemini-3.8-flash', thinkingBudget = 8000) {

  // Build a transcript reference with timestamps for the AI
  const transcriptBlock = chunks
    .map((c, i) => `[CHUNK ${i + 1}] [${formatTime(c.start)} → ${formatTime(c.end)}]\n${c.text}`)
    .join('\n\n');

  const prompt = `You are an expert short-form content editor. Analyze this YouTube video transcript and identify the top viral clip candidates using the 5-Step "Illusion of Novelty" Content Framework.

VIDEO TITLE: "${videoTitle}"

TRANSCRIPT WITH TIMESTAMPS:
${transcriptBlock}

---

## YOUR TASK

Identify the TOP 3–6 most viral-worthy clips from this transcript. Each clip should be 30–90 seconds long when possible (sometimes up to 2 minutes if the content demands it).

For each clip, apply the full 5-step framework:

### STEP 1 — NEW REVEAL + OUTCOME
Identify if the moment contains: a surprising angle, something viewers may not know, a challenge to an assumption, an unexpected consequence, a useful explanation, or a significant detail. Explain the actual "new information."

### STEP 2 — CONTRAST FRAMING
Identify any genuine contrast: question vs. answer, claim vs. response, expectation vs. reality, problem vs. solution, common belief vs. explanation, before vs. after.

### STEP 3 — URGENCY / RECENCY
Note only if genuinely supported by the content (recent events, time-sensitive info). Do NOT manufacture urgency.

### STEP 4 — BULLSEYE PROOF
Identify the strongest evidence: specific example, direct explanation, demonstration, anecdote, statistic, Q&A exchange, or concrete real-world example.

### STEP 5 — PROTECT THE ILLUSION
Suggest a natural-sounding hook/title that doesn't reveal the framework.

### ENGAGEMENT SCORE (out of 100)
Score each clip using these 7 factors:
- Hook potential — /20
- Curiosity/novelty — /20
- Narrative strength — /15
- Clarity/context — /15
- Emotional/intellectual interest — /10
- Strong ending/payoff — /10
- Editing potential — /10

---

## OUTPUT FORMAT

Return ONLY valid JSON. No markdown, no explanation outside the JSON.

{
  "clips": [
    {
      "clipNumber": 1,
      "startTime": 0.0,
      "endTime": 0.0,
      "startTimeFormatted": "00:00",
      "endTimeFormatted": "00:00",
      "suggestedTitle": "...",
      "suggestedHook": "...",
      "framework": {
        "step1_newReveal": "...",
        "step2_contrast": "...",
        "step3_urgency": "...",
        "step4_proof": "...",
        "step5_hookStyle": "..."
      },
      "scoreBreakdown": {
        "hookPotential": 0,
        "curiosityNovelty": 0,
        "narrativeStrength": 0,
        "clarityContext": 0,
        "emotionalIntellectual": 0,
        "strongEndingPayoff": 0,
        "editingPotential": 0,
        "total": 0
      },
      "scoreExplanation": "...",
      "transcriptPreview": "..."
    }
  ]
}`;

  try {
    return await executeWithKeyRotation(async (client) => {
      const model = client.getGenerativeModel({
        model: modelId,
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          ...(thinkingBudget > 0 && {
            thinkingConfig: { thinkingBudget },
          }),
        },
      });
      const responseText = result.response.text();

      // Strip markdown code blocks if present
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      // Sort by total score descending
      parsed.clips.sort((a, b) => b.scoreBreakdown.total - a.scoreBreakdown.total);

      return parsed.clips;
    });
  } catch (err) {
    throw new Error(`Gemini analysis failed: ${err.message}`);
  }
}

/**
 * Formats seconds into "MM:SS" string.
 */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
