export type AiPurpose = "text" | "vision" | "memory" | "rag";

export type AiModelConfig = {
  provider: "aliyun_bailian" | "moonshot" | "openai_compatible";
  apiKey: string;
  baseURL: string;
  model: string;
};

function first(...values: Array<string | undefined>) {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? "";
}

function selectedProvider() {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (["aliyun", "bailian", "dashscope", "aliyun_bailian"].includes(explicit ?? "")) {
    return "aliyun_bailian" as const;
  }
  if (["kimi", "moonshot"].includes(explicit ?? "")) return "moonshot" as const;
  if (explicit === "openai_compatible") return "openai_compatible" as const;
  if (first(process.env.DASHSCOPE_API_KEY, process.env.BAILIAN_API_KEY)) return "aliyun_bailian" as const;
  if (first(process.env.AI_API_KEY, process.env.OPENAI_API_KEY)) return "openai_compatible" as const;
  return "moonshot" as const;
}

function dashscopeWorkspaceOrigin() {
  const workspaceId = first(
    process.env.DASHSCOPE_WORKSPACE_ID,
    process.env.BAILIAN_WORKSPACE_ID,
  );
  if (!workspaceId) return "";
  const region = first(process.env.DASHSCOPE_REGION) || "cn-beijing";
  return `https://${workspaceId}.${region}.maas.aliyuncs.com`;
}

export function getDashscopeCompatibleBaseURL() {
  const explicit = first(process.env.DASHSCOPE_BASE_URL, process.env.AI_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, "");
  const workspaceOrigin = dashscopeWorkspaceOrigin();
  if (workspaceOrigin) return `${workspaceOrigin}/compatible-mode/v1`;
  return "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

export function getDashscopeNativeBaseURL() {
  const explicit = first(process.env.DASHSCOPE_NATIVE_BASE_URL);
  if (explicit) return explicit.replace(/\/$/, "");
  const workspaceOrigin = dashscopeWorkspaceOrigin();
  if (workspaceOrigin) return `${workspaceOrigin}/api/v1`;
  return "https://dashscope.aliyuncs.com/api/v1";
}

export function getAiModelConfig(purpose: AiPurpose = "text"): AiModelConfig {
  const provider = selectedProvider();
  if (provider === "aliyun_bailian") {
    const modelByPurpose: Record<AiPurpose, string> = {
      text: first(process.env.AI_MODEL, process.env.DASHSCOPE_MODEL) || "qwen3.8-flash",
      vision: first(process.env.AI_VISION_MODEL, process.env.DASHSCOPE_VISION_MODEL) || "qwen3.8-flash",
      memory: first(process.env.MEMORY_EXTRACTION_MODEL, process.env.AI_MODEL, process.env.DASHSCOPE_MODEL) || "qwen3.8-flash",
      rag: first(process.env.RAG_GENERATION_MODEL, process.env.AI_MODEL, process.env.DASHSCOPE_MODEL) || "qwen3.8-flash",
    };
    return {
      provider,
      apiKey: first(process.env.DASHSCOPE_API_KEY, process.env.BAILIAN_API_KEY, process.env.AI_API_KEY),
      baseURL: getDashscopeCompatibleBaseURL(),
      model: modelByPurpose[purpose],
    };
  }

  if (provider === "openai_compatible") {
    const modelByPurpose: Record<AiPurpose, string> = {
      text: first(process.env.AI_MODEL) || "gpt-4.1-mini",
      vision: first(process.env.AI_VISION_MODEL, process.env.AI_MODEL) || "gpt-4.1-mini",
      memory: first(process.env.MEMORY_EXTRACTION_MODEL, process.env.AI_MODEL) || "gpt-4.1-mini",
      rag: first(process.env.RAG_GENERATION_MODEL, process.env.AI_MODEL) || "gpt-4.1-mini",
    };
    return {
      provider,
      apiKey: first(process.env.AI_API_KEY, process.env.OPENAI_API_KEY),
      baseURL: first(process.env.AI_BASE_URL) || "https://api.openai.com/v1",
      model: modelByPurpose[purpose],
    };
  }

  const modelByPurpose: Record<AiPurpose, string> = {
    text: first(process.env.KIMI_MODEL, process.env.MOONSHOT_MODEL) || "kimi-k2.6",
    vision: first(process.env.KIMI_VISION_MODEL, process.env.KIMI_MODEL) || "kimi-k2.6",
    memory: first(process.env.MEMORY_EXTRACTION_MODEL, process.env.KIMI_MODEL) || "kimi-k2.6",
    rag: first(process.env.RAG_GENERATION_MODEL, process.env.KIMI_MODEL) || "kimi-k2.6",
  };
  return {
    provider,
    apiKey: first(process.env.KIMI_API_KEY, process.env.MOONSHOT_API_KEY),
    baseURL: first(process.env.KIMI_BASE_URL, process.env.MOONSHOT_BASE_URL) || "https://api.moonshot.cn/v1",
    model: modelByPurpose[purpose],
  };
}

export function getTextModelCandidates() {
  const config = getAiModelConfig("text");
  if (config.provider === "aliyun_bailian") {
    return config.model === "qwen-plus"
      ? [config.model]
      : [...new Set([config.model, "qwen3.7-flash", "qwen-plus"])];
  }
  if (config.provider === "moonshot") return [...new Set([config.model, "kimi-k2.6", "moonshot-v1-8k"])];
  return [config.model];
}

export function modelTemperature(model: string, structured = false) {
  if (structured) return model.startsWith("kimi-k") ? 1 : 0.1;
  return model.startsWith("kimi-k") ? 1 : 0.2;
}

export function getEmbeddingModelConfig() {
  const ai = getAiModelConfig("rag");
  return {
    apiKey: first(process.env.RAG_EMBEDDING_API_KEY, ai.provider === "aliyun_bailian" ? ai.apiKey : undefined),
    baseURL: first(process.env.RAG_EMBEDDING_BASE_URL, ai.provider === "aliyun_bailian" ? ai.baseURL : undefined),
    model: first(process.env.RAG_EMBEDDING_MODEL) || (ai.provider === "aliyun_bailian" ? "text-embedding-v4" : ""),
  };
}
