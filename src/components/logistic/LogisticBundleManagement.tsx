import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Package, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";

interface BundleItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
}

const LogisticBundleManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);

  // Add item form
  const [selectedProductId, setSelectedProductId] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);

  // Generate bundle SKU from items: SKU_A-unit + SKU_B-unit format
  const generateBundleSku = (items: BundleItem[]): string => {
    if (items.length === 0) return "";
    return items
      .map((item) => `${item.productSku}-${item.quantity}`)
      .join(" + ");
  };

  // Auto-calculated bundle SKU
  const bundleSku = generateBundleSku(bundleItems);

  // Fetch all products
  const { data: products = [] } = useQuery({
    queryKey: ["all-products-for-bundle"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, base_cost")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch bundles for this logistic user
  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ["logistic-bundles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logistic_bundles")
        .select(`
          *,
          items:logistic_bundle_items(
            id,
            product_id,
            quantity,
            product:products(id, name, sku)
          )
        `)
        .eq("logistic_id", user?.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Reset form
  const resetForm = () => {
    setBundleName("");
    setBundleDescription("");
    setBundleItems([]);
    setSelectedProductId("");
    setItemQuantity(1);
    setIsEditing(false);
    setEditingBundleId(null);
  };

  // Open create dialog
  const handleOpenCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  // Open edit dialog
  const handleOpenEdit = (bundle: any) => {
    setIsEditing(true);
    setEditingBundleId(bundle.id);
    setBundleName(bundle.name);
    setBundleDescription(bundle.description || "");
    setBundleItems(
      bundle.items.map((item: any) => ({
        productId: item.product_id,
        productName: item.product?.name || "Unknown",
        productSku: item.product?.sku || "",
        quantity: item.quantity,
      }))
    );
    setDialogOpen(true);
  };

  // Add item to bundle
  const handleAddItem = () => {
    if (!selectedProductId) {
      toast.error("Please select a product");
      return;
    }

    // Check if product already exists in bundle
    if (bundleItems.some((item) => item.productId === selectedProductId)) {
      toast.error("Product already in bundle. Update quantity instead.");
      return;
    }

    const product = products.find((p: any) => p.id === selectedProductId);
    if (!product) return;

    setBundleItems([
      ...bundleItems,
      {
        productId: selectedProductId,
        productName: product.name,
        productSku: product.sku || "",
        quantity: itemQuantity,
      },
    ]);

    setSelectedProductId("");
    setItemQuantity(1);
  };

  // Remove item from bundle
  const handleRemoveItem = (productId: string) => {
    setBundleItems(bundleItems.filter((item) => item.productId !== productId));
  };

  // Update item quantity
  const handleUpdateItemQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    setBundleItems(
      bundleItems.map((item) =>
        item.productId === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  // Save bundle
  const handleSave = async () => {
    if (!bundleName.trim()) {
      toast.error("Please enter bundle name");
      return;
    }

    if (bundleItems.length === 0) {
      toast.error("Please add at least one product to the bundle");
      return;
    }

    setIsSaving(true);

    try {
      // Generate SKU from bundle items
      const generatedSku = generateBundleSku(bundleItems);

      if (isEditing && editingBundleId) {
        // Update existing bundle
        const { error: updateError } = await supabase
          .from("logistic_bundles")
          .update({
            name: bundleName.trim(),
            description: bundleDescription.trim() || null,
            sku: generatedSku,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingBundleId);

        if (updateError) throw updateError;

        // Delete existing items and re-insert
        await supabase
          .from("logistic_bundle_items")
          .delete()
          .eq("bundle_id", editingBundleId);

        const itemsToInsert = bundleItems.map((item) => ({
          bundle_id: editingBundleId,
          product_id: item.productId,
          quantity: item.quantity,
        }));

        const { error: itemsError } = await supabase
          .from("logistic_bundle_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast.success("Bundle updated successfully");
      } else {
        // Create new bundle
        const { data: newBundle, error: insertError } = await supabase
          .from("logistic_bundles")
          .insert({
            logistic_id: user?.id,
            name: bundleName.trim(),
            description: bundleDescription.trim() || null,
            sku: generatedSku,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Insert bundle items
        const itemsToInsert = bundleItems.map((item) => ({
          bundle_id: newBundle.id,
          product_id: item.productId,
          quantity: item.quantity,
        }));

        const { error: itemsError } = await supabase
          .from("logistic_bundle_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast.success("Bundle created successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["logistic-bundles"] });
      setDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Save bundle error:", error);
      toast.error(error.message || "Failed to save bundle");
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle bundle active status
  const handleToggleActive = async (bundleId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("logistic_bundles")
        .update({ is_active: !currentStatus })
        .eq("id", bundleId);

      if (error) throw error;

      toast.success(`Bundle ${!currentStatus ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["logistic-bundles"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update bundle status");
    }
  };

  // Delete bundle
  const handleDelete = async (bundleId: string, bundleName: string) => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete Bundle?",
      text: `Are you sure you want to delete "${bundleName}"? This action cannot be undone.`,
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const { error } = await supabase
        .from("logistic_bundles")
        .delete()
        .eq("id", bundleId);

      if (error) throw error;

      toast.success("Bundle deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["logistic-bundles"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete bundle");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bundle Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage product bundles (combos)
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Bundle
        </Button>
      </div>

      {/* Bundles List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Your Bundles ({bundles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : bundles.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No bundles created yet.</p>
              <p className="text-sm">Click "Create Bundle" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bundle Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.map((bundle: any) => (
                  <TableRow key={bundle.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{bundle.name}</p>
                        {bundle.description && (
                          <p className="text-xs text-muted-foreground">
                            {bundle.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {bundle.sku || "-"}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {bundle.items?.map((item: any) => (
                          <Badge key={item.id} variant="secondary" className="text-xs">
                            {item.product?.name} x{item.quantity}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={bundle.is_active}
                          onCheckedChange={() =>
                            handleToggleActive(bundle.id, bundle.is_active)
                          }
                        />
                        <span className={bundle.is_active ? "text-green-600" : "text-gray-400"}>
                          {bundle.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(bundle)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(bundle.id, bundle.name)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Bundle" : "Create New Bundle"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Bundle Info */}
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="bundleName">Bundle Name *</Label>
                <Input
                  id="bundleName"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  placeholder="e.g., Combo A, Family Pack"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bundleDescription">Description (Optional)</Label>
                <Input
                  id="bundleDescription"
                  value={bundleDescription}
                  onChange={(e) => setBundleDescription(e.target.value)}
                  placeholder="Bundle description..."
                />
              </div>
            </div>

            {/* Add Products Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold">Bundle Products</h3>

              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((p: any) => !bundleItems.some((bi) => bi.productId === p.id))
                        .map((product: any) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} ({product.sku})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                    placeholder="Qty"
                  />
                </div>
                <Button onClick={handleAddItem} variant="secondary">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {/* Bundle Items List */}
              {bundleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No products added yet. Select a product and click + to add.
                </p>
              ) : (
                <div className="space-y-2">
                  {bundleItems.map((item) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between bg-muted/50 rounded-lg p-3"
                    >
                      <span className="font-medium">{item.productName}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleUpdateItemQuantity(item.productId, item.quantity - 1)
                          }
                          disabled={item.quantity <= 1}
                          className="h-8 w-8 p-0"
                        >
                          -
                        </Button>
                        <span className="w-8 text-center font-medium">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleUpdateItemQuantity(item.productId, item.quantity + 1)
                          }
                          className="h-8 w-8 p-0"
                        >
                          +
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(item.productId)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            {bundleItems.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-800 mb-2">Bundle Summary</h4>
                <div className="text-sm text-blue-700">
                  <p>Total Products: {bundleItems.length}</p>
                  <p>Total Units: {bundleItems.reduce((sum, item) => sum + item.quantity, 0)}</p>
                  <div className="mt-3 p-2 bg-white/50 rounded border border-blue-300">
                    <p className="text-xs text-blue-600 mb-1">Auto-Generated SKU:</p>
                    <code className="text-sm font-mono font-bold text-blue-900 break-all">
                      {bundleSku}
                    </code>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : isEditing ? (
                "Update Bundle"
              ) : (
                "Create Bundle"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LogisticBundleManagement;
