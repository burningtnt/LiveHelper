import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export default function ComponentCard(
  { name, description, badge, selected, onClick, onEdit, onDelete }: {
    name: string;
    description: string;
    badge?: ReactNode;
    selected: boolean;
    onClick: () => void;
    onEdit: () => void;
    onDelete: () => void;
  },
) {
  return (
    <Grid size={6}>
      <Card
        className={`group cursor-pointer transition-shadow hover:shadow-md ${selected ? "ring-2 ring-blue-500 shadow-md" : ""}`}
        onClick={onClick}
      >
        <Stack className="w-full px-4 py-3 items-start" spacing={1}>
          <Stack direction="row" alignItems="center" className="flex w-full min-w-0" spacing={1.5}>
            <Typography variant="h6" component="div" noWrap className="flex-1 min-w-0">
              {name}
            </Typography>
            {badge}
            <Box className="hidden group-hover:flex items-center gap-0.5">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Stack>
          <Typography variant="body2" color="text.secondary" className="line-clamp-2">
            {description || "暂无描述"}
          </Typography>
        </Stack>
      </Card>
    </Grid>
  );
}
