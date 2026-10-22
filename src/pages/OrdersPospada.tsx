import Orders from './Orders';

// "History Pospada" — exactly the History tab (same boxes, table, filters, Edit, Print…), but
// listing only booking orders that have a pospada date. A separate component so each tab keeps
// its own filters when switching between them.
const OrdersPospada = () => <Orders pospada />;

export default OrdersPospada;
