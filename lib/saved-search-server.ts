import { z } from "zod";

const institutionTypes = ["CHILDCARE", "KINDERGARTEN", "ACADEMY", "TUTORING"] as const;
const sorts = ["RECOMMENDED", "DISTANCE", "RATING", "REVIEWS", "PRICE", "NAME", "CHECKED"] as const;

export const savedSearchCreateInput = z.object({
  label: z.string().trim().min(1).max(40),
  query: z.string().trim().max(80),
  zone: z.enum(["DONGTAN_1", "DONGTAN_2"]),
  institutionType: z.union([z.literal("ALL"), z.enum(institutionTypes)]),
  sort: z.enum(sorts),
  pickup: z.boolean(),
  trial: z.boolean(),
});

export const savedSearchDeleteInput = z.object({
  id: z.string().uuid(),
});

export type SavedSearchCreateInput = z.infer<typeof savedSearchCreateInput>;

export function buildSavedSearchPath(input: SavedSearchCreateInput) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  params.set("zone", input.zone);
  if (input.institutionType !== "ALL") params.set("type", input.institutionType);
  if (input.sort !== "RECOMMENDED" && input.sort !== "NAME") params.set("sort", input.sort);
  if (input.pickup) params.set("pickup", "true");
  if (input.trial) params.set("trial", "true");
  const query = params.toString();
  return query ? `/discover?${query}` : "/discover";
}
