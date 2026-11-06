// Safety check, version 1 (指示書 第5.1節; original: safety.schema.json).
import { z } from "zod";

export const safety = z.strictObject({
  schema_version: z.literal("1"),
  safety_flag: z.enum(["none", "distress", "inappropriate"]),
});

export type Safety = z.infer<typeof safety>;
