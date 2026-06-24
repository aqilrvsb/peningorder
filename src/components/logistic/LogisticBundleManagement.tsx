import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AUDIT_MODE } from "@/lib/audit";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Package, Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

interface BundleItem {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  baseCost: number;
}

const LogisticBundleManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bundleToDelete, setBundleToDelete] = useState<{ id: string; name: string } | null>(null);

  // Form states
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  const [bundleItems, setBundleItems] = useState<BundleItem[]>([]);
  const [baseCost, setBaseCost] = useState<number>(0);
  const [hqCost, setHqCost] = useState<number>(0);
  const [kosPostageSm, setKosPostageSm] = useState<number>(0);
  const [kosPostageSs, setKosPostageSs] = useState<number>(0);
  // Single set of prices (no platform differentiation)
  const [priceNp, setPriceNp] = useState<number>(0);
  const [priceEp, setPriceEp] = useState<number>(0);
  const [priceEc, setPriceEc] = useState<number>(0);
  // COD postage and weight
  const [postageCod, setPostageCod] = useState<number>(0);
  const [weight, setWeight] = useState<number>(0.5);

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
        .select("*")
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
    setBaseCost(0);
    setHqCost(0);
    setKosPostageSm(0);
    setKosPostageSs(0);
    setPriceNp(0);
    setPriceEp(0);
    setPriceEc(0);
    setPostageCod(0);
    setWeight(0.5);
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
    setBaseCost(Number(bundle.base_cost) || 0);
    setHqCost(Number(bundle.hq_cost) || 0);
    setKosPostageSm(Number(bundle.kos_postage_sm) || 0);
    setKosPostageSs(Number(bundle.kos_postage_ss) || 0);
    // Single set of prices (use online prices as the standard, fallback to 0)
    setPriceNp(Number(bundle.price_online_np) || 0);
    setPriceEp(Number(bundle.price_online_ep) || 0);
    setPriceEc(Number(bundle.price_online_ec) || 0);
    // COD postage and weight
    setPostageCod(Number(bundle.postage_cod) || 0);
    setWeight(Number(bundle.weight) || 0.5);
    // Parse SKU to reconstruct bundle items for editing
    const skuParts = (bundle.sku || "").split(" + ");
    const reconstructedItems: BundleItem[] = [];
    skuParts.forEach((part: string) => {
      const match = part.match(/^(.+)-(\d+)$/);
      if (match) {
        const sku = match[1];
        const qty = parseInt(match[2]) || 1;
        const product = products.find((p: any) => p.sku === sku);
        if (product) {
          reconstructedItems.push({
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
            quantity: qty,
            baseCost: Number(product.base_cost) || 0,
          });
        }
      }
    });
    setBundleItems(reconstructedItems);
    setDialogOpen(true);
  };

  // Calculate combined base cost from bundle items
  const calculateCombinedBaseCost = (items: BundleItem[]): number => {
    return items.reduce((total, item) => total + (item.baseCost * item.quantity), 0);
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

    const newItems = [
      ...bundleItems,
      {
        productId: selectedProductId,
        productName: product.name,
        productSku: product.sku || "",
        quantity: itemQuantity,
        baseCost: Number(product.base_cost) || 0,
      },
    ];

    setBundleItems(newItems);
    // Auto-calculate base cost
    setBaseCost(calculateCombinedBaseCost(newItems));

    setSelectedProductId("");
    setItemQuantity(1);
  };

  // Remove item from bundle
  const handleRemoveItem = (productId: string) => {
    const newItems = bundleItems.filter((item) => item.productId !== productId);
    setBundleItems(newItems);
    // Recalculate base cost
    setBaseCost(calculateCombinedBaseCost(newItems));
  };

  // Update item quantity
  const handleUpdateItemQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    const newItems = bundleItems.map((item) =>
      item.productId === productId ? { ...item, quantity: newQuantity } : item
    );
    setBundleItems(newItems);
    // Recalculate base cost
    setBaseCost(calculateCombinedBaseCost(newItems));
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
        // Update existing bundle - set same price for all platforms
        const { error: updateError } = await supabase
          .from("logistic_bundles")
          .update({
            name: bundleName.trim(),
            description: bundleDescription.trim() || null,
            sku: generatedSku,
            base_cost: baseCost,
            hq_cost: hqCost,
            kos_postage_sm: kosPostageSm,
            kos_postage_ss: kosPostageSs,
            price_online_np: priceNp,
            price_online_ep: priceEp,
            price_online_ec: priceEc,
            price_tiktok_np: priceNp,
            price_tiktok_ep: priceEp,
            price_tiktok_ec: priceEc,
            price_shopee_np: priceNp,
            price_shopee_ep: priceEp,
            price_shopee_ec: priceEc,
            postage_cod: postageCod,
            weight: weight,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingBundleId);

        if (updateError) throw updateError;

        toast.success("Bundle updated successfully");
      } else {
        // Create new bundle - set same price for all platforms
        const { error: insertError } = await supabase
          .from("logistic_bundles")
          .insert({
            logistic_id: user?.id,
            name: bundleName.trim(),
            description: bundleDescription.trim() || null,
            sku: generatedSku,
            base_cost: baseCost,
            hq_cost: hqCost,
            kos_postage_sm: kosPostageSm,
            kos_postage_ss: kosPostageSs,
            price_online_np: priceNp,
            price_online_ep: priceEp,
            price_online_ec: priceEc,
            price_tiktok_np: priceNp,
            price_tiktok_ep: priceEp,
            price_tiktok_ec: priceEc,
            price_shopee_np: priceNp,
            price_shopee_ep: priceEp,
            price_shopee_ec: priceEc,
            postage_cod: postageCod,
            weight: weight,
          });

        if (insertError) throw insertError;

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

  // Delete bundle - open confirmation dialog
  const handleDeleteClick = (bundleId: string, bundleName: string) => {
    setBundleToDelete({ id: bundleId, name: bundleName });
    setDeleteDialogOpen(true);
  };

  // Confirm delete bundle
  const handleConfirmDelete = async () => {
    if (!bundleToDelete) return;

    try {
      const { error } = await supabase
        .from("logistic_bundles")
        .delete()
        .eq("id", bundleToDelete.id);

      if (error) throw error;

      toast.success("Bundle deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["logistic-bundles"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to delete bundle");
    } finally {
      setDeleteDialogOpen(false);
      setBundleToDelete(null);
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
                  <TableHead>SKU (Products)</TableHead>
                  <TableHead className="text-center">Base Cost</TableHead>
                  <TableHead className="text-center">HQ Cost (Kilang)</TableHead>
                  <TableHead className="text-center">Postage SM</TableHead>
                  <TableHead className="text-center">Postage SS</TableHead>
                  <TableHead className="text-center">Postage COD</TableHead>
                  <TableHead className="text-center">Weight (KG)</TableHead>
                  <TableHead className="text-center bg-blue-50" colSpan={3}>Minimum Price (RM)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                  <TableHead className="text-center text-xs bg-blue-50">NP</TableHead>
                  <TableHead className="text-center text-xs bg-blue-50">EP</TableHead>
                  <TableHead className="text-center text-xs bg-blue-50">EC</TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
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
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                        {bundle.sku || "-"}
                      </code>
                    </TableCell>
                    <TableCell className="text-center font-medium text-red-600">
                      RM {Number(bundle.base_cost || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-medium text-purple-600">
                      RM {Number(bundle.hq_cost || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-medium text-blue-600">
                      RM {Number(bundle.kos_postage_sm || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-medium text-orange-600">
                      RM {Number(bundle.kos_postage_ss || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-medium text-purple-600">
                      RM {Number(bundle.postage_cod || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center font-medium text-gray-600">
                      {Number(bundle.weight || 0.5).toFixed(2)}
                    </TableCell>
                    {/* Single set of prices (using online as reference) */}
                    <TableCell className="text-center text-sm bg-blue-50/50">
                      {Number(bundle.price_online_np || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm bg-blue-50/50">
                      {Number(bundle.price_online_ep || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm bg-blue-50/50">
                      {Number(bundle.price_online_ec || 0).toFixed(2)}
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
                        {!AUDIT_MODE && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(bundle.id, bundle.name)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
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

            {/* Cost Settings Section */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold">Cost Settings</h3>
              <p className="text-xs text-muted-foreground">
                Base cost is auto-calculated from product costs. Postage costs are for Semenanjung (SM) and Sabah/Sarawak (SS).
              </p>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="baseCost" className="text-red-600 font-medium">Base Cost (RM)</Label>
                  <Input
                    id="baseCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={baseCost || ""}
                    onChange={(e) => setBaseCost(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="border-red-300 focus:border-red-500"
                  />
                  <p className="text-xs text-muted-foreground">Combined product cost</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hqCost" className="text-purple-600 font-medium">HQ Cost Kilang (RM)</Label>
                  <Input
                    id="hqCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hqCost || ""}
                    onChange={(e) => setHqCost(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="border-purple-300 focus:border-purple-500"
                  />
                  <p className="text-xs text-muted-foreground">Optional HQ cost</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kosPostageSm" className="text-blue-600 font-medium">Kos Postage SM (RM)</Label>
                  <Input
                    id="kosPostageSm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={kosPostageSm || ""}
                    onChange={(e) => setKosPostageSm(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="border-blue-300 focus:border-blue-500"
                  />
                  <p className="text-xs text-muted-foreground">Semenanjung</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kosPostageSs" className="text-orange-600 font-medium">Kos Postage SS (RM)</Label>
                  <Input
                    id="kosPostageSs"
                    type="number"
                    min="0"
                    step="0.01"
                    value={kosPostageSs || ""}
                    onChange={(e) => setKosPostageSs(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="border-orange-300 focus:border-orange-500"
                  />
                  <p className="text-xs text-muted-foreground">Sabah/Sarawak</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postageCod" className="text-purple-600 font-medium">Postage COD (RM)</Label>
                  <Input
                    id="postageCod"
                    type="number"
                    min="0"
                    step="0.01"
                    value={postageCod || ""}
                    onChange={(e) => setPostageCod(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="border-purple-300 focus:border-purple-500"
                  />
                  <p className="text-xs text-muted-foreground">Additional fee for COD</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight" className="text-gray-600 font-medium">Weight (KG)</Label>
                  <Input
                    id="weight"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={weight || ""}
                    onChange={(e) => setWeight(parseFloat(e.target.value) || 0.5)}
                    placeholder="0.5"
                    className="border-gray-300 focus:border-gray-500"
                  />
                  <p className="text-xs text-muted-foreground">For NinjaVan shipping</p>
                </div>
              </div>
            </div>

            {/* Prices Section - Single set for all platforms */}
            <div className="border rounded-lg p-4 space-y-4">
              <h3 className="font-semibold">Minimum Prices (for Marketer)</h3>
              <p className="text-xs text-muted-foreground">
                Set minimum selling prices for each customer type. NP = New Prospect, EP = Existing Prospect, EC = Existing Customer.
              </p>

              {/* Single Price Section */}
              <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                <h4 className="font-medium text-blue-800">Minimum Price (All Platforms)</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="priceNp" className="text-xs">NP (RM)</Label>
                    <Input
                      id="priceNp"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceNp || ""}
                      onChange={(e) => setPriceNp(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="priceEp" className="text-xs">EP (RM)</Label>
                    <Input
                      id="priceEp"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceEp || ""}
                      onChange={(e) => setPriceEp(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="priceEc" className="text-xs">EC (RM)</Label>
                    <Input
                      id="priceEc"
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceEc || ""}
                      onChange={(e) => setPriceEc(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-9"
                    />
                  </div>
                </div>
              </div>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bundle?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{bundleToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LogisticBundleManagement;
