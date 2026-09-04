import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("audio")),
}));
vi.mock("@/lib/speech/localWhisper", () => ({
  transcribeLocalAudio: vi.fn(async () => ({
    text: "我要预约家庭医生",
    provider: "whisper-wu-local",
    model: "whisper-small + whisper-wu",
    device: "cpu",
  })),
}));

const sentenceRecognition = vi.fn(async () => ({
  Result: "我想查询家庭医生排班。",
  RequestId: "asr-request-1",
}));
vi.mock("tencentcloud-sdk-nodejs-asr", () => ({
  asr: {
    v20190614: {
      Client: class {
        SentenceRecognition = sentenceRecognition;
      },
    },
  },
}));

describe("speech provider routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    sentenceRecognition.mockClear();
  });

  it("uses the local Whisper-Wu provider by default", async () => {
    const { transcribeAudio } = await import("./transcribe");
    const result = await transcribeAudio("recording.wav");
    expect(result.provider).toBe("whisper-wu-local");
    expect(result.text).toContain("家庭医生");
  });

  it("uses Tencent sentence recognition without exposing credentials", async () => {
    vi.stubEnv("ASR_PROVIDER", "tencent_asr");
    vi.stubEnv("TENCENT_ASR_SECRET_ID", "secret-id");
    vi.stubEnv("TENCENT_ASR_SECRET_KEY", "secret-key");
    vi.stubEnv("TENCENT_ASR_ENGINE", "16k_zh_medical");
    const { transcribeAudio } = await import("./transcribe");
    const result = await transcribeAudio("recording.mp3");
    expect(result).toMatchObject({
      provider: "tencent-cloud-asr",
      model: "16k_zh_medical",
      requestId: "asr-request-1",
    });
    expect(sentenceRecognition).toHaveBeenCalledWith(expect.objectContaining({
      SourceType: 1,
      VoiceFormat: "mp3",
      DataLen: 5,
    }));
  });

  it("uses Bailian Qwen ASR with an ephemeral data URI", async () => {
    vi.stubEnv("ASR_PROVIDER", "bailian_qwen_asr");
    vi.stubEnv("DASHSCOPE_API_KEY", "test-bailian-key");
    vi.stubEnv("ASR_MODEL", "qwen-audio-3.0-asr-flash");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      request_id: "asr-bailian-1",
      output: { text: "我要预约明天下午的家庭医生。" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const { transcribeAudio } = await import("./transcribe");
    const result = await transcribeAudio("recording.webm");
    expect(result).toMatchObject({
      provider: "aliyun-bailian-asr",
      model: "qwen-audio-3.0-asr-flash",
      text: "我要预约明天下午的家庭医生。",
    });
    const request = fetchMock.mock.calls[0];
    expect(request[0]).toContain("/multimodal-generation/generation");
    expect(String(request[1]?.body)).toContain("data:audio/webm;base64,");
    fetchMock.mockRestore();
  });

  it("rejects unknown providers", async () => {
    vi.stubEnv("ASR_PROVIDER", "unknown");
    const { transcribeAudio } = await import("./transcribe");
    await expect(transcribeAudio("recording.wav")).rejects.toThrow("ASR_PROVIDER_UNAVAILABLE");
  });
});
