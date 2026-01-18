import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Minus, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getMalaysiaDate, getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from "@/lib/utils";

const LogisticStockOut = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState("");
  const [stockDate, setStockDate] = useState(getMalaysiaDate());
  const [description, setDescription] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: stockOuts, isLoading } = useQuery({
    queryKey: ["stock-out-logistic", user?.id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("stock_out_logistic")
        .select(`
          *,
          product:products(name, sku)
        `)
        .eq("logistic_id", user?.id)
        .order("date", { ascending: false });

      if (startDate) {
        query = query.gte("date", startDate);
      }
      if (endDate) {
        query = query.lte("date", endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const removeStock = useMutation({
    mutationFn: async () => {
      const quantityToRemove = parseInt(quantity);

      // Insert stock out record only (no product quantity update)
      const { error: stockOutError } = await supabase
        .from("stock_out_logistic")
        .insert({
          logistic_id: user?.id,
          product_id: selectedProduct,
          quantity: quantityToRemove,
          date: stockDate,
          description: description || null,
        });

      if (stockOutError) throw stockOutError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-out-logistic"] });
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Stock out recorded successfully");
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to process stock out");
    },
  });

  const deleteStock = useMutation({
    mutationFn: async (id: string) => {
      // Get the stock out record first to know the quantity and product
      const { data: stockRecord, error: fetchRecordError } = await supabase
        .from("stock_out_logistic")
        .select("product_id, quantity")
        .eq("id", id)
        .single();

      if (fetchRecordError) throw fetchRecordError;

      // Get current product quantity
      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("quantity, stock_out")
        .eq("id", stockRecord.product_id)
        .single();

      if (fetchError) throw fetchError;

      // Increase the quantity back to product (reverse the stock out)
      const { error: updateError } = await supabase
        .from("products")
        .update({
          quantity: (product.quantity || 0) + stockRecord.quantity,
          stock_out: Math.max(0, (product.stock_out || 0) - stockRecord.quantity),
          updated_at: new Date().toISOString(),
        })
        .eq("id", stockRecord.product_id);

      if (updateError) throw updateError;

      // Delete the record
      const { error } = await supabase
        .from("stock_out_logistic")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-out-logistic"] });
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Stock out record deleted successfully");
    },
    onError: (error: any) => {
      toast.error("Failed to delete stock: " + error.message);
    },
  });

  const resetForm = () => {
    setSelectedProduct("");
    setQuantity("");
    setStockDate(getMalaysiaDate());
    setDescription("");
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this stock out record?")) {
      deleteStock.mutate(id);
    }
  };

  const totalRecords = stockOuts?.length || 0;
  const totalQuantity = stockOuts?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const stats = [
    { title: "Total Records", value: totalRecords, icon: Calendar, color: "text-blue-600" },
    { title: "Total Units", value: totalQuantity, icon: Package, color: "text-red-600" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Stock Out
          </h1>
          <p className="text-muted-foreground mt-2">
            Remove stock from your inventory
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Minus className="mr-2 h-4 w-4" />
              Stock Out
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Stock Out</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({product.sku}) - Qty: {product.quantity || 0}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={stockDate}
                  onChange={(e) => setStockDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description (Optional)</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes about this stock out..."
                />
              </div>
              <Button
                onClick={() => removeStock.mutate()}
                className="w-full"
                variant="destructive"
                disabled={!selectedProduct || !quantity || removeStock.isPending}
              >
                {removeStock.isPending ? "Processing..." : "Stock Out"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold mt-2">{stat.value}</p>
                </div>
                <stat.icon className={`h-8 w-8 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter by Date</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading stock records...</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockOuts && stockOuts.length > 0 ? (
                    stockOuts.map((item) => {
                      const itemDate = item.date ? new Date(item.date) : null;
                      const isValidDate = itemDate && !isNaN(itemDate.getTime());

                      return (
                        <TableRow key={item.id}>
                          <TableCell>{isValidDate ? format(itemDate, "dd-MM-yyyy") : "-"}</TableCell>
                          <TableCell>{item.product?.name}</TableCell>
                          <TableCell>{item.product?.sku}</TableCell>
                          <TableCell className="font-bold text-red-600">-{item.quantity}</TableCell>
                          <TableCell>{item.description || "-"}</TableCell>
                          <TableCell>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No stock out records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LogisticStockOut;
