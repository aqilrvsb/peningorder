import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fetch ALL rows from a Supabase query using pagination.
 * Supabase/PostgREST has a server-side max_rows limit (default 1000).
 * This function fetches in batches to guarantee all rows are returned.
 *
 * @param buildQuery - A function that returns a fresh query builder (called per page)
 * @returns All rows concatenated
 */
export async function fetchAllRows<T = any>(
  buildQuery: () => any
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    const rows = (data || []) as T[];
    allData = allData.concat(rows);
    if (rows.length < PAGE_SIZE) break;
    page++;
  }

  return allData;
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

/**
 * Get start of current month in Malaysia timezone (UTC+8)
 * Returns date string in YYYY-MM-DD format
 */
export function getMalaysiaStartOfMonth(): string {
  const now = new Date();
  const year = now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" });
  const month = now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", month: "2-digit" });
  return `${year}-${month}-01`;
}

/**
 * Get end of current month in Malaysia timezone (UTC+8)
 * Returns date string in YYYY-MM-DD format
 */
export function getMalaysiaEndOfMonth(): string {
  const now = new Date();
  const year = parseInt(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", year: "numeric" }));
  const month = parseInt(now.toLocaleString("en-US", { timeZone: "Asia/Kuala_Lumpur", month: "numeric" }));
  // Get last day of month by going to first day of next month and subtracting 1
  const lastDay = new Date(year, month, 0).getDate();
  const monthStr = month.toString().padStart(2, "0");
  return `${year}-${monthStr}-${lastDay.toString().padStart(2, "0")}`;
}

// Map a 5-digit Malaysian postcode to its state (negeri), matching the
// uppercase values in NEGERI_OPTIONS. State is deterministic from the
// postcode prefix. Returns null for unknown/invalid postcodes.
export function postcodeToNegeri(postcode: string): string | null {
  if (!/^\d{5}$/.test(postcode)) return null;
  const n = parseInt(postcode, 10);
  const inRange = (a: number, b: number) => n >= a && n <= b;

  if (inRange(1000, 2999)) return "PERLIS";
  if (inRange(5000, 9999)) return "KEDAH";
  if (inRange(10000, 14999)) return "PULAU PINANG";
  if (inRange(15000, 18999)) return "KELANTAN";
  if (inRange(20000, 24999)) return "TERENGGANU";
  if (inRange(25000, 28999) || inRange(39000, 39999) || inRange(49000, 49999) || inRange(69000, 69999)) return "PAHANG";
  if (inRange(30000, 36999)) return "PERAK";
  if (inRange(40000, 48999) || inRange(63000, 68999)) return "SELANGOR";
  if (inRange(62000, 62999)) return "PUTRAJAYA";
  if (inRange(50000, 60999)) return "KUALA LUMPUR";
  if (inRange(70000, 73999)) return "NEGERI SEMBILAN";
  if (inRange(75000, 78999)) return "MELAKA";
  if (inRange(79000, 86999)) return "JOHOR";
  if (inRange(87000, 87999)) return "LABUAN";
  if (inRange(88000, 91999)) return "SABAH";
  if (inRange(93000, 98999)) return "SARAWAK";
  return null;
}
