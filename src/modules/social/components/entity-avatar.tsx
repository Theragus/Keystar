import { Mail, Users } from "lucide-react";
import { AllianceLogo, CorpLogo, Portrait } from "@/components/ui/eve-image";
import { cn } from "@/lib/utils";

/** Portrait or logo for a mail sender/recipient, by /universe/names category. */
export function EntityAvatar({
  id,
  category,
  size = 32,
  className,
}: {
  id: number;
  category: string | null | undefined;
  size?: number;
  className?: string;
}) {
  switch (category) {
    case "character":
      return <Portrait id={id} size={size} className={className} />;
    case "corporation":
      return <CorpLogo id={id} size={size} className={className} />;
    case "alliance":
      return <AllianceLogo id={id} size={size} className={className} />;
    default: {
      const Icon = category === "mailing_list" ? Users : Mail;
      return (
        <span
          className={cn("glass-chip inline-grid shrink-0 place-items-center rounded-full text-ink-3", className)}
          style={{ width: size, height: size }}
          aria-hidden
        >
          <Icon className="size-[55%]" />
        </span>
      );
    }
  }
}
