import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

/**
 * ENERLECTRA AI SIMULATION ENGINE
 * Uses Claude 3.5 Sonnet to predict ROI and Risks for Zambian Solar Clusters.
 */
export const runClusterSimulation = async (req: any, res: any) => {
  const { clusterData, prompt } = req.body;

  try {
    if (!clusterData) {
      return res.status(400).json({ error: "Missing clusterData for simulation." });
    }

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: `You are the Enerlectra Strategic AI. Analyze the provided solar cluster data and the user's hypothetical scenario. 
      Return a STRICT JSON response with the following keys: 
      'recommendation' (string), 'projectedROI' (string), 'riskLevel' (Low/Medium/High), and 'logic' (string array of 3-4 points). 
      Base your math on Zambian solar averages (approx 2,000+ sunshine hours/year). No conversational text, only the JSON block.`,
      messages: [{ 
        role: "user", 
        content: `Cluster Data: ${JSON.stringify(clusterData)}. Scenario: ${prompt}` 
      }],
    });

    // Extract content safely from the Anthropic response structure
    const content = msg.content[0].type === 'text' ? msg.content[0].text : '';
    
    // Safety: Strip Markdown code blocks if Claude adds them
    const cleanJson = content.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanJson);
    
    console.log(`🤖 [AI] Simulation processed for: ${clusterData.name || 'Unknown Cluster'}`);
    res.status(200).json(result);

  } catch (error: any) {
    console.error("Simulation Error:", error);
    res.status(500).json({ 
      error: "Failed to process simulation logic.",
      details: error.message 
    });
  }
};