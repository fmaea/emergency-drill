// emergency-drill-backend/services/aiFeedbackService.js
// Using global fetch available in Node.js 18+

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL_NAME = 'deepseek-chat'; // User specified model

let apiKey;

try {
    apiKey = process.env.deepseek; // User specified environment variable name for DeepSeek
    if (!apiKey) {
        console.error('DeepSeek API key (process.env.deepseek) not found. AI Feedback service will not be available.');
    } else {
        console.log('[AIService] DeepSeek API key loaded. Service is ready.');
    }
} catch (error) {
    console.error('[AIService] Error accessing DeepSeek API key from environment:', error);
    apiKey = null; 
}

// Default generation config (OpenAI style)
const generationConfig = {
    temperature: 0.7,       // Controls randomness. Higher is more creative.
    max_tokens: 250,        // Max length of the generated response.
    // top_p: 0.95,         // Nucleus sampling (alternative to temperature)
    // frequency_penalty: 0, // Penalize new tokens based on their existing frequency in the text so far.
    // presence_penalty: 0,  // Penalize new tokens based on whether they appear in the text so far.
};

// Safety settings are often specific to the provider (e.g. Google Gemini).
// For OpenAI-compatible APIs, they are usually not sent in the request body this way,
// or are handled by the provider's default content moderation.
// We will omit explicit safety settings for DeepSeek unless documentation specifies them.

async function generateTeamFeedback(teamData, caseContext) {
    if (!apiKey) {
        const errorMsg = 'AI Feedback Service is not initialized (DeepSeek API key missing).';
        console.error(`[AIService] generateTeamFeedback: ${errorMsg}`);
        throw new Error(errorMsg);
    }

    const safeCaseContext = {
        title: caseContext?.title || 'Unknown Case',
        description: caseContext?.description || 'No description provided.',
        learningObjectives: Array.isArray(caseContext?.learningObjectives) && caseContext.learningObjectives.length > 0 
                            ? caseContext.learningObjectives.join(', ') 
                            : 'general emergency response skills'
    };

    const safeTeamData = {
        name: teamData?.name || 'Unnamed Team',
        score: teamData?.score === undefined ? 'an unknown number of' : teamData.score,
        studentsCount: teamData?.students?.length || 'an unspecified number of' // Assuming teamData.students is an array
    };

    // Constructing the prompt similar to before
    const prompt = `
You are an insightful and encouraging teaching assistant evaluating a team's performance in an educational emergency drill.

Drill Context:
- Title: "${safeCaseContext.title}"
- Learning Objectives: ${safeCaseContext.learningObjectives}

Team Performance:
- Team Name: "${safeTeamData.name}"
- Number of Members: ${safeTeamData.studentsCount}
- Final Score: ${safeTeamData.score} points

Based on this information, please provide concise (2-4 sentences) and constructive feedback for Team "${safeTeamData.name}". 
Focus on:
1. Acknowledging their effort.
2. Relating their score (qualitatively, e.g., "good", "solid", "room for improvement") to the drill's context.
3. Suggesting one general area they might focus on for future improvement, tied to the learning objectives if possible.
Avoid overly negative or prescriptive language. Be encouraging.
Example: "Team Alpha, good effort in the '${safeCaseContext.title}' drill! A score of ${safeTeamData.score} shows a solid understanding of [relevant objective]. For next time, perhaps focus more on [another objective area] to further enhance your response strategy."
Do not repeat the score or team name in your generated response unless it feels natural within the sentence.
    `;

    const requestBody = {
        model: MODEL_NAME,
        messages: [{ role: 'user', content: prompt }],
        ...generationConfig
    };

    try {
        console.log(`[AIService] Sending request to DeepSeek API for team: ${safeTeamData.name}. Model: ${MODEL_NAME}`);
        // console.log('[AIService] Request body:', JSON.stringify(requestBody, null, 2)); // For debugging prompt

        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ message: response.statusText }));
            console.error(`[AIService] DeepSeek API error response: ${response.status}`, errorBody);
            throw new Error(`DeepSeek API request failed with status ${response.status}: ${errorBody.message || 'Unknown error'}`);
        }

        const result = await response.json();
        // console.log('[AIService] DeepSeek API raw response:', JSON.stringify(result, null, 2)); // For debugging response structure

        if (result.choices && result.choices.length > 0 && result.choices[0].message && result.choices[0].message.content) {
            const feedbackText = result.choices[0].message.content;
            console.log(`[AIService] Feedback generated for team ${safeTeamData.name}:`, feedbackText);
            return feedbackText.trim();
        } else {
            console.error('[AIService] Unexpected response structure from DeepSeek API:', JSON.stringify(result, null, 2));
            throw new Error('AI model returned an empty or malformed response (OpenAI compatibility issue?).');
        }
    } catch (error) {
        console.error(`[AIService] Error calling DeepSeek API for team ${safeTeamData.name}:`, error);
        // More specific error message if it's a fetch/network error vs API error
        if (error instanceof TypeError && error.message.includes('fetch')) { // Node fetch specific error
             throw new Error(`Network error or issue reaching DeepSeek API: ${error.message}`);
        }
        throw new Error(`Failed to generate AI feedback via DeepSeek: ${error.message}`);
    }
}

export { generateTeamFeedback };
