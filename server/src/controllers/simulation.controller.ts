import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

const anthropic = apiKey
  ? new Anthropic({ apiKey })
  : null;

/**
 * ENERLECTRA AI SIMULATION ENGINE
 * Uses Claude 3.5 Sonnet to predict ROI and Risks for Zambian Solar Clusters.
 */
export const runClusterSimulation = async (req: any, res: any) => {
  const { clusterData, prompt } = req.body;

  try {
    if (!clusterData) {
      return res.status(400).json({ error: 'Missing clusterData for simulation.' });
    }

    // If Claude is not configured, return a deterministic fallback for demo
    if (!anthropic) {
      const targetKw = Number(clusterData?.target_kw ?? 0);
      const monthlyKwh = Number(clusterData?.monthly_kwh ?? 0);
      const name = clusterData?.name || 'this cluster';
      const location = clusterData?.location || 'Zambia';

      return res.status(200).json({
        recommendation: `Proceed with the ${targetKw || 150} kW pilot for ${name} in ${location}, with close monitoring during the first rainy season.`,
        projectedROI:
          'Estimated 18–24 month payback period based on current diesel and ZESCO spend, assuming stable tariffs and FX.',
        riskLevel: 'Medium',
        logic: [
          `The cluster is fully funded and located in a diesel- and grid-dependent context, where each kWh of solar yield has strong cost displacement potential.`,
          `A ${targetKw || 150} kW system with roughly ${monthlyKwh || 20000} kWh per month offsets a meaningful share of baseline energy expenditure.`,
          'Key risks are weather-driven yield variability, FX volatility on imported equipment, and potential changes in local tariff structures.',
          'Mitigation strategies include performance guarantees, minimum savings floors, and a rolling 12-month review of yield against model assumptions.',
        ],
      });
    }

    const summary = `
Cluster Summary:
- Name: ${clusterData.name}
- Location: ${clusterData.location}
- Target kW: ${clusterData.target_kw}
- Monthly kWh: ${clusterData.monthly_kwh}
- Target USD: ${clusterData.target_usd}
User Scenario: ${prompt}

Full Cluster JSON:
${JSON.stringify(clusterData)}
    `.trim();

    const msg = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system:
        "You are the Enerlectra Strategic AI. Analyze the provided solar cluster data and the user's hypothetical scenario. " +
        "Return a STRICT JSON response with the following keys: " +
        "'recommendation' (string), 'projectedROI' (string), 'riskLevel' (Low/Medium/High), and 'logic' (string array of 3-4 points). " +
        'Base your math on Zambian solar averages (approx 2,000+ sunshine hours/year). No conversational text, only the JSON block.',
      messages: [
        {
          role: 'user',
          content: summary,
        },
      ],
    });

    const first = msg.content[0];
    const content = first.type === 'text' ? first.text : '';
    const cleanJson = content.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleanJson);

    console.log(`🤖 [AI] Simulation processed for: ${clusterData.name || 'Unknown Cluster'}`);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Simulation Error:', error);
    return res.status(500).json({
      error: 'Failed to process simulation logic.',
      details: error.message,
    });
  }
};