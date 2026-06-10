import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { debounce } from "lodash-es";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import AddIcon from "@mui/icons-material/Add";
import CheckCircle from "@mui/icons-material/CheckCircle";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import Save from "@mui/icons-material/Save";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { InputDeclaration, Program } from "~/api/schema";
import {
  createProgram,
  deleteProgramFromApi,
  getProgramCode,
  getPrograms,
  programsQueryKey,
  setProgramCode,
  setProgramWasm,
  updateProgram,
} from "~/api/api";
import { parseError } from "~/utils";
import InputEditor from "./InputEditor";
import ComponentCard from "~/components/ComponentCard";
import { compileWithIncludes } from "./asc";

const AssemblyScriptEditor = lazy(() => import("~/components/AssemblyScriptEditor"));

// ── Zod schema ──────────────────────────────────────────────
const programFormSchema = z.object({
  name: z.string().trim().min(1, "请输入程序名称"),
  description: z.string().trim(),
  usage: z.enum(["clip", "manager"]),
});
type ProgramFormData = z.infer<typeof programFormSchema>;

// ── Template files ─────────────────────────────────────────
import clipTemplate from "./template/clip.as?raw";
import managerTemplate from "./template/manager.as?raw";

const usageLabels: Record<string, string> = {
  clip: "分镜头",
  manager: "调度器",
};

const usageColors: Record<string, "info" | "warning"> = {
  clip: "info",
  manager: "warning",
};

export default function Program() {
  const queryClient = useQueryClient();

  // ── Data fetching ─────────────────────────────────────────
  const { data: programs = [], isLoading, error } = useQuery({
    queryKey: programsQueryKey,
    queryFn: getPrograms,
    staleTime: 5 * 60 * 1000,
  });

  // ── Selection ─────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedProgram = programs.find((p) => p.id === selectedId) ?? null;

  // ── Code loading ──────────────────────────────────────────
  const { data: loadedCode = "", refetch: refetchCode } = useQuery({
    queryKey: ["programs", selectedId, "code"],
    queryFn: () => getProgramCode(selectedId!),
    enabled: selectedId !== null,
    staleTime: 60 * 1000,
  });

  const [localCode, setLocalCode] = useState("");

  // Sync server code → local when selection changes
  useEffect(() => {
    setLocalCode(loadedCode);
  }, [loadedCode, selectedId]);

  // Refetch code when the tab regains focus
  useEffect(() => {
    if (selectedId === null) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetchCode();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [selectedId, refetchCode]);

  // ── Debounced code save ───────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const usageRef = useRef(selectedProgram?.usage ?? "clip");
  usageRef.current = selectedProgram?.usage ?? "clip";

  const debouncedSave = useRef(
    debounce(async (code: string) => {
      const id = selectedIdRef.current;
      if (id === null) return;
      setSaveStatus("saving");
      try {
        await setProgramCode(id, code);
        setSaveStatus("saved");
      } catch (e) {
        setSaveStatus("idle");
        toast.error(parseError(e));
      }
    }, 600),
  ).current;

  // Cancel pending save when selection changes
  useEffect(() => {
    return () => { debouncedSave.cancel(); };
  }, [selectedId, debouncedSave]);

  // ── Debounced WASM compilation ──────────────────────────────
  const [compileStatus, setCompileStatus] = useState<"idle" | "compiling" | "compiled" | "error">("idle");
  const [compileError, setCompileError] = useState<string | null>(null);

  const debouncedCompile = useRef(
    debounce(async (code: string) => {
      const id = selectedIdRef.current;
      if (id === null) return;
      setCompileStatus("compiling");
      setCompileError(null);
      try {
        const usage = usageRef.current;
        const { binary, error } = await compileWithIncludes(code, usage);
        if (error || !binary) {
          setCompileStatus("error");
          setCompileError(error);
          return;
        }
        await setProgramWasm(id, binary);
        setCompileStatus("compiled");
      } catch (e) {
        setCompileStatus("error");
        setCompileError(parseError(e));
      }
    }, 1500),
  ).current;

  // Cancel pending compile when selection changes
  useEffect(() => {
    return () => { debouncedCompile.cancel(); };
  }, [selectedId, debouncedCompile]);

  const handleCodeChange = useCallback(
    (value: string) => {
      setLocalCode(value);
      setSaveStatus("saving");
      debouncedSave(value);
      debouncedCompile(value);
    },
    [debouncedSave, debouncedCompile],
  );

  // ── Mutations ─────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: async ({ program, template }: { program: Program; template: string }) => {
      await createProgram(program);
      await setProgramCode(program.id, template);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: programsQueryKey });
      toast.success("程序创建成功");
      addForm.reset();
      setAddInputs([]);
      setAddOpen(false);
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Program> }) =>
      updateProgram(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programsQueryKey });
      toast.success("程序更新成功");
      editForm.reset();
      setEditingProgram(null);
      setEditInputs([]);
      setEditOpen(false);
      // Invalidate code if inputs changed (code display may depend on it)
      queryClient.invalidateQueries({ queryKey: ["programs", variables.id, "code"] });
    },
    onError: (e) => toast.error(parseError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteProgramFromApi(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: programsQueryKey });
      toast.success("程序已删除");
      setDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmInput("");
      if (selectedId === deletedId) {
        setSelectedId(null);
      }
    },
    onError: (e) => toast.error(parseError(e)),
  });

  // ── Add dialog ────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addInputs, setAddInputs] = useState<InputDeclaration[]>([]);
  const addForm = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
    defaultValues: { name: "", description: "", usage: "clip" },
  });

  const nextId = useMemo(() => {
    if (programs.length === 0) return 1;
    const maxId = Math.max(...programs.map((p) => p.id));
    return maxId + 1;
  }, [programs]);

  const handleAdd = () => {
    addForm.handleSubmit((data) => {
      for (const input of addInputs) {
        if (!input.id.trim()) { toast.warning("形参 ID 不能为空"); return; }
        if (!input.name.trim()) { toast.warning("形参名称不能为空"); return; }
      }
      const template = data.usage === "clip" ? clipTemplate : managerTemplate;
      createMut.mutate({
        program: {
          id: nextId,
          name: data.name,
          description: data.description,
          usage: data.usage,
          inputs: addInputs.map(({ type, ...rest }) =>
            type ? { ...rest, type } : { ...rest, type: "number" as const },
          ),
        },
        template,
      });
    })();
  };

  // ── Edit dialog ───────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [editInputs, setEditInputs] = useState<InputDeclaration[]>([]);
  const editForm = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
  });
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);

  const openEdit = (program: Program) => {
    editForm.reset({
      name: program.name,
      description: program.description,
      usage: program.usage,
    });
    setEditInputs(program.inputs);
    setEditingProgram(program);
    setEditOpen(true);
  };

  const handleEdit = () => {
    if (!editingProgram) return;
    editForm.handleSubmit((data) => {
      for (const input of editInputs) {
        if (!input.id.trim()) { toast.warning("形参 ID 不能为空"); return; }
        if (!input.name.trim()) { toast.warning("形参名称不能为空"); return; }
      }
      updateMut.mutate({
        id: editingProgram.id,
        data: {
          id: editingProgram.id,
          name: data.name,
          description: data.description,
          usage: data.usage,
          inputs: editInputs.map(({ type, ...rest }) =>
            type ? { ...rest, type } : { ...rest, type: "number" as const },
          ),
        },
      });
    })();
  };

  // ── Delete dialog ─────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

  const openDelete = (program: Program) => {
    setDeleteTarget(program);
    setDeleteConfirmInput("");
    setDeleteOpen(true);
  };

  const canDelete = deleteConfirmInput === deleteTarget?.name;

  const handleDelete = () => {
    if (!deleteTarget || !canDelete) return;
    deleteMut.mutate(deleteTarget.id);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <Box className="w-full h-full flex flex-1">
      {/* Left panel: program list */}
      <Box className="w-1/2 p-4 overflow-auto">
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
        {!isLoading && !error && (
          <Grid container spacing={2}>
            {[...programs].sort((a, b) => a.id - b.id).map((program) => (
              <ComponentCard
                key={program.id}
                name={program.name}
                description={program.description}
                badge={
                  <Chip
                    label={usageLabels[program.usage] ?? program.usage}
                    color={usageColors[program.usage] ?? "default"}
                    size="small"
                    variant="outlined"
                    className="shrink-0"
                  />
                }
                selected={selectedId === program.id}
                onClick={() => setSelectedId(program.id)}
                onEdit={() => openEdit(program)}
                onDelete={() => openDelete(program)}
              />
            ))}
            <Grid size={12}>
              <Card>
                <Button
                  className="w-full h-full py-4"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    addForm.reset();
                    setAddInputs([]);
                    setAddOpen(true);
                  }}
                >
                  <Typography variant="body1" component="div">
                    添加程序
                  </Typography>
                </Button>
              </Card>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* Right panel: WASM editor + input params */}
      <Box className="w-1/2 h-full overflow-hidden rounded-r-lg border-l border-gray-200 dark:border-gray-700 flex flex-col">
        {selectedProgram ? (
          <>
            <Box key={selectedId} className="flex-1 overflow-hidden min-h-0">
              <Suspense fallback={<Box sx={{ p: 2 }} className="flex h-full items-center justify-center">编辑器加载中 (1/2)</Box>}>
                <AssemblyScriptEditor content={localCode} onContentChange={handleCodeChange} />
              </Suspense>
            </Box>
            <Box className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 shrink-0 max-h-48 overflow-auto">
              <Box className="flex items-center gap-1 mb-1">
                <Typography variant="subtitle2" className="text-muted-foreground">
                  {selectedProgram.inputs.length > 0 ? "输入形参" : "无输入形参"}
                </Typography>
                <Tooltip title={saveStatus === "saving" ? "未保存" : "已保存"} arrow>
                  <Save
                    sx={{
                      fontSize: 14,
                      color: saveStatus === "saving" ? "text.disabled" : "success.main",
                    }}
                  />
                </Tooltip>
                {compileStatus === "compiling" && (
                  <Tooltip title="编译中" arrow>
                    <CircularProgress size={14} color="info" />
                  </Tooltip>
                )}
                {compileStatus === "compiled" && (
                  <Tooltip title="编译完成" arrow>
                    <CheckCircle color="info" sx={{ fontSize: 14 }} />
                  </Tooltip>
                )}
                {compileStatus === "error" && (
                  <Tooltip title={compileError || "编译出错"} arrow>
                    <ErrorOutline color="error" sx={{ fontSize: 14 }} />
                  </Tooltip>
                )}
              </Box>
              {
                selectedProgram.inputs.map((input) => (
                  <Tooltip
                    key={input.id}
                    title={input.description || "无描述"}
                    placement="left"
                    arrow
                  >
                    <Box className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-default">
                      <code className="text-xs bg-muted px-1 rounded shrink-0">{input.id}</code>
                      <span className="flex-1 truncate min-w-0">{input.name || "(未命名)"}</span>
                      <Chip
                        label={input.type === "number" ? "数字" : "坐标与视角"}
                        size="small"
                        variant="outlined"
                        className="shrink-0"
                      />
                      {input.multivalue && (
                        <Chip
                          label="多值"
                          size="small"
                          color="primary"
                          variant="outlined"
                          className="shrink-0"
                        />
                      )}
                    </Box>
                  </Tooltip>
                ))
              }
            </Box>
          </>
        ) : (
          <Box className="flex items-center justify-center h-full">
            <Typography variant="body1" color="text.secondary">
              请从左侧选择一个程序
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Add Dialog ──────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => { addForm.reset(); setAddOpen(false); }} maxWidth="sm" fullWidth>
        <DialogTitle>添加程序</DialogTitle>
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
            label="用途"
            fullWidth
            value={addForm.watch("usage")}
            onChange={(e) =>
              addForm.setValue("usage", e.target.value as "clip" | "manager", { shouldValidate: true })
            }
            error={!!addForm.formState.errors.usage}
            helperText={addForm.formState.errors.usage?.message}
          >
            <MenuItem value="clip">分镜头</MenuItem>
            <MenuItem value="manager">调度器</MenuItem>
          </TextField>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              输入形参
            </Typography>
            <InputEditor
              inputs={addInputs}
              onChange={setAddInputs}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { addForm.reset(); setAddOpen(false); }}>取消</Button>
          <Button onClick={handleAdd} variant="contained" disabled={createMut.isPending}>
            {createMut.isPending ? "创建中…" : "创建"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Dialog ─────────────────────────────────── */}
      <Dialog open={editOpen} onClose={() => { editForm.reset(); setEditOpen(false); }} maxWidth="sm" fullWidth>
        <DialogTitle>编辑程序</DialogTitle>
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
            label="用途"
            fullWidth
            value={usageLabels[editForm.watch("usage")] ?? editForm.watch("usage")}
            slotProps={{ input: { readOnly: true } }}
            disabled
          />
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              输入形参
            </Typography>
            <InputEditor
              inputs={editInputs}
              onChange={setEditInputs}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { editForm.reset(); setEditOpen(false); }}>取消</Button>
          <Button onClick={handleEdit} variant="contained" disabled={updateMut.isPending}>
            {updateMut.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────── */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent className="space-y-3 pt-2!">
          <Typography variant="body2" color="text.secondary">
            删除操作不可撤销。请输入程序名称
            <strong> {deleteTarget?.name} </strong>
            以确认删除：
          </Typography>
          <TextField
            label="程序名称"
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
    </Box>
  );
}
