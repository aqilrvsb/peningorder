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
import { Package, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

const LogisticProductManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Edit state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editQuantity, setEditQuantity] = useState("");

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

  // Update inventory mutation
  const updateInventoryMutation = useMutation({
    mutationFn: async ({
      productId,
      quantity,
    }: {
      productId: string;
      quantity: number;
    }) => {
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
      toast.success("Inventory quantity updated successfully");
      queryClient.invalidateQueries({ queryKey: ["logistic-inventory"] });
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      setEditQuantity("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update inventory");
    },
  });

  // Get quantity for a product
  const getQuantity = (productId: string) => {
    const inv = inventory?.find(i => i.product_id === productId);
    return inv?.quantity || 0;
  };

  // Open edit dialog
  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setEditQuantity(String(getQuantity(product.id)));
    setIsEditDialogOpen(true);
  };

  // Handle edit submit
  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(editQuantity, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error("Please enter a valid quantity (0 or more)");
      return;
    }
    if (!editingProduct) return;
    updateInventoryMutation.mutate({
      productId: editingProduct.id,
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
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
          Inventory Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your inventory quantities
        </p>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(product)}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
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

      {/* Edit Quantity Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Inventory Quantity</DialogTitle>
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
              <Button type="submit" disabled={updateInventoryMutation.isPending}>
                {updateInventoryMutation.isPending ? (
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
    </div>
  );
};

export default LogisticProductManagement;
