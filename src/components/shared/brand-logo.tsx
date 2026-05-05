import Image from "next/image";
import { cn } from "@/lib/web-utils";

export function BrandLogo({
  size = 40,
  className,
  priority = false
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo/icon.png"
      alt="Duali"
      width={size}
      height={size}
      priority={priority}
      className={cn("rounded-2xl object-cover shadow-soft", className)}
    />
  );
}
