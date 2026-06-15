import type { RouteConfig } from "@react-router/dev/routes";
import { index, route } from "@react-router/dev/routes";

export default [
  route("/", "routes/program/route.tsx"),
  route("/clip", "routes/clip/route.tsx"),
  route("/manager", "routes/manager/route.tsx"),
] satisfies RouteConfig;
