import type { FlagReason } from "./index";

export const FLAG_LABEL: Record<FlagReason, string> = {
  non_usd: "Not in USD",
  invalid_date: "Invalid or reversed dates",
  invalid_amount: "Invalid payout amount",
  missing_ref: "Missing booking reference",
  unknown_listing: "Listing doesn't match any of your properties",
  conflicting_duplicate: "Same booking appears twice with different payouts",
  payout_changed: "Payout differs from what you imported before",
};

export const FORMAT_LABEL: Record<string, string> = {
  airbnb: "Airbnb payout report",
  booking_com: "Booking.com payout statement",
  guesty: "Guesty export",
  manual: "Custom columns",
  unknown: "Unrecognized format",
};
