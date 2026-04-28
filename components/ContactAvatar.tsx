import Image from "next/image";
import Link from "next/link";
import { ContactItem } from "@/lib/types";

type ContactAvatarProps = {
  contact: ContactItem;
};

export function ContactAvatar({ contact }: ContactAvatarProps) {
  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="flex flex-col items-center gap-2 rounded-[24px] px-2 py-2 transition hover:-translate-y-0.5"
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
        {contact.avatarPath ? (
          <Image
            src={contact.avatarPath}
            alt={contact.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-xl font-semibold text-white"
            style={{ backgroundColor: contact.avatarColor }}
          >
            {contact.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-navy">{contact.name}</p>
        <p className="text-xs text-navy/58">{contact.role}</p>
      </div>
    </Link>
  );
}
