import type { ReactNode } from "react";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import GlobalStyles from "@mui/material/GlobalStyles";
import { zhCN } from "@mui/material/locale";

const theme = createTheme(
  {
    breakpoints: {
      values: {
        xs: 0,
        sm: 40,
        md: 48,
        lg: 64,
        xl: 80,
      },
      unit: "rem",
    },
    cssVariables: {
      nativeColor: true,
    },
    components: {
      MuiInputBase: {
        defaultProps: {
          // Workaround: 禁用 TextField 全局样式自动注入；原因是这些样式会注入到 DOM 最顶层，
          // 在启用 CSS Layer 时，导致 MUI 的 layer 优先级变为最低，被 TailwindCSS 的样式覆盖
          // Ref: https://mui.com/material-ui/react-text-field/#performance
          disableInjectingGlobalStyles: true,
        },
      },
    },
    palette: {
      mode: 'dark',
    },
    colorSchemes: {
      dark: {
        palette: {
          primary: {
            main: "var(--color-blue-500)",
            light: "var(--color-blue-400)",
            dark: "var(--color-blue-700)",
          },
      
          secondary: {
            main: "var(--color-violet-500)",
            light: "var(--color-violet-400)",
            dark: "var(--color-violet-700)",
          },
      
          grey: {
            50: "var(--color-zinc-950)",
            100: "var(--color-zinc-900)",
            200: "var(--color-zinc-800)",
            300: "var(--color-zinc-700)",
            400: "var(--color-zinc-600)",
            500: "var(--color-zinc-500)",
            600: "var(--color-zinc-400)",
            700: "var(--color-zinc-300)",
            800: "var(--color-zinc-200)",
            900: "var(--color-zinc-100)",
      
            A100: "var(--color-zinc-900)",
            A200: "var(--color-zinc-800)",
            A400: "var(--color-zinc-600)",
            A700: "var(--color-zinc-300)",
          },
      
          text: {
            primary: "var(--color-zinc-100)",
            secondary: "var(--color-zinc-400)",
            disabled: "var(--color-zinc-600)",
          },
      
          divider: "var(--color-zinc-800)",
      
          // Workaround: 开启 Native Color 后，MUI 会把 TableCell 边框颜色算得过浅，先手动固定边框色
          TableCell: {
            border: "var(--color-zinc-800)",
          },
      
          background: {
            default: "var(--color-zinc-950)",
            paper: "var(--color-zinc-950)",
          },
        },
      },
    },
    typography: {
      fontFamily: "var(--default-font-family)",
    },
  },
  zhCN,
);

export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles
        styles={{
          "@keyframes mui-auto-fill": { from: { display: "block" } },
          "@keyframes mui-auto-fill-cancel": {
            from: { display: "block" },
          },
        }}
      />
      {children}
    </ThemeProvider>
  );
}
