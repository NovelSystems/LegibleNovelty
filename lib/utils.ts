import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui's class-merge helper: clsx for conditional joins, tailwind-merge to
// resolve conflicting Tailwind utilities (the last one wins).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
