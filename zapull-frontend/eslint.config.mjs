import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Disallow direct usage of toast.success anywhere; enforce using our wrapper toastSuccess
      "no-restricted-properties": [
        "error",
        {
          object: "toast",
          property: "success",
          message: "Use toastSuccess from src/lib/toast instead of toast.success to keep UX consistent."
        }
      ]
    }
  }
];

export default eslintConfig;
