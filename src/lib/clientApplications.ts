import { supabase } from "./supabase";
export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "rejected";
export type ApplicationDetails = Record<string, string | string[] | boolean>;
export interface ClientApplication {
  id: string;
  user_id: string;
  status: ApplicationStatus;
  details: ApplicationDetails;
  review_note: string;
  updated_at: string;
  created_at: string;
}
export const applicationLabels: Record<ApplicationStatus, string> = {
  draft: "Application in progress",
  submitted: "Application under review",
  changes_requested: "Changes requested",
  approved: "Application approved",
  rejected: "Application not approved",
};
export const applicationFields = [
  ["Company", "company_name", "Company name", "text", true],
  ["Company", "company_type", "Organization type", "text", true],
  ["Company", "website", "Company website", "url", false],
  ["Company", "country", "Country", "text", true],
  ["Company", "address", "Street address", "text", true],
  ["Company", "city", "City", "text", true],
  ["Company", "state", "State / region", "text", false],
  ["Company", "postal_code", "Postal code", "text", true],
  ["Primary contact", "contact_name", "Full name", "text", true],
  ["Primary contact", "contact_title", "Job title", "text", true],
  ["Primary contact", "contact_email", "Work email", "email", true],
  ["Primary contact", "phone", "Phone", "tel", true],
  [
    "Testing requirements",
    "research_focus",
    "Research focus / intended use",
    "text",
    true,
  ],
  [
    "Testing requirements",
    "sample_types",
    "Sample materials and formats",
    "text",
    true,
  ],
  [
    "Testing requirements",
    "monthly_samples",
    "Estimated samples per month",
    "number",
    true,
  ],
  [
    "Testing requirements",
    "first_batch_samples",
    "Samples in your first shipment",
    "number",
    true,
  ],
  [
    "Testing requirements",
    "target_date",
    "Target first shipment",
    "date",
    false,
  ],
  [
    "Testing requirements",
    "handling_notes",
    "Handling, storage or hazard information",
    "text",
    false,
  ],
  [
    "Shipping & billing",
    "shipping_country",
    "Country you will ship from",
    "text",
    true,
  ],
  ["Shipping & billing", "billing_email", "Billing email", "email", true],
  [
    "Shipping & billing",
    "billing_notes",
    "Billing address or purchase order requirements",
    "text",
    false,
  ],
] as const;
export const testingServices = [
  "Identity, purity & quantity",
  "Heavy metals",
  "Endotoxin",
  "Sterility",
  "Fentanyl detection",
  "Other / discuss with the lab",
];
export async function loadApplication(userId: string) {
  const { data, error } = await supabase
    .from("client_applications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ClientApplication | null;
}
export async function hasOrderingAccess(userId: string) {
  const { data, error } = await supabase
    .from("client_order_access")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
