import { useState } from "react";
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
import { getMalaysiaStartOfMonth, getMalaysiaEndOfMonth } from "@/lib/utils";
import { Loader2, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const LogisticUpdateCostProduct = () => {
  const [costType, setCostType] = useState<"base_cost" | "hq_cost">("base_cost");
  const [startDate, setStartDate] = useState(getMalaysiaStartOfMonth());
  const [endDate, setEndDate] = useState(getMalaysiaEndOfMonth());
  const [isUpdating, setIsUpdating] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; errors: number } | null>(null);

  const handleUpdate = async () => {
    if (!startDate || !endDate) {
      toast.error("Please select start and end date");
      return;
    }

    setIsUpdating(true);
    setResult(null);

    try {
      // Use database function (SECURITY DEFINER) to bypass RLS and update in a single query
      const { data: updatedCount, error: rpcError } = await (supabase as any).rpc('update_cost_product', {
        p_cost_type: costType,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (rpcError) throw rpcError;

      const count = Number(updatedCount) || 0;
      setResult({ updated: count, skipped: 0, errors: 0 });
      toast.success(`Updated ${count} order(s) successfully`);
    } catch (error: any) {
      console.error("Update cost product error:", error);
      toast.error(error.message || "Failed to update cost product");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Update Cost Product</h1>
        <p className="text-muted-foreground text-sm">
          Bulk update cost product for orders based on their bundle's cost
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label>Cost Type</Label>
              <Select value={costType} onValueChange={(v: "base_cost" | "hq_cost") => setCostType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base_cost">Base Cost → cost_baseproduct</SelectItem>
                  <SelectItem value="hq_cost">HQ Cost → cost_hq</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <Button onClick={handleUpdate} disabled={isUpdating} className="h-10">
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Update Orders
                </>
              )}
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">How it works:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Fetches all orders in the date range that have a bundle assigned</li>
              <li>Looks up each bundle's <strong>{costType === "hq_cost" ? "HQ Cost" : "Base Cost"}</strong></li>
              <li>Updates the order's <strong>{costType === "hq_cost" ? "cost_hq" : "cost_baseproduct"}</strong> = bundle cost × order unit quantity</li>
              <li>Orders without a bundle are skipped</li>
            </ul>
          </div>

          {result && (
            <div className="flex gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-lg font-bold text-green-600">{result.updated}</p>
                  <p className="text-xs text-muted-foreground">Updated</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="text-lg font-bold text-yellow-600">{result.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped (no bundle)</p>
                </div>
              </div>
              {result.errors > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="text-lg font-bold text-red-600">{result.errors}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LogisticUpdateCostProduct;
