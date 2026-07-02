import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { debounce } from "lodash-es";
import { createRoot, type Root } from "react-dom/client";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { GridStack } from "gridstack";
import type { GridStackWidget } from "gridstack";
import "gridstack/dist/gridstack.css";

type GridStackWidgetWithId = GridStackWidget & Required<Pick<GridStackWidget, "id">>;

import {
  dashboardsQueryKey,
  getDashboards,
  createDashboard,
  updateDashboard,
  deleteDashboardFromApi,
  getManagers,
  managersQueryKey,
} from "~/api/api";
import type { Dashboard, DashboardComponent } from "~/api/schema";
import type { Manager } from "~/api/schema";
import { parseError } from "~/utils";
import { Markdown } from "~/components/Markdown";
import { AppTheme } from "~/components/AppTheme";

// ── Internal type (API nodes have no id) ───────────────────
interface NodeData extends DashboardComponent {
  id: string;
}

function stripId(nodes: NodeData[]): DashboardComponent[] {
  return nodes.map(({ id: _id, ...rest }) => rest);
}

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `n-${idCounter}-${Date.now()}`;
}

// ── Build widget JSX for a node ──
function buildWidget(
  node: NodeData,
  managers: Manager[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
) {
  if (node.type === "text") {
    return (
      <Box className="relative flex size-full items-center justify-center overflow-auto p-2 group">
        {node.content ? <Markdown className="w-fit">{node.content}</Markdown> : null}
        <Box className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(node.id); }}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    );
  }

  const mgr = node.manager ? managers.find((m) => m.id === node.manager) : undefined;
  const mgrName = mgr?.name ?? (node.manager ? `调度器 #${node.manager}` : "调度器 (未设置)");
  const mgrDesc = mgr?.description;

  return (
    <Box className="relative size-full p-2 group">
      <Box className="flex size-full flex-col items-center justify-center gap-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/20">
        <Typography variant="body2" className="text-center font-medium leading-tight">
          {mgrName}
        </Typography>
        {mgrDesc && (
          <Typography variant="caption" className="text-center leading-tight text-gray-600 dark:text-gray-400">
            {mgrDesc}
          </Typography>
        )}
      </Box>
      <Box className="absolute right-1 top-1 hidden gap-0.5 group-hover:flex">
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(node.id); }}>
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

function renderIntoRoot(
  root: Root,
  node: NodeData,
  managers: Manager[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
) {
  root.render(<AppTheme>{buildWidget(node, managers, onEdit, onDelete)}</AppTheme>);
}

// ── Render widget content into a .grid-stack-item-content ──
function renderContent(
  el: HTMLElement,
  node: NodeData,
  managers: Manager[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
): Root {
  const root = createRoot(el);
  renderIntoRoot(root, node, managers, onEdit, onDelete);
  return root;
}

function addWidgetToGrid(
  grid: GridStack,
  node: NodeData,
  managers: Manager[],
  onEdit: (id: string) => void,
  onDelete: (id: string) => void,
  roots: Map<string, Root>,
) {
  const el = grid.addWidget({
    id: node.id,
    x: node.left,
    y: node.up,
    w: node.right - node.left + 1,
    h: node.down - node.up + 1,
  });
  const contentEl = el.querySelector(".grid-stack-item-content") as HTMLElement | null;
  if (contentEl) {
    const root = renderContent(contentEl, node, managers, onEdit, onDelete);
    roots.set(node.id, root);
  }
}

// ── Route ──────────────────────────────────────────────────

export default function DashboardRoute() {
  const queryClient = useQueryClient();

  // ── Data ──
  const { data: dashboards = [], isLoading, error } = useQuery({
    queryKey: dashboardsQueryKey,
    queryFn: getDashboards,
    staleTime: 5 * 60 * 1000,
  });

  const { data: managers = [] } = useQuery({
    queryKey: managersQueryKey,
    queryFn: getManagers,
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ──
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Dashboard> }) =>
      updateDashboard(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardsQueryKey });
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const createMut = useMutation({
    mutationFn: createDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardsQueryKey });
      toast.success("看板创建成功");
      setAddOpen(false);
      setNewName("");
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDashboardFromApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardsQueryKey });
      toast.success("看板已删除");
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteInput("");
    },
    onError: (e) => toast.error(parseError(e)),
  });

  // ── Local state ──
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(
    () => dashboards.find((d) => d.id === selectedId) ?? dashboards[0] ?? null,
    [dashboards, selectedId],
  );

  useEffect(() => {
    if (dashboards.length > 0 && selectedId === null) {
      setSelectedId(dashboards[0].id);
    }
  }, [dashboards, selectedId]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridStack | null>(null);
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const nodesRef = useRef<NodeData[]>([]);
  const editCbRef = useRef<(id: string) => void>(() => {});
  const deleteCbRef = useRef<(id: string) => void>(() => {});

  // ── Persist to API ──
  const persist = useCallback(
    debounce((id: number, name: string, nodes: NodeData[]) => {
      updateMut.mutate({ id, data: { id, name, nodes: stripId(nodes) } });
    }, 400),
    [],
  );

  const persistNow = useCallback((id: number, name: string, nodes: NodeData[]) => {
    updateMut.mutate({ id, data: { id, name, nodes: stripId(nodes) } });
  }, []);

  // ── Read positions from GridStack ──
  const readPositions = useCallback((): NodeData[] => {
    const grid = gridRef.current;
    if (!grid) return nodesRef.current;
    const widgets = grid.save(false) as GridStackWidgetWithId[];
    const current = nodesRef.current;
    return current.map((n) => {
      const w = widgets.find((w) => String(w.id) === n.id);
      if (w && w.x !== undefined && w.w !== undefined) {
        return { ...n, left: w.x, right: w.x + w.w - 1, up: w.y ?? n.up, down: (w.y ?? n.up) + (w.h ?? 1) - 1 };
      }
      return n;
    });
  }, []);

  // ── Init GridStack when selected dashboard changes ──
  useEffect(() => {
    if (!containerRef.current || !selected) return;

    // Cleanup previous
    if (gridRef.current) {
      gridRef.current.removeAll(true);
      gridRef.current.destroy(false);
      gridRef.current = null;
    }
    for (const r of rootsRef.current.values()) r.unmount();
    rootsRef.current.clear();

    const grid = GridStack.init({ column: 12, cellHeight: "auto", margin: 4, float: true }, containerRef.current);
    gridRef.current = grid;

    const nodes: NodeData[] = selected.nodes.map((n) => ({ ...n, id: genId() }));
    nodesRef.current = nodes;

    for (const n of nodes) {
      addWidgetToGrid(grid, n, managers, editCbRef.current, deleteCbRef.current, rootsRef.current);
    }

    const save = () => {
      const updated = readPositions();
      nodesRef.current = updated;
      persistNow(selected.id, selected.name, updated);
    };

    const debounced = () => {
      const updated = readPositions();
      nodesRef.current = updated;
      persist(selected.id, selected.name, updated);
    };

    grid.on("dragstop", save);
    grid.on("resizestop", save);
    grid.on("change", debounced);

    return () => {
      grid.removeAll(true);
      grid.destroy(false);
      gridRef.current = null;
      for (const r of rootsRef.current.values()) r.unmount();
      rootsRef.current.clear();
    };
  }, [selected?.id]);

  // ── Keep callback refs current ──
  const openEdit = useCallback((compId: string) => {
    const n = nodesRef.current.find((x) => x.id === compId);
    if (!n) return;
    setEditId(compId);
    setEditType(n.type);
    setEditContent(n.content ?? "");
    setEditSched(n.manager ?? 0);
    setEditOpen(true);
  }, []);

  const handleDeleteComp = useCallback((compId: string) => {
    const grid = gridRef.current;
    if (!grid) return;
    const el = containerRef.current?.querySelector(`[gs-id="${compId}"]`);
    if (el) grid.removeWidget(el as HTMLElement, false);
    const root = rootsRef.current.get(compId);
    if (root) { root.unmount(); rootsRef.current.delete(compId); }
    const next = nodesRef.current.filter((n) => n.id !== compId);
    nodesRef.current = next;
    const sel = selected;
    if (sel) persistNow(sel.id, sel.name, next);
    toast.success("组件已删除");
  }, [persistNow, selected]);

  editCbRef.current = openEdit;
  deleteCbRef.current = handleDeleteComp;

  // ── Dashboard CRUD ──
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const canDelete = deleteInput === deleteTarget?.name;

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  const nextId = useMemo(() => {
    if (dashboards.length === 0) return 1;
    return Math.max(...dashboards.map((d) => d.id)) + 1;
  }, [dashboards]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) { toast.warning("请输入看板名称"); return; }
    createMut.mutate({ id: nextId, name, nodes: [] });
  };

  const handleDelete = () => {
    if (!deleteTarget || !canDelete) return;
    deleteMut.mutate(deleteTarget.id);
  };

  const handleEditName = () => {
    const name = editNameValue.trim();
    if (!name || !selected) { toast.warning("请输入看板名称"); return; }
    updateMut.mutate({ id: selected.id, data: { id: selected.id, name, nodes: selected.nodes } });
    setEditNameOpen(false);
  };

  // ── Component CRUD ──
  const [addCompOpen, setAddCompOpen] = useState(false);
  const [addType, setAddType] = useState<"text" | "switch">("text");
  const [addContent, setAddContent] = useState("");
  const [addSched, setAddSched] = useState<number>(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editType, setEditType] = useState<"text" | "switch">("text");
  const [editContent, setEditContent] = useState("");
  const [editSched, setEditSched] = useState<number>(0);

  const handleAdd = () => {
    const sel = selected;
    if (!sel) return;
    const current = nodesRef.current;
    const nextUp = current.length > 0 ? Math.max(...current.map((c) => c.down + 1)) : 0;
    const node: NodeData = {
      id: genId(),
      type: addType,
      left: 0, right: 2, up: nextUp, down: nextUp + 1,
      content: addType === "text" ? addContent : undefined,
      manager: addType === "switch" ? addSched || undefined : undefined,
    };
    const next = [...current, node];
    nodesRef.current = next;
    const grid = gridRef.current;
    if (grid) {
      addWidgetToGrid(grid, node, managers, editCbRef.current, deleteCbRef.current, rootsRef.current);
    }
    persistNow(sel.id, sel.name, next);
    setAddCompOpen(false);
    setAddContent("");
    setAddSched(0);
    toast.success("组件已添加");
  };

  const handleEdit = () => {
    const sel = selected;
    if (!editId || !sel) return;
    const next = nodesRef.current.map((n) => {
      if (n.id !== editId) return n;
      return { ...n, type: editType, content: editType === "text" ? editContent : undefined, manager: editType === "switch" ? editSched || undefined : undefined };
    });
    nodesRef.current = next;
    persistNow(sel.id, sel.name, next);
    const root = rootsRef.current.get(editId);
    const updatedNode = nodesRef.current.find((n) => n.id === editId);
    if (root && updatedNode) {
      renderIntoRoot(root, updatedNode, managers, editCbRef.current, deleteCbRef.current);
    }
    setEditOpen(false);
    setEditId(null);
    toast.success("组件已更新");
  };

  // ── Render ──
  return (
    <Box className="flex h-full flex-col overflow-hidden">
      {/* Loading / error / empty states */}
      {isLoading && (
        <Box className="flex flex-1 items-center justify-center">
          <Typography variant="body1" color="text.secondary">加载中…</Typography>
        </Box>
      )}
      {error && (
        <Box className="flex flex-1 items-center justify-center">
          <Typography variant="body1" color="error">加载失败: {parseError(error)}</Typography>
        </Box>
      )}
      {!isLoading && !error && dashboards.length === 0 && (
        <Box className="flex flex-1 flex-col items-center justify-center gap-4">
          <Typography variant="body1" color="text.secondary">暂无看板</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setNewName(""); setAddOpen(true); }}>新建看板</Button>
        </Box>
      )}
      {!isLoading && !error && dashboards.length > 0 && selected && (
        <Box className="flex flex-1 flex-col overflow-hidden">
          <Box className="pt-1">
            <Box className="flex items-stretch">
              <Box className="relative flex items-center gap-2 px-4 py-2">
                <ToggleButtonGroup value={selectedId} exclusive onChange={(_, id) => { if (id !== null) setSelectedId(id); }} size="small">
                  {dashboards.map((d) => (
                    <ToggleButton key={d.id} value={d.id} sx={{ textTransform: "none" }}>{d.name}</ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <Tooltip title="新建看板">
                  <IconButton size="small" color="inherit" onClick={() => { setNewName(""); setAddOpen(true); }}>
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="编辑看板名称">
                  <IconButton size="small" color="inherit" onClick={() => { setEditNameValue(selected.name); setEditNameOpen(true); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="删除当前看板">
                  <IconButton size="small" color="inherit" onClick={() => { setDeleteTarget(selected); setDeleteInput(""); setDeleteOpen(true); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Box className="absolute bottom-0 left-0 right-0 h-px bg-gray-300 dark:bg-gray-600 rounded-r-[5px]" />
              </Box>
              <Box className="w-px bg-gray-300 dark:bg-gray-600 rounded-[5px]" />
              <Box className="relative flex flex-1 items-center gap-2 px-4 py-2">
                <Box className="absolute top-0 left-0 right-0 h-px bg-gray-300 dark:bg-gray-600 rounded-l-[5px]" />
                <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => { setAddType("text"); setAddContent(""); setAddSched(0); setAddCompOpen(true); }}>
                  添加组件
                </Button>
                <Button variant="contained" size="small" onClick={() => window.open(`/dashboard/${selected.id}`, "_blank")}>
                  进入看板
                </Button>
              </Box>
            </Box>
          </Box>
          <Box className="flex-1 p-2">
            <div ref={containerRef} className="grid-stack overflow-hidden" />
          </Box>
        </Box>
      )}

      {/* Create Dashboard */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>新建看板</DialogTitle>
        <DialogContent className="pt-2!">
          <TextField label="看板名称" fullWidth autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>取消</Button>
          <Button onClick={handleCreate} variant="contained" disabled={createMut.isPending}>
            {createMut.isPending ? "创建中…" : "创建"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dashboard */}
      <Dialog open={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteInput(""); }} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent className="space-y-3 pt-2!">
          <Typography variant="body2" color="text.secondary">
            删除操作不可撤销。请输入看板名称<strong> {deleteTarget?.name} </strong>以确认删除：
          </Typography>
          <TextField label="看板名称" fullWidth value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder={deleteTarget?.name ?? ""} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteOpen(false); setDeleteInput(""); }}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={!canDelete || deleteMut.isPending}>
            {deleteMut.isPending ? "删除中…" : "确认删除"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dashboard Name */}
      <Dialog open={editNameOpen} onClose={() => setEditNameOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>编辑看板名称</DialogTitle>
        <DialogContent className="pt-2!">
          <TextField label="看板名称" fullWidth autoFocus value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEditName(); }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditNameOpen(false)}>取消</Button>
          <Button onClick={handleEditName} variant="contained" disabled={updateMut.isPending}>
            {updateMut.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Component */}
      <Dialog open={addCompOpen} onClose={() => setAddCompOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>添加组件</DialogTitle>
        <DialogContent className="space-y-4 pt-2!">
          <TextField select label="组件类型" fullWidth value={addType} onChange={(e) => { const t = e.target.value as "text" | "switch"; setAddType(t); if (t === "text") setAddSched(0); else setAddContent(""); }}>
            <MenuItem value="text">文字</MenuItem>
            <MenuItem value="switch">调度器开关</MenuItem>
          </TextField>
          {addType === "text" ? (
            <TextField label="文字内容" fullWidth multiline minRows={4} maxRows={12} value={addContent} onChange={(e) => setAddContent(e.target.value)} />
          ) : (
            <TextField select label="调度器" fullWidth value={addSched || ""} onChange={(e) => setAddSched(Number(e.target.value))}>
              {managers.map((m) => (
                <MenuItem key={m.id} value={m.id}>{m.name} (#{m.id})</MenuItem>
              ))}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCompOpen(false)}>取消</Button>
          <Button onClick={handleAdd} variant="contained">添加</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Component */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>编辑组件</DialogTitle>
        <DialogContent className="space-y-4 pt-2!">
          <TextField select label="组件类型" fullWidth value={editType} onChange={(e) => { const t = e.target.value as "text" | "switch"; setEditType(t); if (t === "text") setEditSched(0); else setEditContent(""); }}>
            <MenuItem value="text">文字</MenuItem>
            <MenuItem value="switch">调度器开关</MenuItem>
          </TextField>
          {editType === "text" ? (
            <TextField label="文字内容" fullWidth multiline minRows={4} maxRows={12} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
          ) : (
            <TextField select label="调度器" fullWidth value={editSched || ""} onChange={(e) => setEditSched(Number(e.target.value))}>
              {managers.map((m) => (
                <MenuItem key={m.id} value={m.id}>{m.name} (#{m.id})</MenuItem>
              ))}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>取消</Button>
          <Button onClick={handleEdit} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
