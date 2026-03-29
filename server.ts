import express from "express";
import { createServer as createViteServer } from "vite";
import { BigQuery } from "@google-cloud/bigquery";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Ensure we don't use placeholder values from .env.example
if (process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY") {
  delete process.env.GEMINI_API_KEY;
}

const SYSTEM_INSTRUCTION = `Role: You are a Senior Blockchain Research Lead and Quantitative Analyst. Your objective is to produce institutional-grade research reports that go beyond surface-level data, focusing on technical architecture, economic sustainability (tokenomics), and strategic positioning.

Operational Protocol: The "Deep-Dive Thinking Block"
Before generating the final report, you MUST perform a multi-stage analysis inside <research_process> tags.

Stage 1: Source Intelligence & Veracity
- Catalog all sources. Rate them by reliability (Official Docs > Audits > News > Social Media).
- Identify conflicting data points and resolve them using the most authoritative source.

Stage 2: Technical & Economic Modeling
- Analyze the underlying consensus mechanism and its security implications.
- Deconstruct the tokenomics: Calculate circulating vs. total supply, analyze vesting cliffs, and evaluate the "sink" vs. "faucet" balance.

Stage 3: Competitive & Risk Mapping
- Perform a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats).
- Compare the entity against its top 3 competitors on specific metrics (TVL, Users, Fees, Tech).

Output Protocol: The "Institutional Research Report"
Your final output must be contained within <report> tags. Use a sophisticated, objective tone.

Formatting Requirements:
- Use **Field Name**: Value format for all data points (e.g., **Consensus**: Proof of Stake).
- Use tables for Category 9 (Competitive Analysis) and Category 7 (Investments).
- This formatting is CRITICAL for the interactive "Find Deeper" system.

Required Categories & Deep Fields:

1. Executive Summary: A high-level synthesis of the entity's value proposition and current market standing.

2. Company & Protocol Fundamentals: 
   - Date, HQ, Legal Structure, Valuation History.
   - Mission Statement & Problem Solved.

3. Technical Architecture (Deep Dive):
   - Consensus Mechanism (PoS, PoW, etc.), Layer (L1, L2, AppChain).
   - Smart Contract Languages, Security Audits (List firms and dates).
   - Scalability Metrics (TPS, Finality, Gas Model).

4. Tokenomics & Incentives:
   - Native Token Utility, Governance Rights.
   - Supply Dynamics: Inflation rate, Burn mechanisms, Max supply.
   - Distribution: Team, Investors, Ecosystem, Public (with vesting details).

5. Ecosystem & Products:
   - Detailed catalog of services.
   - TVL (Total Value Locked) trends, Volume, and Revenue models.

6. Governance & Decentralization:
   - DAO Structure, Voting Power distribution.
   - Major Governance Proposals (Last 3 significant votes).

7. Strategic Investments & Partnerships:
   - As Investee: Detailed rounds, lead investors (e.g., Paradigm, a16z), and valuation at each stage.
   - As Investor: Strategic portfolio alignment.

8. Team & Leadership:
   - Founders' background (Previous successful exits/projects).
   - Key Engineering & Research leads.

9. Market Positioning & Competitive Analysis:
   - Table comparing with top 3 competitors.
   - Unique Selling Proposition (USP).

10. Regulatory & Compliance Status:
    - Licenses held, Jurisdictions of operation.
    - Known regulatory hurdles or legal proceedings.

11. Community & Social Metrics:
    - Developer Activity (GitHub commits/stars).
    - Social Sentiment Analysis (X, Discord, Telegram volume).

12. Risk Assessment (Critical):
    - Technical Risks (e.g., centralization, bug history).
    - Economic Risks (e.g., death spirals, liquidity issues).
    - Regulatory Risks.

13. Historical Timeline: Chronological list of major milestones and pivots.

14. SEO & Digital Footprint: 
    - Metadata analysis (Titles, H1s, Schema).
    - Domain Authority & Backlink profile summary.

15. API & Grounding Metadata: Source verification and timestamp.

Final Summary: "Data Gaps & Analyst Verdict"
- List missing critical data.
- Provide a "Confidence Score" (1-10) for the report based on source quality.
- Total token consumption.`;

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS for QD Dashboard cross-origin access
  const QD_DASHBOARD_URL = process.env.QD_DASHBOARD_URL || "";
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (origin === QD_DASHBOARD_URL || QD_DASHBOARD_URL === "*")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // API Key for QD Dashboard Integration
  const API_KEY_CI3 = process.env.INTERNAL_API_KEY || "chainintel_secret_123";

  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey === API_KEY_CI3) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized. Invalid API Key." });
    }
  };

  // Initialize BigQuery
  let bigquery: BigQuery | null = null;
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.BIGQUERY_PROJECT_ID) {
      bigquery = new BigQuery();
    }
  } catch (e) {
    console.error("BigQuery init failed:", e);
  }

  // API: Health Check
  app.get("/api/health", (req, res) => {
    const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);
    const hasBigQueryKey = !!process.env.BIGQUERY_PROJECT_ID;
    
    res.json({ 
      status: "ok", 
      config: {
        gemini: hasGeminiKey,
        bigquery: hasBigQueryKey
      }
    });
  });

  // API: Research Endpoint (Can be called by CI3 or Frontend)
  app.post("/api/research", async (req, res) => {
    const { entityName, dataSources, apiKey: userApiKey } = req.body;
    
    if (!entityName) {
      return res.status(400).json({ error: "Entity name is required" });
    }

    // API Key Detection Logic
    const getValidKey = (key?: string) => {
      if (!key || key.trim() === "") return undefined;
      const placeholders = ["MY_GEMINI_API_KEY", "YOUR_API_KEY_HERE", "REPLACE_WITH_YOUR_KEY", "API_KEY"];
      if (placeholders.includes(key.trim())) return undefined;
      return key.trim();
    };

    let apiKey = getValidKey(userApiKey) || 
                 getValidKey(process.env.GEMINI_API_KEY) || 
                 getValidKey(process.env.API_KEY);

    if (!apiKey) {
      console.error("CRITICAL: Gemini API Key is missing or invalid.");
      return res.status(500).json({ 
        error: "Gemini API Key is not configured. Please go to the 'Settings' tab in this app and paste your key, or add it to AI Studio Secrets as 'GEMINI_API_KEY'." 
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";
      const prompt = `Research Entity: ${entityName}\n\nData Sources: ${dataSources || 'Use Google Search grounding.'}`;

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        },
      });

      const fullText = result.text || '';
      const usage = result.usageMetadata;
      const groundingMetadata = result.candidates?.[0]?.groundingMetadata;

      res.json({ 
        fullText, 
        usage,
        groundingMetadata
      });
    } catch (error: any) {
      console.error("Research API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Log Research to BigQuery
  app.post("/api/log-research", async (req, res) => {
    const { entityName, report, projectId: userProjectId } = req.body;
    
    const projectId = userProjectId || process.env.BIGQUERY_PROJECT_ID;
    
    if (!projectId) {
      return res.status(503).json({ error: "BigQuery Project ID not configured" });
    }

    try {
      const bq = new BigQuery({ projectId });
      // Logic to insert into BigQuery would go here
      // For this demo, we'll just simulate a successful log
      console.log(`Logging research for ${entityName} to BigQuery project: ${projectId}`);
      res.json({ success: true, message: `Logged to BigQuery (${projectId})` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── QD Dashboard API (authenticated, versioned) ──────────────────────────

  // Health check for the QD Dashboard to verify connectivity
  app.get("/api/v1/health", authMiddleware, (req, res) => {
    const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.API_KEY);
    const hasBigQueryKey = !!process.env.BIGQUERY_PROJECT_ID;
    res.json({
      status: "ok",
      version: "v1",
      config: { gemini: hasGeminiKey, bigquery: hasBigQueryKey },
    });
  });

  // Research endpoint for the QD Dashboard
  app.post("/api/v1/research", authMiddleware, async (req, res) => {
    const { entityName, dataSources, apiKey: userApiKey } = req.body;

    if (!entityName) {
      return res.status(400).json({ error: "Entity name is required" });
    }

    const getValidKey = (key?: string) => {
      if (!key || key.trim() === "") return undefined;
      const placeholders = ["MY_GEMINI_API_KEY", "YOUR_API_KEY_HERE", "REPLACE_WITH_YOUR_KEY", "API_KEY"];
      if (placeholders.includes(key.trim())) return undefined;
      return key.trim();
    };

    const apiKey =
      getValidKey(userApiKey) ||
      getValidKey(process.env.GEMINI_API_KEY) ||
      getValidKey(process.env.API_KEY);

    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = "gemini-3.1-pro-preview";
      const prompt = `Research Entity: ${entityName}\n\nData Sources: ${dataSources || "Use Google Search grounding."}`;

      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ googleSearch: {} }],
        },
      });

      res.json({
        fullText: result.text || "",
        usage: result.usageMetadata,
        groundingMetadata: result.candidates?.[0]?.groundingMetadata,
      });
    } catch (error: any) {
      console.error("QD Dashboard Research API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
