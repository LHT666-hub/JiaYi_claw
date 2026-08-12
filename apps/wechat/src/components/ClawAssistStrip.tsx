import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ChevronRight, HeartHandshake } from "lucide-react-taro";

export function ClawAssistStrip({
  eyebrow = "Claw 协助",
  title,
  description,
  prompt,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  prompt?: string;
}) {
  const query = prompt ? `?prompt=${encodeURIComponent(prompt)}` : "";
  return (
    <View
      className="claw-assist-strip pressable"
      onClick={() => Taro.navigateTo({ url: `/pages/ask/index${query}` })}
      role="button"
      aria-label={`${title}，打开 Claw`}
    >
      <View className="claw-assist-symbol">
        <HeartHandshake size={22} color="#D9EAE4" strokeWidth={1.9} />
      </View>
      <View className="grow">
        <Text className="claw-assist-eyebrow">{eyebrow}</Text>
        <Text className="claw-assist-title">{title}</Text>
        <Text className="claw-assist-copy">{description}</Text>
      </View>
      <ChevronRight size={20} color="rgba(255,255,255,.54)" />
    </View>
  );
}
