import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Save,
  Building2,
  Phone,
  Mail,
  Globe,
  FileText,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, IconTile, TableSkeleton, MissingHint } from "@/components/common/SoftUI";

interface InvoiceSettings {
  id: string;
  company_name: string;
  registration_no: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

const AccountInvoiceSettings = () => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<InvoiceSettings>>({
    company_name: "",
    registration_no: "",
    address: "",
    phone: "",
    email: "",
    website: "",
  });

  // Fetch existing settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["invoice-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_settings")
        .select("*")
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found
        throw error;
      }
      return data as InvoiceSettings | null;
    },
  });

  // Update form when settings are loaded
  useEffect(() => {
    if (settings) {
      setFormData({
        company_name: settings.company_name || "",
        registration_no: settings.registration_no || "",
        address: settings.address || "",
        phone: settings.phone || "",
        email: settings.email || "",
        website: settings.website || "",
      });
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<InvoiceSettings>) => {
      if (settings?.id) {
        // Update existing
        const { error } = await supabase
          .from("invoice_settings")
          .update({
            ...data,
            updated_at: new Date().toISOString(),
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from("invoice_settings").insert({
          company_name: data.company_name || "Company Name",
          registration_no: data.registration_no,
          address: data.address,
          phone: data.phone,
          email: data.email,
          website: data.website,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Invoice settings saved successfully");
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save settings");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name?.trim()) {
      toast.error("Company name is required");
      return;
    }
    saveMutation.mutate(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <TableSkeleton rows={6} cols={2} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Settings"
        description="Configure company information for invoices"
        icon={FileText}
        tone="brand"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTile icon={Building2} tone="blue" size="sm" />
              Company Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Company Name */}
              <div className="space-y-2">
                <Label htmlFor="company_name" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Company Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="company_name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={handleChange}
                  placeholder="Enter company name"
                  required
                />
              </div>

              {/* Registration No */}
              <div className="space-y-2">
                <Label
                  htmlFor="registration_no"
                  className="flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Company Registration No.
                </Label>
                <Input
                  id="registration_no"
                  name="registration_no"
                  value={formData.registration_no || ""}
                  onChange={handleChange}
                  placeholder="e.g., 123456-X"
                />
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Business Address
                </Label>
                <Textarea
                  id="address"
                  name="address"
                  value={formData.address || ""}
                  onChange={handleChange}
                  placeholder="Enter full business address"
                  rows={3}
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Business Phone
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone || ""}
                  onChange={handleChange}
                  placeholder="e.g., +60 12-345 6789"
                />
              </div>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Business Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email || ""}
                  onChange={handleChange}
                  placeholder="e.g., info@company.com"
                />
              </div>

              {/* Website */}
              <div className="space-y-2">
                <Label htmlFor="website" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Website
                </Label>
                <Input
                  id="website"
                  name="website"
                  value={formData.website || ""}
                  onChange={handleChange}
                  placeholder="e.g., www.company.com"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2 space-y-3">
                <MissingHint items={[{ label: "Company Name", done: !!formData.company_name?.trim() }]} />
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="w-full"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Settings
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Preview Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconTile icon={FileText} tone="slate" size="sm" />
              Invoice Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 sm:p-6 rounded-xl border break-words">
              <h2 className="text-xl font-bold text-gray-900">
                {formData.company_name || "Company Name"}{" "}
                {formData.registration_no && `(${formData.registration_no})`}
              </h2>
              {formData.address && (
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-line">
                  {formData.address}
                </p>
              )}
              {formData.phone && (
                <p className="text-sm text-gray-700 mt-1">
                  Tel: {formData.phone}
                </p>
              )}
              {formData.email && (
                <p className="text-sm text-gray-700">Email: {formData.email}</p>
              )}
              {formData.website && (
                <p className="text-sm text-gray-700">
                  Website: {formData.website}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AccountInvoiceSettings;
