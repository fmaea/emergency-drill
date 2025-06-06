// emergency-drill-backend/routes/feedbackRoutes.js
import express from 'express';
import { generateTeamFeedback } from '../services/aiFeedbackService.js';
import { protect } from '../middleware/authMiddleware.js'; // Assuming teachers need to be logged in

const router = express.Router();

/**
 * @route   POST /api/feedback/generate-team-comment
 * @desc    Generate AI feedback for a specific team's performance
 * @access  Private (e.g., Teacher)
 */
router.post('/generate-team-comment', protect, async (req, res) => {
    const { teamData, caseContext } = req.body;

    if (!teamData || !caseContext) {
        return res.status(400).json({ message: 'Missing teamData or caseContext in request body.' });
    }
    
    // Basic validation for required sub-fields (can be more extensive)
    if (!teamData.name || teamData.score === undefined) {
        return res.status(400).json({ message: 'teamData must include name and score.' });
    }
    if (!caseContext.title) { // Assuming title is a minimum requirement for case context
        return res.status(400).json({ message: 'caseContext must include a title.' });
    }

    try {
        console.log(`[FeedbackRoutes] Received request for AI feedback for team: ${teamData.name}, case: ${caseContext.title}`);
        const feedback = await generateTeamFeedback(teamData, caseContext);
        res.json({ feedback });
    } catch (error) {
        console.error('[FeedbackRoutes] Error generating AI feedback for team:', teamData ? teamData.name : 'Unknown Team', error.message);
        
        // Check for specific error messages that indicate an issue with the AI service itself or its connection
        if (error.message && (
            error.message.includes('AI Feedback Service is not initialized') || 
            error.message.includes('Failed to generate AI feedback') || // Generic from service
            error.message.includes('DeepSeek API') || // Specific to DeepSeek calls
            error.message.includes('AI model returned an empty or malformed response')
           )) {
            // Provide a slightly more user-friendly message but include details for debugging
            res.status(503).json({ message: `AI Service Error: Could not generate feedback. Details: ${error.message}` }); // 503 Service Unavailable
        } else {
            res.status(500).json({ message: 'An internal server error occurred while processing your request for AI feedback.' });
        }
    }
});

export default router;
