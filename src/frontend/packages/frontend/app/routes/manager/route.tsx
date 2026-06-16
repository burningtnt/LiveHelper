import type { InputValue, Manager, ManagerStatus } from "~/api/schema";
import InputValueEditor from "~/components/InputValueEditor";
import { buildInputsFromDeclarations, validateAndNormalize } from "~/routes/clip/input-utils";
import AddIcon from "@mui/icons-material/Add";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicator from "@mui/icons-material/DragIndicator";
import EditIcon from "@mui/icons-material/Edit";
import HighlightOff from "@mui/icons-material/HighlightOff";
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
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

  const [addInputs, setAddInputs] = useState<InputValue[]>([]);
  const [editInputs, setEditInputs] = useState<InputValue[]>([]);

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
  const uidRef = useRef(0);
  const [clipSequence, setClipSequence] = useState<
    { uid: string; clipId: number }[]
  >([]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

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
      setAddInputs([]);
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
      setEditInputs([]);
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
      const prog = programs.find((p) => p.id === data.program);
      const normalized = validateAndNormalize(addInputs, prog?.inputs ?? []);
      if (!normalized) return;
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
        inputs: normalized,
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
    setEditInputs(mgr.inputs);
    setEditingManager(mgr);
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingManager) return;
    editForm.handleSubmit((data) => {
      const prog = programs.find((p) => p.id === data.program);
      const normalized = validateAndNormalize(editInputs, prog?.inputs ?? []);
      if (!normalized) return;
      updateMut.mutate({
        id: editingManager.id,
        data: {
          id: editingManager.id,
          name: data.name,
          description: data.description,
          clips: editingManager.clips,
          program: data.program,
          width: data.width,
          height: data.height,
          fps: data.fps,
          renderDistance: data.renderDistance,
          inputs: normalized,
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
    const validClipIds = new Set(clips.map((c) => c.id));
    const seq = mgr.clips
      .filter((id) => validClipIds.has(id))
      .map((clipId) => ({
        uid: `seq-${uidRef.current++}`,
        clipId,
      }));
    setClipSelectManager(mgr);
    setClipSequence(seq);
    setClipSelectOpen(true);
  };

  const addToSequence = (clipId: number) => {
    setClipSequence((prev) => [
      ...prev,
      { uid: `seq-${uidRef.current++}`, clipId },
    ]);
  };

  const removeFromSequence = (index: number) => {
    setClipSequence((prev) => prev.filter((_, i) => i !== index));
  };

  const [activeDragClip, setActiveDragClip] = useState<{
    clipId: number;
    name: string;
  } | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith("available-")) {
      const clipId = Number(id.slice("available-".length));
      const clip = clips.find((c) => c.id === clipId);
      if (clip) {
        setActiveDragClip({ clipId: clip.id, name: clip.name });
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragClip(null);
    if (!over) return;

    const activeId = String(active.id);

    // Dragging from available clips
    if (activeId.startsWith("available-")) {
      const clipId = Number(activeId.slice("available-".length));
      const overId = String(over.id);

      if (overId === "sequence-droppable") {
        // Dropped on the empty sequence area → append to end
        addToSequence(clipId);
      } else if (overId.startsWith("seq-")) {
        // Dropped on a specific position in the sequence → insert there
        setClipSequence((prev) => {
          const insertIndex = prev.findIndex((item) => item.uid === overId);
          if (insertIndex < 0) return prev;
          const newItem = { uid: `seq-${uidRef.current++}`, clipId };
          const copy = [...prev];
          copy.splice(insertIndex, 0, newItem);
          return copy;
        });
      }
      return;
    }

    // Reorder within sequence
    if (active.id === over.id) return;
    setClipSequence((prev) => {
      const oldIndex = prev.findIndex((item) => item.uid === activeId);
      const newIndex = prev.findIndex((item) => item.uid === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleClipSelectConfirm = () => {
    if (!clipSelectManager) {
      return;
    }
    updateMut.mutate({
      id: clipSelectManager.id,
      data: {
        ...clipSelectManager,
        clips: clipSequence.map((item) => item.clipId),
      },
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
            setAddInputs([]);
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
        onClose={() => { addForm.reset(); setAddInputs([]); setAddOpen(false); }}
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
            onChange={(e) => {
              const progId = Number(e.target.value);
              addForm.setValue("program", progId, { shouldValidate: true });
              const prog = programs.find((p) => p.id === progId);
              setAddInputs(prog ? buildInputsFromDeclarations(prog.inputs) : []);
            }}
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
          {addForm.watch("program") ? (
            <Box>
              <Typography variant="subtitle2" gutterBottom>输入值</Typography>
              <InputValueEditor
                declarations={programs.find((p) => p.id === addForm.watch("program"))?.inputs ?? []}
                values={addInputs}
                onChange={setAddInputs}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">请先选择调度程序以配置输入值</Typography>
          )}
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
        onClose={() => { editForm.reset(); setEditInputs([]); setEditOpen(false); }}
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
            onChange={(e) => {
              const progId = Number(e.target.value);
              editForm.setValue("program", progId, { shouldValidate: true });
              const prog = programs.find((p) => p.id === progId);
              setEditInputs(prog ? buildInputsFromDeclarations(prog.inputs) : []);
            }}
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
          {editForm.watch("program") ? (
            <Box>
              <Typography variant="subtitle2" gutterBottom>输入值</Typography>
              <InputValueEditor
                declarations={programs.find((p) => p.id === editForm.watch("program"))?.inputs ?? []}
                values={editInputs}
                onChange={setEditInputs}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">请先选择调度程序以配置输入值</Typography>
          )}
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <DialogContent className="space-y-4 pt-2!" sx={{ minHeight: 400 }}>
            {/* ── Current sequence ─────────────────────────── */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                className="mb-1 font-bold"
              >
                当前序列（拖拽排序）
              </Typography>
              {clipSequence.length === 0 && (
                <SequenceDroppable />
              )}
              {clipSequence.length > 0 && (
                <SortableContext
                  items={clipSequence.map((item) => item.uid)}
                  strategy={verticalListSortingStrategy}
                >
                  <Box className="flex flex-col gap-1">
                    {clipSequence.map((item, index) => (
                      <SortableClipItem
                        key={item.uid}
                        uid={item.uid}
                        index={index}
                        clip={clips.find((c) => c.id === item.clipId)}
                        onRemove={() => removeFromSequence(index)}
                      />
                    ))}
                  </Box>
                </SortableContext>
              )}
            </Box>

            {/* divider */}
            <Box className="border-t border-gray-200 dark:border-gray-700" />

            {/* ── Available clips ──────────────────────────── */}
            <Box>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                className="mb-1 font-bold"
              >
                可用分镜头（点击 + 追加到末尾，或拖入上方序列）
              </Typography>
              {clips.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  暂无可用分镜头
                </Typography>
              )}
              {clips.length > 0 && (
                <Box
                  className="grid gap-2"
                  sx={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(180px, 1fr))",
                  }}
                >
                  {[...clips]
                    .sort((a, b) => a.id - b.id)
                    .map((clip) => (
                      <AvailableClipCard
                        key={clip.id}
                        clip={clip}
                        onAppend={() => addToSequence(clip.id)}
                      />
                    ))}
                </Box>
              )}
            </Box>
          </DialogContent>

          {/* ── Drag overlay ──────────────────────────────── */}
          <DragOverlay>
            {activeDragClip ? (
              <Card
                className="
                  flex items-center gap-1.5 px-4 py-2 opacity-80 shadow-xl
                  ring-2 ring-blue-500
                "
              >
                <DragIndicator fontSize="small" />
                <Typography variant="body2" className="font-medium">
                  {activeDragClip.name}
                </Typography>
              </Card>
            ) : null}
          </DragOverlay>

          <DialogActions>
            <Button onClick={() => setClipSelectOpen(false)}>取消</Button>
            <Button onClick={handleClipSelectConfirm} variant="contained">
              确认
            </Button>
          </DialogActions>
        </DndContext>
      </Dialog>
    </Box>
  );
}

// ── SequenceDroppable sub-component ────────────────────────

function SequenceDroppable() {
  const { setNodeRef, isOver } = useDroppable({ id: "sequence-droppable" });

  return (
    <Box
      ref={setNodeRef}
      className={`
        rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors
        ${isOver
          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
          : "border-gray-300 dark:border-gray-600"}
      `}
    >
      <Typography
        variant="body2"
        color={isOver ? "primary" : "text.secondary"}
        className="italic"
      >
        {isOver ? "松开以添加分镜头" : "尚未添加分镜头，从下方拖入或点击 + 添加"}
      </Typography>
    </Box>
  );
}

// ── AvailableClipCard sub-component ────────────────────────

function AvailableClipCard({
  clip,
  onAppend,
}: {
  clip: { id: number; name: string; description: string };
  onAppend: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `available-${clip.id}`,
    data: { clipId: clip.id },
  });

  return (
    <Card
      ref={setNodeRef}
      className={`
        transition-shadow hover:shadow-md
        ${isDragging ? "opacity-50" : ""}
      `}
      {...attributes}
      {...listeners}
    >
      <Box className="flex items-center gap-1 px-3 py-2">
        <Box className="min-w-0 flex-1">
          <Typography variant="body2" noWrap className="font-medium">
            {clip.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            className="line-clamp-1 block"
          >
            {clip.description || "暂无描述"}
          </Typography>
        </Box>
        {/* Use pointer-events-auto inside a draggable to keep the button clickable */}
        <Box
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onAppend();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <IconButton size="small" color="primary" title="追加到序列末尾">
            <AddCircleOutline fontSize="small" />
          </IconButton>
        </Box>
      </Box>
    </Card>
  );
}

// ── SortableClipItem sub-component ─────────────────────────

function SortableClipItem({
  uid,
  index,
  clip,
  onRemove,
}: {
  uid: string;
  index: number;
  clip?: { id: number; name: string; description: string };
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: uid });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-1 px-3 py-2
        ${isDragging ? "shadow-lg" : ""}
      `}
    >
      {/* Drag handle */}
      <IconButton
        size="small"
        className="cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <DragIndicator fontSize="small" />
      </IconButton>

      {/* Order number badge */}
      <Chip
        label={`#${index + 1}`}
        size="small"
        variant="outlined"
        className="shrink-0"
      />

      {/* Clip name */}
      <Typography variant="body2" className="min-w-0 flex-1 font-medium">
        {clip?.name ?? `分镜头 #${uid}`}
      </Typography>

      {/* Remove button */}
      <IconButton size="small" color="error" onClick={onRemove} title="移除">
        <HighlightOff fontSize="small" />
      </IconButton>
    </Card>
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
  const clipLookup = new Map(clips.map((c) => [c.id, c]));
  const assignedClips = manager.clips
    .map((id) => clipLookup.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);
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
              className="flex flex-wrap gap-2"
            >
              {assignedClips.map((clip, index) => (
                <OrderedClipCard
                  key={`${clip.id}-${index}`}
                  index={index}
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

// ── OrderedClipCard sub-component ──────────────────────────

function OrderedClipCard({
  index,
  name,
  description,
}: {
  index: number;
  name: string;
  description: string;
}) {
  return (
    <Tooltip title={description || "暂无描述"} arrow placement="top">
      <Card
        className="
          flex items-center gap-1.5 px-3 py-2 transition-shadow
          hover:shadow-sm
        "
      >
        <Chip
          label={`#${index + 1}`}
          size="small"
          variant="outlined"
          className="shrink-0"
        />
        <Typography variant="body2" noWrap className="font-medium">
          {name}
        </Typography>
      </Card>
    </Tooltip>
  );
}
