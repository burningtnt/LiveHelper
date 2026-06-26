import { Markdown } from "~/components/Markdown";
import readme from "../../../../../README.md?raw";
import Stack from "@mui/material/Stack";

export default function HomePage() {
  return (
    <Stack direction="row" justifyContent="center" alignItems="center" className="h-full">
        <Markdown className="w-[60%] my-[5%]" controls={{"table": false}}>{readme}</Markdown>
    </Stack>
  );
}
