import type { StreamdownProps } from "streamdown";
import Link from "@mui/material/Link";
import { cjk } from "@streamdown/cjk";
import { Streamdown } from "streamdown";

export function Markdown({ components, plugins, ...props }: StreamdownProps) {
  return (
    <Streamdown
      mode="static"
      {...props}
      components={{
        a: ({ href, children, ...anchorProps }) => (
          <Link href={href} {...anchorProps}>
            {children}
          </Link>
        ),
        ...components,
      }}
      plugins={{ cjk, ...plugins }}
    />
  );
}
