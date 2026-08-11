// Fallback type declarations for packages whose bundled types are missing
// in this offline install. Keeps `tsc --noEmit` and `next build` happy.

declare module "lucide-react" {
  import * as React from "react";

  export type LucideProps = React.SVGAttributes<SVGSVGElement> & {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
  };

  export type LucideIcon = React.ForwardRefExoticComponent<
    LucideProps & React.RefAttributes<SVGSVGElement>
  >;

  // Permissive any-icon export so any `import { Foo } from "lucide-react"`
  // type-checks against any icon name in the library. The runtime module
  // exports the real components.
  // Using `any` here matches the bundler's actual output without
  // requiring us to enumerate every icon.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const icons: { [name: string]: LucideIcon } & Record<string, any>;
  export default icons;

  // Re-export every named import as LucideIcon. The declaration trick:
  // ambient module + named export proxy via `const ... ; export const X`
  // can't enumerate all icons, so we declare a generic export below.
  export const Activity: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowUpRight: LucideIcon;
  export const Award: LucideIcon;
  export const Bell: LucideIcon;
  export const BellRing: LucideIcon;
  export const BookOpen: LucideIcon;
  export const Building2: LucideIcon;
  export const Camera: LucideIcon;
  export const CalendarCheck2: LucideIcon;
  export const CalendarClock: LucideIcon;
  export const CalendarDays: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const ClipboardCheck: LucideIcon;
  export const ClipboardList: LucideIcon;
  export const CircleAlert: LucideIcon;
  export const Clock3: LucideIcon;
  export const Coins: LucideIcon;
  export const Droplets: LucideIcon;
  export const ExternalLink: LucideIcon;
  export const FileText: LucideIcon;
  export const Footprints: LucideIcon;
  export const Gift: LucideIcon;
  export const GraduationCap: LucideIcon;
  export const Headphones: LucideIcon;
  export const HeartPulse: LucideIcon;
  export const HeartHandshake: LucideIcon;
  export const History: LucideIcon;
  export const Home: LucideIcon;
  export const House: LucideIcon;
  export const Hash: LucideIcon;
  export const ImagePlus: LucideIcon;
  export const Keyboard: LucideIcon;
  export const KeyRound: LucideIcon;
  export const LogIn: LucideIcon;
  export const LoaderCircle: LucideIcon;
  export const LockKeyhole: LucideIcon;
  export const MessageCircle: LucideIcon;
  export const MessageCircleMore: LucideIcon;
  export const MessageSquareText: LucideIcon;
  export const MessageSquareWarning: LucideIcon;
  export const Mic: LucideIcon;
  export const MapPin: LucideIcon;
  export const Pause: LucideIcon;
  export const Phone: LucideIcon;
  export const PencilLine: LucideIcon;
  export const Pill: LucideIcon;
  export const Play: LucideIcon;
  export const PlayCircle: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const RotateCw: LucideIcon;
  export const Send: LucideIcon;
  export const Search: LucideIcon;
  export const Settings: LucideIcon;
  export const ShieldAlert: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Stethoscope: LucideIcon;
  export const Smartphone: LucideIcon;
  export const Scale: LucideIcon;
  export const Trash2: LucideIcon;
  export const Undo2: LucideIcon;
  export const UserRoundCheck: LucideIcon;
  export const UserRoundPlus: LucideIcon;
  export const UserRound: LucideIcon;
  export const Users: LucideIcon;
  export const UsersRound: LucideIcon;
  export const WandSparkles: LucideIcon;
  export const XCircle: LucideIcon;
}
