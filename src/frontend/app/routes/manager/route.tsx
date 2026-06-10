import type { Manager, ManagerStatus } from "~/api/schema";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrow from "@mui/icons-material/PlayArrow";
import Stop from "@mui/icons-material/Stop";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  clipsQueryKey,
  createManager,
  deleteManagerFromApi,
  getClips,
  getManagerActivation,
  getManagers,
  getPrograms,
  managersQueryKey,
  programsQueryKey,
  setManagerActivation,
  updateManager,
} from "~/api/api";
import { formatErrorMessages, parseError } from "~/utils";

// ── Zod schema ──────────────────────────────────────────────
const managerFormSchema = z.object({
  name: z.string().trim().min(1, "请输入调度器名称"),
  description: z.string().trim(),
  program: z.number().min(1, "请选择调度程序"),
  width: z.number().positive("请输入有效的宽度"),
  height: z.number().positive("请输入有效的高度"),
  fps: z.number().positive("请输入有效的每秒帧数"),
  renderDistance: z.number().min(0, "请输入有效的渲染距离"),
});
type ManagerFormData = z.infer<typeof managerFormSchema>;

const statusLabels: Record<string, string> = {
  disabled: "未运行",
  running: "运行中",
  error: "错误",
};

const statusColors: Record<string, "default" | "success" | "error"> = {
  disabled: "default",
  running: "success",
  error: "error",
};

// ── Default form values ────────────────────────────────────
const defaultFormValues: ManagerFormData = {
  name: "",
  description: "",
  program: 0,
  width: 1920,
  height: 1080,
  fps: 30,
  renderDistance: 2,
};

export default function ManagerRoute() {
  const queryClient = useQueryClient();

  // ── Data fetching ─────────────────────────────────────────
  const {
    data: managers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: managersQueryKey,
    queryFn: getManagers,
    staleTime: 5 * 60 * 1000,
  });

  const { data: clips = [] } = useQuery({
    queryKey: clipsQueryKey,
    queryFn: getClips,
    staleTime: 5 * 60 * 1000,
  });

  const { data: programs = [] } = useQuery({
    queryKey: programsQueryKey,
    queryFn: getPrograms,
    staleTime: 5 * 60 * 1000,
  });

  // ── All state ─────────────────────────────────────────────
  // (must come before useMutation that references their setters)
  const [activationMap, setActivationMap] = useState<
    Record<number, ManagerStatus>
  >({});

  const [addOpen, setAddOpen] = useState(false);
  const addForm = useForm<ManagerFormData>({
    resolver: zodResolver(managerFormSchema),
    defaultValues: defaultFormValues,
  });

  const [editOpen, setEditOpen] = useState(false);
  const editForm = useForm<ManagerFormData>({
    resolver: zodResolver(managerFormSchema),
  });
  const [editingManager, setEditingManager] = useState<Manager | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Manager | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  const [clipSelectOpen, setClipSelectOpen] = useState(false);
  const [clipSelectManager, setClipSelectManager] = useState<Manager | null>(
    null,
  );
  const [selectedClipIds, setSelectedClipIds] = useState<number[]>([]);

  // ── Derived values ────────────────────────────────────────
  const nextId = useMemo(() => {
    if (managers.length === 0) {
      return 1;
    }
    return Math.max(...managers.map((m) => m.id)) + 1;
  }, [managers]);

  const canDelete = deleteConfirmInput === deleteTarget?.name;

  // ── Activation status polling (every 5s) ──────────────────
  useEffect(() => {
    const ids = managers.map((m) => m.id);
    if (ids.length === 0) {
      setActivationMap({});
      return;
    }
    let cancelled = false;

    const fetchAll = async () => {
      const results = await Promise.all(
        ids.map(async (id) => {
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
        for (const r of results) {
          map[r.id] = r.status;
        }
        setActivationMap(map);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [managers]);

  // ── Mutations ─────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: createManager,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managersQueryKey });
      toast.success("调度器创建成功");
      addForm.reset();
      setAddOpen(false);
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Manager> }) =>
      updateManager(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managersQueryKey });
      toast.success("调度器更新成功");
      editForm.reset();
      setEditingManager(null);
      setEditOpen(false);
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteManagerFromApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managersQueryKey });
      toast.success("调度器已删除");
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmInput("");
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const activationMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ManagerStatus }) =>
      setManagerActivation(id, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: managersQueryKey });
      // Refresh activation status for this manager
      getManagerActivation(variables.id)
        .then((status) => {
          setActivationMap((prev) => ({ ...prev, [variables.id]: status }));
        })
        .catch(() => {});
      toast.success(
        variables.status.status === "running" ? "调度器已启动" : "调度器已停止",
      );
    },
    onError: (e) => toast.error(parseError(e)),
  });

  // ── Callbacks ─────────────────────────────────────────────
  const handleAdd = () => {
    addForm.handleSubmit((data) => {
      createMut.mutate({
        id: nextId,
        name: data.name,
        description: data.description,
        clips: [],
        program: data.program,
        width: data.width,
        height: data.height,
        fps: data.fps,
        renderDistance: data.renderDistance,
        inputs: [],
      });
    })();
  };

  const openEdit = (mgr: Manager) => {
    editForm.reset({
      name: mgr.name,
      description: mgr.description,
      program: mgr.program,
      width: mgr.width,
      height: mgr.height,
      fps: mgr.fps,
      renderDistance: mgr.renderDistance,
    });
    setEditingManager(mgr);
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingManager) return;
    editForm.handleSubmit((data) => {
      updateMut.mutate({
        id: editingManager.id,
        data: {
          id: editingManager.id,
          name: data.name,
          description: data.description,
          program: data.program,
          width: data.width,
          height: data.height,
          fps: data.fps,
          renderDistance: data.renderDistance,
        },
      });
    })();
  };

  const openDelete = (mgr: Manager) => {
    setDeleteTarget(mgr);
    setDeleteConfirmInput("");
    setDeleteOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget || !canDelete) {
      return;
    }
    deleteMut.mutate(deleteTarget.id);
  };

  const openClipSelect = (mgr: Manager) => {
    const validClipIds = clips.map((c) => c.id);
    const filtered = mgr.clips.filter((id) => validClipIds.includes(id));
    setClipSelectManager(mgr);
    setSelectedClipIds(filtered);
    setClipSelectOpen(true);
  };

  const toggleClipSelection = (clipId: number) => {
    setSelectedClipIds((prev) =>
      prev.includes(clipId)
        ? prev.filter((id) => id !== clipId)
        : [...prev, clipId],
    );
  };

  const handleClipSelectConfirm = () => {
    if (!clipSelectManager) {
      return;
    }
    updateMut.mutate({
      id: clipSelectManager.id,
      data: { ...clipSelectManager, clips: selectedClipIds },
    });
    setClipSelectOpen(false);
    setClipSelectManager(null);
  };

  const toggleActivation = (mgr: Manager) => {
    const current = activationMap[mgr.id]?.status ?? "disabled";
    if (current === "running") {
      activationMut.mutate({ id: mgr.id, status: { status: "disabled" } });
    } else {
      activationMut.mutate({ id: mgr.id, status: { status: "running" } });
    }
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <Box className="size-full space-y-2 overflow-auto p-4">
      {isLoading && (
        <Typography variant="body1" color="text.secondary">
          加载中…
        </Typography>
      )}
      {error && (
        <Typography variant="body1" color="error">
          加载失败: {parseError(error)}
        </Typography>
      )}
      {!isLoading && !error && managers.length === 0 && (
        <Typography variant="body1" color="text.secondary">
          暂无调度器
        </Typography>
      )}
      {!isLoading &&
        !error &&
        [...managers]
          .sort((a, b) => a.id - b.id)
          .map((mgr) => {
            const activation = activationMap[mgr.id];
            const status = activation?.status ?? "disabled";
            const errors =
              activation?.status === "error"
                ? (activation as import("~/api/schema").ManagerError).error
                : undefined;
            return (
              <ManagerTrack
                key={mgr.id}
                manager={mgr}
                status={status}
                errors={errors}
                clips={clips}
                activationPending={activationMut.isPending}
                onEdit={() => openEdit(mgr)}
                onDelete={() => openDelete(mgr)}
                onToggleActivation={() => toggleActivation(mgr)}
                onAddClip={() => openClipSelect(mgr)}
              />
            );
          })}

      {/* ── Add button ─────────────────────────────────────── */}
      <Card>
        <Button
          className="size-full py-4"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => {
            addForm.reset();
            setAddOpen(true);
          }}
        >
          <Typography variant="body1" component="div">
            添加调度器
          </Typography>
        </Button>
      </Card>

      {/* ── Add Dialog ─────────────────────────────────────── */}
      <Dialog
        open={addOpen}
        onClose={() => { addForm.reset(); setAddOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>添加调度器</DialogTitle>
        <DialogContent className="space-y-4 pt-2!">
          <TextField
            label="名称"
            fullWidth
            value={addForm.watch("name")}
            onChange={(e) => addForm.setValue("name", e.target.value, { shouldValidate: true })}
            error={!!addForm.formState.errors.name}
            helperText={addForm.formState.errors.name?.message}
          />
          <TextField
            label="描述"
            fullWidth
            multiline
            minRows={2}
            value={addForm.watch("description")}
            onChange={(e) => addForm.setValue("description", e.target.value)}
          />
          <TextField
            select
            label="调度程序"
            fullWidth
            value={addForm.watch("program") || ""}
            onChange={(e) =>
              addForm.setValue("program", Number(e.target.value), { shouldValidate: true })
            }
            error={!!addForm.formState.errors.program}
            helperText={addForm.formState.errors.program?.message}
          >
            {programs
              .filter((p) => p.usage === "manager")
              .map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} (#{p.id})
                </MenuItem>
              ))}
          </TextField>
          <Box className="flex gap-2">
            <TextField
              label="宽度（像素）"
              type="number"
              fullWidth
              value={addForm.watch("width")}
              onChange={(e) =>
                addForm.setValue("width", Number(e.target.value), { shouldValidate: true })
              }
              error={!!addForm.formState.errors.width}
              helperText={addForm.formState.errors.width?.message}
            />
            <TextField
              label="高度（像素）"
              type="number"
              fullWidth
              value={addForm.watch("height")}
              onChange={(e) =>
                addForm.setValue("height", Number(e.target.value), { shouldValidate: true })
              }
              error={!!addForm.formState.errors.height}
              helperText={addForm.formState.errors.height?.message}
            />
          </Box>
          <Box className="flex gap-2">
            <TextField
              label="每秒帧数"
              type="number"
              fullWidth
              value={addForm.watch("fps")}
              onChange={(e) =>
                addForm.setValue("fps", Number(e.target.value), { shouldValidate: true })
              }
              error={!!addForm.formState.errors.fps}
              helperText={addForm.formState.errors.fps?.message}
            />
            <TextField
              label="渲染距离（区块）"
              type="number"
              fullWidth
              value={addForm.watch("renderDistance")}
              onChange={(e) =>
                addForm.setValue("renderDistance", Number(e.target.value), { shouldValidate: true })
              }
              error={!!addForm.formState.errors.renderDistance}
              helperText={addForm.formState.errors.renderDistance?.message}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { addForm.reset(); setAddOpen(false); }}>取消</Button>
          <Button
            onClick={handleAdd}
            variant="contained"
            disabled={createMut.isPending}
          >
            {createMut.isPending ? "创建中…" : "创建"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────────── */}
      <Dialog
        open={editOpen}
        onClose={() => { editForm.reset(); setEditOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>编辑调度器</DialogTitle>
        <DialogContent className="space-y-4 pt-2!">
          <TextField
            label="名称"
            fullWidth
            value={editForm.watch("name")}
            onChange={(e) => editForm.setValue("name", e.target.value, { shouldValidate: true })}
            error={!!editForm.formState.errors.name}
            helperText={editForm.formState.errors.name?.message}
          />
          <TextField
            label="描述"
            fullWidth
            multiline
            minRows={2}
            value={editForm.watch("description")}
            onChange={(e) => editForm.setValue("description", e.target.value)}
          />
          <TextField
            select
            label="调度程序"
            fullWidth
            value={editForm.watch("program") || ""}
            onChange={(e) =>
              editForm.setValue("program", Number(e.target.value), { shouldValidate: true })
            }
            error={!!editForm.formState.errors.program}
            helperText={editForm.formState.errors.program?.message}
          >
            {programs
              .filter((p) => p.usage === "manager")
              .map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} (#{p.id})
                </MenuItem>
              ))}
          </TextField>
          <Box className="flex gap-2">
            <TextField
              label="宽度（像素）"
              type="number"
              fullWidth
              value={editForm.watch("width")}
              onChange={(e) =>
                editForm.setValue("width", Number(e.target.value), { shouldValidate: true })
              }
              error={!!editForm.formState.errors.width}
              helperText={editForm.formState.errors.width?.message}
            />
            <TextField
              label="高度（像素）"
              type="number"
              fullWidth
              value={editForm.watch("height")}
              onChange={(e) =>
                editForm.setValue("height", Number(e.target.value), { shouldValidate: true })
              }
              error={!!editForm.formState.errors.height}
              helperText={editForm.formState.errors.height?.message}
            />
          </Box>
          <Box className="flex gap-2">
            <TextField
              label="每秒帧数"
              type="number"
              fullWidth
              value={editForm.watch("fps")}
              onChange={(e) =>
                editForm.setValue("fps", Number(e.target.value), { shouldValidate: true })
              }
              error={!!editForm.formState.errors.fps}
              helperText={editForm.formState.errors.fps?.message}
            />
            <TextField
              label="渲染距离（区块）"
              type="number"
              fullWidth
              value={editForm.watch("renderDistance")}
              onChange={(e) =>
                editForm.setValue("renderDistance", Number(e.target.value), { shouldValidate: true })
              }
              error={!!editForm.formState.errors.renderDistance}
              helperText={editForm.formState.errors.renderDistance?.message}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { editForm.reset(); setEditOpen(false); }}>取消</Button>
          <Button
            onClick={handleEdit}
            variant="contained"
            disabled={updateMut.isPending}
          >
            {updateMut.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────── */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent className="space-y-3 pt-2!">
          <Typography variant="body2" color="text.secondary">
            删除操作不可撤销。请输入调度器名称
            <strong> {deleteTarget?.name} </strong>
            以确认删除：
          </Typography>
          <TextField
            label="调度器名称"
            fullWidth
            value={deleteConfirmInput}
            onChange={(e) => setDeleteConfirmInput(e.target.value)}
            placeholder={deleteTarget?.name ?? ""}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>取消</Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={!canDelete || deleteMut.isPending}
          >
            {deleteMut.isPending ? "删除中…" : "确认删除"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Clip Selection Dialog ───────────────────────────── */}
      <Dialog
        open={clipSelectOpen}
        onClose={() => setClipSelectOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>选择分镜头 — {clipSelectManager?.name ?? ""}</DialogTitle>
        <DialogContent
          className="overflow-y-auto pt-2!"
          sx={{ minHeight: 300 }}
        >
          {clips.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              暂无可用分镜头
            </Typography>
          )}
          {clips.length > 0 && (
            <Box
              className="grid gap-2"
              sx={{
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              }}
            >
              {[...clips]
                .sort((a, b) => a.id - b.id)
                .map((clip) => {
                  const isSelected = selectedClipIds.includes(clip.id);
                  return (
                    <Card
                      key={clip.id}
                      className={`
                        cursor-pointer transition-shadow
                        hover:shadow-md
                        ${isSelected ? "shadow-md ring-2 ring-blue-500" : ""}
                      `}
                      onClick={() => toggleClipSelection(clip.id)}
                    >
                      <Box className="px-3 py-2">
                        <Box className="flex items-center gap-1">
                          <Typography
                            variant="body2"
                            noWrap
                            className="min-w-0 flex-1 font-medium"
                          >
                            {clip.name}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          className="mt-0.5 line-clamp-1 block"
                        >
                          {clip.description || "暂无描述"}
                        </Typography>
                      </Box>
                    </Card>
                  );
                })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClipSelectOpen(false)}>取消</Button>
          <Button onClick={handleClipSelectConfirm} variant="contained">
            确认
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── ManagerTrack sub-component ──────────────────────────────

function ManagerTrack({
  manager,
  status,
  errors,
  clips,
  activationPending,
  onEdit,
  onDelete,
  onToggleActivation,
  onAddClip,
}: {
  manager: Manager;
  status: string;
  errors?: string[];
  clips: { id: number; name: string; description: string }[];
  activationPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActivation: () => void;
  onAddClip: () => void;
}) {
  const assignedClips = clips.filter((c) => manager.clips.includes(c.id));
  const canStart = status === "disabled" || status === "error";

  return (
    <Card className="w-full">
      <Box className="flex min-h-24 items-stretch">
        {/* ── Left info panel ──────────────────────────────── */}
        <Box
          className="
            flex w-72 shrink-0 flex-col justify-between gap-2 border-r
            border-gray-200 p-4
            dark:border-gray-700
          "
        >
          {/* Name + actions */}
          <Box className="flex items-start gap-1">
            <Tooltip
              title={manager.description || "暂无描述"}
              arrow
              placement="top"
            >
              <Typography
                variant="h6"
                noWrap
                className="min-w-0 flex-1 cursor-help"
              >
                {manager.name}
              </Typography>
            </Tooltip>
            <Box className="flex shrink-0 items-center">
              <IconButton size="small" onClick={onEdit}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={onDelete}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          {/* Sub-info */}
          <Typography
            variant="caption"
            color="text.secondary"
            className="block"
          >
            {manager.width}×{manager.height} · {manager.fps}fps · 渲染距离:{" "}
            {manager.renderDistance}
          </Typography>

          {/* Status + activation button */}
          <Box className="flex items-center gap-2">
            {status === "error" && errors && errors.length > 0 ? (
              <Tooltip
                title={formatErrorMessages(errors)}
                arrow
                placement="top"
              >
                <Chip
                  label={statusLabels[status] ?? status}
                  color={statusColors[status] ?? "default"}
                  size="small"
                  variant="filled"
                />
              </Tooltip>
            ) : (
              <Chip
                label={statusLabels[status] ?? status}
                color={statusColors[status] ?? "default"}
                size="small"
                variant={status === "error" ? "filled" : "outlined"}
              />
            )}
            <Button
              size="small"
              variant="contained"
              color={canStart ? "success" : "warning"}
              startIcon={
                canStart ? (
                  <PlayArrow fontSize="small" />
                ) : (
                  <Stop fontSize="small" />
                )
              }
              onClick={onToggleActivation}
              disabled={activationPending}
            >
              {activationPending ? "处理中…" : canStart ? "开始运行" : "停止"}
            </Button>
          </Box>
        </Box>

        {/* ── Right clip panel ─────────────────────────────── */}
        <Box className="flex-1 overflow-y-auto p-3" sx={{ maxHeight: 120 }}>
          {assignedClips.length === 0 && (
            <Box className="flex h-full items-center gap-2">
              <Typography
                variant="body2"
                color="text.secondary"
                className="px-2"
              >
                暂无分镜头
              </Typography>
              <Button variant="outlined" size="small" onClick={onAddClip}>
                更改
              </Button>
            </Box>
          )}
          {assignedClips.length > 0 && (
            <Box
              className="grid gap-2"
              sx={{
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              {assignedClips.map((clip) => (
                <MiniClipCard
                  key={clip.id}
                  name={clip.name}
                  description={clip.description}
                />
              ))}
              <Button variant="outlined" size="small" onClick={onAddClip}>
                更改
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Card>
  );
}

// ── MiniClipCard sub-component ──────────────────────────────

function MiniClipCard({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <Tooltip title={description || "暂无描述"} arrow placement="top">
      <Card
        className="
          w-full cursor-default transition-shadow
          hover:shadow-sm
        "
      >
        <Box className="px-3 py-2">
          <Typography variant="body2" noWrap className="font-medium">
            {name}
          </Typography>
        </Box>
      </Card>
    </Tooltip>
  );
}
