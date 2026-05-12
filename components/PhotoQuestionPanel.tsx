"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";

type PhotoCategory = "report" | "medicine" | "notice" | "app" | "other";

type PhotoCategoryOption = {
  id: PhotoCategory;
  label: string;
  description: string;
  recognitionText: string;
  generatedQuestion: string;
};

const categoryOptions: PhotoCategoryOption[] = [
  {
    id: "report",
    label: "体检报告",
    description: "体检单、化验单、检查报告",
    recognitionText:
      "我看到这可能是一张体检报告。家医 Claw 可以帮您了解报告领取、解释和联系路径，但不能判断报告严重程度。",
    generatedQuestion: "我拍了一张体检报告，看不懂下一步该怎么办？",
  },
  {
    id: "medicine",
    label: "药盒 / 药品",
    description: "药盒、药瓶、处方单",
    recognitionText:
      "我看到这可能是药盒或药品信息。请按医生原医嘱用药，家医 Claw 不能建议停药、换药或调整剂量。",
    generatedQuestion: "我拍了一张药盒，想知道药吃完了应该怎么续配？",
  },
  {
    id: "notice",
    label: "社区通知",
    description: "居委通知、活动通知",
    recognitionText:
      "我看到这可能是一张社区通知。可以帮您整理通知内容，并提示是否需要联系居委、家庭医生或家属。",
    generatedQuestion: "我拍了一张社区通知，想知道下一步该怎么做？",
  },
  {
    id: "app",
    label: "健康云 / 小程序截图",
    description: "线上预约、操作页面",
    recognitionText:
      "我看到这可能是线上预约或小程序操作页面。可以请家属、居委或社区工作人员协助。",
    generatedQuestion:
      "我拍了一张健康云或小程序页面，不知道怎么操作怎么办？",
  },
  {
    id: "other",
    label: "其他",
    description: "不确定是什么",
    recognitionText:
      "我看到了您拍的图片。家医 Claw 可以帮您整理问题，但不能根据图片判断病情。",
    generatedQuestion:
      "我拍了一张图片，不知道该找谁帮忙看看下一步怎么做？",
  },
];

type PanelStep = "select" | "preview" | "confirm";

type PhotoQuestionPanelProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (question: string) => void;
};

export function PhotoQuestionPanel({
  open,
  onClose,
  onConfirm,
}: PhotoQuestionPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<PanelStep>("select");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] =
    useState<PhotoCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetState() {
    setStep("select");
    setPreviewUrl(null);
    setSelectedCategory(null);
    setError(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("暂时无法读取这个文件，请选择一张图片。");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("图片太大了，请选择一张小一点的图片。");
      return;
    }

    setError(null);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep("preview");
  }

  function handleCategorySelect(category: PhotoCategory) {
    setSelectedCategory(category);
    setStep("confirm");
  }

  function handleConfirm() {
    const option = categoryOptions.find((o) => o.id === selectedCategory);
    if (!option) return;

    onConfirm(option.generatedQuestion);
    resetState();
    onClose();
  }

  if (!open) return null;

  const selectedOption = categoryOptions.find(
    (o) => o.id === selectedCategory,
  );

  return (
    <div className="animate-in rounded-[28px] border border-line bg-cream p-5 shadow-float">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-base font-semibold text-navy">拍照问问</p>
          {step === "select" ? (
            <p className="mt-1 text-sm leading-6 text-navy/60">
              可以拍体检报告、药盒或社区通知单
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/8 text-navy/60 active:scale-95"
        >
          <span className="text-base font-semibold">&times;</span>
        </button>
      </div>

      {/* Step: Select image */}
      {step === "select" ? (
        <div className="mt-4 space-y-4">
          {error ? (
            <div className="rounded-[18px] bg-[#FBF0ED] px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-line/80 bg-[#FFF8ED] px-4 py-8 text-navy active:scale-[0.98]"
          >
            <Camera className="h-6 w-6 text-navy/50" />
            <span className="text-base font-semibold">选择照片</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-full border border-line bg-[#FFF8ED] px-4 py-3.5 text-sm font-semibold text-navy active:scale-[0.98]"
          >
            取消
          </button>
        </div>
      ) : null}

      {/* Step: Preview + category selection */}
      {step === "preview" ? (
        <div className="mt-4 space-y-4">
          {previewUrl ? (
            <div className="overflow-hidden rounded-[18px] border border-line/60 bg-[#FFF8ED]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="拍摄的照片预览"
                className="mx-auto max-h-48 w-auto object-contain"
              />
            </div>
          ) : null}

          <p className="text-sm font-semibold text-navy">
            请选择图片类型
          </p>
          <div className="space-y-2">
            {categoryOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleCategorySelect(option.id)}
                className="flex w-full items-center justify-between rounded-[20px] border border-line bg-[#FFF8ED] px-4 py-3.5 text-left transition active:scale-[0.98] active:bg-[#F7ECDA]"
              >
                <div>
                  <p className="text-sm font-semibold text-navy">
                    {option.label}
                  </p>
                  <p className="mt-0.5 text-xs text-navy/55">
                    {option.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setPreviewUrl(null);
              setStep("select");
            }}
            className="w-full rounded-full border border-line bg-[#FFF8ED] px-4 py-3 text-sm font-semibold text-navy active:scale-[0.98]"
          >
            重新选择
          </button>
        </div>
      ) : null}

      {/* Step: Confirm */}
      {step === "confirm" && selectedOption ? (
        <div className="mt-4 space-y-4">
          {previewUrl ? (
            <div className="overflow-hidden rounded-[18px] border border-line/60 bg-[#FFF8ED]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="拍摄的照片预览"
                className="mx-auto max-h-36 w-auto object-contain"
              />
            </div>
          ) : null}

          <div className="rounded-[18px] bg-[#EEF5F3] px-4 py-4">
            <p className="text-sm font-semibold text-sage">
              {selectedOption.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-navy/75">
              {selectedOption.recognitionText}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                setStep("preview");
              }}
              className="rounded-full border border-line bg-[#FFF8ED] px-4 py-4 text-base font-semibold text-navy active:scale-[0.98]"
            >
              重新选择
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-full bg-navy px-4 py-4 text-base font-semibold text-white active:scale-[0.98]"
            >
              让 Claw 帮我问
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-full border border-line/70 bg-cream/60 px-4 py-3 text-sm font-semibold text-navy/60 active:scale-[0.98]"
          >
            取消
          </button>
        </div>
      ) : null}

      {/* Safety notice - always visible */}
      <p className="mt-4 text-xs leading-5 text-navy/45">
        家医 Claw
        不能根据图片判断病情严重程度，不能提供诊断、处方、停药、换药或剂量调整建议。涉及身体不适、报告异常或用药问题，请联系家庭医生或线下医生。
      </p>
    </div>
  );
}
