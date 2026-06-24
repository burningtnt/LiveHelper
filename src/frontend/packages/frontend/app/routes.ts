import type { RouteConfig } from "@react-router/dev/routes";
import { index, route } from "@react-router/dev/routes";

export default [
  route("/", "routes/program/route.tsx"),
  route("/clip", "routes/clip/route.tsx"),
  route("/manager", "routes/manager/route.tsx"),
  route("/dashboard", "routes/dashboard/route.tsx"),
  route("/dashboard/:id", "routes/dashboard.$id/route.tsx"),
] satisfies RouteConfig;
