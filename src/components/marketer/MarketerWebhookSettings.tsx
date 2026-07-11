import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, ExternalLink, Webhook, Globe, Key, AlertCircle, CheckCircle, ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";

const MarketerWebhookSettings = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  // Get Supabase project URL from the client
  const supabaseUrl = (supabase as any).supabaseUrl || "";
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

  // Construct webhook URLs
  const woocommerceWebhookUrl = profile?.idstaff
    ? `${supabaseUrl}/functions/v1/woocommerce-webhook?marketer_id=${profile.idstaff}`
    : "";

  const shoppegoWebhookUrl = profile?.idstaff
    ? `${supabaseUrl}/functions/v1/woocommerce-webhook?marketer_id=${profile.idstaff}&platform=shoppego`
    : "";

  // Webhook secret is the marketer's idstaff
  const webhookSecret = profile?.idstaff || "";

  // Fetch recent webhook logs for this marketer (both WooCommerce and Shoppego)
  const { data: webhookLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["webhook-logs", profile?.idstaff],
    queryFn: async () => {
      if (!profile?.idstaff) return [];

      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .in("webhook_type", ["woocommerce", "shoppego"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;

      // Filter logs that contain this marketer's idstaff
      return (data || []).filter((log: any) => {
        const parsedData = log.parsed_data as any;
        return parsedData?.marketerIdStaff === profile.idstaff;
      });
    },
    enabled: !!profile?.idstaff,
  });

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    toast.success(`${type} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const successCount = webhookLogs.filter((log: any) => log.response_status === 200).length;
  const errorCount = webhookLogs.filter((log: any) => log.response_status !== 200).length;

  // Handle tab change - refresh webhook logs
  const handleTabChange = () => {
    queryClient.invalidateQueries({ queryKey: ["webhook-logs"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhook Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure auto order from your WooCommerce website or Shoppego store
        </p>
      </div>

      {/* Platform Tabs */}
      <Tabs defaultValue="woocommerce" className="w-full" onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="woocommerce" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            WooCommerce
          </TabsTrigger>
          <TabsTrigger value="shoppego" className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            Shoppego
          </TabsTrigger>
        </TabsList>

        {/* WooCommerce Tab */}
        <TabsContent value="woocommerce" className="space-y-6 mt-6">
          {/* Webhook URL Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                WooCommerce Webhook Configuration
              </CardTitle>
              <CardDescription>
                Use these settings in your WooCommerce admin panel under WooCommerce → Settings → Advanced → Webhooks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Delivery URL */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Delivery URL
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={woocommerceWebhookUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(woocommerceWebhookUrl, "WooCommerce URL")}
                  >
                    {copied === "WooCommerce URL" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Secret */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Secret (Your ID Staff)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={webhookSecret}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(webhookSecret, "Secret")}
                  >
                    {copied === "Secret" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Topic */}
              <div className="space-y-2">
                <Label>Topic</Label>
                <div className="flex gap-2">
                  <Input
                    value="order.updated"
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard("order.updated", "Topic")}
                  >
                    {copied === "Topic" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Input value="Active" readOnly className="text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* WooCommerce Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>WooCommerce Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Go to WooCommerce Settings</p>
                    <p className="text-sm text-muted-foreground">
                      In your WordPress admin, navigate to WooCommerce → Settings → Advanced → Webhooks
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Add New Webhook</p>
                    <p className="text-sm text-muted-foreground">
                      Click "Add webhook" and fill in the following:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside mt-1">
                      <li>Name: Peningorder Order</li>
                      <li>Status: Active</li>
                      <li>Topic: Order updated</li>
                      <li>Delivery URL: Copy from above</li>
                      <li>Secret: Your ID Staff (e.g., {profile?.idstaff || "MR-001"})</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Configure Product SKUs</p>
                    <p className="text-sm text-muted-foreground">
                      Make sure your WooCommerce products have SKUs that match your bundles in Peningorder.
                      Format: <code className="bg-muted px-1 rounded">BUNDLE-SKU-QUANTITY</code> (e.g., ZP250-6 for 6 units)
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    4
                  </div>
                  <div>
                    <p className="font-medium">Test Your Webhook</p>
                    <p className="text-sm text-muted-foreground">
                      Create a test order on your website. When payment is confirmed (status: processing),
                      the order will automatically appear in your Peningorder dashboard with tracking number.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shoppego Tab */}
        <TabsContent value="shoppego" className="space-y-6 mt-6">
          {/* Webhook URL Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Shoppego Webhook Configuration
              </CardTitle>
              <CardDescription>
                Use this webhook URL in your Shoppego dashboard under Settings → Webhook
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Delivery URL */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Webhook URL
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={shoppegoWebhookUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(shoppegoWebhookUrl, "Shoppego URL")}
                  >
                    {copied === "Shoppego URL" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Event */}
              <div className="space-y-2">
                <Label>Event</Label>
                <div className="flex gap-2">
                  <Input
                    value="checkout.completed"
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard("checkout.completed", "Shoppego Event")}
                  >
                    {copied === "Shoppego Event" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label>Status</Label>
                <Input value="Active" readOnly className="text-sm" />
              </div>
            </CardContent>
          </Card>

          {/* Shoppego Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Shoppego Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Go to Shoppego Dashboard</p>
                    <p className="text-sm text-muted-foreground">
                      Log in to your Shoppego account and navigate to Settings → Webhook
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Add New Webhook</p>
                    <p className="text-sm text-muted-foreground">
                      Click "Add Webhook" and configure:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside mt-1">
                      <li>Webhook URL: Copy from above</li>
                      <li>Event: checkout.completed</li>
                      <li>Status: Active</li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Configure Product SKUs</p>
                    <p className="text-sm text-muted-foreground">
                      Make sure your Shoppego products have SKUs that match your bundles in Peningorder.
                      Format: <code className="bg-muted px-1 rounded">BUNDLE-SKU-QUANTITY</code> (e.g., ZP250-6 for 6 units)
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                    4
                  </div>
                  <div>
                    <p className="font-medium">Test Your Webhook</p>
                    <p className="text-sm text-muted-foreground">
                      Create a test checkout on your Shoppego store. When checkout is completed,
                      the order will automatically appear in your Peningorder dashboard with tracking number.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* What Happens When Order Received */}
      <Card>
        <CardHeader>
          <CardTitle>Auto Features</CardTitle>
          <CardDescription>
            When an order is received from WooCommerce or Shoppego, the following happens automatically:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Auto Key-In Order</p>
                <p className="text-sm text-green-700">Order automatically created in your History tab</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-blue-900">Auto Generate Tracking</p>
                <p className="text-sm text-blue-700">NinjaVan tracking number generated instantly</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <CheckCircle className="h-5 w-5 text-purple-600" />
              <div>
                <p className="font-medium text-purple-900">Auto WhatsApp</p>
                <p className="text-sm text-purple-700">Customer receives WhatsApp with order details & tracking</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Webhook Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Recent Webhook Activity</span>
            <div className="flex gap-2 text-sm font-normal">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="h-4 w-4" /> {successCount} success
              </span>
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-4 w-4" /> {errorCount} errors
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <p className="text-muted-foreground text-center py-4">Loading...</p>
          ) : webhookLogs.length > 0 ? (
            <div className="space-y-2">
              {webhookLogs.slice(0, 5).map((log: any) => (
                <div
                  key={log.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    log.response_status === 200 ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {log.response_status === 200 ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">
                        {log.parsed_data?.idSale || "Order"} - {log.parsed_data?.customerName || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("en-MY")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {log.parsed_data?.trackingNumber && (
                      <p className="font-mono text-sm">{log.parsed_data.trackingNumber}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {log.processing_time_ms}ms
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No webhook activity yet</p>
              <p className="text-sm">Orders from your website will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketerWebhookSettings;
