import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { formatErrorMessages } from "~/utils";

const statusLabels: Record<string, string> = {
  disabled: "未运行",
  running: "运行中",
  error: "错误",
};

type ConfirmState =
  | { phase: "idle" }
  | { phase: "waiting"; remaining: number }
  | { phase: "ready" };

interface SwitchWidgetProps {
  managerId: number;
  managerName: string;
  managerDescription?: string;
  status: "disabled" | "running" | "error";
  errors?: string[];
  isPending: boolean;
  onToggle: () => void;
}

export function SwitchWidget({
  managerName,
  managerDescription,
  status,
  errors,
  isPending,
  onToggle,
}: SwitchWidgetProps) {
  const [confirm, setConfirm] = useState<ConfirmState>({ phase: "idle" });
  const startTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cleanup = () => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);
    intervalRef.current = undefined;
    timeoutRef.current = undefined;
    setConfirm({ phase: "idle" });
  };

  useEffect(() => cleanup, []);

  const bgClass
    = status === "running"
      ? "bg-yellow-100 dark:bg-yellow-900/30"
      : status === "error"
        ? "bg-red-100 dark:bg-red-900/30"
        : "";

  const handleClick = () => {
    if (isPending) return;

    if (status === "disabled" || status === "error") {
      onToggle();
      return;
    }

    if (confirm.phase === "idle") {
      startTimeRef.current = Date.now();
      setConfirm({ phase: "waiting", remaining: 1 });

      const tick = () => {
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed >= 2000) {
          cleanup();
          return;
        }
        if (elapsed < 1000) {
          setConfirm({ phase: "waiting", remaining: (1000 - elapsed) / 1000 });
        } else {
          setConfirm({ phase: "ready" });
        }
      };

      tick();
      intervalRef.current = setInterval(tick, 50);
      timeoutRef.current = setTimeout(cleanup, 2000);
    } else if (confirm.phase === "waiting") {
      cleanup();
    } else if (confirm.phase === "ready") {
      cleanup();
      onToggle();
    }
  };

  let label: string;
  if (confirm.phase === "waiting") {
    label = `请等待 ${confirm.remaining.toFixed(2)} 秒后再点一次来关闭`;
  } else if (confirm.phase === "ready") {
    label = "再点一次来关闭";
  } else {
    label = statusLabels[status] ?? status;
  }

  return (
    <Box
      className={`flex size-full cursor-pointer flex-col items-center justify-center gap-0.5 overflow-auto p-2 text-center select-none ${bgClass}`}
      onClick={handleClick}
    >
      <Typography variant="body2" className="font-bold leading-tight">
        {managerName}
      </Typography>
      {managerDescription && (
        <Typography variant="caption" className="leading-tight text-gray-600 dark:text-gray-400">
          {managerDescription}
        </Typography>
      )}
      <Typography
        variant="caption"
        className={`leading-tight ${confirm.phase !== "idle" ? "text-orange-600 dark:text-orange-400" : ""}`}
      >
        {label}
      </Typography>
      {status === "error" && errors && errors.length > 0 && (
        <Typography
          variant="caption"
          className="mt-1 block max-w-full leading-tight text-red-600 dark:text-red-400"
          sx={{ wordBreak: "break-word" }}
        >
          {formatErrorMessages(errors)}
        </Typography>
      )}
    </Box>
  );
}
