import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Loader2, Trash2, Save, Eye, ScanLine, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { getMalaysiaDate } from "@/lib/utils";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Set the workerSrc for PDF.js using the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ParsedWaybill {
  id: string;
  tracking_number: string;
  customer_name: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  quantity: number;
  product_sku: string;
  product_name: string;
  total_price: number;
  payment_method: string;
  jenis_closing: string;
  date_order: string;
  platform: string;
  raw_text: string;
  selected: boolean;
  isDuplicate?: boolean;
  bundle_id?: string | null;
}

const LogisticScanWaybill = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = getMalaysiaDate();

  const [platform, setPlatform] = useState<string>("Tiktok");
  const [bulkDateOrder, setBulkDateOrder] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parsedWaybills, setParsedWaybills] = useState<ParsedWaybill[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Raw text modal state
  const [rawTextModalOpen, setRawTextModalOpen] = useState(false);
  const [selectedRawText, setSelectedRawText] = useState("");

  // Fetch all active bundles for SKU matching
  const { data: allBundles = [] } = useQuery({
    queryKey: ["all-logistic-bundles-scan"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistic_bundles")
        .select("id, name, sku, base_cost")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  // Default bundle configuration - use first GSI bundle if found
  const gsiBundleMatch = allBundles.find((b: any) => b.sku && b.sku.toUpperCase().includes("GSI"));
  const DEFAULT_BUNDLE = {
    sku: gsiBundleMatch ? gsiBundleMatch.sku : "GSI",
    name: gsiBundleMatch ? gsiBundleMatch.name : "GSI",
    id: gsiBundleMatch ? gsiBundleMatch.id : null as string | null,
  };

  // Product matching - same logic as woocommerce-webhook
  // Method 1: Match "SET X" pattern in product name → find bundle name containing "SET X"
  // Method 2: Match BOTOL/UNIT count → find bundle with SKU matching "GSI-{count}"
  // Method 3: Exact Seller SKU match
  // Fallback: Default GSI bundle
  // Note: unit (quantity) is always 1 — each waybill page = 1 bundle ordered
  const matchBundleFromDB = (sellerSku: string, waybillProductText: string): { sku: string; name: string; id: string | null } => {
    let bundleSku = DEFAULT_BUNDLE.sku;
    let bundleName = DEFAULT_BUNDLE.name;
    let bundleId: string | null = DEFAULT_BUNDLE.id;
    let matched = false;

    const productNameLower = waybillProductText.toLowerCase();

    // Method 1: Match "SET X" pattern in product name (e.g., "SET C" → find bundle named "SET C ...")
    const setIndex = productNameLower.indexOf('set');
    let setIdentifier = '';
    if (setIndex >= 0) {
      if (productNameLower.substring(setIndex).startsWith('set bundle')) {
        setIdentifier = 'SET BUNDLE';
      } else if (setIndex + 5 <= waybillProductText.length) {
        const afterSet = waybillProductText.substring(setIndex + 3, setIndex + 5).trim();
        if (afterSet.length >= 1 && /^[A-Za-z]$/.test(afterSet.charAt(0))) {
          setIdentifier = 'SET ' + afterSet.charAt(0).toUpperCase();
        }
      }
    }

    if (setIdentifier && !matched) {
      const setMatch = allBundles.find((b: any) =>
        b.name && b.name.toLowerCase().includes(setIdentifier.toLowerCase())
      );
      if (setMatch) {
        bundleSku = setMatch.sku || "";
        bundleName = setMatch.name;
        bundleId = setMatch.id;
        matched = true;
      }
    }

    // Method 2: Match by BOTOL/UNIT count → find bundle with SKU matching "GSI-{count}"
    if (!matched && !setIdentifier) {
      let unitCount = 0;

      // Try BOTOL pattern first
      const botolIndex = productNameLower.indexOf('botol');
      if (botolIndex >= 2) {
        const beforeBotol = waybillProductText.substring(Math.max(0, botolIndex - 3), botolIndex);
        const digitsOnly = beforeBotol.replace(/\D/g, '');
        if (digitsOnly) {
          unitCount = parseInt(digitsOnly, 10);
        }
      }

      // If no BOTOL found, try UNIT pattern
      if (unitCount === 0) {
        const unitIndex = productNameLower.indexOf('unit');
        if (unitIndex >= 2) {
          const beforeUnit = waybillProductText.substring(Math.max(0, unitIndex - 3), unitIndex);
          const digitsOnly = beforeUnit.replace(/\D/g, '');
          if (digitsOnly) {
            unitCount = parseInt(digitsOnly, 10);
          }
        }
      }

      if (unitCount > 0) {
        const unitRegex = new RegExp(`^gsi-${unitCount}(\\s*\\+|$)`, 'i');
        const unitMatch = allBundles.find((b: any) => b.sku && unitRegex.test(b.sku));
        if (unitMatch) {
          bundleSku = unitMatch.sku || "";
          bundleName = unitMatch.name;
          bundleId = unitMatch.id;
          matched = true;
        }
      }
    }

    // Method 3: Exact Seller SKU match against bundle SKU
    if (!matched && sellerSku) {
      const exactMatch = allBundles.find((b: any) => b.sku && b.sku.toUpperCase() === sellerSku.toUpperCase());
      if (exactMatch) {
        bundleSku = exactMatch.sku || "";
        bundleName = exactMatch.name;
        bundleId = exactMatch.id;
        matched = true;
      }
    }

    return { sku: bundleSku, name: bundleName, id: bundleId };
  };

  // Parse TikTok waybill text (J&T Express format)
  const parseTiktokWaybill = (text: string, pageNum: number): ParsedWaybill | null => {
    try {
      console.log("=== TikTok Raw Text ===");
      console.log(text);

      const normalizedText = text.replace(/\s+/g, " ");

      // Find Order ID
      let trackingNumber = "";
      const orderIdMatch = text.match(/Order\s*ID[:\s]*(\d{15,20})/i);
      if (orderIdMatch) {
        trackingNumber = orderIdMatch[1];
      } else {
        const numericMatch = text.match(/\b(\d{18})\b/);
        if (numericMatch) {
          trackingNumber = numericMatch[1];
        }
      }

      // Customer name - before "Receiver"
      let customerName = "";
      let afterReceiverText = "";
      const receiverIdx = normalizedText.indexOf("Receiver");

      if (receiverIdx > 0) {
        const beforeReceiver = normalizedText.substring(0, receiverIdx);
        afterReceiverText = normalizedText.substring(receiverIdx + 8);

        const nameWithBinMatch = beforeReceiver.match(/([A-Z][A-Z\.\s]+(?:BINTI|BIN|BINTE)\s+[A-Z][A-Z\.\s]+?)\s*$/i);
        if (nameWithBinMatch) {
          customerName = nameWithBinMatch[1].trim();
        } else {
          const simpleNameMatch = beforeReceiver.match(/([A-Za-z][A-Za-z0-9\.]+(?:\s+[A-Za-z0-9\.]+)*)\s*$/);
          if (simpleNameMatch) {
            customerName = simpleNameMatch[1].trim();
          }
        }
        if (customerName) {
          customerName = customerName
            .replace(/^(Order\s+Created\s+time|Order\s+Created|Sender|Tracking\s+ID|Shipping\s+Label)\s+/i, "")
            .trim();
        }
      }

      // Address - after "Receiver"
      let address = "";
      const statesList = ["JOHOR", "KEDAH", "KELANTAN", "MELAKA", "NEGERI SEMBILAN", "PAHANG", "PERAK", "PERLIS", "PULAU PINANG", "SABAH", "SARAWAK", "SELANGOR", "TERENGGANU", "KUALA LUMPUR", "LABUAN", "PUTRAJAYA"];

      if (afterReceiverText) {
        const statesRegex = statesList.join("|");
        const addressRegex = new RegExp(`^\\s*([A-Z0-9][A-Z0-9\\s,\\.\\-\\(\\)\\/]+(?:${statesRegex}))`, "i");
        const addressMatch = afterReceiverText.match(addressRegex);
        if (addressMatch) {
          address = addressMatch[1].trim().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
        }
      }

      // Postcode - skip sender postcodes
      let postcode = "";
      const allPostcodes = normalizedText.match(/\b(\d{5})\b/g) || [];
      const senderPostcodes = ["15000", "15100", "15200", "15300", "15400"];
      for (const pc of allPostcodes) {
        if (!senderPostcodes.includes(pc)) {
          postcode = pc;
          break;
        }
      }

      // State from address
      let state = "";
      if (address) {
        for (const s of statesList) {
          if (address.toUpperCase().includes(s)) {
            state = s;
            break;
          }
        }
      }
      if (!state && afterReceiverText) {
        for (const s of statesList) {
          if (s !== "KELANTAN" && afterReceiverText.toUpperCase().includes(s)) {
            state = s;
            break;
          }
        }
      }

      // Seller SKU
      let sellerSku = "";
      const sellerSkuMatch = normalizedText.match(/Seller\s*SKU\s+([A-Z0-9][A-Z0-9\s\+\-]*?)(?=\s+\d|\s+Qty)/i);
      if (sellerSkuMatch) {
        sellerSku = sellerSkuMatch[1].trim();
      }

      // Product name text for bundle matching (contains SET/BOTOL/UNIT info)
      let waybillProductText = "";
      const productTextMatch = normalizedText.match(/Product\s*Name\s+(.+?)(?=\s+Qty\s*Total)/i);
      if (productTextMatch) {
        waybillProductText = productTextMatch[1].trim().toUpperCase();
      }

      // Match bundle from DB - try product name first, then full text
      const matchedBundle = matchBundleFromDB(sellerSku, waybillProductText || normalizedText);

      // Quantity: 1 waybill page = 1 bundle ordered
      const quantity = 1;

      // Date order
      let dateOrder = bulkDateOrder;
      if (!dateOrder) {
        const dateMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
        if (dateMatch) {
          dateOrder = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        } else {
          dateOrder = today;
        }
      }

      console.log("Parsed:", { trackingNumber, customerName, address, postcode, state, quantity, bundle: matchedBundle.name, sellerSku });

      if (trackingNumber) {
        return {
          id: `waybill-${pageNum}-${Date.now()}`,
          tracking_number: trackingNumber,
          customer_name: customerName,
          phone: "",
          address: address,
          postcode: postcode,
          city: "",
          state: state,
          quantity: quantity,
          product_sku: matchedBundle.sku,
          product_name: matchedBundle.name,
          total_price: 0,
          payment_method: /\bCOD\b/.test(normalizedText) ? "COD" : "Online Transfer",
          jenis_closing: "Shop",
          date_order: dateOrder,
          platform: "Tiktok",
          raw_text: text,
          selected: true,
          bundle_id: matchedBundle.id,
        };
      }

      return null;
    } catch (error) {
      console.error("Error parsing TikTok waybill:", error);
      return null;
    }
  };

  // Shopee page interfaces
  interface ShopeeShippingPage {
    orderId: string;
    customerName: string;
    phone: string;
    address: string;
    postcode: string;
    state: string;
    isCOD: boolean;
    dateOrder: string;
    rawText: string;
  }

  interface ShopeePackingPage {
    orderId: string;
    productName: string;
    productSku: string;
    quantity: number;
    totalPrice: number;
    rawText: string;
    bundleId: string | null;
  }

  // Build position-sorted line text from PDF.js text items (for Shopee two-column layout)
  const buildLineText = (textItems: any[]): string => {
    const items = textItems
      .filter((item: any) => item.str.trim().length > 0)
      .map((item: any) => ({
        text: item.str.trim(),
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
      }));

    if (items.length === 0) return "";

    items.sort((a: any, b: any) => b.y - a.y || a.x - b.x);

    const lines: string[] = [];
    let currentLine = items[0].text;
    let lastY = items[0].y;

    for (let i = 1; i < items.length; i++) {
      if (Math.abs(items[i].y - lastY) > 5) {
        lines.push(currentLine);
        currentLine = items[i].text;
        lastY = items[i].y;
      } else {
        currentLine += " " + items[i].text;
      }
    }
    lines.push(currentLine);

    return lines.join("\n");
  };

  // Parse Shopee shipping label page
  const parseShopeeShippingPage = (lineText: string): ShopeeShippingPage | null => {
    try {
      console.log("=== Shopee Shipping (line-sorted) ===");
      console.log(lineText);

      const lines = lineText.split("\n");
      const fullText = lineText.replace(/\n/g, " ");

      let orderId = "";
      const orderIdMatch = fullText.match(/Order\s*ID[:\s]*([A-Z0-9]{10,20})/i);
      if (orderIdMatch) {
        orderId = orderIdMatch[1];
      }

      const isCOD = /\bCOD\b/.test(fullText);

      let recipientLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/Recipient\s*Details|Penerima/i.test(lines[i])) {
          recipientLineIdx = i;
          break;
        }
      }

      let customerName = "";
      let address = "";
      let postcode = "";
      let phone = "";

      if (recipientLineIdx >= 0) {
        for (let i = recipientLineIdx; i < lines.length; i++) {
          const line = lines[i];

          if (/Select\s*.*Self|Scan\s*QR|Seller\s*Details/i.test(line)) break;

          if (!customerName) {
            const nameMatch = line.match(/Name[:\s]+(.+)/i);
            if (nameMatch) {
              customerName = nameMatch[1].trim();
            }
          }

          if (!address) {
            const addrMatch = line.match(/Address[:\s]+(.+)/i);
            if (addrMatch) {
              let addrParts = [addrMatch[1].trim()];
              for (let j = i + 1; j < lines.length; j++) {
                if (/Postcode|Name:|Address:|Select|Scan|Seller/i.test(lines[j])) break;
                if (lines[j].length > 3 && !/^[A-Z0-9\-\.]+$/.test(lines[j].trim())) {
                  addrParts.push(lines[j].trim());
                }
              }
              address = addrParts.join(", ")
                .replace(/\s*SPXMY\d+/gi, "")
                .replace(/\s*,\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
            }
          }

          if (!postcode && i > recipientLineIdx) {
            const pcLabelMatch = line.match(/(?:Postcode|Poskod)[:\s]+.*?(\d{5})/i);
            if (pcLabelMatch) {
              postcode = pcLabelMatch[1];
            }
            if (!postcode && /(?:Postcode|Poskod)/i.test(line)) {
              const pcNumMatch = line.match(/\b(\d{5})\b/);
              if (pcNumMatch) {
                postcode = pcNumMatch[1];
              }
              if (!postcode && i + 1 < lines.length) {
                const nextLineMatch = lines[i + 1].match(/\b(\d{5})\b/);
                if (nextLineMatch) {
                  postcode = nextLineMatch[1];
                }
              }
            }
            if (!postcode && i > recipientLineIdx + 2 && /^\s*\d{5}\s*$/.test(line)) {
              postcode = line.trim();
            }
          }

          if (!phone) {
            const phoneMatch = line.match(/\b(0\d{1,2}[\s\-]?\d{3,4}[\s\-]?\d{4})\b/);
            if (phoneMatch) {
              phone = phoneMatch[1].replace(/[\s\-]/g, "");
            }
          }
        }
      }

      // Fallback postcode
      if (!postcode) {
        const allPostcodeMatches = fullText.match(/Postcode[:\s]+(\d{5})/gi) || [];
        if (allPostcodeMatches.length > 0) {
          const lastMatch = allPostcodeMatches[allPostcodeMatches.length - 1].match(/(\d{5})/);
          if (lastMatch) {
            postcode = lastMatch[1];
          }
        }
      }

      if (!postcode && address) {
        const addrPostcodeMatch = address.match(/\b(\d{5})\b/);
        if (addrPostcodeMatch) {
          postcode = addrPostcodeMatch[1];
        }
      }

      // State from address
      let state = "";
      const statesList = ["JOHOR", "KEDAH", "KELANTAN", "MELAKA", "NEGERI SEMBILAN", "PAHANG", "PERAK", "PERLIS", "PULAU PINANG", "PENANG", "SABAH", "SARAWAK", "SELANGOR", "TERENGGANU", "KUALA LUMPUR", "LABUAN", "PUTRAJAYA", "W.P. KUALA LUMPUR"];
      const addrUpper = address.toUpperCase();
      for (const s of statesList) {
        if (addrUpper.includes(s)) {
          state = s === "PENANG" ? "PULAU PINANG" : s === "W.P. KUALA LUMPUR" ? "KUALA LUMPUR" : s;
          break;
        }
      }

      // Date
      let dateOrder = bulkDateOrder;
      if (!dateOrder) {
        const dateMatch = fullText.match(/Ship\s*By\s*Date[:\s]*(\d{2})-(\d{2})-(\d{4})/i);
        if (dateMatch) {
          dateOrder = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        } else {
          dateOrder = today;
        }
      }

      if (orderId) {
        return {
          orderId,
          customerName,
          phone,
          address,
          postcode,
          state,
          isCOD,
          dateOrder,
          rawText: lineText,
        };
      }

      return null;
    } catch (error) {
      console.error("Error parsing Shopee shipping page:", error);
      return null;
    }
  };

  // Parse Shopee packing list page
  const parseShopeePackingPage = (lineText: string): ShopeePackingPage | null => {
    try {
      console.log("=== Shopee Packing (line-sorted) ===");
      console.log(lineText);

      const flatText = lineText.replace(/\n/g, " ");
      if (!/Packing\s+List/i.test(flatText)) {
        return null;
      }

      let orderId = "";
      const orderIdMatch = flatText.match(/Order\s*ID[:\s]*([A-Z0-9]{10,20})/i);
      if (orderIdMatch) {
        orderId = orderIdMatch[1];
      }

      // Extract total price from packing list (last decimal number e.g. "79.00")
      let totalPrice = 0;
      const priceMatches = flatText.match(/(\d+\.\d{2})/g);
      if (priceMatches && priceMatches.length > 0) {
        totalPrice = parseFloat(priceMatches[priceMatches.length - 1]) || 0;
      }

      // Try to match bundle from DB using product text
      const matchedBundle = matchBundleFromDB("", flatText);

      // Check if the match is a real match (not just default fallback)
      // For Shopee, product names are generic - only trust SET pattern matches
      const hasSetPattern = /\bset\s+[a-z]/i.test(flatText);
      const hasBotolPattern = /\d+\s*botol/i.test(flatText);
      const isRealMatch = hasSetPattern || hasBotolPattern;

      // Quantity: 1 waybill = 1 bundle ordered
      const quantity = 1;

      if (orderId) {
        return {
          orderId,
          productName: isRealMatch ? matchedBundle.name : "",
          productSku: isRealMatch ? matchedBundle.sku : "",
          quantity,
          totalPrice,
          rawText: lineText,
          bundleId: isRealMatch ? matchedBundle.id : null,
        };
      }

      return null;
    } catch (error) {
      console.error("Error parsing Shopee packing page:", error);
      return null;
    }
  };

  // Merge Shopee shipping and packing pages
  const mergeShopeePages = (
    shippingPages: ShopeeShippingPage[],
    packingPages: ShopeePackingPage[]
  ): ParsedWaybill[] => {
    const waybills: ParsedWaybill[] = [];

    for (const shipping of shippingPages) {
      const packing = packingPages.find(p => p.orderId === shipping.orderId);

      waybills.push({
        id: `waybill-${shipping.orderId}-${Date.now()}`,
        tracking_number: shipping.orderId,
        customer_name: shipping.customerName,
        phone: shipping.phone,
        address: shipping.address,
        postcode: shipping.postcode,
        city: "",
        state: shipping.state,
        quantity: packing?.quantity || 1,
        product_sku: packing?.productSku || "",
        product_name: packing?.productName || "",
        total_price: packing?.totalPrice || 0,
        payment_method: shipping.isCOD ? "COD" : "Online Transfer",
        jenis_closing: "Shop",
        date_order: shipping.dateOrder,
        platform: "Shopee",
        raw_text: `=== SHIPPING PAGE ===\n${shipping.rawText}\n\n=== PACKING PAGE ===\n${packing?.rawText || "Not found"}`,
        selected: true,
        bundle_id: packing?.bundleId || null,
      });
    }

    return waybills;
  };

  // Core PDF processing
  const processPDFData = async (arrayBuffer: ArrayBuffer) => {
    setIsProcessing(true);
    setParsedWaybills([]);

    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const waybills: ParsedWaybill[] = [];

      console.log(`PDF loaded: ${numPages} pages`);
      toast.info(`Processing ${numPages} page(s)...`);

      if (platform === "Tiktok") {
        for (let i = 1; i <= numPages; i++) {
          console.log(`Processing TikTok page ${i}/${numPages}...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items
            .map((item: any) => item.str)
            .join(" ");

          console.log(`Page ${i} text length: ${text.length}, preview: ${text.substring(0, 100)}`);
          const parsedWaybill = parseTiktokWaybill(text, i);
          console.log(`Page ${i} parse result:`, parsedWaybill ? `OK - tracking: ${parsedWaybill.tracking_number}` : "FAILED (null)");
          if (parsedWaybill) {
            waybills.push(parsedWaybill);
          }
        }
        console.log(`TikTok total parsed: ${waybills.length}/${numPages}`);
      } else if (platform === "Shopee") {
        const shippingPages: ShopeeShippingPage[] = [];
        const packingPages: ShopeePackingPage[] = [];

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const lineText = buildLineText(textContent.items);

          const packingData = parseShopeePackingPage(lineText);
          if (packingData) {
            packingPages.push(packingData);
            continue;
          }

          const shippingData = parseShopeeShippingPage(lineText);
          if (shippingData) {
            shippingPages.push(shippingData);
          }
        }

        const mergedWaybills = mergeShopeePages(shippingPages, packingPages);
        waybills.push(...mergedWaybills);

        console.log(`Shopee: Found ${shippingPages.length} shipping pages, ${packingPages.length} packing pages, merged into ${mergedWaybills.length} orders`);
      }

      // Check for duplicate tracking numbers in the database
      if (waybills.length > 0) {
        const trackingNumbers = waybills
          .map(w => w.tracking_number)
          .filter(t => t.length > 0);

        if (trackingNumbers.length > 0) {
          const { data: existingOrders } = await supabase
            .from("customer_purchases")
            .select("tracking_number")
            .in("tracking_number", trackingNumbers);

          if (existingOrders && existingOrders.length > 0) {
            const existingSet = new Set(
              existingOrders.map((o: any) => o.tracking_number)
            );

            for (const w of waybills) {
              if (existingSet.has(w.tracking_number)) {
                w.isDuplicate = true;
                w.selected = false;
              }
            }

            const dupCount = waybills.filter(w => w.isDuplicate).length;
            toast.warning(`${dupCount} duplicate tracking number(s) found - highlighted in red and deselected`);
          }
        }
      }

      setParsedWaybills(waybills);

      if (waybills.length === 0) {
        toast.warning("No waybills could be parsed from the PDF. Please check the format.");
      } else {
        const pagesPerOrder = platform === "Shopee" ? " (2 pages per order)" : "";
        toast.success(`Successfully parsed ${waybills.length} order(s) from ${numPages} page(s)${pagesPerOrder}`);
      }
    } catch (error: any) {
      console.error("Error processing PDF:", error);
      toast.error(`Failed to process PDF: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      setSelectedFile(file);
      file.arrayBuffer().then(buf => processPDFData(buf));
    }
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    setParsedWaybills(prev =>
      prev.map(w => w.isDuplicate ? w : { ...w, selected: checked })
    );
  };

  const handleSelectWaybill = (id: string, checked: boolean) => {
    setParsedWaybills(prev =>
      prev.map(w => {
        if (w.id !== id) return w;
        if (w.isDuplicate) return w;
        return { ...w, selected: checked };
      })
    );
  };

  const handleDeleteSelected = () => {
    const count = parsedWaybills.filter(w => w.selected).length;
    if (count === 0) {
      toast.error("Please select waybills to delete");
      return;
    }
    setParsedWaybills(prev => prev.filter(w => !w.selected));
    toast.success(`Removed ${count} waybill(s) from the list`);
  };

  const updateWaybillField = (id: string, field: keyof ParsedWaybill, value: any) => {
    setParsedWaybills(prev =>
      prev.map(w => w.id === id ? { ...w, [field]: value } : w)
    );
  };

  const MALAYSIAN_STATES = [
    "JOHOR", "KEDAH", "KELANTAN", "MELAKA", "NEGERI SEMBILAN", "PAHANG",
    "PERAK", "PERLIS", "PULAU PINANG", "SABAH", "SARAWAK", "SELANGOR",
    "TERENGGANU", "KUALA LUMPUR", "LABUAN", "PUTRAJAYA",
  ];

  const viewRawText = (waybill: ParsedWaybill) => {
    setSelectedRawText(waybill.raw_text);
    setRawTextModalOpen(true);
  };

  // Save waybills to customer_purchases (DFR EMPIRE field mapping)
  const saveWaybills = async () => {
    const selectedWaybills = parsedWaybills.filter(w => w.selected);

    if (selectedWaybills.length === 0) {
      toast.error("Please select at least one waybill to save");
      return;
    }

    const result = await Swal.fire({
      icon: "question",
      title: "Save Orders?",
      text: `Are you sure you want to create ${selectedWaybills.length} order(s)?`,
      showCancelButton: true,
      confirmButtonColor: "#22c55e",
      confirmButtonText: "Yes, Save",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    setIsSaving(true);

    try {
      for (const w of selectedWaybills) {
        const isTiktok = w.platform === "Tiktok";
        const kurierValue = isTiktok ? "Kurier Tiktok" : "Kurier Shopee";

        // Look up bundle base_cost for cost_baseproduct (same as OrderForm - base_cost only, not multiplied by quantity)
        const bundle = w.bundle_id ? allBundles.find((b: any) => b.id === w.bundle_id) : null;
        const baseCost = bundle ? (Number(bundle.base_cost) || 0) : 0;

        const { error } = await supabase
          .from("customer_purchases")
          .insert({
            marketer_id_staff: null, // Marketplace orders - no marketer
            name_customer: w.customer_name,
            phone_customer: w.phone || null,
            address_customer: w.address,
            postcode_customer: w.postcode || null,
            city_customer: w.city || null,
            state_customer: w.state,
            unit: w.quantity,
            total_sale: w.total_price,
            cost_baseproduct: baseCost,
            type_payment: w.payment_method || "COD",
            jenis_closing: w.jenis_closing || "Shop",
            jenis_platform: w.platform,
            tracking_number: w.tracking_number,
            delivery_status: "Shipped",
            seos: "Shipped",
            kurier: kurierValue,
            date_order: w.date_order || today,
            date_processed: w.date_order || today,
            bundle_id: w.bundle_id || null,
            nota_staff: w.product_name || null,
          });

        if (error) throw error;
      }

      toast.success(`Successfully created ${selectedWaybills.length} order(s)`);

      // Invalidate queries so data appears immediately
      queryClient.invalidateQueries({ queryKey: ["logistics-orders"] });
      queryClient.invalidateQueries({ queryKey: ["logistics-order"] });
      queryClient.invalidateQueries({ queryKey: ["logistics-processed"] });
      queryClient.invalidateQueries({ queryKey: ["customer_purchases"] });

      // Clear saved waybills from list
      setParsedWaybills(prev => prev.filter(w => !w.selected));

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSelectedFile(null);
    } catch (error: any) {
      console.error("Error saving waybills:", error);
      toast.error(`Failed to save orders: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = parsedWaybills.filter(w => w.selected).length;
  const nonDuplicates = parsedWaybills.filter(w => !w.isDuplicate);
  const duplicateCount = parsedWaybills.filter(w => w.isDuplicate).length;
  const isAllSelected = nonDuplicates.length > 0 && nonDuplicates.every(w => w.selected);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scan Waybill</h1>
        <p className="text-muted-foreground mt-2">
          Upload waybill PDF to auto-create orders
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Upload Waybill PDF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(val) => { setPlatform(val); if (val !== "Tiktok") setUploadMethod("file"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tiktok">TikTok Shop</SelectItem>
                  <SelectItem value="Shopee">Shopee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Order</Label>
              <Input
                type="date"
                value={bulkDateOrder}
                onChange={(e) => setBulkDateOrder(e.target.value)}
                placeholder="Use waybill date if empty"
              />
              <p className="text-xs text-muted-foreground">Optional - uses waybill date if empty</p>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={isProcessing}
              />
              {isProcessing && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{selectedFile.name}</span>
              </div>
            )}
          </div>

          <div className="p-4 bg-muted rounded-lg space-y-3">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Bundle Matching
              </h4>
              <p className="text-sm text-muted-foreground">
                Products will be matched against active bundles by SKU or name keywords.
                {allBundles.length > 0 ? ` (${allBundles.length} active bundles)` : " No active bundles found."}
              </p>
            </div>
            {platform === "Shopee" && (
              <div className="pt-2 border-t">
                <h4 className="font-medium mb-1 text-orange-600">Shopee Format</h4>
                <p className="text-sm text-muted-foreground">
                  Shopee waybills use 2 pages per order:
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  <li>Page 1: Shipping label (tracking, customer, address)</li>
                  <li>Page 2: Packing list (product, quantity, price)</li>
                </ul>
              </div>
            )}
            {platform === "Tiktok" && (
              <div className="pt-2 border-t">
                <h4 className="font-medium mb-1 text-pink-600">TikTok Format</h4>
                <p className="text-sm text-muted-foreground">
                  TikTok waybills use 1 page per order with all information on one label.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parsed Waybills Preview */}
      {parsedWaybills.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Parsed Waybills ({parsedWaybills.length})
                {duplicateCount > 0 && (
                  <span className="text-sm font-normal text-red-600 bg-red-100 px-2 py-0.5 rounded">
                    {duplicateCount} duplicate(s)
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-2">
                {selectedCount > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove ({selectedCount})
                  </Button>
                )}
                <Button
                  onClick={saveWaybills}
                  disabled={isSaving || selectedCount === 0}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Orders ({selectedCount})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>No</TableHead>
                    <TableHead>Date Order</TableHead>
                    <TableHead>Tracking No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Postcode</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Bundle</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Total (RM)</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Jenis Closing</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedWaybills.map((waybill, index) => (
                    <TableRow
                      key={waybill.id}
                      className={waybill.isDuplicate ? "bg-red-50 dark:bg-red-950/30" : ""}
                    >
                      <TableCell>
                        {waybill.isDuplicate ? (
                          <span className="text-xs text-red-600 font-medium">DUP</span>
                        ) : (
                          <Checkbox
                            checked={waybill.selected}
                            onCheckedChange={(checked) =>
                              handleSelectWaybill(waybill.id, !!checked)
                            }
                          />
                        )}
                      </TableCell>
                      <TableCell className={waybill.isDuplicate ? "text-red-600" : ""}>{index + 1}</TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={waybill.date_order}
                          onChange={(e) => updateWaybillField(waybill.id, "date_order", e.target.value)}
                          className="h-8 w-[130px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={waybill.tracking_number}
                          onChange={(e) => updateWaybillField(waybill.id, "tracking_number", e.target.value)}
                          className={`h-8 w-[160px] font-mono text-xs ${waybill.isDuplicate ? "border-red-400 text-red-600 bg-red-50" : ""}`}
                          readOnly={waybill.isDuplicate}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={waybill.customer_name}
                          onChange={(e) => updateWaybillField(waybill.id, "customer_name", e.target.value)}
                          className="h-8 w-[140px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={waybill.phone}
                          onChange={(e) => updateWaybillField(waybill.id, "phone", e.target.value)}
                          className="h-8 w-[110px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={waybill.address}
                          onChange={(e) => updateWaybillField(waybill.id, "address", e.target.value)}
                          className="h-8 w-[200px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={waybill.postcode}
                          onChange={(e) => updateWaybillField(waybill.id, "postcode", e.target.value)}
                          className="h-8 w-[70px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={waybill.city}
                          onChange={(e) => updateWaybillField(waybill.id, "city", e.target.value)}
                          className="h-8 w-[100px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={waybill.state}
                          onValueChange={(val) => updateWaybillField(waybill.id, "state", val)}
                        >
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue placeholder="State" />
                          </SelectTrigger>
                          <SelectContent>
                            {MALAYSIAN_STATES.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={waybill.bundle_id || ""}
                          onValueChange={(val) => {
                            const bundle = allBundles.find((b: any) => b.id === val);
                            if (bundle) {
                              setParsedWaybills(prev =>
                                prev.map(w => w.id === waybill.id ? {
                                  ...w,
                                  bundle_id: bundle.id,
                                  product_name: bundle.name,
                                  product_sku: bundle.sku || "",
                                } : w)
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 w-[180px] text-xs">
                            <SelectValue placeholder="Select bundle" />
                          </SelectTrigger>
                          <SelectContent>
                            {allBundles.map((b: any) => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">{waybill.product_sku}</span>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={waybill.quantity}
                          onChange={(e) => updateWaybillField(waybill.id, "quantity", parseInt(e.target.value) || 0)}
                          className="h-8 w-[60px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={waybill.total_price}
                          onChange={(e) => updateWaybillField(waybill.id, "total_price", parseFloat(e.target.value) || 0)}
                          className="h-8 w-[80px] text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={waybill.payment_method}
                          onValueChange={(val) => updateWaybillField(waybill.id, "payment_method", val)}
                        >
                          <SelectTrigger className="h-8 w-[120px] text-xs">
                            <SelectValue placeholder="Payment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="COD">COD</SelectItem>
                            <SelectItem value="Online Transfer">Online Transfer</SelectItem>
                            <SelectItem value="Cash">Cash</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={waybill.jenis_closing}
                          onValueChange={(val) => updateWaybillField(waybill.id, "jenis_closing", val)}
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue placeholder="Closing" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Shop">Shop</SelectItem>
                            <SelectItem value="Direct">Direct</SelectItem>
                            <SelectItem value="Live">Live</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={waybill.platform}
                          onValueChange={(val) => updateWaybillField(waybill.id, "platform", val)}
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue placeholder="Platform" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Tiktok">Tiktok</SelectItem>
                            <SelectItem value="Shopee">Shopee</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewRawText(waybill)}
                          title="View Raw Text"
                        >
                          <Eye className="h-4 w-4 text-blue-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw Text Modal */}
      <Dialog open={rawTextModalOpen} onOpenChange={setRawTextModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Raw Extracted Text</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={selectedRawText}
              readOnly
              className="min-h-[300px] font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setRawTextModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticScanWaybill;
