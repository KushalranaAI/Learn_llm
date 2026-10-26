// The AI back-ends a learner can connect. Calls go directly from their browser to the provider they pick (or, when the
// app runs locally with keys in .env, through the local relay in app/api/ai-server). No other server sees prompts or keys.
// Ported from Machine Learning 1 → 100 (web/lib/ai/providers.ts); Claude defaults match System Learn.

export type ProviderId = "ollama" | "anthropic" | "openai" | "azure" | "gemini" | "custom";
export type ProviderKind = "openai" | "anthropic" | "gemini" | "azure";

export type Provider = {
  id: ProviderId;
  label: string;
  tagline: string;
  kind: ProviderKind;
  local: boolean;
  baseUrl: string;
  editableBaseUrl: boolean;
  needsKey: boolean;
  keyLabel: string;
  keyUrl?: string;
  defaultModel: string;
  /** offered in the model box before (or instead of) listing models from the provider */
  suggestedModels?: string[];
  /** Default amount of page text sent along with a question. Small local models have small context windows. */
  contextChars: number;
  setup: string;
  /** Only offered when the app runs on this machine (localhost dev server), never on the static GitHub Pages copy. */
  localOnly?: boolean;
  baseLabel?: string;
  basePlaceholder?: string;
  modelLabel?: string;
  modelHelp?: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "anthropic",
    label: "Claude (Anthropic)",
    tagline: "Strongest explanations. Needs an API key.",
    kind: "anthropic",
    local: false,
    baseUrl: "https://api.anthropic.com",
    editableBaseUrl: false,
    needsKey: true,
    keyLabel: "Anthropic API key",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-opus-5-5",
    suggestedModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    contextChars: 16000,
    setup: "Create a key in the Anthropic console. Usage is billed to your account.",
  },
  {
    id: "openai",
    label: "OpenAI",
    tagline: "GPT models. Needs an API key.",
    kind: "openai",
    local: false,
    baseUrl: "https://api.openai.com/v1",
    editableBaseUrl: false,
    needsKey: true,
    keyLabel: "OpenAI API key",
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    suggestedModels: ["gpt-4o-mini", "gpt-4o"],
    contextChars: 16000,
    setup: "Create a key on the OpenAI platform. Usage is billed to your account.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    tagline: "Gemini models. Has a free tier.",
    kind: "gemini",
    local: false,
    baseUrl: "https://generativelanguage.googleapis.com",
    editableBaseUrl: false,
    needsKey: true,
    keyLabel: "Gemini API key",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.0-flash",
    contextChars: 16000,
    setup: "Create a key in Google AI Studio.",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    tagline: "Your own Azure deployment. Offered only when running locally.",
    kind: "azure",
    local: false,
    localOnly: true,
    baseUrl: "",
    editableBaseUrl: true,
    baseLabel: "Azure OpenAI endpoint",
    basePlaceholder: "https://YOUR-RESOURCE.openai.azure.com",
    needsKey: true,
    keyLabel: "Azure OpenAI API key",
    keyUrl: "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI",
    defaultModel: "",
    modelLabel: "Deployment name",
    modelHelp: "The name you gave the deployment in Azure AI Foundry (not the model name).",
    contextChars: 16000,
    setup: "In the Azure portal open your Azure OpenAI resource → Keys and Endpoint, copy the endpoint and a key, and note your deployment name. Entra ID sign-in isn't supported, only API keys. Easiest: put them in .env (see docs/AI.md).",
  },
  {
    id: "ollama",
    label: "Ollama",
    tagline: "Runs on your computer. Free, private, works offline.",
    kind: "openai",
    local: true,
    baseUrl: "http://localhost:11434/v1",
    editableBaseUrl: true,
    needsKey: false,
    keyLabel: "",
    defaultModel: "llama3.2",
    contextChars: 4000,
    setup: "Install Ollama from ollama.com, then run `ollama pull llama3.2` in a terminal. Leave Ollama running.",
  },
  {
    id: "custom",
    label: "Local server / other",
    tagline: "LM Studio, llama.cpp, vLLM … any OpenAI-compatible server running on this computer.",
    kind: "openai",
    local: true,
    baseUrl: "http://localhost:1234/v1",
    editableBaseUrl: true,
    needsKey: false,
    keyLabel: "API key (only if the server needs one)",
    defaultModel: "",
    contextChars: 6000,
    setup: "In LM Studio start the local server (Developer tab) and enable CORS. Paste the server's base URL here. The page can only reach servers on localhost / 127.0.0.1.",
  },
];

export const providerById = (id: ProviderId): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

/** Providers whose key can live in .env and be attached by the local relay. */
export type RelayProvider = "openai" | "anthropic" | "azure";
export const isRelayProvider = (id: ProviderId): id is RelayProvider => id === "openai" || id === "anthropic" || id === "azure";
