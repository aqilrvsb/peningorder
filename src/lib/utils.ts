import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get current date in Malaysia timezone (UTC+8)
 * Returns date string in YYYY-MM-DD format
 */
export function getMalaysiaDate(): string {
  const now = new Date();
  // Format directly in Malaysia timezone
  const year = now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" });
  const month = now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit" });
  const day = now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit" });
  return `${year}-${month}-${day}`;
}

/**
 * Get yesterday's date in Malaysia timezone (UTC+8)
 * Returns date string in YYYY-MM-DD format
 */
export function getMalaysiaYesterday(): string {
  const now = new Date();
  // Subtract 1 day in milliseconds
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  // Format directly in Malaysia timezone
  const year = yesterday.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" });
  const month = yesterday.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit" });
  const day = yesterday.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit" });
  return `${year}-${month}-${day}`;
}
