import { Button, Text, View } from "@tarojs/components";
import { CircleAlert, RefreshCw } from "lucide-react-taro";

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
      <View className="page-feedback-mark"><CircleAlert size={30} color="#2F6C56" strokeWidth={1.9} /></View>
      <Text className="page-feedback-title">{title}</Text>
      <Text className="page-feedback-copy">{message}</Text>
      <Button className="page-feedback-action pressable" onClick={onRetry}>
        <RefreshCw size={18} color="#FFFFFF" strokeWidth={2.1} />
        <Text>重新加载</Text>
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
      <View className="inline-retry-mark"><CircleAlert size={17} color="#8A5D25" strokeWidth={2.1} /></View>
      <Text className="inline-retry-copy">{message}</Text>
      <Text className="inline-retry-action pressable" onClick={onRetry}>重试</Text>
    </View>
  );
}
