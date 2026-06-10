import Editor from "@monaco-editor/react";
import * as monaco from "monaco-editor";

type Monaco = typeof monaco;

function beforeMount(mn: Monaco) {
  const LANG = "assemblyscript";
  mn.languages.register({ id: LANG });
}

interface Props {
  content: string;
  onContentChange: (value: string) => void;
}

export default function AssemblyScriptEditor({ content, onContentChange }: Props) {
  function onMount(editor: monaco.editor.IStandaloneCodeEditor) {
    editor.addAction({
      id: "prevent-save",
      label: "Prevent browser save dialog",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => {},
    });
  }

  return (
    <Editor
      height="100%"
      language="assemblyscript"
      value={content}
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(v) => onContentChange(v ?? "")}
      loading="编辑器加载中 (2/2)"
      theme="vs-dark"
      options={{
        fontSize: 14,
        fontFamily: "'Consolas', monospace",
        lineNumbers: "on",
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        renderWhitespace: "selection",
        bracketPairColorization: { enabled: true },
        autoClosingBrackets: "always",
        autoClosingQuotes: "always",
        padding: { top: 8 },
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        automaticLayout: true,
      }}
    />
  );
}
