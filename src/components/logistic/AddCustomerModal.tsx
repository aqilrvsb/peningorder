import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, X } from "lucide-react";

interface BundleItem {
  product_id: string;
  quantity: number;
  product?: {
    id: string;
    name: string;
    sku: string;
  };
}

interface Bundle {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  total_price?: number;
  is_active: boolean;
  items: BundleItem[];
}

interface AddCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CustomerPurchaseData) => void;
  isLoading?: boolean;
  products: Array<{
    id: string;
    name: string;
    sku: string;
  }>;
  bundles?: Bundle[];
}

export interface CustomerPurchaseData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerPostcode?: string;
  customerCity?: string;
  customerState: string;
  paymentMethod: string;
  closingType: string;
  productId: string;
  quantity: number;
  price: number;
  trackingNumber?: string;
  orderFrom?: string;
  attachmentFile?: File;
  dateOrder?: string;
  isBundle?: boolean;
  bundleId?: string;
  bundleName?: string;
  bundleSku?: string;
  bundleItems?: BundleItem[];
}

const MALAYSIAN_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Kuala Lumpur",
  "Labuan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Penang",
  "Perak",
  "Perlis",
  "Putrajaya",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
];

const PAYMENT_METHODS = ["COD", "Online Transfer", "Cash"];

const CLOSING_TYPES = [
  "Website",
  "Wa Bot",
  "Call",
  "Manual",
  "Live",
  "Shop",
  "Walk In",
];

const ORDER_FROM_OPTIONS = [
  "Facebook",
  "Tiktok",
  "Shopee",
  "Database",
  "Google",
];

// These sources require manual tracking number and PDF attachment (no NinjaVan, phone optional)
const MANUAL_TRACKING_SOURCES = ["Tiktok", "Shopee"];

// These sources use NinjaVan for shipping (phone REQUIRED for shipping)
const NINJAVAN_SOURCES = ["Facebook", "Database", "Google"];

const AddCustomerModal = ({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  products,
  bundles = [],
}: AddCustomerModalProps) => {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPostcode, setCustomerPostcode] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [customerState, setCustomerState] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [closingType, setClosingType] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [orderFrom, setOrderFrom] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [dateOrder, setDateOrder] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bundle selection
  const [selectionType, setSelectionType] = useState<"product" | "bundle">("product");
  const [bundleId, setBundleId] = useState("");

  // Get selected bundle
  const selectedBundle = bundles.find(b => b.id === bundleId);

  // When bundle is selected
  const handleBundleChange = (id: string) => {
    setBundleId(id);
  };

  // Check if order source requires manual tracking (Tiktok/Shopee)
  const requiresManualTracking = MANUAL_TRACKING_SOURCES.includes(orderFrom);
  // Check if order source uses NinjaVan (Facebook, Database, Google)
  const usesNinjaVan = orderFrom && NINJAVAN_SOURCES.includes(orderFrom);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setAttachmentFile(file);
    }
  };

  const handleRemoveFile = () => {
    setAttachmentFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Normalize phone: auto-prepend 60 if starts with 0 or 1
  const normalizePhone = (raw: string): string => {
    let phone = raw.trim().replace(/\D/g, "");
    if (phone.startsWith("0")) {
      phone = "6" + phone; // 012345 → 6012345
    } else if (phone.startsWith("1")) {
      phone = "60" + phone; // 19723 → 6019723
    }
    return phone;
  };

  const handleSubmit = () => {
    // Basic validation - phone is optional for non-NinjaVan sources
    const isProductSelected = selectionType === "product" && productId;
    const isBundleSelected = selectionType === "bundle" && bundleId;

    if (!customerName || !customerState || !paymentMethod || !closingType || !quantity || !price) {
      return;
    }

    // Must have either product or bundle selected
    if (!isProductSelected && !isBundleSelected) {
      return;
    }

    // Requires orderFrom
    if (!orderFrom) {
      return;
    }

    // For Tiktok/Shopee: require tracking number (PDF attachment optional)
    if (requiresManualTracking && !trackingNumber) {
      return;
    }

    // For NinjaVan sources: require phone, postcode and city for shipping
    if (usesNinjaVan && (!customerPhone || !customerPostcode || !customerCity)) {
      return;
    }

    onSubmit({
      customerName,
      customerPhone: customerPhone ? normalizePhone(customerPhone) : "",
      customerAddress,
      customerPostcode: customerPostcode || undefined,
      customerCity: customerCity || undefined,
      customerState,
      paymentMethod,
      closingType,
      productId: isProductSelected ? productId : "",
      quantity: parseInt(quantity),
      price: parseFloat(price),
      trackingNumber: trackingNumber || undefined,
      orderFrom: orderFrom || undefined,
      attachmentFile: attachmentFile || undefined,
      dateOrder: dateOrder || undefined,
      isBundle: isBundleSelected,
      bundleId: isBundleSelected ? bundleId : undefined,
      bundleName: isBundleSelected ? selectedBundle?.name : undefined,
      bundleSku: isBundleSelected ? selectedBundle?.sku : undefined,
      bundleItems: isBundleSelected ? selectedBundle?.items : undefined,
    });

    // Reset form
    setCustomerName("");
    setCustomerPhone("");
    setCustomerAddress("");
    setCustomerPostcode("");
    setCustomerCity("");
    setCustomerState("");
    setPaymentMethod("");
    setClosingType("");
    setProductId("");
    setQuantity("");
    setPrice("");
    setTrackingNumber("");
    setOrderFrom("");
    setAttachmentFile(null);
    setDateOrder("");
    setSelectionType("product");
    setBundleId("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isProductSelected = selectionType === "product" && productId;
  const isBundleSelected = selectionType === "bundle" && bundleId;

  const isFormValid =
    customerName &&
    customerState &&
    paymentMethod &&
    closingType &&
    (isProductSelected || isBundleSelected) &&
    quantity &&
    parseInt(quantity) > 0 &&
    price &&
    parseFloat(price) > 0 &&
    orderFrom &&
    (!requiresManualTracking || trackingNumber) &&
    (!usesNinjaVan || (customerPhone && customerPostcode && customerCity));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Customer Purchase</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Customer Name */}
          <div className="space-y-2">
            <Label htmlFor="customer-name">Name Customer *</Label>
            <Input
              id="customer-name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Enter customer name"
            />
          </div>

          {/* Customer Phone - Required for NinjaVan, Optional for others */}
          <div className="space-y-2">
            <Label htmlFor="customer-phone">
              Phone Customer {usesNinjaVan ? "*" : "(Optional)"}
            </Label>
            <Input
              id="customer-phone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Enter customer phone"
            />
            {usesNinjaVan && (
              <p className="text-xs text-blue-600">
                Phone is required for NinjaVan shipping.
              </p>
            )}
          </div>

          {/* Customer Address */}
          <div className="space-y-2">
            <Label htmlFor="customer-address">Address</Label>
            <Textarea
              id="customer-address"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Enter customer address"
              rows={3}
            />
          </div>

          {/* Postcode and City - Required for NinjaVan */}
          {usesNinjaVan && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer-postcode">Postcode *</Label>
                <Input
                  id="customer-postcode"
                  value={customerPostcode}
                  onChange={(e) => setCustomerPostcode(e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-city">City *</Label>
                <Input
                  id="customer-city"
                  value={customerCity}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  placeholder="e.g. Kuala Lumpur"
                />
              </div>
            </div>
          )}

          {/* State */}
          <div className="space-y-2">
            <Label htmlFor="customer-state">State *</Label>
            <Select value={customerState} onValueChange={setCustomerState}>
              <SelectTrigger id="customer-state">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {MALAYSIAN_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="payment-method">Payment Method *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="payment-method">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Order From */}
          <div className="space-y-2">
            <Label htmlFor="order-from">Order From *</Label>
            <Select value={orderFrom} onValueChange={setOrderFrom}>
              <SelectTrigger id="order-from">
                <SelectValue placeholder="Select order source" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_FROM_OPTIONS.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {requiresManualTracking && (
              <p className="text-xs text-orange-600">
                Tiktok/Shopee orders require manual tracking number and PDF attachment.
              </p>
            )}
            {usesNinjaVan && (
              <p className="text-xs text-blue-600">
                This order will use NinjaVan integration for shipping.
              </p>
            )}
          </div>

          {/* Date Order - optional */}
          <div className="space-y-2">
            <Label htmlFor="date-order">Date Order (Optional)</Label>
            <Input
              id="date-order"
              type="date"
              value={dateOrder}
              onChange={(e) => setDateOrder(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use today's date. Select a date to backdate this order.
            </p>
          </div>

          {/* Jenis Closing */}
          <div className="space-y-2">
            <Label htmlFor="closing-type">Jenis Closing *</Label>
            <Select value={closingType} onValueChange={setClosingType}>
              <SelectTrigger id="closing-type">
                <SelectValue placeholder="Select jenis closing" />
              </SelectTrigger>
              <SelectContent>
                {CLOSING_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Product/Bundle Selection Type - Only show if bundles available */}
          {bundles.length > 0 && (
            <div className="space-y-2">
              <Label>Item Type *</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="selectionType"
                    value="product"
                    checked={selectionType === "product"}
                    onChange={() => {
                      setSelectionType("product");
                      setBundleId("");
                    }}
                    className="w-4 h-4"
                  />
                  <span>Product</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="selectionType"
                    value="bundle"
                    checked={selectionType === "bundle"}
                    onChange={() => {
                      setSelectionType("bundle");
                      setProductId("");
                    }}
                    className="w-4 h-4"
                  />
                  <span>Bundle</span>
                </label>
              </div>
            </div>
          )}

          {/* Product Selection */}
          {selectionType === "product" && (
            <div className="space-y-2">
              <Label htmlFor="product">Product *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger id="product">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Bundle Selection */}
          {selectionType === "bundle" && (
            <div className="space-y-2">
              <Label htmlFor="bundle">Bundle *</Label>
              <Select value={bundleId} onValueChange={handleBundleChange}>
                <SelectTrigger id="bundle">
                  <SelectValue placeholder="Select bundle" />
                </SelectTrigger>
                <SelectContent>
                  {bundles.filter(b => b.is_active).map((bundle) => (
                    <SelectItem key={bundle.id} value={bundle.id}>
                      {bundle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Show bundle items when selected */}
              {selectedBundle && (
                <div className="mt-2 p-3 bg-muted/50 rounded-md text-sm">
                  {selectedBundle.sku && (
                    <div className="mb-2 p-2 bg-blue-50 rounded">
                      <p className="text-xs text-blue-600">Bundle SKU:</p>
                      <code className="text-xs font-mono font-bold text-blue-900">
                        {selectedBundle.sku}
                      </code>
                    </div>
                  )}
                  <p className="font-medium mb-2">Bundle Contents:</p>
                  <ul className="space-y-1">
                    {selectedBundle.items.map((item, index) => (
                      <li key={index} className="flex justify-between">
                        <span>{item.product?.name || 'Unknown Product'}</span>
                        <span className="text-muted-foreground">x {item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Unit/Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Unit *</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter unit quantity"
            />
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label htmlFor="price">Price (RM) *</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Enter price"
            />
          </div>

          {/* Tracking Number - Optional for all, but shows hint for Tiktok/Shopee */}
          <div className="space-y-2">
            <Label htmlFor="tracking-number">
              Tracking Number {requiresManualTracking ? "*" : usesNinjaVan ? "(Auto-generated)" : "(Optional)"}
            </Label>
            <Input
              id="tracking-number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder={
                requiresManualTracking
                  ? "Enter tracking number from Tiktok/Shopee"
                  : usesNinjaVan
                  ? "Will be auto-generated"
                  : "Enter tracking number (optional)"
              }
              disabled={usesNinjaVan}
            />
            {usesNinjaVan && (
              <p className="text-xs text-muted-foreground">
                Tracking number will be automatically generated by NinjaVan.
              </p>
            )}
          </div>

          {/* PDF Attachment - For Tiktok/Shopee (optional now) */}
          {requiresManualTracking && (
            <div className="space-y-2">
              <Label htmlFor="attachment">PDF Attachment (Optional)</Label>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="attachment"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {!attachmentFile ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload PDF
                  </Button>
                ) : (
                  <div className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-red-500" />
                      <span className="text-sm truncate max-w-[200px]">
                        {attachmentFile.name}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveFile}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Upload the shipping label PDF from Tiktok/Shopee.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid || isLoading}>
            {isLoading ? "Processing..." : "Submit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddCustomerModal;
