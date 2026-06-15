import type { Route } from "./+types/root";
import { StyledEngineProvider } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { AppTheme } from "./components/AppTheme";
import { Header } from "./components/Header";
import { Toaster } from "./components/Toaster";
import "./app.css";
import "dayjs/locale/zh-cn";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";

dayjs.extend(duration);
dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const queryClient = new QueryClient();

export function meta() {
  return [{ title: "LiveHelper" }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans-CN" data-mui-color-scheme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="bg-background antialiased">
        <QueryClientProvider client={queryClient}>
          <StyledEngineProvider enableCssLayer>
            <AppTheme>{children}</AppTheme>
          </StyledEngineProvider>
        </QueryClientProvider>
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <Stack className="flex h-screen">
      <Header />
      <Box className="flex-1">
        <Outlet />
      </Box>
    </Stack>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "不好！";
  let details = "LiveHelper 出现未知错误，请联系模组开发者";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "请求的路由不存在"
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
