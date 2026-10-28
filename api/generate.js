const DIFFICULTIES = new Set(['Easy', 'Medium', 'Hard', 'Expert']);
const STYLES = new Set([
  'Standard Academic',
  'Casual & Gamified',
  'Professional / Technical Interview',
  'Cryptic & Riddle-like'
]);
const QUESTION_COUNTS = new Set([5, 10, 15, 20]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'The AI service is not configured. Please contact the site owner.' });
  }

  const { model, topic, difficulty, count, style } = req.body || {};
  if (
    typeof model !== 'string'
    || !/^[a-zA-Z0-9._-]+$/.test(model)
    || typeof topic !== 'string'
    || !topic.trim()
    || topic.trim().length > 200
    || !DIFFICULTIES.has(difficulty)
    || !QUESTION_COUNTS.has(Number(count))
    || !STYLES.has(style)
  ) {
    return res.status(400).json({ error: 'Invalid quiz settings. Check the topic and selected quiz options.' });
  }

  const questionCount = Number(count);
  const prompt = `You are an expert educator and quiz builder.
Create a customized, comprehensive quiz about "${topic.trim()}" matching the following settings:
- Difficulty: ${difficulty}
- Total Questions: ${questionCount}
- Tone/Style: ${style}

IMPORTANT REQUIREMENT:
- Generate unique multiple-choice questions.
- Each question must have exactly 4 options.
- Choose clear distractors and exactly one clearly correct answer.
- Provide a detailed and friendly explanation for each question explaining why the correct answer is right and why other options are incorrect.
- Ensure the correctAnswer is one of the choices exactly as spelled.`;

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          questions: {
            type: 'ARRAY',
            description: `List of exactly ${questionCount} quiz questions`,
            items: {
              type: 'OBJECT',
              properties: {
                question: { type: 'STRING' },
                options: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                  description: 'Exactly 4 distinct answers for the question'
                },
                correctAnswer: { type: 'STRING' },
                explanation: { type: 'STRING' }
              },
              required: ['question', 'options', 'correctAnswer', 'explanation']
            }
          }
        },
        required: ['title', 'questions']
      }
    }
  };

  try {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    url.searchParams.set('key', apiKey);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message = data?.error?.message || `Google AI returned HTTP ${response.status}.`;
      if (/api key not valid|api_key_invalid|invalid api key|api key expired/i.test(message)) {
        return res.status(503).json({ error: 'The AI service key is invalid. Please contact the site owner.' });
      }
      return res.status(response.status >= 500 ? 502 : response.status).json({ error: message });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: 'The selected model did not return quiz content. Try another model.' });
    }

    const jsonText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const quiz = JSON.parse(jsonText);
    const validQuestions = Array.isArray(quiz?.questions)
      && quiz.questions.length === questionCount
      && quiz.questions.every(question =>
        typeof question.question === 'string'
        && Array.isArray(question.options)
        && question.options.length === 4
        && question.options.every(option => typeof option === 'string')
        && question.options.includes(question.correctAnswer)
        && typeof question.explanation === 'string'
      );
    if (!validQuestions) {
      return res.status(502).json({ error: 'The selected model returned an invalid quiz. Try another model.' });
    }

    return res.status(200).json({ quiz });
  } catch (error) {
    console.error('Gemini quiz generation failed:', error);
    return res.status(502).json({ error: 'Could not complete quiz generation. Please try again.' });
  }
};
