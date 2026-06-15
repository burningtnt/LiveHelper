import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import type { InputDeclaration } from "~/api/schema";

interface InputEditorProps {
  inputs: InputDeclaration[];
  onChange: (inputs: InputDeclaration[]) => void;
}

export default function InputEditor({ inputs, onChange }: InputEditorProps) {
  const addInput = () => {
    onChange([
      ...inputs,
      { id: "", name: "", description: "", type: "number", multivalue: false },
    ]);
  };

  const removeInput = (index: number) => {
    onChange(inputs.filter((_, i) => i !== index));
  };

  const updateField = (index: number, field: keyof InputDeclaration, value: any) => {
    onChange(
      inputs.map((input, i) =>
        i === index ? { ...input, [field]: value } as InputDeclaration : input,
      ),
    );
  };

  return (
    <Box>
      {inputs.length === 0 && (
        <Box className="text-sm text-gray-500 mb-2">暂无输入参数</Box>
      )}
      {inputs.map((input, index) => (
        <Box key={index} className="mb-3 p-2 rounded border border-gray-200 dark:border-gray-700">
          {/* Row 1: ID + Name + Delete */}
          <Box className="flex items-center gap-2 mb-2">
            <TextField
              size="small"
              label="ID"
              value={input.id}
              onChange={(e) => updateField(index, "id", e.target.value)}
              className="shrink-0"
              sx={{ width: 100 }}
            />
            <TextField
              size="small"
              label="名称"
              value={input.name}
              onChange={(e) => updateField(index, "name", e.target.value)}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <IconButton onClick={() => removeInput(index)} size="small" color="error">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
          {/* Row 2: Description + Type + Multivalue */}
          <Box className="flex items-center gap-2">
            <TextField
              size="small"
              label="描述"
              value={input.description}
              onChange={(e) => updateField(index, "description", e.target.value)}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <TextField
              select
              size="small"
              label="类型"
              value={input.type}
              onChange={(e) => updateField(index, "type", e.target.value)}
              className="shrink-0"
              sx={{ width: 110 }}
            >
              <MenuItem value="number">数字</MenuItem>
              <MenuItem value="pose">坐标与视角</MenuItem>
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={input.multivalue}
                  onChange={(e) => updateField(index, "multivalue", e.target.checked)}
                  size="small"
                />
              }
              label="多值"
            />
          </Box>
        </Box>
      ))}
      <Button startIcon={<AddIcon />} onClick={addInput} size="small" variant="outlined">
        添加参数
      </Button>
    </Box>
  );
}
