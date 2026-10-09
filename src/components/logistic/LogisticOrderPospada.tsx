import LogisticOrder from "./LogisticOrder";

// "Order Pospada" — exactly the Order tab (same table, filters, Generate Tracking, Shipped,
// Print, Reject…), but listing Pending bookings that have a pospada date. A separate
// component so each tab keeps its own filters/selection when switching between them.
const LogisticOrderPospada = () => <LogisticOrder pospada />;

export default LogisticOrderPospada;
