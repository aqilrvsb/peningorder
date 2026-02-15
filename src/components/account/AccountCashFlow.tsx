import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getMalaysiaDate } from "@/lib/utils";
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  Upload,
  FileText,
  Image,
  Eye,
  Download,
  TrendingUp,
  TrendingDown,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { put } from "@vercel/blob";

const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;

const BANK_OPTIONS = ["DZI Holistik", "DFR Empire", "AEON Bank", "GX Bank", "TNG"] as const;

// Cash In
const CASH_IN_JENIS = ["Rekod Jualan", "Rekod Selain Jualan"] as const;
const CASH_IN_KATEGORI = [
  "Collection COD Ninja Van",
  "Manual Payment",
  "Billplz",
  "Agent",
  "TikTok",
  "Shopee",
] as const;

// Cash Out
const CASH_OUT_JENIS = ["Rekod Belian", "Rekod Belanja", "Rekod Selain Belanja"] as const;
const CASH_OUT_PLATFORM = ["Facebook", "TikTok", "Shopee", "Database", "Google", "Office"] as const;
const CASH_OUT_KATEGORI = ["Overhead", "Marketing", "Other", "Inventory"] as const;

interface CashFlow {
  id: string;
  flow_type: string;
  bank: string;
  jenis: string;
  kategori: string | null;
  platform: string | null;
  description: string;
  date: string;
  amount: number;
  attachment_url: string | null;
  created_at: string;
}

const AccountCashFlow = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();
  const firstDayOfMonth = today.substring(0, 8) + "01";

  // Active tab
  const [activeTab, setActiveTab] = useState<"cash-in" | "cash-out">("cash-in");

  // Filter states
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [filterBank, setFilterBank] = useState<string>("all");
  const [filterJenis, setFilterJenis] = useState<string>("all");
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formBank, setFormBank] = useState<string>(BANK_OPTIONS[0]);
  const [formJenis, setFormJenis] = useState<string>("");
  const [formKategori, setFormKategori] = useState<string>("");
  const [formPlatform, setFormPlatform] = useState<string>("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState(today);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  const flowType = activeTab === "cash-in" ? "Cash In" : "Cash Out";

  // Fetch cash flows
  const { data: cashFlows = [], isLoading } = useQuery({
    queryKey: ["account-cashflow", startDate, endDate],
    queryFn: async () => {
      let query = (supabase as any)
        .from("cash_flows")
        .select("*")
        .order("date", { ascending: false });

      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CashFlow[];
    },
  });

  // Filter by active tab + bank + jenis
  const filteredFlows = useMemo(() => {
    return cashFlows.filter((cf) => {
      if (cf.flow_type !== flowType) return false;
      if (filterBank !== "all" && cf.bank !== filterBank) return false;
      if (filterJenis !== "all" && cf.jenis !== filterJenis) return false;
      return true;
    });
  }, [cashFlows, flowType, filterBank, filterJenis]);

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredFlows.length / pageSize);
  const paginatedFlows =
    pageSize === "All"
      ? filteredFlows
      : filteredFlows.slice((currentPage - 1) * (pageSize as number), currentPage * (pageSize as number));

  // Summary totals
  const totalCashIn = useMemo(
    () => cashFlows.filter((cf) => cf.flow_type === "Cash In").reduce((sum, cf) => sum + Number(cf.amount), 0),
    [cashFlows]
  );
  const totalCashOut = useMemo(
    () => cashFlows.filter((cf) => cf.flow_type === "Cash Out").reduce((sum, cf) => sum + Number(cf.amount), 0),
    [cashFlows]
  );

  // Bank totals for current tab
  const bankTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    BANK_OPTIONS.forEach((b) => (totals[b] = 0));
    cashFlows
      .filter((cf) => cf.flow_type === flowType)
      .forEach((cf) => {
        if (totals[cf.bank] !== undefined) totals[cf.bank] += Number(cf.amount);
      });
    return totals;
  }, [cashFlows, flowType]);

  // Determine if current jenis needs kategori
  const needsKategori =
    (activeTab === "cash-in" && formJenis === "Rekod Jualan") ||
    (activeTab === "cash-out" && formJenis === "Rekod Belanja");

  // Determine if current jenis needs platform (Cash Out > Rekod Belanja only)
  const needsPlatform = activeTab === "cash-out" && formJenis === "Rekod Belanja";

  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Only JPEG, PNG, and PDF files are allowed");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      setAttachmentFile(file);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => setAttachmentPreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setAttachmentPreview(null);
      }
    }
  };

  // Reset form
  const resetForm = () => {
    setFormBank(BANK_OPTIONS[0]);
    setFormJenis("");
    setFormKategori("");
    setFormPlatform("");
    setFormDescription("");
    setFormAmount("");
    setFormDate(today);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setExistingAttachment(null);
    setIsEditing(false);
    setEditingId(null);
  };

  const handleAddClick = () => {
    resetForm();
    // Set default jenis based on tab
    if (activeTab === "cash-in") {
      setFormJenis(CASH_IN_JENIS[0]);
    } else {
      setFormJenis(CASH_OUT_JENIS[0]);
    }
    setIsDialogOpen(true);
  };

  const handleEditClick = (cf: CashFlow) => {
    setFormBank(cf.bank);
    setFormJenis(cf.jenis);
    setFormKategori(cf.kategori || "");
    setFormPlatform(cf.platform || "");
    setFormDescription(cf.description);
    setFormAmount(cf.amount.toString());
    setFormDate(cf.date);
    setExistingAttachment(cf.attachment_url);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setIsEditing(true);
    setEditingId(cf.id);
    setIsDialogOpen(true);
  };

  // Upload to Vercel Blob
  const uploadToVercelBlob = async (file: File): Promise<string> => {
    const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("Blob storage token not configured");
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "-");
    const filename = `cashflow/${timestamp}-${cleanFileName}`;
    const blob = await put(filename, file, { access: "public", token });
    return blob.url;
  };

  // Delete from Vercel Blob
  const deleteFromBlob = async (url: string) => {
    try {
      const response = await fetch("/api/delete-blob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) console.error("Failed to delete from Blob:", url);
    } catch (err) {
      console.error("Blob delete error:", err);
    }
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formBank) {
      toast.error("Please select a bank");
      return;
    }
    if (!formJenis) {
      toast.error("Please select jenis");
      return;
    }
    if (needsKategori && !formKategori) {
      toast.error("Please select kategori");
      return;
    }
    if (needsPlatform && !formPlatform) {
      toast.error("Please select platform");
      return;
    }
    if (!formDescription.trim()) {
      toast.error("Please enter a description");
      return;
    }
    if (!formAmount || Number(formAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!formDate) {
      toast.error("Please select a date");
      return;
    }

    setIsSubmitting(true);

    try {
      let attachmentUrl = existingAttachment;

      if (attachmentFile) {
        if (existingAttachment) await deleteFromBlob(existingAttachment);
        attachmentUrl = await uploadToVercelBlob(attachmentFile);
      }

      const record: any = {
        flow_type: flowType,
        bank: formBank,
        jenis: formJenis,
        kategori: needsKategori ? formKategori : null,
        platform: needsPlatform ? formPlatform : null,
        description: formDescription.trim(),
        date: formDate,
        amount: Number(formAmount),
        attachment_url: attachmentUrl || null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await (supabase as any).from("cash_flows").update(record).eq("id", editingId);
        if (error) throw error;
        toast.success("Record updated successfully");
      } else {
        const { error } = await (supabase as any).from("cash_flows").insert(record);
        if (error) throw error;
        toast.success("Record added successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["account-cashflow"] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save record");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string, attachmentUrl: string | null) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Record?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;

    try {
      if (attachmentUrl) await deleteFromBlob(attachmentUrl);
      const { error } = await (supabase as any).from("cash_flows").delete().eq("id", id);
      if (error) throw error;
      toast.success("Record deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["account-cashflow"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete record");
    }
  };

  // Get file icon
  const getFileIcon = (url: string) => {
    if (url.includes(".pdf")) return <FileText className="w-4 h-4" />;
    return <Image className="w-4 h-4" />;
  };

  // Export to XLSX
  const exportToXLSX = () => {
    const data = filteredFlows.map((cf, index) => {
      const row: any = {
        No: index + 1,
        Bank: cf.bank,
        Jenis: cf.jenis,
      };
      if (cf.kategori) row["Kategori"] = cf.kategori;
      if (cf.platform) row["Platform"] = cf.platform;
      row["Description"] = cf.description;
      row["Date"] = cf.date;
      row["Amount (RM)"] = Number(cf.amount).toFixed(2);
      return row;
    });

    // Add total row
    const totalAmount = filteredFlows.reduce((sum, cf) => sum + Number(cf.amount), 0);
    data.push({
      No: "",
      Bank: "",
      Jenis: "",
      Description: "TOTAL",
      Date: "",
      "Amount (RM)": totalAmount.toFixed(2),
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, flowType);

    const colWidths = [
      { wch: 5 },
      { wch: 15 },
      { wch: 22 },
      { wch: 20 },
      { wch: 40 },
      { wch: 12 },
      { wch: 15 },
    ];
    worksheet["!cols"] = colWidths;

    const fileName = `${flowType.replace(" ", "_")}_${startDate}_to_${endDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Get jenis options based on active tab
  const jenisOptions = activeTab === "cash-in" ? CASH_IN_JENIS : CASH_OUT_JENIS;

  // Get kategori options based on active tab and jenis
  const getKategoriOptions = () => {
    if (activeTab === "cash-in" && formJenis === "Rekod Jualan") return CASH_IN_KATEGORI;
    if (activeTab === "cash-out" && formJenis === "Rekod Belanja") return CASH_OUT_KATEGORI;
    return [];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cash Flow</h1>
          <p className="text-muted-foreground mt-2">Manage Cash In & Cash Out records</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <ArrowDownToLine className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">RM {totalCashIn.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Cash In</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <ArrowUpFromLine className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">RM {totalCashOut.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Cash Out</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${totalCashIn - totalCashOut >= 0 ? "bg-blue-100" : "bg-orange-100"}`}>
                <DollarSign className={`w-6 h-6 ${totalCashIn - totalCashOut >= 0 ? "text-blue-600" : "text-orange-600"}`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${totalCashIn - totalCashOut >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                  RM {(totalCashIn - totalCashOut).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">Net Cash Flow</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Cash In / Cash Out */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as "cash-in" | "cash-out");
          setFilterBank("all");
          setFilterJenis("all");
          setCurrentPage(1);
        }}
      >
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="cash-in" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Cash In
          </TabsTrigger>
          <TabsTrigger value="cash-out" className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4" />
            Cash Out
          </TabsTrigger>
        </TabsList>

        {/* Both tabs share the same content structure */}
        {["cash-in", "cash-out"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            {/* Bank Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {BANK_OPTIONS.map((bank) => (
                <Card
                  key={bank}
                  className={`cursor-pointer transition-all ${filterBank === bank ? "ring-2 ring-primary" : "hover:shadow-md"}`}
                  onClick={() => {
                    setFilterBank(filterBank === bank ? "all" : bank);
                    setCurrentPage(1);
                  }}
                >
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground truncate">{bank}</p>
                    <p className="text-lg font-bold">RM {(bankTotals[bank] || 0).toFixed(2)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters + Add Button */}
            <Card className="mb-4">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Start:</span>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                      className="w-40"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">End:</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                      className="w-40"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Bank:</span>
                    <Select value={filterBank} onValueChange={(v) => { setFilterBank(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Banks</SelectItem>
                        {BANK_OPTIONS.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Jenis:</span>
                    <Select value={filterJenis} onValueChange={(v) => { setFilterJenis(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Jenis</SelectItem>
                        {jenisOptions.map((j) => (
                          <SelectItem key={j} value={j}>{j}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <SelectItem key={size.toString()} value={size.toString()}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">entries</span>
                  </div>
                  <Button onClick={exportToXLSX} className="bg-green-600 hover:bg-green-700 text-white">
                    <Download className="w-4 h-4 mr-2" />
                    Export XLSX
                  </Button>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={handleAddClick}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add {flowType}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>{isEditing ? "Edit" : "Add"} {flowType}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-1">
                        {/* Bank */}
                        <div className="space-y-2">
                          <Label>Bank</Label>
                          <Select value={formBank} onValueChange={setFormBank}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select bank" />
                            </SelectTrigger>
                            <SelectContent>
                              {BANK_OPTIONS.map((b) => (
                                <SelectItem key={b} value={b}>{b}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Jenis */}
                        <div className="space-y-2">
                          <Label>Jenis</Label>
                          <Select
                            value={formJenis}
                            onValueChange={(v) => {
                              setFormJenis(v);
                              setFormKategori("");
                              setFormPlatform("");
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select jenis" />
                            </SelectTrigger>
                            <SelectContent>
                              {jenisOptions.map((j) => (
                                <SelectItem key={j} value={j}>{j}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Platform (Cash Out > Rekod Belanja only) */}
                        {needsPlatform && (
                          <div className="space-y-2">
                            <Label>Platform</Label>
                            <Select value={formPlatform} onValueChange={setFormPlatform}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select platform" />
                              </SelectTrigger>
                              <SelectContent>
                                {CASH_OUT_PLATFORM.map((p) => (
                                  <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Kategori */}
                        {needsKategori && (
                          <div className="space-y-2">
                            <Label>Kategori</Label>
                            <Select value={formKategori} onValueChange={setFormKategori}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select kategori" />
                              </SelectTrigger>
                              <SelectContent>
                                {getKategoriOptions().map((k) => (
                                  <SelectItem key={k} value={k}>{k}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Description */}
                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Input
                            placeholder="Enter description..."
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                          />
                        </div>

                        {/* Date */}
                        <div className="space-y-2">
                          <Label>Date</Label>
                          <Input
                            type="date"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                          />
                        </div>

                        {/* Amount */}
                        <div className="space-y-2">
                          <Label>Amount (RM)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                          />
                        </div>

                        {/* Attachment (Optional for both Cash In & Cash Out) */}
                        <div className="space-y-2">
                            <Label>Attachment (Optional)</Label>
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                onChange={handleFileChange}
                                className="hidden"
                                id="cashflow-attachment-upload"
                              />
                              <label
                                htmlFor="cashflow-attachment-upload"
                                className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                              >
                                <Upload className="w-4 h-4" />
                                <span className="text-sm text-muted-foreground">
                                  {attachmentFile
                                    ? attachmentFile.name
                                    : existingAttachment
                                      ? "Replace existing attachment"
                                      : "Upload JPEG, PNG, or PDF (max 5MB)"}
                                </span>
                              </label>
                              {(attachmentPreview || existingAttachment) && (
                                <div className="mt-2 p-2 bg-muted rounded-lg">
                                  {attachmentPreview ? (
                                    <img src={attachmentPreview} alt="Preview" className="w-full h-32 object-cover rounded" />
                                  ) : existingAttachment && existingAttachment.includes(".pdf") ? (
                                    <div className="flex items-center gap-2 text-sm">
                                      <FileText className="w-4 h-4" />
                                      <span>PDF attached</span>
                                      <a href={existingAttachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                                    </div>
                                  ) : existingAttachment ? (
                                    <img src={existingAttachment} alt="Existing attachment" className="w-full h-32 object-cover rounded" />
                                  ) : null}
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Supported: JPEG, PNG, PDF (max 5MB)</p>
                          </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => { setIsDialogOpen(false); resetForm(); }}
                          >
                            Cancel
                          </Button>
                          <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            {isEditing ? "Update" : "Add"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            {/* Data Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="p-3 text-left">No</th>
                            <th className="p-3 text-left">Bank</th>
                            <th className="p-3 text-left">Jenis</th>
                            <th className="p-3 text-left">Kategori</th>
                            {activeTab === "cash-out" && <th className="p-3 text-left">Platform</th>}

                            <th className="p-3 text-left">Description</th>
                            <th className="p-3 text-left">Date</th>
                            <th className="p-3 text-right">Amount (RM)</th>
                            <th className="p-3 text-center">Attachment</th>
                            <th className="p-3 text-center">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedFlows.length > 0 ? (
                            paginatedFlows.map((cf, index) => (
                              <tr key={cf.id} className="border-b hover:bg-muted/30">
                                <td className="p-3">
                                  {pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                    {cf.bank}
                                  </span>
                                </td>
                                <td className="p-3 whitespace-nowrap">{cf.jenis}</td>
                                <td className="p-3 whitespace-nowrap">
                                  {cf.kategori ? (
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                                      {cf.kategori}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                                {activeTab === "cash-out" && (
                                  <td className="p-3 whitespace-nowrap">
                                    {cf.platform ? (
                                      <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">
                                        {cf.platform}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                )}
                                <td className="p-3">{cf.description}</td>
                                <td className="p-3 whitespace-nowrap">{cf.date}</td>
                                <td className="p-3 text-right font-medium">
                                  RM {Number(cf.amount).toFixed(2)}
                                </td>
                                <td className="p-3 text-center">
                                    {cf.attachment_url ? (
                                      <a
                                        href={cf.attachment_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                                      >
                                        {getFileIcon(cf.attachment_url)}
                                        <Eye className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditClick(cf)}
                                      className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDelete(cf.id, cf.attachment_url)}
                                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={activeTab === "cash-out" ? 10 : 9} className="text-center py-12 text-muted-foreground">
                                No {flowType.toLowerCase()} records found for this date range.
                              </td>
                            </tr>
                          )}
                        </tbody>
                        {paginatedFlows.length > 0 && (
                          <tfoot className="bg-muted/50">
                            <tr>
                              <td colSpan={activeTab === "cash-out" ? 7 : 6} className="p-3 text-right font-bold">
                                Total:
                              </td>
                              <td className="p-3 text-right font-bold">
                                RM {filteredFlows.reduce((sum, cf) => sum + Number(cf.amount), 0).toFixed(2)}
                              </td>
                              <td className="p-3"></td>
                              <td className="p-3"></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <div className="text-sm text-muted-foreground">
                          Showing {(currentPage - 1) * (pageSize as number) + 1} to{" "}
                          {Math.min(currentPage * (pageSize as number), filteredFlows.length)} of{" "}
                          {filteredFlows.length} entries
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default AccountCashFlow;
