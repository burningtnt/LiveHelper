import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams } from "react-router";
import { createRoot, type Root } from "react-dom/client";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";

import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.css";

import {
  dashboardQueryKey,
  getDashboard,
  managersQueryKey,
  getManagers,
  getManagerActivation,
  setManagerActivation,
} from "~/api/api";
import type { DashboardComponent } from "~/api/schema";
import type { Manager, ManagerStatus, ManagerError } from "~/api/schema";
import { parseError } from "~/utils";
import { Markdown } from "~/components/Markdown";
import { AppTheme } from "~/components/AppTheme";
import { SwitchWidget } from "./SwitchWidget";

interface NodeData extends DashboardComponent {
  id: string;
}

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `n-${idCounter}-${Date.now()}`;
}

type WidgetCtx = { root: Root; node: NodeData };

function renderNode(
  ctx: WidgetCtx,
  managerLookup: Map<number, Manager>,
  activationMap: Record<number, ManagerStatus>,
  pending: boolean,
  onToggle: (managerId: number) => void,
) {
  const { root, node } = ctx;
  if (node.type === "text") {
    root.render(
      <AppTheme>
        <Box className="flex size-full items-center justify-center overflow-auto p-2">
          {node.content ? <Markdown>{node.content}</Markdown> : null}
        </Box>
      </AppTheme>,
    );
  } else if (node.type === "switch" && node.manager) {
    const act = activationMap[node.manager];
    const status = act?.status ?? "disabled";
    const errors = act?.status === "error" ? (act as ManagerError).error : undefined;
    const mgr = managerLookup.get(node.manager);
    const name = mgr ? mgr.name : `调度器 #${node.manager}`;
    root.render(
      <AppTheme>
        <SwitchWidget
          managerId={node.manager}
          managerName={name}
          managerDescription={mgr?.description}
          status={status}
          errors={errors}
          isPending={pending}
          onToggle={() => onToggle(node.manager!)}
        />
      </AppTheme>,
    );
  }
}

function buildManagerLookup(managers: Manager[]): Map<number, Manager> {
  const map = new Map<number, Manager>();
  for (const m of managers) map.set(m.id, m);
  return map;
}

export default function DashboardViewRoute() {
  const { id: paramId } = useParams<{ id: string }>();
  const dashboardId = Number(paramId);

  const queryClient = useQueryClient();

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: dashboardQueryKey(dashboardId),
    queryFn: () => getDashboard(dashboardId),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
    enabled: !Number.isNaN(dashboardId),
  });

  const { data: managers = [] } = useQuery({
    queryKey: managersQueryKey,
    queryFn: getManagers,
    staleTime: 5 * 60 * 1000,
  });

  // ── Manager IDs referenced in this dashboard ──
  const managerIds = useMemo(() => {
    if (!dashboard) return [];
    const ids = new Set<number>();
    for (const n of dashboard.nodes) {
      if (n.type === "switch" && n.manager != null) ids.add(n.manager);
    }
    return [...ids];
  }, [dashboard]);

  // ── Activation status polling (every 5s) ──
  const [activationMap, setActivationMap] = useState<Record<number, ManagerStatus>>({});

  useEffect(() => {
    if (managerIds.length === 0) {
      setActivationMap({});
      return;
    }
    let cancelled = false;

    const fetchAll = async () => {
      const results = await Promise.all(
        managerIds.map(async (id) => {
          try {
            const status = await getManagerActivation(id);
            return { id, status };
          } catch {
            return { id, status: { status: "disabled" } as ManagerStatus };
          }
        }),
      );
      if (!cancelled) {
        const map: Record<number, ManagerStatus> = {};
        for (const r of results) map[r.id] = r.status;
        setActivationMap(map);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [managerIds]);

  // ── Activation mutation ──
  const activationMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ManagerStatus }) =>
      setManagerActivation(id, status),
    onSuccess: (_data, variables) => {
      getManagerActivation(variables.id)
        .then((status) => {
          setActivationMap((prev) => ({ ...prev, [variables.id]: status }));
        })
        .catch(() => {});
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const handleToggle = useCallback(
    (managerId: number) => {
      const current = activationMap[managerId];
      if (current?.status === "running") {
        activationMut.mutate({ id: managerId, status: { status: "disabled" } });
      } else {
        activationMut.mutate({ id: managerId, status: { status: "running" } });
      }
    },
    [activationMap, activationMut],
  );

  // ── GridStack setup ──
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridStack | null>(null);
  const widgetCtxRef = useRef<Map<string, WidgetCtx>>(new Map());
  const nodesRef = useRef<NodeData[]>([]);

  const managerLookup = useMemo(() => buildManagerLookup(managers), [managers]);

  // Initialize GridStack when dashboard data changes
  useEffect(() => {
    if (!containerRef.current || !dashboard) return;

    // Cleanup previous
    if (gridRef.current) {
      gridRef.current.removeAll(true);
      gridRef.current.destroy(false);
      gridRef.current = null;
    }
    for (const ctx of widgetCtxRef.current.values()) ctx.root.unmount();
    widgetCtxRef.current.clear();

    const grid = GridStack.init(
      { column: 12, cellHeight: "auto", margin: 4, float: true, staticGrid: true },
      containerRef.current,
    );
    gridRef.current = grid;

    const nodes: NodeData[] = dashboard.nodes.map((n) => ({ ...n, id: genId() }));
    nodesRef.current = nodes;

    for (const node of nodes) {
      const el = grid.addWidget({
        id: node.id,
        x: node.left,
        y: node.up,
        w: node.right - node.left + 1,
        h: node.down - node.up + 1,
      });
      const contentEl = el.querySelector(".grid-stack-item-content") as HTMLElement | null;
      if (contentEl) {
        const root = createRoot(contentEl);
        const ctx: WidgetCtx = { root, node };
        widgetCtxRef.current.set(node.id, ctx);
        renderNode(ctx, managerLookup, activationMap, activationMut.isPending, handleToggle);
      }
    }

    return () => {
      grid.removeAll(true);
      grid.destroy(false);
      gridRef.current = null;
      for (const ctx of widgetCtxRef.current.values()) ctx.root.unmount();
      widgetCtxRef.current.clear();
    };
  }, [dashboard]);

  // Re-render widgets when activation state or manager lookup changes
  useEffect(() => {
    for (const ctx of widgetCtxRef.current.values()) {
      renderNode(ctx, managerLookup, activationMap, activationMut.isPending, handleToggle);
    }
  }, [activationMap, managerLookup, activationMut.isPending, handleToggle]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".grid-stack-item")) return;
    document.documentElement.requestFullscreen().catch(() => {});
  };

  // ── Render ──
  return (
    <Box className="size-full" onDoubleClick={handleDoubleClick}>
      {isLoading && (
        <Box className="flex size-full items-center justify-center">
          <Typography variant="body1" color="text.secondary">加载中…</Typography>
        </Box>
      )}

      {error && (
        <Box className="flex size-full items-center justify-center">
          <Typography variant="body1" color="error">加载失败: {parseError(error)}</Typography>
        </Box>
      )}

      {!isLoading && !error && !dashboard && (
        <Box className="flex size-full items-center justify-center">
          <Typography variant="body1" color="text.secondary">看板不存在</Typography>
        </Box>
      )}

      {dashboard && (
        <Box className="size-full p-2">
          <div ref={containerRef} className="grid-stack size-full overflow-hidden" />
        </Box>
      )}
    </Box>
  );
}
