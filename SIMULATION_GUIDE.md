# 🧠 Enerlectra Simulation Engine (v2.4)

## Overview
The Simulation Engine leverages **Anthropic's Claude 3.5 Sonnet** to provide predictive analytics for decentralized energy grids. Unlike static charts, the engine combines real-time Supabase telemetry with LLM-based economic reasoning.

## How it Works
1. **Context Injection**: The `SimulationForm` sends the entire `clusterData` object (location, generation, capacity, participants) to the backend.
2. **The Prompt**: The user provides a "What if?" scenario.
3. **Neural Processing**: The backend instructs Claude to act as an Energy Economist, calculating impacts on ROI, grid stability, and tokenized yields.
4. **Structured Output**: Results are returned as JSON and rendered in the `SimulationResultView`.

## Key Capabilities
- **Weather Impact**: Predict yield drops based on seasonal cloud cover.
- **Economic Stress**: Simulate currency fluctuations (USD/ZMW) on hardware import costs.
- **Scaling Logic**: Model the impact of adding 50 new households to a specific node.

3. Sample "Economic Stress Test" Prompt
Use this exact prompt to demo the system's depth to your team. It forces the AI to look at both the technical and financial data of the cluster.

Copy/Paste this into the Terminal:

"Conduct a 24-month economic stress test. Assume a scenario where the Zambian Kwacha (ZMW) depreciates by 22% against the USD, increasing maintenance costs for imported solar inverters, while local energy demand in this cluster spikes by 15% due to new small-scale milling activity. Calculate the impact on our current P2P token yield and suggest an optimized tariff adjustment to maintain a 4% ROI."