import { readFile } from "node:fs/promises";
import path from "node:path";
import { asr } from "tencentcloud-sdk-nodejs-asr";
import { getAiModelConfig, getDashscopeNativeBaseURL } from "@/lib/ai/config";
import { transcribeLocalAudio } from "@/lib/speech/localWhisper";

export type SpeechTranscription = {
  text: string;
  provider: "whisper-wu-local" | "tencent-cloud-asr" | "aliyun-bailian-asr";
  model: string;
  device: string;
  requestId?: string;
};

function aliyunCredential() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim()
    || process.env.BAILIAN_API_KEY?.trim()
    || process.env.AI_API_KEY?.trim();
  if (!apiKey) throw new Error("BAILIAN_ASR_NOT_CONFIGURED");
  return {
    apiKey: apiKey.replace(/^Bearer\s+/i, ""),
    endpoint: process.env.DASHSCOPE_ASR_URL?.trim()
      || `${getDashscopeNativeBaseURL()}/services/aigc/multimodal-generation/generation`,
  };
}

function audioMimeType(audioPath: string) {
  const extension = path.extname(audioPath).slice(1).toLowerCase();
  const types: Record<string, string> = {
    aac: "audio/aac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    ogg: "audio/ogg",
    opus: "audio/opus",
    wav: "audio/wav",
    webm: "audio/webm",
  };
  const type = types[extension];
  if (!type) throw new Error("ASR_AUDIO_FORMAT_UNSUPPORTED");
  return type;
}

function audioFileFormat(audioPath: string) {
  const extension = path.extname(audioPath).slice(1).toLowerCase();
  if (["aac", "m4a", "mp3", "mp4", "ogg", "opus", "wav", "webm"].includes(extension)) {
    return extension;
  }
  throw new Error("ASR_AUDIO_FORMAT_UNSUPPORTED");
}

function dataUri(bytes: Buffer, audioPath: string) {
  return `data:${audioMimeType(audioPath)};base64,${bytes.toString("base64")}`;
}

async function transcribeAliyunNative(
  audioPath: string,
  bytes: Buffer,
): Promise<SpeechTranscription> {
  const { apiKey, endpoint } = aliyunCredential();
  const model = process.env.ASR_MODEL?.trim() || "qwen-audio-3.0-asr-flash";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-SSE": "disable",
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: dataUri(bytes, audioPath) },
              },
            ],
          },
        ],
      },
      parameters: {
        format: audioFileFormat(audioPath),
        language_hints: ["zh"],
        vocabulary: {
          "上海话": 5,
          "吴语": 5,
          "家庭医生": 5,
          "家医": 5,
          "复诊": 5,
          "转诊": 5,
          "续方": 5,
          "配药": 5,
          "慢病": 5,
          "奉贤区": 5,
          "南桥": 5,
          "奉浦": 5,
          "海湾镇": 5,
          "社区卫生服务中心": 5,
        },
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    request_id?: string;
    output?: { text?: string };
    code?: string;
    message?: string;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const code = payload.code ?? payload.error?.code ?? String(response.status);
    const detail = payload.message ?? payload.error?.message ?? "unknown";
    throw new Error(`BAILIAN_ASR_NATIVE_FAILED:${code}:${detail}`);
  }
  const text = payload.output?.text?.trim() ?? "";
  if (!text) throw new Error("NO_SPEECH_DETECTED");
  return {
    text,
    provider: "aliyun-bailian-asr",
    model,
    device: process.env.DASHSCOPE_REGION?.trim() || "cn-beijing",
    requestId: payload.request_id,
  };
}

async function transcribeAliyunCompatible(
  audioPath: string,
  bytes: Buffer,
): Promise<SpeechTranscription> {
  const config = getAiModelConfig("text");
  if (!config.apiKey) throw new Error("BAILIAN_ASR_NOT_CONFIGURED");
  const model = process.env.ASR_FALLBACK_MODEL?.trim() || "qwen3-asr-flash";
  const response = await fetch(`${config.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey.replace(/^Bearer\s+/i, "")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: { data: dataUri(bytes, audioPath) },
            },
          ],
        },
      ],
      asr_options: {
        enable_itn: true,
      },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    request_id?: string;
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `BAILIAN_ASR_COMPAT_FAILED:${payload.error?.code ?? response.status}:${payload.error?.message ?? "unknown"}`,
    );
  }
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("NO_SPEECH_DETECTED");
  return {
    text,
    provider: "aliyun-bailian-asr",
    model,
    device: process.env.DASHSCOPE_REGION?.trim() || "cn-beijing",
    requestId: payload.request_id ?? payload.id,
  };
}

async function transcribeAliyunAudio(audioPath: string): Promise<SpeechTranscription> {
  const bytes = await readFile(audioPath);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("BAILIAN_ASR_AUDIO_TOO_LARGE");
  try {
    return await transcribeAliyunNative(audioPath, bytes);
  } catch (nativeError) {
    if (nativeError instanceof Error && nativeError.message.includes("NO_SPEECH_DETECTED")) {
      throw nativeError;
    }
    try {
      return await transcribeAliyunCompatible(audioPath, bytes);
    } catch (compatibleError) {
      const nativeMessage = nativeError instanceof Error ? nativeError.message : "native_failed";
      const compatibleMessage = compatibleError instanceof Error ? compatibleError.message : "compatible_failed";
      throw new Error(`BAILIAN_ASR_FAILED:${nativeMessage}|${compatibleMessage}`);
    }
  }
}

function audioFormat(audioPath: string) {
  const extension = path.extname(audioPath).slice(1).toLowerCase();
  if (extension === "webm") return "ogg-opus";
  if (["wav", "pcm", "ogg", "speex", "silk", "mp3", "m4a", "aac", "amr"].includes(extension)) {
    return extension;
  }
  throw new Error("ASR_AUDIO_FORMAT_UNSUPPORTED");
}

function tencentCredential() {
  const secretId = process.env.TENCENT_ASR_SECRET_ID?.trim()
    || process.env.TENCENT_SMS_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_ASR_SECRET_KEY?.trim()
    || process.env.TENCENT_SMS_SECRET_KEY?.trim();
  if (!secretId || !secretKey) throw new Error("TENCENT_ASR_NOT_CONFIGURED");
  return {
    secretId,
    secretKey,
    token: process.env.TENCENT_ASR_SECURITY_TOKEN?.trim() || undefined,
  };
}

async function transcribeTencentAudio(audioPath: string): Promise<SpeechTranscription> {
  const bytes = await readFile(audioPath);
  if (Buffer.byteLength(bytes.toString("base64"), "utf8") > 3 * 1024 * 1024) {
    throw new Error("TENCENT_ASR_AUDIO_TOO_LARGE");
  }
  const engine = process.env.TENCENT_ASR_ENGINE?.trim() || "16k_zh_medical";
  const Client = asr.v20190614.Client;
  const client = new Client({
    credential: tencentCredential(),
    region: process.env.TENCENT_ASR_REGION?.trim() || "ap-shanghai",
    profile: {
      signMethod: "TC3-HMAC-SHA256",
      httpProfile: { reqMethod: "POST", reqTimeout: 45 },
    },
  });
  const response = await client.SentenceRecognition({
    EngSerViceType: engine,
    SourceType: 1,
    VoiceFormat: audioFormat(audioPath),
    Data: bytes.toString("base64"),
    DataLen: bytes.byteLength,
    FilterDirty: 0,
    FilterModal: 0,
    FilterPunc: 0,
    ConvertNumMode: 1,
    HotwordId: process.env.TENCENT_ASR_HOTWORD_ID?.trim() || undefined,
  });
  return {
    text: response.Result?.trim() ?? "",
    provider: "tencent-cloud-asr",
    model: engine,
    device: process.env.TENCENT_ASR_REGION?.trim() || "ap-shanghai",
    requestId: response.RequestId,
  };
}

export function speechProvider() {
  const configured = process.env.ASR_PROVIDER?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "bailian_qwen_asr" : "local_whisper_wu";
}

export async function transcribeAudio(audioPath: string): Promise<SpeechTranscription> {
  const provider = speechProvider();
  if (provider === "local_whisper_wu") return transcribeLocalAudio(audioPath);
  if (provider === "tencent_asr") return transcribeTencentAudio(audioPath);
  if (provider === "bailian_qwen_asr") return transcribeAliyunAudio(audioPath);
  throw new Error("ASR_PROVIDER_UNAVAILABLE");
}
