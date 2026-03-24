import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export const runClusterSimulation = async (req: any, res: any) => {
  const { clusterData, prompt } = req.body;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      system: `You are the Enerlectra Strategic AI. Analyze the provided solar cluster data and the user's hypothetical scenario. 
      Return a STRICT JSON response with the following keys: 
      'recommendation' (string), 'projectedROI' (string), 'riskLevel' (Low/Medium/High), and 'logic' (string array of 3-4 points). 
      Base your math on Zambian solar averages.`,
      messages: [{ 
        role: "user", 
        content: `Cluster Data: ${JSON.stringify(clusterData)}. Scenario: ${prompt}` 
      }],
    });

    // Extracting the text content from Claude's response
    const content = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const result = JSON.parse(content);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Simulation Error:", error);
    res.status(500).json({ error: "Failed to process simulation logic." });
  }
};