import { readFile } from "node:fs/promises";
import path from "node:path";
import { asr } from "tencentcloud-sdk-nodejs-asr";
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
    baseURL: (process.env.DASHSCOPE_BASE_URL?.trim()
      || process.env.AI_BASE_URL?.trim()
      || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, ""),
  };
}

function audioMimeType(audioPath: string) {
  const extension = path.extname(audioPath).slice(1).toLowerCase();
  const types: Record<string, string> = {
    aac: "audio/aac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    opus: "audio/opus",
    wav: "audio/wav",
    webm: "audio/webm",
  };
  const type = types[extension];
  if (!type) throw new Error("ASR_AUDIO_FORMAT_UNSUPPORTED");
  return type;
}

async function transcribeAliyunAudio(audioPath: string): Promise<SpeechTranscription> {
  const bytes = await readFile(audioPath);
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("BAILIAN_ASR_AUDIO_TOO_LARGE");
  const { apiKey, baseURL } = aliyunCredential();
  const model = process.env.ASR_MODEL?.trim() || "qwen3-asr-flash";
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "基层家庭医生服务场景。常见词包括家医、复诊、转诊、续方、配药、血压、血糖、海湾镇、社区卫生服务中心。",
        },
        {
          role: "user",
          content: [{
            type: "input_audio",
            input_audio: {
              data: `data:${audioMimeType(audioPath)};base64,${bytes.toString("base64")}`,
            },
          }],
        },
      ],
      asr_options: { language: "zh", enable_itn: true },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.json() as {
    id?: string;
    request_id?: string;
    choices?: Array<{ message?: { content?: string } }>;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new Error(`BAILIAN_ASR_FAILED:${payload.error?.code ?? response.status}`);
  }
  return {
    text: payload.choices?.[0]?.message?.content?.trim() ?? "",
    provider: "aliyun-bailian-asr",
    model,
    device: "aliyun-cn-beijing",
    requestId: payload.request_id ?? payload.id,
  };
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
  // Tencent SentenceRecognition accepts at most 3 MB after base64 encoding.
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
  return process.env.ASR_PROVIDER?.trim() || "local_whisper_wu";
}

export async function transcribeAudio(audioPath: string): Promise<SpeechTranscription> {
  const provider = speechProvider();
  if (provider === "local_whisper_wu") return transcribeLocalAudio(audioPath);
  if (provider === "tencent_asr") return transcribeTencentAudio(audioPath);
  if (provider === "bailian_qwen_asr") return transcribeAliyunAudio(audioPath);
  throw new Error("ASR_PROVIDER_UNAVAILABLE");
}
