// Where the stored discriminating problems live (指示書 第6.7節 手順3).
import { fileURLToPath } from "node:url";

export const DEFAULT_DIR = fileURLToPath(new URL("../../../content/problems/discriminating/", import.meta.url));
