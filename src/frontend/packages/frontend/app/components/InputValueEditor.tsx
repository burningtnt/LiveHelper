import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import DeleteIcon from "@mui/icons-material/Delete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { InputDeclaration, InputValue, PoseValue } from "~/api/schema";
import { getQueueResult, submitEntityQueue, submitPoseQueue } from "~/api/api";
import { parseError } from "~/utils";

interface InputValueEditorProps {
    declarations: InputDeclaration[];
    values: InputValue[];
    onChange: (values: InputValue[]) => void;
}

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

/** Display a pose value as "(X, Y, Z), (QX, QY, QZ, QW)" */
function formatPose(v: PoseValue): string {
    const pos = `(${[v.x, v.y, v.z].map((n) => Number(n).toFixed(2)).join(", ")})`;
    const rot = `(${[v.qx, v.qy, v.qz, v.qw].map((n) => Number(n).toFixed(2)).join(", ")})`;
    return `${pos}, ${rot}`;
}

const typeLabel: Record<string, string> = {
    number: "数字",
    pose: "坐标与视角",
    entity: "实体",
};

export default function InputValueEditor({ declarations, values, onChange }: InputValueEditorProps) {
    // Wrapped onChange that validates + normalizes before emitting
    const emit = (next: InputValue[]) => {
        onChange(next);
    };

    const updateValue = (newValue: InputValue) => {
        const id = values.findIndex(v => v.id == newValue.id);
        const vs = [...values];
        if (id >= 0) {
            vs[id] = newValue;
        } else {
            vs.push(newValue);
        }
        emit(vs);
    };

    const addIndexedValue = (baseId: string, declType: "number" | "pose" | "entity") => {
        const indexed = findIndexedValues(values, baseId);
        const nextIndex = indexed.length;
        const newValue: InputValue = { id: `${baseId}.${nextIndex}`, type: declType, value: null };
        emit([...values, newValue]);
    };

    const removeIndexedValue = (baseId: string, removeIdx: number) => {
        const kept = values.filter((v) => !(v.id === `${baseId}.${removeIdx}`));
        emit(kept);
    };

    const moveIndexedValue = (baseId: string, fromIdx: number, toIdx: number) => {
        const indexed = findIndexedValues(values, baseId);
        if (toIdx < 0 || toIdx >= indexed.length) return;
        const a = indexed[fromIdx];
        const b = indexed[toIdx];
        const swapped = values.map((v) => {
            if (v.id === a.id) return { ...v, id: b.id } as InputValue;
            if (v.id === b.id) return { ...v, id: a.id } as InputValue;
            return v;
        });
        emit(swapped);
    };

    return (
        <Box className="space-y-3">
            {declarations.map((decl) => {
                const indexedValues = decl.multivalue ? findIndexedValues(values, decl.id) : [];
                const sectionLabel = decl.multivalue
                    ? `${decl.name} (多值)`
                    : `${decl.name} (${typeLabel[decl.type] ?? decl.type})`;

                return (
                    <Box key={decl.id} className="p-2 rounded border border-gray-200 dark:border-gray-700">

                        {!decl.multivalue && (
                            decl.type === "number"
                                ? (
                                    <NumberInput
                                        value={values.find((v) => v.id === decl.id) ?? { id: decl.id, type: decl.type, value: null }}
                                        onChange={updateValue}
                                        label={sectionLabel}
                                        placeholder={decl.description || "无描述信息"}
                                    />
                                )
                                : decl.type === "entity"
                                    ? (
                                        <EntityDisplay
                                            value={values.find((v) => v.id === decl.id) ?? { id: decl.id, type: decl.type, value: null }}
                                            onChange={updateValue}
                                            label={sectionLabel}
                                            placeholder={decl.description || "无描述信息"}
                                        />
                                    )
                                    : (
                                        <PoseDisplay
                                            value={values.find((v) => v.id === decl.id) ?? { id: decl.id, type: decl.type, value: null }}
                                            onChange={updateValue}
                                            label={sectionLabel}
                                            placeholder={decl.description || "无描述信息"}
                                        />
                                    )
                        )}

                        {decl.multivalue && (
                            <Box>
                                <Typography variant="subtitle2" className="mb-1">{sectionLabel}</Typography>
                                {indexedValues.map((iv, idx) => (
                                    <Box key={iv.id} className="flex items-start gap-1 mb-1">
                                        <Box className="flex flex-col gap-0.5 pt-1">
                                            <IconButton
                                                size="small"
                                                onClick={() => moveIndexedValue(decl.id, idx, idx - 1)}
                                                disabled={idx === 0}
                                                className="w-5 h-5 min-w-0!"
                                            >
                                                <ArrowUpward fontSize="inherit" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => moveIndexedValue(decl.id, idx, idx + 1)}
                                                disabled={idx === indexedValues.length - 1}
                                                className="w-5 h-5 min-w-0!"
                                            >
                                                <ArrowDownward fontSize="inherit" />
                                            </IconButton>
                                        </Box>
                                        <Box className="flex-1">
                                            {iv.type === "number"
                                                ? (
                                                    <NumberInput
                                                        value={iv}
                                                        onChange={updateValue}
                                                        label={`${decl.name} #${idx}`}
                                                        placeholder={decl.description || "无描述信息"}
                                                    />
                                                )
                                                : iv.type === "entity"
                                                    ? (
                                                        <EntityDisplay
                                                            value={iv}
                                                            onChange={updateValue}
                                                            label={`${decl.name} #${idx}`}
                                                            placeholder={decl.description || "无描述信息"}
                                                        />
                                                    )
                                                    : (
                                                        <PoseDisplay
                                                            value={iv}
                                                            onChange={updateValue}
                                                            label={`${decl.name} #${idx}`}
                                                            placeholder={decl.description || "无描述信息"}
                                                        />
                                                    )}
                                        </Box>
                                        <IconButton
                                            onClick={() => removeIndexedValue(decl.id, idx)}
                                            size="small"
                                            color="error"
                                            className="mt-1"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                ))}
                                <Button
                                    startIcon={<AddIcon />}
                                    onClick={() => addIndexedValue(decl.id, decl.type)}
                                    size="small"
                                    variant="outlined"
                                    className="mt-1"
                                >
                                    添加{decl.name || decl.id}
                                </Button>
                            </Box>
                        )}
                    </Box>
                );
            })}
            {declarations.length === 0 && (
                <Typography variant="body2" className="text-muted-foreground">
                    请先选择技法程序
                </Typography>
            )}
        </Box>
    );
}

function NumberInput({
    value,
    onChange,
    label: labelProp,
    labelPrefix,
    placeholder,
}: {
    value: InputValue;
    onChange: (v: InputValue) => void;
    label?: string;
    labelPrefix?: string;
    placeholder?: string;
}) {
    const label = labelProp ?? labelPrefix ?? value.id;
    const [raw, setRaw] = useState(value.value !== null ? String(value.value) : "");

    return (
        <TextField
            size="small"
            label={label}
            type="text"
            inputMode="decimal"
            fullWidth
            value={raw}
            placeholder={placeholder}
            onChange={(e) => {
                const text = e.target.value;
                setRaw(text);
                if (text === "") {
                    onChange({ ...value, value: null });
                } else {
                    const parsed = Number(text);
                    if (!Number.isNaN(parsed)) {
                        onChange({ ...value, value: parsed });
                    } else if (value.value !== null) {
                        // Had a valid value before, invalid now — reject and warn
                        toast.warning("请输入十进制数字");
                        setRaw(String(value.value));
                    }
                    // If value was already null (unset), stay null — no toast needed
                }
            }}
            onBlur={() => {
                const trimmed = raw.replace(/^(0+)(\d)/, "$2");
                if (trimmed !== raw) {
                    setRaw(trimmed);
                    const parsed = Number(trimmed);
                    if (trimmed === "") {
                        onChange({ ...value, value: null });
                    } else if (!Number.isNaN(parsed)) {
                        onChange({ ...value, value: parsed });
                    }
                }
            }}
        />
    );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function EntityDisplay({
    value,
    onChange,
    label: labelProp,
    labelPrefix,
    placeholder,
}: {
    value: InputValue;
    onChange?: (v: InputValue) => void;
    label?: string;
    labelPrefix?: string;
    placeholder?: string;
}) {
    const label = labelProp ?? labelPrefix ?? "实体 UUID";
    const [raw, setRaw] = useState(typeof value.value === "string" ? value.value : "");
    const [uuidError, setUuidError] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);
    const pollingRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);   

    useEffect(() => {
        return () => {
            pollingRef.current = false;
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    const stopPolling = () => {
        pollingRef.current = false;
        setPolling(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleSetFromGame = async () => {
        if (polling) return;
        setPolling(true);
        pollingRef.current = true;

        try {
            const key = await submitEntityQueue();
            if (!pollingRef.current) return;

            timerRef.current = setInterval(async () => {
                if (!pollingRef.current) {
                    stopPolling();
                    return;
                }
                try {
                    const result = await getQueueResult(key);
                    if (!pollingRef.current) return;

                    if (result.status === 200 && result.data) {
                        const str = typeof result.data.value === "string" ? result.data.value : "";
                        const updated: InputValue = {
                            ...result.data,
                            id: value.id,
                        };
                        setRaw(str);
                        setUuidError(null);
                        onChange?.(updated);
                        stopPolling();
                        toast.success("已从游戏内获取设置");
                    } else if (result.status === 404) {
                        stopPolling();
                    }
                } catch {
                    if (pollingRef.current) {
                        stopPolling();
                    }
                }
            }, 500);
        } catch (e) {
            stopPolling();
            if (pollingRef.current) {
                toast.error(parseError(e));
            }
        }
    };

    const validateAndUpdate = (text: string) => {
        setRaw(text);
        if (text === "") {
            setUuidError(null);
            onChange?.({ ...value, value: null });
        } else if (UUID_REGEX.test(text)) {
            setUuidError(null);
            onChange?.({ ...value, value: text });
        } else {
            setUuidError("请输入有效的实体 UUID");
            if (typeof value.value !== "string" || !UUID_REGEX.test(value.value)) {
                onChange?.({ ...value, value: null });
            }
        }
    };

    return (
        <Box className="flex items-start gap-2">
            <TextField
                size="small"
                label={label}
                fullWidth
                value={raw}
                placeholder={placeholder ?? "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
                error={!!uuidError}
                helperText={uuidError || "UUID 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
                onChange={(e) => validateAndUpdate(e.target.value)}
            />
            <Button
                variant="outlined"
                size="small"
                onClick={handleSetFromGame}
                disabled={polling}
                className="shrink-0 whitespace-nowrap mt-1"
            >
                {polling ? "请求中…" : "至游戏内设置"}
            </Button>
        </Box>
    );
}

function PoseDisplay({
    value,
    onChange,
    label: labelProp,
    labelPrefix,
    placeholder,
}: {
    value: InputValue;
    onChange?: (v: InputValue) => void;
    label?: string;
    labelPrefix?: string;
    placeholder?: string;
}) {
    const label = labelProp ?? labelPrefix ?? "坐标与视角";
    const pose = value.value && typeof value.value === "object" ? value.value as PoseValue : null;

    const [polling, setPolling] = useState(false);
    const pollingRef = useRef(false);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Cleanup polling on unmount (e.g. dialog closed)
    useEffect(() => {
        return () => {
            pollingRef.current = false;
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, []);

    const stopPolling = () => {
        pollingRef.current = false;
        setPolling(false);
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleSetFromGame = async () => {
        if (polling) return;
        setPolling(true);
        pollingRef.current = true;

        try {
            const key = await submitPoseQueue();
            if (!pollingRef.current) return;

            timerRef.current = setInterval(async () => {
                if (!pollingRef.current) {
                    stopPolling();
                    return;
                }
                try {
                    const result = await getQueueResult(key);
                    if (!pollingRef.current) return;

                    if (result.status === 200 && result.data) {
                        // Replace response id with current input's id
                        const updated: InputValue = {
                            ...result.data,
                            id: value.id,
                        };
                        onChange?.(updated);
                        stopPolling();
                        toast.success("已从游戏内获取设置");
                    } else if (result.status === 404) {
                        // User cancelled in-game, stop silently
                        stopPolling();
                    }
                    // 202: continue polling
                } catch {
                    if (pollingRef.current) {
                        stopPolling();
                    }
                }
            }, 500);
        } catch (e) {
            stopPolling();
            if (pollingRef.current) {
                toast.error(parseError(e));
            }
        }
    };

    return (
        <Box className="flex items-center gap-2">
            <TextField
                size="small"
                label={label}
                fullWidth
                value={pose ? formatPose(pose) : ""}
                placeholder={placeholder ?? "无描述信息"}
                slotProps={{ input: { readOnly: true } }}
            />
            <Button
                variant="outlined"
                size="small"
                onClick={handleSetFromGame}
                disabled={polling}
                className="shrink-0 whitespace-nowrap"
            >
                {polling ? "请求中…" : "至游戏内设置"}
            </Button>
        </Box>
    );
}
