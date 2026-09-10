export type OrdersFilter =
  | "active"
  | "unpaid"
  | "awaiting_sample"
  | "overdue"
  | "urgent"
  | "rush"
  | "all";
export const ORDER_FILTERS: { id: OrdersFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "unpaid", label: "Unpaid" },
  { id: "awaiting_sample", label: "Awaiting sample" },
  { id: "overdue", label: "Overdue" },
  { id: "urgent", label: "Urgent" },
  { id: "rush", label: "Rush" },
  { id: "all", label: "All orders" },
];
