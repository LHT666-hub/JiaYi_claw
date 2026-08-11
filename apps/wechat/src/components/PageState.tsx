import { Button, Text, View } from "@tarojs/components";

export function PageFeedback({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="page-feedback">
      <View className="page-feedback-mark">!</View>
      <Text className="page-feedback-title">{title}</Text>
      <Text className="page-feedback-copy">{message}</Text>
      <Button className="page-feedback-action pressable" onClick={onRetry}>
        重新加载
      </Button>
    </View>
  );
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View className="page-skeleton" aria-label="正在加载">
      <View className="page-skeleton-hero" />
      {Array.from({ length: rows }, (_, index) => (
        <View className="page-skeleton-row" key={index}>
          <View className="page-skeleton-icon" />
          <View className="grow">
            <View className="page-skeleton-line strong" />
            <View className="page-skeleton-line" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function InlineRetry({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View className="inline-retry">
      <View className="inline-retry-mark">!</View>
      <Text className="inline-retry-copy">{message}</Text>
      <Text className="inline-retry-action pressable" onClick={onRetry}>重试</Text>
    </View>
  );
}
