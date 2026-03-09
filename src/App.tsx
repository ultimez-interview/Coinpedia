import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { 
  Search, 
  FileText, 
  Database, 
  Loader2, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink,
  Info,
  Layers,
  BarChart3,
  Users,
  Briefcase,
  ShieldCheck,
  Globe,
  Mail,
  Twitter,
  Linkedin,
  Github,
  MoreHorizontal,
  Zap
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SYSTEM_INSTRUCTION = `Role: You are a highly analytical Research Lead specializing in the global blockchain and cryptocurrency ecosystem. Your objective is to transform raw data sources into a structured, high-fidelity research report for specific crypto entities.

Operational Protocol: The "Thinking Block"
Before generating the final report, you MUST perform a deep-dive analysis inside <research_process> tags. This section is for your internal logic and data extraction.

Step 1: Source Mapping
Catalog every provided source and its primary data value.
If Google Search grounding is enabled, identify which external search queries were most fruitful.

Step 2: Entity Classification
Categorize the entity (e.g., Layer 1, DEX, CEX, Infrastructure, Wallet).

Step 3: Systematic Extraction
Iterate through all 15 categories.
Quote verbatim evidence for every field found.
Explicitly mark "Data not available" or "Not applicable" for every single field to ensure no category is skipped.

Step 4: Verification
Cross-reference facts.
Identify gaps and suggest specific search queries to fill them.

Output Protocol: The "Final Report"
Your final output must be contained within <report> tags and follow the markdown structure below.

Report Requirements:
- Tone: Professional, objective, and data-driven.
- Formatting: Use tables for Category 3 (SEO) and Category 7 (Investments) for better readability.
- Field Formatting: Use **Field Name**: Value format for all data points. This is CRITICAL for the interactive "Find Deeper" system.
- Attribution: Use inline citations (Source 1, Source 2).
- No Hallucinations: If the data is not in the {{DATA_SOURCES}} or returned via grounding, you MUST state "Data not available."

Required Categories & Fields:
1. Company Fundamentals: Date, HQ, Business Type, Valuation, Size, Descriptions.
2. Contact & Digital: Email, Phone, Web, Wallet Addresses.
3. SEO & Metadata: Titles, Descriptions, H1s, Schema (JSON-LD), OG Tags, Twitter Cards.
4. Social Media: Full links for LinkedIn, X, FB, TG, Medium, Reddit, YouTube, RSS.
5. Products: Catalog of all owned services/products.
6. Crypto Specifics: Supported coins, underlying chain, native tokens.
7. Investments: 
   - As Investee: Round, Date, Amount, Lead Investors.
   - As Investor: Portfolio companies, Dates, Amounts.
8. Team: Key members, Titles, Roles, Experience.
9. Jobs/HR: Openings, Salary ranges, Skills, Locations.
10. Financials: Revenue by year/quarter, Categories.
11. Trading Data: (Exchanges only) Volume (24h/30d), Pairs, Market Share.
12. Compliance: Licenses, Jurisdictions, Regulatory status.
13. User Metrics: Active users, Fee structures.
14. Community: Follower counts, FAQ sets.
15. API & Grounding Metadata: Verification of sources used, timestamp of last update, and grounding attributions.

Final Summary: Conclude with a "Data Gaps Summary" listing exactly what information was missing and total token consumption if available.`;

const FieldWrapper = ({ children, onDeepen }: { children: React.ReactNode, onDeepen: (field: string) => void }) => {
  const [showMenu, setShowMenu] = useState(false);
  
  const extractText = (node: any): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node?.props?.children) return extractText(node.props.children);
    return '';
  };

  const text = extractText(children);
  const fieldNameMatch = text.match(/^([^:]+):/);
  const fieldName = fieldNameMatch ? fieldNameMatch[1].replace(/\*/g, '').trim() : text.slice(0, 30).trim();

  return (
    <div className="group relative mb-1">
      <div className="flex items-start gap-2">
        <button 
          onClick={() => setShowMenu(!showMenu)}
          className="mt-1.5 shrink-0 w-5 h-5 flex items-center justify-center border border-transparent hover:border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-all rounded-sm text-[10px] font-bold"
          title="Field Options"
        >
          ...
        </button>
        <div className="flex-1">{children}</div>
      </div>
      {showMenu && (
        <div className="absolute left-6 top-0 z-30 bg-white border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] p-1 min-w-[140px] animate-in fade-in slide-in-from-left-2 duration-200">
          <button 
            onClick={() => {
              onDeepen(fieldName);
              setShowMenu(false);
            }}
            className="w-full text-left text-[9px] font-mono uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] p-2 flex items-center gap-2 transition-colors"
          >
            <Zap className="w-3 h-3" />
            Find Deeper
          </button>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [entityName, setEntityName] = useState('');
  const [dataSources, setDataSources] = useState('');
  const [report, setReport] = useState('');
  const [researchProcess, setResearchProcess] = useState('');
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [error, setError] = useState('');
  const [groundingUrls, setGroundingUrls] = useState<{ uri: string; title: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'report' | 'process' | 'settings'>('report');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [configStatus, setConfigStatus] = useState<{ gemini: boolean, bigquery: boolean }>({ gemini: true, bigquery: false });
  
  // Local settings state
  const [settings, setSettings] = useState({
    geminiApiKey: localStorage.getItem('gemini_api_key') || '',
    bqProjectId: localStorage.getItem('bq_project_id') || ''
  });

  const [deepDiveResult, setDeepDiveResult] = useState<{ field: string, content: string } | null>(null);

  React.useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        if (data.config) setConfigStatus(data.config);
      } catch (e) {
        console.error("Health check failed", e);
      }
    };
    checkHealth();
  }, []);

  const updateSettings = (key: 'geminiApiKey' | 'bqProjectId', value: string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem(key === 'geminiApiKey' ? 'gemini_api_key' : 'bq_project_id', value);
  };

  const handleDeepen = async (field: string) => {
    setDeepLoading(true);
    setDeepDiveResult(null);
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          entityName: `${entityName} - Deep Dive on ${field}`, 
          dataSources: `Focus exclusively on providing an exhaustive, granular analysis of the following field for ${entityName}: ${field}. Use all available grounding tools to find specific data points, historical context, and technical details that were not in the initial summary.`,
          apiKey: settings.geminiApiKey || undefined
        }),
      });

      if (!response.ok) throw new Error('Deep research failed');
      const data = await response.json();
      
      const fullText = data.fullText || '';
      const reportMatch = fullText.match(/<report>([\s\S]*?)<\/report>/);
      const content = reportMatch ? reportMatch[1].trim() : fullText.replace(/<research_process>[\s\S]*?<\/research_process>/, '').trim();
      
      setDeepDiveResult({ field, content });
    } catch (err: any) {
      setError(`Deep Dive failed: ${err.message}`);
    } finally {
      setDeepLoading(false);
    }
  };

  const saveToBigQuery = async () => {
    if (!report) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const response = await fetch('/api/log-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityName,
          report,
          projectId: settings.bqProjectId || undefined
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setSaveStatus({ type: 'success', message: 'Report archived in BigQuery.' });
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const generateReport = async () => {
    if (!entityName.trim()) {
      setError('Please enter an entity name.');
      return;
    }

    setLoading(true);
    setError('');
    setReport('');
    setResearchProcess('');
    setGroundingUrls([]);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          entityName, 
          dataSources,
          apiKey: settings.geminiApiKey || undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error && errorData.error.includes("API Key")) {
          setActiveTab('settings');
          throw new Error("API Key required. Please enter it in the Settings tab.");
        }
        throw new Error(errorData.error || 'Research failed');
      }

      const data = await response.json();
      const fullText = data.fullText || '';
      const usage = data.usage;
      const tokenSummary = usage ? `\n\n---\n**Token Usage:** Prompt: ${usage.promptTokenCount} | Candidates: ${usage.candidatesTokenCount} | Total: ${usage.totalTokenCount}` : '';
      
      // Extract research process
      const processMatch = fullText.match(/<research_process>([\s\S]*?)<\/research_process>/);
      if (processMatch) {
        setResearchProcess(processMatch[1].trim());
      }

      // Extract report
      const reportMatch = fullText.match(/<report>([\s\S]*?)<\/report>/);
      if (reportMatch) {
        setReport(reportMatch[1].trim() + tokenSummary);
      } else {
        setReport(fullText.replace(/<research_process>[\s\S]*?<\/research_process>/, '').trim() + tokenSummary);
      }

      // Extract grounding metadata
      const chunks = data.groundingMetadata?.groundingChunks;
      if (chunks) {
        const urls = chunks
          .filter((chunk: any) => chunk.web)
          .map((chunk: any) => ({ uri: chunk.web!.uri, title: chunk.web!.title || chunk.web!.uri }));
        setGroundingUrls(urls);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while generating the report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-[#E4E3E0] sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] flex items-center justify-center rounded-sm">
            <Layers className="text-[#E4E3E0] w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">ChainIntel</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">Blockchain Research Analyst Agent</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
            <div className={cn(
              "w-2 h-2 rounded-full",
              configStatus.gemini ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            )} />
            {configStatus.gemini ? "System Online" : "System Offline (Key Missing)"}
          </div>
          {!configStatus.gemini && !settings.geminiApiKey && (
            <button 
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1 border border-red-500 text-red-500 text-[10px] font-mono uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors"
            >
              Setup Key
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Section */}
        <section className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
            <h2 className="font-serif italic text-lg mb-4 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Research Parameters
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-mono uppercase opacity-50 block mb-1">Entity Name</label>
                <input 
                  type="text" 
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder="e.g. Uniswap, Coinbase, Solana"
                  className="w-full bg-[#F5F5F5] border border-[#141414] p-3 focus:outline-none focus:ring-1 focus:ring-[#141414] font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase opacity-50 block mb-1">Data Sources (Optional)</label>
                <textarea 
                  value={dataSources}
                  onChange={(e) => setDataSources(e.target.value)}
                  placeholder="Paste URLs or raw text here..."
                  rows={6}
                  className="w-full bg-[#F5F5F5] border border-[#141414] p-3 focus:outline-none focus:ring-1 focus:ring-[#141414] font-mono text-sm resize-none"
                />
              </div>

              <button 
                onClick={generateReport}
                disabled={loading}
                className={cn(
                  "w-full py-4 bg-[#141414] text-[#E4E3E0] font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]",
                  loading && "opacity-70 cursor-not-allowed"
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Generate Report
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-900 p-4 flex flex-col gap-3">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-red-900 shrink-0 mt-0.5" />
                <p className="text-xs text-red-900 font-medium">{error}</p>
              </div>
              {error.includes("Secrets") && (
                <div className="mt-2 p-3 bg-white/50 border border-red-200 rounded text-[10px] font-mono uppercase tracking-tight text-red-800 space-y-2">
                  <p className="font-bold underline">Quick Setup Guide:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Click the ⚙️ Gear icon in the left sidebar.</li>
                    <li>Go to the "Secrets" tab.</li>
                    <li>Add a secret named <code className="bg-red-100 px-1">GEMINI_API_KEY</code>.</li>
                    <li>Paste your key from Google AI Studio.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {groundingUrls.length > 0 && (
            <div className="bg-white border border-[#141414] p-6 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)]">
              <h3 className="text-[10px] font-mono uppercase opacity-50 mb-3 tracking-widest">Sources Found</h3>
              <ul className="space-y-2">
                {groundingUrls.map((url, i) => (
                  <li key={i} className="group">
                    <a 
                      href={url.uri} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs flex items-center gap-2 hover:underline decoration-[#141414] underline-offset-2"
                    >
                      <ExternalLink className="w-3 h-3 opacity-30 group-hover:opacity-100" />
                      <span className="truncate">{url.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Output Section */}
        <section className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-[#141414] min-h-[600px] flex flex-col shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
            {/* Tabs */}
            <div className="flex border-b border-[#141414] justify-between items-center pr-4">
              <div className="flex">
                <button 
                  onClick={() => setActiveTab('report')}
                  className={cn(
                    "px-6 py-4 text-[10px] font-mono uppercase tracking-widest border-r border-[#141414] transition-colors",
                    activeTab === 'report' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#F5F5F5]"
                  )}
                >
                  Final Report
                </button>
                <button 
                  onClick={() => setActiveTab('process')}
                  className={cn(
                    "px-6 py-4 text-[10px] font-mono uppercase tracking-widest border-r border-[#141414] transition-colors",
                    activeTab === 'process' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#F5F5F5]"
                  )}
                >
                  Research Process
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    "px-6 py-4 text-[10px] font-mono uppercase tracking-widest border-r border-[#141414] transition-colors",
                    activeTab === 'settings' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#F5F5F5]"
                  )}
                >
                  Settings
                </button>
              </div>

              {report && activeTab === 'report' && (
                <div className="flex items-center gap-3">
                  {saveStatus && (
                    <span className={cn(
                      "text-[10px] font-mono uppercase tracking-widest",
                      saveStatus.type === 'success' ? "text-emerald-600" : "text-red-600"
                    )}>
                      {saveStatus.message}
                    </span>
                  )}
                  <button 
                    onClick={saveToBigQuery}
                    disabled={saving}
                    className="flex items-center gap-2 px-3 py-1.5 border border-[#141414] text-[10px] font-mono uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                    Archive to BigQuery
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-8 overflow-auto max-h-[800px]">
              {!report && !researchProcess && !loading && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 space-y-4">
                  <Database className="w-16 h-16" />
                  <div>
                    <p className="font-serif italic text-xl">Awaiting Input</p>
                    <p className="text-xs font-mono uppercase tracking-widest">System ready for data extraction</p>
                  </div>
                </div>
              )}

              {loading && (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-[#141414]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-[#141414] rounded-full" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-serif italic text-lg animate-pulse">Synthesizing Intelligence...</p>
                    <div className="flex flex-col gap-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest opacity-50">Mapping Sources</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest opacity-50">Extracting Fundamentals</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest opacity-50">Verifying Compliance Data</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'report' && report && (
                <div className="relative">
                  {deepLoading && (
                    <div className="absolute inset-0 z-40 bg-[#E4E3E0]/40 backdrop-blur-[1px] flex items-center justify-center">
                      <div className="bg-white border border-[#141414] p-4 shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-[10px] font-mono uppercase tracking-widest">Deep Diving...</span>
                      </div>
                    </div>
                  )}
                  
                  {deepDiveResult && (
                    <div className="mb-8 p-6 bg-emerald-50 border border-[#141414] shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] animate-in slide-in-from-top-4 duration-300">
                      <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#141414]/20">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-700" />
                          <h4 className="text-[10px] font-mono uppercase tracking-widest font-bold">Deep Dive: {deepDiveResult.field}</h4>
                        </div>
                        <button 
                          onClick={() => setDeepDiveResult(null)}
                          className="text-[10px] font-mono uppercase hover:underline"
                        >
                          [Close]
                        </button>
                      </div>
                      <div className="prose prose-sm max-w-none">
                        <Markdown>{deepDiveResult.content}</Markdown>
                      </div>
                    </div>
                  )}

                  <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:italic prose-headings:border-b prose-headings:border-[#141414] prose-headings:pb-2 prose-table:border prose-table:border-[#141414] prose-th:bg-[#F5F5F5] prose-th:p-2 prose-td:p-2 prose-td:border prose-td:border-[#141414]">
                    <Markdown 
                      components={{
                        li: ({ children }) => <li className="list-none"><FieldWrapper onDeepen={handleDeepen}>{children}</FieldWrapper></li>,
                        p: ({ children }) => <FieldWrapper onDeepen={handleDeepen}>{children}</FieldWrapper>
                      }}
                    >
                      {report}
                    </Markdown>
                  </div>
                </div>
              )}

              {activeTab === 'process' && researchProcess && (
                <div className="bg-[#F5F5F5] p-6 border border-[#141414] font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-[#141414] opacity-50">
                    <Info className="w-3 h-3" />
                    INTERNAL LOGS / DATA EXTRACTION
                  </div>
                  {researchProcess}
                </div>
              )}
              {activeTab === 'settings' && (
                <div className="space-y-8 max-w-2xl">
                  <div>
                    <h3 className="font-serif italic text-xl mb-2">Configuration Management</h3>
                    <p className="text-xs opacity-60 mb-6">Manage your API keys and project identifiers. Values stored here will override environment variables for the current session.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase opacity-50 block">Gemini API Key</label>
                      <input 
                        type="password"
                        value={settings.geminiApiKey}
                        onChange={(e) => updateSettings('geminiApiKey', e.target.value)}
                        placeholder={configStatus.gemini ? "••••••••••••••••" : "Enter Gemini API Key..."}
                        className="w-full bg-[#F5F5F5] border border-[#141414] p-3 focus:outline-none focus:ring-1 focus:ring-[#141414] font-mono text-sm"
                      />
                      <p className="text-[9px] opacity-40">Used for AI synthesis and Google Search grounding.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase opacity-50 block">BigQuery Project ID</label>
                      <input 
                        type="text"
                        value={settings.bqProjectId}
                        onChange={(e) => updateSettings('bqProjectId', e.target.value)}
                        placeholder={configStatus.bigquery ? "Project ID detected" : "Enter Project ID..."}
                        className="w-full bg-[#F5F5F5] border border-[#141414] p-3 focus:outline-none focus:ring-1 focus:ring-[#141414] font-mono text-sm"
                      />
                      <p className="text-[9px] opacity-40">Required for archiving research reports to your data warehouse.</p>
                    </div>

                    <div className="pt-4 border-t border-[#141414]/10">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", (settings.geminiApiKey || configStatus.gemini) ? "bg-emerald-500" : "bg-red-500")} />
                          <span className="text-[10px] font-mono uppercase">Gemini: {(settings.geminiApiKey || configStatus.gemini) ? "Ready" : "Missing"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", (settings.bqProjectId || configStatus.bigquery) ? "bg-emerald-500" : "bg-red-500")} />
                          <span className="text-[10px] font-mono uppercase">BigQuery: {(settings.bqProjectId || configStatus.bigquery) ? "Ready" : "Missing"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-[#141414] p-8 text-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-mono uppercase opacity-50 tracking-widest">
            © 2026 ChainIntel Intelligence Systems. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="#" className="opacity-50 hover:opacity-100 transition-opacity"><Twitter className="w-4 h-4" /></a>
            <a href="#" className="opacity-50 hover:opacity-100 transition-opacity"><Linkedin className="w-4 h-4" /></a>
            <a href="#" className="opacity-50 hover:opacity-100 transition-opacity"><Github className="w-4 h-4" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
