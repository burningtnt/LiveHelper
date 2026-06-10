import antfu from "@antfu/eslint-config";
import betterTailwindcssPlugin from "eslint-plugin-better-tailwindcss";
import prettier from "eslint-plugin-prettier/recommended";

export default antfu(
  {
    react: true,
    formatters: {
      css: true,
    },
  },
  {
    name: "better-tailwindcss/recommended",
    ...betterTailwindcssPlugin.configs.recommended,
    settings: {
      "better-tailwindcss": {
        entryPoint: "app/app.css",
      },
    },
  },
  prettier,
);
