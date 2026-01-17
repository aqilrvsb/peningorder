import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Package, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const LogisticProductManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Add product dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductSku, setNewProductSku] = useState("");
  const [newProductBaseCost, setNewProductBaseCost] = useState("");
  const [newProductQuantity, setNewProductQuantity] = useState("0");

  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editBaseCost, setEditBaseCost] = useState("");

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);

  // Fetch all products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, base_cost, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch inventory for this logistic user (user_id = logistic user id)
  const { data: inventory, isLoading: inventoryLoading } = useQuery({
    queryKey: ["logistic-inventory", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, product_id, quantity, updated_at")
        .eq("user_id", user?.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Add product mutation
  const addProductMutation = useMutation({
    mutationFn: async ({
      name,
      sku,
      baseCost,
      quantity,
    }: {
      name: string;
      sku: string;
      baseCost: number;
      quantity: number;
    }) => {
      // Insert new product
      const { data: newProduct, error: productError } = await supabase
        .from("products")
        .insert({
          name,
          sku,
          base_cost: baseCost,
          is_active: true,
        })
        .select()
        .single();

      if (productError) throw productError;

      // Insert inventory record for this logistic user
      if (quantity > 0) {
        const { error: inventoryError } = await supabase
          .from("inventory")
          .insert({
            user_id: user?.id,
            product_id: newProduct.id,
            quantity,
          });

        if (inventoryError) throw inventoryError;
      }

      return newProduct;
    },
    onSuccess: () => {
      toast.success("Product added successfully");
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-inventory"] });
      setIsAddDialogOpen(false);
      setNewProductName("");
      setNewProductSku("");
      setNewProductBaseCost("");
      setNewProductQuantity("0");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to add product");
    },
  });

  // Update product and inventory mutation
  const updateProductMutation = useMutation({
    mutationFn: async ({
      productId,
      baseCost,
      quantity,
    }: {
      productId: string;
      baseCost: number;
      quantity: number;
    }) => {
      // Update product base cost
      const { error: productError } = await supabase
        .from("products")
        .update({ base_cost: baseCost, updated_at: new Date().toISOString() })
        .eq("id", productId);

      if (productError) throw productError;

      // Check if inventory record exists
      const existingInventory = inventory?.find(inv => inv.product_id === productId);

      if (existingInventory) {
        // Update existing record
        const { error } = await supabase
          .from("inventory")
          .update({ quantity, updated_at: new Date().toISOString() })
          .eq("id", existingInventory.id);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from("inventory")
          .insert({
            user_id: user?.id,
            product_id: productId,
            quantity,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Product updated successfully");
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-inventory"] });
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      setEditQuantity("");
      setEditBaseCost("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update product");
    },
  });

  // Delete product mutation
  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      // First delete inventory records for this product (for this user)
      const { error: inventoryError } = await supabase
        .from("inventory")
        .delete()
        .eq("product_id", productId)
        .eq("user_id", user?.id);

      if (inventoryError) throw inventoryError;

      // Then set product as inactive (soft delete)
      const { error: productError } = await supabase
        .from("products")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", productId);

      if (productError) throw productError;
    },
    onSuccess: () => {
      toast.success("Product deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["logistic-inventory"] });
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete product");
    },
  });

  // Open delete dialog
  const openDeleteDialog = (product: any) => {
    setProductToDelete({ id: product.id, name: product.name });
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleConfirmDelete = () => {
    if (productToDelete) {
      deleteProductMutation.mutate(productToDelete.id);
    }
  };

  // Get quantity for a product
  const getQuantity = (productId: string) => {
    const inv = inventory?.find(i => i.product_id === productId);
    return inv?.quantity || 0;
  };

  // Open edit dialog
  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setEditQuantity(String(getQuantity(product.id)));
    setEditBaseCost(String(product.base_cost || 0));
    setIsEditDialogOpen(true);
  };

  // Handle add product submit
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      toast.error("Please enter product name");
      return;
    }
    if (!newProductSku.trim()) {
      toast.error("Please enter product SKU");
      return;
    }
    const baseCost = parseFloat(newProductBaseCost) || 0;
    const qty = parseInt(newProductQuantity, 10) || 0;
    if (baseCost < 0) {
      toast.error("Base cost cannot be negative");
      return;
    }
    if (qty < 0) {
      toast.error("Quantity cannot be negative");
      return;
    }
    addProductMutation.mutate({
      name: newProductName.trim(),
      sku: newProductSku.trim().toUpperCase(),
      baseCost,
      quantity: qty,
    });
  };

  // Handle edit submit
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(editQuantity, 10);
    const baseCost = parseFloat(editBaseCost);
    if (isNaN(qty) || qty < 0) {
      toast.error("Please enter a valid quantity (0 or more)");
      return;
    }
    if (isNaN(baseCost) || baseCost < 0) {
      toast.error("Please enter a valid base cost (0 or more)");
      return;
    }
    if (!editingProduct) return;
    updateProductMutation.mutate({
      productId: editingProduct.id,
      baseCost,
      quantity: qty,
    });
  };

  // Stats calculation
  const totalProducts = products?.length || 0;
  const totalQuantity = products?.reduce((sum, p) => sum + getQuantity(p.id), 0) || 0;
  const productsWithStock = products?.filter(p => getQuantity(p.id) > 0).length || 0;

  const isLoading = productsLoading || inventoryLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Product Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your products and inventory
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{totalProducts}</p>
              </div>
              <Package className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Products with Stock</p>
                <p className="text-2xl font-bold text-green-600">{productsWithStock}</p>
              </div>
              <Package className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Quantity</p>
                <p className="text-2xl font-bold text-blue-600">{totalQuantity.toLocaleString()}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Inventory</h3>
          </div>

          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Base Cost</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products && products.length > 0 ? (
                  products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.sku}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>RM {(product.base_cost || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-bold text-lg">
                        {getQuantity(product.id).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(product)}
                          >
                            <Pencil className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDeleteDialog(product)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No products available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Product Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newProductName">Product Name *</Label>
              <Input
                id="newProductName"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Enter product name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newProductSku">SKU *</Label>
              <Input
                id="newProductSku"
                value={newProductSku}
                onChange={(e) => setNewProductSku(e.target.value.toUpperCase())}
                placeholder="Enter SKU (e.g., GSI)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newProductBaseCost">Base Cost (RM)</Label>
              <Input
                id="newProductBaseCost"
                type="number"
                min="0"
                step="0.01"
                value={newProductBaseCost}
                onChange={(e) => setNewProductBaseCost(e.target.value)}
                placeholder="Enter base cost"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newProductQuantity">Initial Quantity</Label>
              <Input
                id="newProductQuantity"
                type="number"
                min="0"
                value={newProductQuantity}
                onChange={(e) => setNewProductQuantity(e.target.value)}
                placeholder="Enter initial quantity"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addProductMutation.isPending}>
                {addProductMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Product"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Product</Label>
              <Input
                value={editingProduct ? `${editingProduct.sku} - ${editingProduct.name}` : ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editBaseCost">Base Cost (RM)</Label>
              <Input
                id="editBaseCost"
                type="number"
                min="0"
                step="0.01"
                value={editBaseCost}
                onChange={(e) => setEditBaseCost(e.target.value)}
                placeholder="Enter base cost"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editQuantity">Quantity</Label>
              <Input
                id="editQuantity"
                type="number"
                min="0"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateProductMutation.isPending}>
                {updateProductMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{productToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteProductMutation.isPending}
            >
              {deleteProductMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LogisticProductManagement;
