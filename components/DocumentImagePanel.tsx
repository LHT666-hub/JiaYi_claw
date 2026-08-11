"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { DocumentAnalysis } from "@/lib/documents/analysis";

export type DocumentImagePanelHandle = { open: () => void };

const documentTypeLabels: Record<DocumentAnalysis["documentType"], string> = {
  lab_report: "化验报告",
  exam_report: "检查报告",
  prescription: "处方",
  medicine_package: "药盒或药品包装",
  discharge_summary: "出院小结",
  other: "医疗文件",
};

export const DocumentImagePanel = forwardRef<
  DocumentImagePanelHandle,
  { onUse: (text: string) => void }
>(function DocumentImagePanel({ onUse }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consentRequired, setConsentRequired] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => inputRef.current?.click(),
  }));

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function clear() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview("");
    setAnalysis(null);
    setError("");
    setConsentRequired(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analyze(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setError("图片不能超过 4MB，请压缩或重新拍摄。");
      return;
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
      setError("目前支持 JPG、PNG 和 WebP 图片。");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setAnalysis(null);
    setError("");
    setConsentRequired(false);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/v1/documents/analyze", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (payload.error?.code === "DOCUMENT_CONSENT_REQUIRED")
        setConsentRequired(true);
      if (!response.ok)
        throw new Error(payload.error?.message ?? "图片识别失败");
      setAnalysis(payload.data as DocumentAnalysis);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片识别失败");
    } finally {
      setLoading(false);
    }
  }

  function useResult() {
    if (!analysis) return;
    const visible = analysis.visibleText.slice(0, 8).join("；");
    const questions = analysis.questionsForClinician.join("；");
    onUse(
      `请帮我整理这份${documentTypeLabels[analysis.documentType]}，图片识别到：${visible || "没有清晰识别到文字"}。我想向家庭医生确认：${questions || "下一步需要准备什么"}`,
    );
    clear();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label="拍摄或选择医疗文件图片"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void analyze(file);
        }}
      />
      {preview || error ? (
        <section className="mb-3 rounded-[26px] border border-line bg-white p-3 shadow-[0_14px_30px_rgba(16,42,67,0.07)]">
          <div className="flex items-center gap-3">
            {preview ? (
              <Image
                src={preview}
                width={64}
                height={64}
                unoptimized
                alt="待识别医疗文件预览"
                className="h-16 w-16 shrink-0 rounded-[18px] object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-risk-soft text-danger">
                <AlertTriangle className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-sage">图片临时识别</p>
              <p className="mt-1 text-sm font-semibold text-navy">
                {loading
                  ? "正在提取清晰可见的文字"
                  : analysis
                    ? documentTypeLabels[analysis.documentType]
                    : "需要重新选择图片"}
              </p>
              <p className="mt-1 text-[11px] text-navy/45">原图不会写入居民档案</p>
            </div>
            <button
              type="button"
              onClick={clear}
              disabled={loading}
              aria-label="关闭图片识别"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-input text-navy/45 disabled:opacity-40"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
          {loading ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-[18px] bg-health-soft px-3 py-4 text-xs font-semibold text-sage">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在识别并进行适老整理
            </div>
          ) : null}
          {analysis ? (
            <div className="mt-3 border-t border-line/70 pt-3">
              <div className="space-y-2">
                {analysis.plainSummary.map((item) => (
                  <p key={item} className="flex gap-2 text-xs leading-5 text-navy/72">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    {item}
                  </p>
                ))}
              </div>
              {analysis.uncertainItems.length ? (
                <p className="mt-3 rounded-[16px] bg-[#FFF4DF] px-3 py-2.5 text-[11px] leading-5 text-[#8A5A20]">
                  需要人工核对：{analysis.uncertainItems.join("；")}
                </p>
              ) : null}
              <p className="mt-3 text-[10px] leading-4 text-navy/40">
                {analysis.safetyNotice}
              </p>
              <button
                type="button"
                onClick={useResult}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-navy px-4 py-3 text-xs font-semibold text-white"
              >
                <FileText className="h-4 w-4" />
                核对文字并继续问 Claw
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 rounded-[18px] bg-risk-soft px-3 py-3 text-xs leading-5 text-danger">
              {error}
              {consentRequired ? (
                <Link href="/privacy" className="mt-2 block font-semibold underline underline-offset-2">
                  前往隐私与授权
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
});
