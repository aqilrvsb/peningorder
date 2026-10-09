import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, ExternalLink, Webhook, Globe, Key, AlertCircle, CheckCircle, ShoppingCart, Store, ListChecks, Zap, Activity } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, IconTile, TableSkeleton, EmptyState } from "@/components/common/SoftUI";

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
      <PageHeader
        title="Webhook Settings"
        description="Configure auto order from your WooCommerce website or Shoppego store"
        icon={Webhook}
        tone="brand"
      />

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
              <CardTitle className="flex items-center gap-3">
                <IconTile icon={ShoppingCart} tone="purple" size="sm" />
                WooCommerce Webhook Configuration
              </CardTitle>
              <CardDescription>
                Use these settings in your WooCommerce admin panel under WooCommerce → Settings → Advanced → Webhooks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Delivery URL */}
              <div className="space-y-1.5">
                <p className="section-label flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Delivery URL
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <code className="min-w-0 flex-1 break-all px-1 text-xs">{woocommerceWebhookUrl}</code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
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
              <div className="space-y-1.5">
                <p className="section-label flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Secret (Your ID Staff)
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <code className="min-w-0 flex-1 break-all px-1 text-xs">{webhookSecret}</code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
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
              <div className="space-y-1.5">
                <p className="section-label flex items-center gap-2">Topic</p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <code className="min-w-0 flex-1 break-all px-1 text-xs">order.updated</code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
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
              <div className="space-y-1.5">
                <p className="section-label">Status</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                </span>
              </div>
            </CardContent>
          </Card>

          {/* WooCommerce Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3"><IconTile icon={ListChecks} tone="blue" size="sm" /> WooCommerce Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
              <CardTitle className="flex items-center gap-3">
                <IconTile icon={Store} tone="orange" size="sm" />
                Shoppego Webhook Configuration
              </CardTitle>
              <CardDescription>
                Use this webhook URL in your Shoppego dashboard under Settings → Webhook
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Delivery URL */}
              <div className="space-y-1.5">
                <p className="section-label flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Webhook URL
                </p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <code className="min-w-0 flex-1 break-all px-1 text-xs">{shoppegoWebhookUrl}</code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
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
              <div className="space-y-1.5">
                <p className="section-label flex items-center gap-2">Event</p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <code className="min-w-0 flex-1 break-all px-1 text-xs">checkout.completed</code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
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
              <div className="space-y-1.5">
                <p className="section-label">Status</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Active
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Shoppego Setup Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3"><IconTile icon={ListChecks} tone="blue" size="sm" /> Shoppego Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-primary-foreground flex items-center justify-center text-sm font-bold">
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
          <CardTitle className="flex items-center gap-3"><IconTile icon={Zap} tone="amber" size="sm" /> Auto Features</CardTitle>
          <CardDescription>
            When an order is received from WooCommerce or Shoppego, the following happens automatically:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50/70 p-3 dark:border-green-500/30 dark:bg-green-500/10">
              <IconTile icon={CheckCircle} tone="green" size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-green-900 dark:text-green-300">Auto Key-In Order</p>
                <p className="text-sm text-green-700 dark:text-green-400/80">Order automatically created in your History tab</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
              <IconTile icon={CheckCircle} tone="blue" size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-blue-900 dark:text-blue-300">Auto Generate Tracking</p>
                <p className="text-sm text-blue-700 dark:text-blue-400/80">NinjaVan tracking number generated instantly</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50/70 p-3 dark:border-purple-500/30 dark:bg-purple-500/10">
              <IconTile icon={CheckCircle} tone="purple" size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-purple-900 dark:text-purple-300">Auto WhatsApp</p>
                <p className="text-sm text-purple-700 dark:text-purple-400/80">Customer receives WhatsApp with order details & tracking</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Webhook Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-3"><IconTile icon={Activity} tone="cyan" size="sm" /> Recent Webhook Activity</span>
            <div className="flex flex-wrap gap-2 text-sm font-normal">
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-green-600 dark:bg-green-500/10 dark:text-green-400">
                <CheckCircle className="h-4 w-4" /> {successCount} success
              </span>
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertCircle className="h-4 w-4" /> {errorCount} errors
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <TableSkeleton rows={3} cols={3} />
          ) : webhookLogs.length > 0 ? (
            <div className="space-y-2">
              {webhookLogs.slice(0, 5).map((log: any) => (
                <div
                  key={log.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                    log.response_status === 200 ? "border-green-200 bg-green-50/70 dark:border-green-500/30 dark:bg-green-500/10" : "border-red-200 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/10"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {log.response_status === 200 ? (
                      <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {log.parsed_data?.idSale || "Order"} - {log.parsed_data?.customerName || "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-MY")}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {log.parsed_data?.trackingNumber && (
                      <p className="font-mono text-sm whitespace-nowrap">{log.parsed_data.trackingNumber}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {log.processing_time_ms}ms
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Webhook}
              title="No webhook activity yet"
              description="Orders from your website will appear here"
              className="py-8"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketerWebhookSettings;
