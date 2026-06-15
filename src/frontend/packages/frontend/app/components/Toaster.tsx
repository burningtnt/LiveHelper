import type { CSSProperties } from "react";
import type { ToasterProps } from "sonner";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import InfoOutline from "@mui/icons-material/InfoOutline";
import TaskAlt from "@mui/icons-material/TaskAlt";
import WarningAmber from "@mui/icons-material/WarningAmber";
import CircularProgress from "@mui/material/CircularProgress";
import { Toaster as Sonner } from "sonner";

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      position="bottom-left"
      richColors
      toastOptions={{
        style: {
          boxShadow: "var(--mui-shadows-6)",
        },
        classNames: {
          loader: "size-4",
        },
      }}
      style={
        {
          "--normal-bg": "var(--color-background)",
          "--normal-border": "var(--color-zinc-200)",
          "--normal-text": "var(--color-zinc-950)",
          "--success-bg": "var(--mui-palette-Alert-successFilledBg)",
          "--success-border": "var(--mui-palette-Alert-successFilledBg)",
          "--success-text": "var(--mui-palette-Alert-successFilledColor)",
          "--info-bg": "var(--mui-palette-Alert-infoFilledBg)",
          "--info-border": "var(--mui-palette-Alert-infoFilledBg)",
          "--info-text": "var(--mui-palette-Alert-infoFilledColor)",
          "--warning-bg": "var(--mui-palette-Alert-warningFilledBg)",
          "--warning-border": "var(--mui-palette-Alert-warningFilledBg)",
          "--warning-text": "var(--mui-palette-Alert-warningFilledColor)",
          "--error-bg": "var(--mui-palette-Alert-errorFilledBg)",
          "--error-border": "var(--mui-palette-Alert-errorFilledBg)",
          "--error-text": "var(--mui-palette-Alert-errorFilledColor)",
          fontFamily: "var(--default-font-family)",
          "--border-radius": "4px",
        } as CSSProperties
      }
      icons={{
        success: <TaskAlt fontSize="small" />,
        info: <InfoOutline fontSize="small" />,
        warning: <WarningAmber fontSize="small" />,
        error: <ErrorOutline fontSize="small" />,
        loading: <CircularProgress color="inherit" size="1rem" />,
      }}
      {...props}
    />
  );
}
