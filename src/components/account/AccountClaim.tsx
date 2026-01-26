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
import { getMalaysiaDate } from "@/lib/utils";
import {
  Loader2,
  Plus,
  Trash2,
  Edit2,
  FileText,
  Download,
  Eye,
  Receipt,
  Upload,
  Image,
} from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { put } from "@vercel/blob";

const PAGE_SIZE_OPTIONS = [10, 50, 100, "All"] as const;
const EMPLOYMENT_TYPE_OPTIONS = ["Full Time", "Part Time", "Contract", "Intern"];
const BANK_OPTIONS = [
  'Maybank',
  'CIMB Bank',
  'Public Bank',
  'RHB Bank',
  'Hong Leong Bank',
  'AmBank',
  'Bank Islam',
  'Bank Rakyat',
  'Affin Bank',
  'Alliance Bank',
];

interface ClaimItem {
  description: string;
  amount: number;
}

interface Claim {
  id: string;
  employee_name: string;
  ic_number: string;
  phone_number: string;
  department: string;
  employment_type: string;
  pay_date: string;
  invoice_number: string;
  items: ClaimItem[];
  total_deductions: number;
  net_pay: number;
  bank_account: string;
  bank_name: string;
  attachment_url: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const AccountClaim = () => {
  const queryClient = useQueryClient();
  const today = getMalaysiaDate();

  // Get first day of current month
  const firstDayOfMonth = today.substring(0, 8) + "01";

  // Filter states
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [pageSize, setPageSize] = useState<number | "All">(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formEmployeeName, setFormEmployeeName] = useState("");
  const [formPayDate, setFormPayDate] = useState(today);
  const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
  const [formItems, setFormItems] = useState<ClaimItem[]>([{ description: "", amount: 0 }]);
  const [formNetPay, setFormNetPay] = useState("");
  const [formBankAccount, setFormBankAccount] = useState("");
  const [formBankName, setFormBankName] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  // Fetch staff names from both profiles and attendance_staff (like HR Attendance)
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-list-all"],
    queryFn: async () => {
      // Fetch profiles (marketers and admins)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      if (profilesError) throw profilesError;

      // Fetch user_roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Fetch attendance_staff (non-login staff)
      const { data: attendanceStaff, error: staffError } = await supabase
        .from("attendance_staff")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (staffError) throw staffError;

      // Create a map of user_id to role
      const rolesMap = new Map(roles?.map((r: any) => [r.user_id, r.role]) || []);

      // Filter only marketers and admins from profiles, and only HQ staff (not Fighter)
      const profileUsers = (profiles || [])
        .map((profile: any) => ({
          name: profile.full_name,
          idstaff: profile.idstaff,
          role: rolesMap.get(profile.id) || "unknown",
        }))
        .filter((u: any) =>
          (u.role === "marketer" || u.role === "admin")
        );

      // Map attendance_staff to same structure
      const staffUsers = (attendanceStaff || []).map((staff: any) => ({
        name: staff.name,
        idstaff: staff.ic_number,
        role: staff.role,
      }));

      // Combine both arrays
      return [...profileUsers, ...staffUsers];
    },
  });

  // Fetch claims
  const { data: claims = [], isLoading } = useQuery({
    queryKey: ["account-claims", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("claims")
        .select("*")
        .order("created_at", { ascending: false });

      if (startDate) {
        query = query.gte("pay_date", startDate);
      }
      if (endDate) {
        query = query.lte("pay_date", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((claim: any) => ({
        ...claim,
        items: claim.items || [],
      })) as Claim[];
    },
  });

  // Filter claims by status
  const filteredClaims = claims.filter((claim) => {
    if (filterStatus === "all") return true;
    return claim.status === filterStatus;
  });

  // Pagination
  const totalPages = pageSize === "All" ? 1 : Math.ceil(filteredClaims.length / pageSize);
  const paginatedClaims = pageSize === "All"
    ? filteredClaims
    : filteredClaims.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Calculate totals
  const totalClaimsAmount = claims.reduce((sum, c) => sum + Number(c.total_deductions), 0);
  const pendingCount = claims.filter((c) => c.status === "pending").length;
  const approvedCount = claims.filter((c) => c.status === "approved").length;

  // Calculate total deductions from items
  const totalDeductions = useMemo(() => {
    return formItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [formItems]);

  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Only JPEG, PNG, and PDF files are allowed");
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      setAttachmentFile(file);
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setAttachmentPreview(reader.result as string);
        reader.readAsDataURL(file);
      } else {
        setAttachmentPreview(null);
      }
    }
  };

  // Upload to Vercel Blob
  const uploadToVercelBlob = async (file: File): Promise<string> => {
    const token = import.meta.env.VITE_BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error('Blob storage token not configured');
    }
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
    const filename = `claims/${timestamp}-${cleanFileName}`;
    const blob = await put(filename, file, { access: 'public', token });
    return blob.url;
  };

  // Delete from Vercel Blob
  const deleteFromBlob = async (url: string) => {
    try {
      const response = await fetch('/api/delete-blob', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        console.error('Failed to delete from Blob:', url);
      }
    } catch (err) {
      console.error('Blob delete error:', err);
    }
  };

  // Add new item row
  const addItemRow = () => {
    setFormItems([...formItems, { description: "", amount: 0 }]);
  };

  // Remove item row
  const removeItemRow = (index: number) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter((_, i) => i !== index));
    }
  };

  // Update item
  const updateItem = (index: number, field: keyof ClaimItem, value: string | number) => {
    const newItems = [...formItems];
    if (field === "amount") {
      newItems[index][field] = Number(value) || 0;
    } else {
      newItems[index][field] = value as string;
    }
    setFormItems(newItems);
  };

  // Reset form
  const resetForm = () => {
    setFormEmployeeName("");
    setFormPayDate(today);
    setFormInvoiceNumber("");
    setFormItems([{ description: "", amount: 0 }]);
    setFormNetPay("");
    setFormBankAccount("");
    setFormBankName("");
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setExistingAttachment(null);
    setIsEditing(false);
    setEditingId(null);
  };

  // Open dialog for adding
  const handleAddClick = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditClick = (claim: Claim) => {
    setFormEmployeeName(claim.employee_name);
    setFormPayDate(claim.pay_date);
    setFormInvoiceNumber(claim.invoice_number || "");
    setFormItems(claim.items.length > 0 ? claim.items : [{ description: "", amount: 0 }]);
    setFormNetPay(claim.net_pay.toString());
    setFormBankAccount(claim.bank_account);
    setFormBankName(claim.bank_name);
    setExistingAttachment(claim.attachment_url);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setIsEditing(true);
    setEditingId(claim.id);
    setIsDialogOpen(true);
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formEmployeeName.trim()) {
      toast.error("Please select employee name");
      return;
    }
    if (!formPayDate) {
      toast.error("Please select pay date");
      return;
    }
    if (formItems.some((item) => !item.description.trim())) {
      toast.error("Please fill all item descriptions");
      return;
    }
    if (!formBankAccount.trim()) {
      toast.error("Please enter bank account");
      return;
    }
    if (!formBankName.trim()) {
      toast.error("Please select bank name");
      return;
    }

    setIsSubmitting(true);

    try {
      let attachmentUrl = existingAttachment;

      // Upload new attachment if provided
      if (attachmentFile) {
        // Delete old attachment if exists
        if (existingAttachment) {
          await deleteFromBlob(existingAttachment);
        }
        attachmentUrl = await uploadToVercelBlob(attachmentFile);
      }

      const claimData = {
        employee_name: formEmployeeName.trim(),
        ic_number: "-",
        phone_number: "-",
        department: "-",
        employment_type: "-",
        pay_date: formPayDate,
        invoice_number: formInvoiceNumber.trim() || "-",
        items: formItems.filter((item) => item.description.trim()),
        total_deductions: totalDeductions,
        net_pay: Number(formNetPay) || totalDeductions,
        bank_account: formBankAccount.trim(),
        bank_name: formBankName.trim(),
        attachment_url: attachmentUrl,
        status: "pending",
        updated_at: new Date().toISOString(),
      };

      if (isEditing && editingId) {
        const { error } = await supabase
          .from("claims")
          .update(claimData)
          .eq("id", editingId);

        if (error) throw error;
        toast.success("Claim updated successfully");
      } else {
        const { error } = await supabase
          .from("claims")
          .insert(claimData);

        if (error) throw error;
        toast.success("Claim added successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["account-claims"] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save claim");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string, attachmentUrl: string | null) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Claim?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      // Delete attachment from blob if exists
      if (attachmentUrl) {
        await deleteFromBlob(attachmentUrl);
      }

      const { error } = await supabase
        .from("claims")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Claim deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["account-claims"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete claim");
    }
  };

  // Get file icon based on URL
  const getFileIcon = (url: string) => {
    if (url.includes('.pdf')) return <FileText className="w-4 h-4" />;
    return <Image className="w-4 h-4" />;
  };

  // Update claim status
  const handleStatusUpdate = async (id: string, newStatus: "approved" | "rejected") => {
    try {
      const { error } = await supabase
        .from("claims")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      toast.success(`Claim ${newStatus} successfully`);
      queryClient.invalidateQueries({ queryKey: ["account-claims"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    }
  };

  // Generate PDF to match template exactly
  const generatePDF = (claim: Claim) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Colors matching template
    const blueHeader: [number, number, number] = [62, 110, 142]; // Blue from template
    const goldColor: [number, number, number] = [218, 165, 32]; // Gold

    // Left side - DZI HOLISTIK Logo (circle)
    doc.setFillColor(...goldColor);
    doc.circle(30, 30, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("DZI", 24, 28);
    doc.setFontSize(7);
    doc.text("HOLISTIK", 21, 34);

    // Right side - Company Name and Address
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("DZI HOLISTIK ENTERPRISE", 60, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("PT 2811, TINGKAT 1 TAMAN D'SAID KG PADANG LANDAK, MUKIM PELAGAT,", 60, 28);
    doc.text("22000 JERTEH, TERENGGANU", 60, 34);
    doc.text("TEL: 016-2569963 (HR)", 60, 40);

    // Employee Details Section
    const detailsStartY = 60;
    const labelX = 20;
    const colonX = 82;
    const valueX = 86;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const details = [
      ["Employee Name", claim.employee_name],
      ["Identification Card Number", claim.ic_number],
      ["Phone Number", claim.phone_number],
      ["Department", claim.department],
      ["Employment Type", claim.employment_type],
      ["Pay Date", claim.pay_date],
    ];

    details.forEach((detail, index) => {
      const y = detailsStartY + index * 8;
      doc.setFont("helvetica", "normal");
      doc.text(detail[0], labelX, y);
      doc.text(":", colonX, y);
      doc.text(detail[1], valueX, y);
    });

    // DEDUCTIONS Section
    const deductionsY = detailsStartY + details.length * 8 + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DEDUCTIONS", labelX, deductionsY);

    // Table with blue header
    const tableData = claim.items.map((item) => [
      item.description,
      `RM ${Number(item.amount).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: deductionsY + 5,
      head: [["DESCRIPTION", "AMOUNT"]],
      body: tableData,
      theme: "grid",
      headStyles: {
        fillColor: blueHeader,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      footStyles: {
        fillColor: blueHeader,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      foot: [["TOTAL DEDUCTIONS", `RM ${claim.total_deductions.toFixed(2)}`]],
      columnStyles: {
        0: { cellWidth: 125, halign: "left" },
        1: { cellWidth: 45, halign: "right" },
      },
      styles: {
        fontSize: 9,
        cellPadding: 4,
      },
      margin: { left: 20, right: 20 },
    });

    // Payment Details
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    doc.setFont("helvetica", "normal");
    doc.text("Net Pay", labelX, finalY);
    doc.text(":", colonX, finalY);
    doc.text(`RM ${claim.net_pay.toFixed(2)}`, valueX, finalY);

    doc.text("Bank Account", labelX, finalY + 8);
    doc.text(":", colonX, finalY + 8);
    doc.text(claim.bank_account, valueX, finalY + 8);

    doc.text("Bank Name", labelX, finalY + 16);
    doc.text(":", colonX, finalY + 16);
    doc.text(claim.bank_name, valueX, finalY + 16);

    // Authorization Section (bottom right)
    const authY = finalY + 35;
    doc.setFontSize(9);
    doc.text("Authorized by:", pageWidth - 75, authY);
    doc.setFont("helvetica", "bold");
    doc.text("Managing Director - DFR Empire", pageWidth - 75, authY + 6);

    // Signature line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(pageWidth - 75, authY + 20, pageWidth - 15, authY + 20);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Muhammad Fahmi Bin Ramelan", pageWidth - 75, authY + 26);

    // Save PDF
    doc.save(`Claim_Slip_${claim.employee_name.replace(/\s+/g, "_")}_${claim.pay_date}.pdf`);
    toast.success("PDF generated successfully");
  };

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Claims</h1>
          <p className="text-muted-foreground mt-2">
            Staff expense claims - when staff use their own money for company purchases
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddClick}>
              <Plus className="w-4 h-4 mr-2" />
              Add Claim
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit Claim" : "Add New Claim"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Employee Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee Name *</Label>
                  <Select value={formEmployeeName} onValueChange={setFormEmployeeName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((staff) => (
                        <SelectItem key={staff.name} value={staff.name}>
                          {staff.name}
                          <span className="text-muted-foreground ml-2">({staff.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay Date *</Label>
                  <Input
                    type="date"
                    value={formPayDate}
                    onChange={(e) => setFormPayDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Number</Label>
                  <Input
                    placeholder="e.g., INV-2026-001"
                    value={formInvoiceNumber}
                    onChange={(e) => setFormInvoiceNumber(e.target.value)}
                  />
                </div>
              </div>

              {/* Deductions Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Deductions / Claims *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-2 border rounded-lg p-3">
                  {formItems.map((item, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Amount"
                        value={item.amount || ""}
                        onChange={(e) => updateItem(index, "amount", e.target.value)}
                        className="w-32"
                      />
                      {formItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItemRow(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-end pt-2 border-t">
                    <span className="font-semibold">
                      Total: RM {totalDeductions.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Net Pay (RM)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={totalDeductions.toFixed(2)}
                    value={formNetPay}
                    onChange={(e) => setFormNetPay(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank Account *</Label>
                  <Input
                    placeholder="Account number"
                    value={formBankAccount}
                    onChange={(e) => setFormBankAccount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank Name *</Label>
                  <Select value={formBankName} onValueChange={setFormBankName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {BANK_OPTIONS.map((bank) => (
                        <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Attachment Upload */}
              <div className="space-y-2">
                <Label>Attachment (Optional)</Label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="claim-attachment-upload"
                  />
                  <label
                    htmlFor="claim-attachment-upload"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors bg-background"
                  >
                    <Upload className="w-4 h-4" />
                    <span className="text-sm text-muted-foreground">
                      {attachmentFile
                        ? attachmentFile.name
                        : existingAttachment
                          ? 'Replace existing attachment'
                          : 'Upload receipt/document (JPEG, PNG, PDF - max 5MB)'}
                    </span>
                  </label>
                  {(attachmentPreview || existingAttachment) && (
                    <div className="mt-2 p-2 bg-muted rounded-lg">
                      {attachmentPreview ? (
                        <img
                          src={attachmentPreview}
                          alt="Preview"
                          className="w-full h-32 object-cover rounded"
                        />
                      ) : existingAttachment && existingAttachment.includes('.pdf') ? (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4" />
                          <span>PDF attached</span>
                          <a href={existingAttachment} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                        </div>
                      ) : existingAttachment ? (
                        <img
                          src={existingAttachment}
                          alt="Existing attachment"
                          className="w-full h-32 object-cover rounded"
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {isEditing ? "Update" : "Add"} Claim
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Receipt className="w-6 h-6 text-blue-500" />
              <div>
                <p className="text-xl font-bold">RM {totalClaimsAmount.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Claims ({claims.length})</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 text-yellow-500" />
              <div>
                <p className="text-xl font-bold">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-green-500" />
              <div>
                <p className="text-xl font-bold">{approvedCount}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
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
              <span className="text-sm text-muted-foreground whitespace-nowrap">Status:</span>
              <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v as any); setCurrentPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Show:</span>
              <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(v === "All" ? "All" : Number(v)); setCurrentPage(1); }}>
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
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
                      <th className="p-3 text-left">Employee</th>
                      <th className="p-3 text-left">Department</th>
                      <th className="p-3 text-left">Pay Date</th>
                      <th className="p-3 text-left">Invoice</th>
                      <th className="p-3 text-center">Attachment</th>
                      <th className="p-3 text-right">Amount (RM)</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedClaims.length > 0 ? (
                      paginatedClaims.map((claim, index) => (
                        <tr key={claim.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            {pageSize === "All" ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1}
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{claim.employee_name}</p>
                              <p className="text-xs text-muted-foreground">{claim.ic_number}</p>
                            </div>
                          </td>
                          <td className="p-3">{claim.department}</td>
                          <td className="p-3 whitespace-nowrap">{claim.pay_date}</td>
                          <td className="p-3">{claim.invoice_number || "-"}</td>
                          <td className="p-3 text-center">
                            {claim.attachment_url ? (
                              <a
                                href={claim.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                {getFileIcon(claim.attachment_url)}
                                <Eye className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-medium">
                            RM {Number(claim.total_deductions).toFixed(2)}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${getStatusColor(claim.status)}`}>
                              {claim.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => generatePDF(claim)}
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditClick(claim)}
                                className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {claim.status === "pending" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStatusUpdate(claim.id, "approved")}
                                    className="h-7 px-2 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStatusUpdate(claim.id, "rejected")}
                                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(claim.id, claim.attachment_url)}
                                className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-muted-foreground">
                          No claims found for this date range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), filteredClaims.length)} of {filteredClaims.length} entries
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
    </div>
  );
};

export default AccountClaim;
