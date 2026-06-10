import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ComponentCard from "~/components/ComponentCard";
import type { Clip, InputDeclaration, InputValue } from "~/api/schema";
import {
    clipsQueryKey,
    createClip,
    deleteClipFromApi,
    getClips,
    getPrograms,
    updateClip,
} from "~/api/api";
import { parseError } from "~/utils";
import InputValueEditor from "./InputValueEditor";

// ── Zod schema ──────────────────────────────────────────────
const clipFormSchema = z.object({
    name: z.string().trim().min(1, "请输入分镜头名称"),
    description: z.string().trim(),
    duration: z.string().refine(
        (val) => {
            if (val === "") return false;
            const num = Number(val);
            return !isNaN(num) && num > 0;
        },
        { message: "请输入有效的时长" },
    ),
    technique: z.number().min(1, "请选择技法程序"),
});
type ClipFormData = z.infer<typeof clipFormSchema>;

/**
 * Validate and normalize values before sending to parent.
 * - Validates all non-multivalue declarations have a non-null value (aborts with toast if not)
 * - For each multivalue declaration: re-index IDs, calculate count, insert count value
 * - Ensures every InputValue carries the correct `type` matching its declaration
 * Returns the normalized array, or `null` if validation failed.
 */
function validateAndNormalize(
    raw: InputValue[],
    declarations: InputDeclaration[],
): InputValue[] | null {
    function findIndexedValues(values: InputValue[], baseId: string): InputValue[] {
        const prefix = `${baseId}.`;
        return values
            .filter((v) => v.id.startsWith(prefix))
            .sort((a, b) => {
                const ai = Number(a.id.slice(prefix.length));
                const bi = Number(b.id.slice(prefix.length));
                return ai - bi;
            });
    }

    const result: InputValue[] = [];

    for (const decl of declarations) {
        if (decl.multivalue) {
            // Collect indexed values, re-index consecutively
            const indexed = findIndexedValues(raw, decl.id);
            for (const inner of indexed) {
                if (inner.type !== decl.type || inner.value === null) {
                    const typeHint = decl.type === "pose" ? "坐标和视角，必须填写" : "数字";
                    toast.warning(`${decl.name} 的输入类型为${typeHint}`);
                    return null
                }
            }
            const reindexed = indexed.map((iv, i) => ({
                ...iv,
                id: `${decl.id}.${i}`,
            }));
            // Insert count value
            result.push({ id: decl.id, type: "number" as const, value: reindexed.length });
            result.push(...reindexed);
        } else {
            const match = raw.find((v) => v.id === decl.id);
            if (!match || match.value === null) {
                const typeHint = decl.type === "pose" ? "坐标和视角，必须填写" : "数字";
                toast.warning(`${decl.name} 的输入类型为${typeHint}`);
                return null;
            }
            result.push({ ...match, type: decl.type });
        }
    }

    return result;
}

function buildInputsFromDeclarations(declarations: InputDeclaration[]): InputValue[] {
    return declarations.map((decl) => {
        return { id: decl.id, type: decl.type, value: null };
    });
}

export default function ClipRoute() {
    const queryClient = useQueryClient();

    // ── Data fetching ─────────────────────────────────────────
    const { data: clips = [], isLoading, error } = useQuery({
        queryKey: clipsQueryKey,
        queryFn: getClips,
        staleTime: 5 * 60 * 1000,
    });

    const { data: programs = [] } = useQuery({
        queryKey: ["programs"],
        queryFn: getPrograms,
        staleTime: 5 * 60 * 1000,
    });

    // ── Mutations ─────────────────────────────────────────────
    const createMut = useMutation({
        mutationFn: createClip,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: clipsQueryKey });
            toast.success("分镜头创建成功");
            addForm.reset();
            setAddInputs([]);
            setAddOpen(false);
        },
        onError: (e) => toast.error(parseError(e)),
    });

    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Clip> }) =>
            updateClip(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: clipsQueryKey });
            toast.success("分镜头更新成功");
            editForm.reset();
            setEditingClip(null);
            setEditInputs([]);
            setEditOpen(false);
        },
        onError: (e) => toast.error(parseError(e)),
    });

    const deleteMut = useMutation({
        mutationFn: (id: number) => deleteClipFromApi(id),
        onSuccess: (_data, deletedId) => {
            queryClient.invalidateQueries({ queryKey: clipsQueryKey });
            toast.success("分镜头已删除");
            setDeleteOpen(false);
            setDeleteTarget(null);
            setDeleteConfirmInput("");
        },
        onError: (e) => toast.error(parseError(e)),
    });

    // ── Add dialog ────────────────────────────────────────────
    const [addOpen, setAddOpen] = useState(false);
    const [addInputs, setAddInputs] = useState<InputValue[]>([]);
    const addForm = useForm<ClipFormData>({
        resolver: zodResolver(clipFormSchema),
        defaultValues: { name: "", description: "", duration: "", technique: 0 },
    });

    const nextId = useMemo(() => {
        if (clips.length === 0) return 1;
        return Math.max(...clips.map((c) => c.id)) + 1;
    }, [clips]);

    const handleAdd = () => {
        addForm.handleSubmit((data) => {
            const prog = programs.find((p) => p.id === data.technique);
            const normalized = validateAndNormalize(addInputs, prog?.inputs ?? []);
            if (!normalized) return;
            createMut.mutate({
                id: nextId,
                name: data.name,
                description: data.description,
                duration: Math.round(Number(data.duration) * 1000),
                technique: data.technique,
                inputs: normalized,
            });
        })();
    };

    // ── Edit dialog ───────────────────────────────────────────
    const [editOpen, setEditOpen] = useState(false);
    const [editInputs, setEditInputs] = useState<InputValue[]>([]);
    const editForm = useForm<ClipFormData>({
        resolver: zodResolver(clipFormSchema),
    });
    const [editingClip, setEditingClip] = useState<Clip | null>(null);

    const openEdit = (clip: Clip) => {
        editForm.reset({
            name: clip.name,
            description: clip.description,
            duration: clip.duration ? String(clip.duration / 1000) : "",
            technique: clip.technique,
        });
        setEditInputs(clip.inputs);
        setEditingClip(clip);
        setEditOpen(true);
    };

    const handleEdit = () => {
        if (!editingClip) return;
        editForm.handleSubmit((data) => {
            const prog = programs.find((p) => p.id === data.technique);
            const normalized = validateAndNormalize(editInputs, prog?.inputs ?? []);
            if (!normalized) return;
            updateMut.mutate({
                id: editingClip.id,
                data: {
                    id: editingClip.id,
                    name: data.name,
                    description: data.description,
                    duration: Math.round(Number(data.duration) * 1000),
                    technique: data.technique,
                    inputs: normalized,
                },
            });
        })();
    };

    // ── Delete dialog ─────────────────────────────────────────
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState("");

    const openDelete = (clip: Clip) => {
        setDeleteTarget(clip);
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
        <Box className="w-full h-full p-4 overflow-auto">
            {isLoading && (
                <Typography variant="body1" color="text.secondary">加载中…</Typography>
            )}
            {error && (
                <Typography variant="body1" color="error">加载失败: {parseError(error)}</Typography>
            )}
            {!isLoading && !error && (
                <Grid container spacing={2}>
                    {[...clips].sort((a, b) => a.id - b.id).map((clip) => (
                        <ComponentCard
                            key={clip.id}
                            name={clip.name}
                            description={clip.description}
                            badge={
                                <Chip
                                    label={programs.find(p => p.id == clip.technique)?.name ?? "加载中"}
                                    color="info"
                                    size="small"
                                    variant="outlined"
                                    className="shrink-0"
                                />
                            }
                            selected={false}
                            onClick={() => { }}
                            onEdit={() => openEdit(clip)}
                            onDelete={() => openDelete(clip)}
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
                                <Typography variant="body1" component="div">添加分镜头</Typography>
                            </Button>
                        </Card>
                    </Grid>
                </Grid>
            )}

            {/* ── Add Dialog ──────────────────────────────────── */}
            <Dialog open={addOpen} onClose={() => { addForm.reset(); setAddOpen(false); }} maxWidth="sm" fullWidth>
                <DialogTitle>添加分镜头</DialogTitle>
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
                        label="时长（秒）"
                        fullWidth
                        value={addForm.watch("duration")}
                        onChange={(e) => addForm.setValue("duration", e.target.value, { shouldValidate: true })}
                        error={!!addForm.formState.errors.duration}
                        helperText={addForm.formState.errors.duration?.message || "允许小数，例如 2.5"}
                    />
                    <TextField
                        select
                        label="技法程序"
                        fullWidth
                        value={addForm.watch("technique") || ""}
                        onChange={(e) => {
                            const progId = Number(e.target.value);
                            addForm.setValue("technique", progId, { shouldValidate: true });
                            const prog = programs.find((p) => p.id === progId);
                            setAddInputs(prog ? buildInputsFromDeclarations(prog.inputs) : []);
                        }}
                        error={!!addForm.formState.errors.technique}
                        helperText={addForm.formState.errors.technique?.message}
                    >
                        {programs.filter((p) => p.usage === "clip").map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                                {p.name} (#{p.id})
                            </MenuItem>
                        ))}
                    </TextField>
                    {addForm.watch("technique") ? (
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>输入值</Typography>
                            <InputValueEditor
                                declarations={programs.find((p) => p.id === addForm.watch("technique"))?.inputs ?? []}
                                values={addInputs}
                                onChange={setAddInputs}
                            />
                        </Box>
                    ) : (
                        <Typography variant="body2" color="text.secondary">请先选择技法程序以配置输入值</Typography>
                    )}
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
                <DialogTitle>编辑分镜头</DialogTitle>
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
                        label="时长（秒）"
                        fullWidth
                        value={editForm.watch("duration")}
                        onChange={(e) => editForm.setValue("duration", e.target.value, { shouldValidate: true })}
                        error={!!editForm.formState.errors.duration}
                        helperText={editForm.formState.errors.duration?.message || "允许小数，例如 2.5"}
                    />
                    <TextField
                        select
                        label="技法程序"
                        fullWidth
                        value={editForm.watch("technique") || ""}
                        onChange={(e) => {
                            const progId = Number(e.target.value);
                            editForm.setValue("technique", progId, { shouldValidate: true });
                            const prog = programs.find((p) => p.id === progId);
                            setEditInputs(prog ? buildInputsFromDeclarations(prog.inputs) : []);
                        }}
                        error={!!editForm.formState.errors.technique}
                        helperText={editForm.formState.errors.technique?.message}
                    >
                        {programs.filter((p) => p.usage === "clip").map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                                {p.name} (#{p.id})
                            </MenuItem>
                        ))}
                    </TextField>
                    {editForm.watch("technique") ? (
                        <Box>
                            <Typography variant="subtitle2" gutterBottom>输入值</Typography>
                            <InputValueEditor
                                declarations={programs.find((p) => p.id === editForm.watch("technique"))?.inputs ?? []}
                                values={editInputs}
                                onChange={setEditInputs}
                            />
                        </Box>
                    ) : (
                        <Typography variant="body2" color="text.secondary">请先选择技法程序以配置输入值</Typography>
                    )}
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
                        删除操作不可撤销。请输入分镜头名称
                        <strong> {deleteTarget?.name} </strong>
                        以确认删除：
                    </Typography>
                    <TextField
                        label="分镜头名称"
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
