import { useState, useEffect, useRef } from "react";
import { compileWatToWasm, runWasmModule, examples } from "../utils/wasmUtils";
import CodeMirror from "@uiw/react-codemirror";
import { wastLanguage } from "@codemirror/lang-wast";
import { oneDark } from "@codemirror/theme-one-dark";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const DEFAULT_CODE = examples.hello;

interface LogEntry {
  type: "info" | "error" | "success";
  message: string;
}

export function WasmPlayground() {
  const [watCode, setWatCode] = useState<string>(DEFAULT_CODE);
  const [output, setOutput] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const wasmModuleRef = useRef<WebAssembly.Module | null>(null);
  const wasmBinaryRef = useRef<Uint8Array | null>(null);
  const originalConsoleLog = useRef(console.log);

  useEffect(() => {
    const originalLog = originalConsoleLog.current;
    console.log = (...args) => {
      originalLog(...args);
      const message = args.map((arg) => String(arg)).join(" ");
      setLogs((prevLogs) => [...prevLogs, { type: "info", message }]);
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  const handleCodeChange = (value: string) => setWatCode(value);
  const addLog = (type: LogEntry["type"], message: string) =>
    setLogs((prevLogs) => [...prevLogs, { type, message }]);
  const clearLogs = () => {
    setLogs([]);
    setOutput("");
  };

  const compileCode = async () => {
    clearLogs();
    setIsCompiling(true);

    try {
      addLog("info", "Compiling WebAssembly Text Format (WAT) to WASM...");
      const { module, binary } = await compileWatToWasm(watCode);
      wasmModuleRef.current = module;
      wasmBinaryRef.current = binary;
      addLog("success", "Successfully compiled WAT to WASM!");
    } catch (error) {
      addLog(
        "error",
        `Compilation error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      wasmModuleRef.current = null;
      wasmBinaryRef.current = null;
    } finally {
      setIsCompiling(false);
    }
  };

  const runCode = async () => {
    if (!wasmModuleRef.current) {
      addLog(
        "error",
        "No compiled WASM module available. Please compile first."
      );
      return;
    }

    setIsRunning(true);

    try {
      addLog("info", "Running WebAssembly module...");
      const { results } = await runWasmModule(wasmModuleRef.current);
      const formattedResults = Object.entries(results)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");

      setOutput(formattedResults || "No results returned");
      addLog("success", "WebAssembly execution completed!");
    } catch (error) {
      addLog(
        "error",
        `Runtime error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleCompileAndRun = async () => {
    await compileCode();
    if (wasmModuleRef.current) {
      await runCode();
    }
  };

  const loadExample = (exampleKey: keyof typeof examples) => {
    setWatCode(examples[exampleKey]);
    addLog("info", `Loaded ${exampleKey} example`);
  };

  const handleDownload = async () => {
    if (!wasmModuleRef.current || !wasmBinaryRef.current) {
      addLog("error", "Please compile the code first before downloading.");
      return;
    }

    setIsDownloading(true);

    try {
      const zip = new JSZip();
      zip.file("module.wasm", wasmBinaryRef.current);
      zip.file("index.html", generateRunnerHTML());
      zip.file("source.wat", watCode);
      zip.file(
        "README.md",
        `# WebAssembly Module

This package contains:
- \`module.wasm\`: The compiled WebAssembly binary
- \`source.wat\`: The original WebAssembly Text Format source code
- \`index.html\`: A web page to run the WebAssembly module

## Usage
1. Serve these files through a web server (WebAssembly can't be loaded from file://)
2. Open index.html in your browser
3. Click "Run WASM" to execute the module

You can use a simple local server like:
- Python: \`python -m http.server\`
- Node.js: \`npx serve\`
`
      );

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "wasm-module.zip");
      addLog(
        "success",
        "Successfully created and downloaded the WASM package!"
      );
    } catch (error) {
      addLog(
        "error",
        `Failed to create download package: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="wasm-playground">
      <div className="header">
        <h1>WebAssembly Playground</h1>
        <p>
          Write, compile, and run WebAssembly Text Format (WAT) code directly in
          your browser
        </p>
      </div>

      <div className="control-panel">
        <button
          onClick={compileCode}
          disabled={isCompiling || watCode.trim() === ""}
        >
          {isCompiling ? "Compiling..." : "Compile WAT to WASM"}
        </button>

        <button
          onClick={runCode}
          disabled={isRunning || !wasmModuleRef.current}
        >
          {isRunning ? "Running..." : "Run WASM"}
        </button>

        <button
          onClick={handleCompileAndRun}
          disabled={isCompiling || isRunning || watCode.trim() === ""}
        >
          Compile & Run
        </button>

        <button
          onClick={handleDownload}
          disabled={isDownloading || !wasmModuleRef.current}
        >
          {isDownloading ? "Creating Package..." : "Download"}
        </button>

        <button onClick={clearLogs}>Clear Logs</button>
      </div>

      <div className="examples">
        <span>Examples: </span>
        {Object.keys(examples).map((key) => (
          <button
            key={key}
            className="example"
            onClick={() => loadExample(key as keyof typeof examples)}
          >
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      <div className="editor-container">
        <div className="editor-panel">
          <h2>WebAssembly Text Format (WAT)</h2>
          <div className="editor-wrapper">
            <CodeMirror
              value={watCode}
              height="400px"
              theme={oneDark}
              extensions={[wastLanguage]}
              onChange={handleCodeChange}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                autocompletion: true,
                closeBrackets: true,
                matchBrackets: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>

        <div className="output-panel">
          <h2>Output</h2>
          <div className="output">
            {output ||
              "No output yet. Compile and run your code to see results."}
          </div>

          <div className="logs">
            <h2>Logs</h2>
            <div className="output">
              {logs.length === 0
                ? "No logs yet."
                : logs.map((log, index) => (
                    <div key={index} className={log.type}>
                      {log.message}
                    </div>
                  ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function generateRunnerHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebAssembly Runner</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: #1a1a1a;
            color: #eee;
        }
        .container {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .output-panel {
            background: #111;
            border: 1px solid #333;
            border-radius: 4px;
            padding: 1rem;
            min-height: 100px;
            font-family: monospace;
            white-space: pre-wrap;
        }
        button {
            background: #646cff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 15px;
        }
        button:hover {
            background: #747bff;
        }
        .success { color: #55ff55; }
        .error { color: #ff5555; }
    </style>
</head>
<body>
    <div class="container">
        <h1>WebAssembly Runner</h1>
        <button onclick="runWasm()">Run WASM</button>
        <div id="output" class="output-panel">Click "Run WASM" to execute the module...</div>
    </div>
    <script>
        let wasmInstance = null;

        async function runWasm() {
            const outputDiv = document.getElementById('output');
            try {
                const response = await fetch('module.wasm');
                const wasmBuffer = await response.arrayBuffer();
                const wasmModule = await WebAssembly.compile(wasmBuffer);
                
                const imports = {
                    env: {
                        log: (value) => {
                            console.log(\`WASM log: \${value}\`);
                            outputDiv.innerHTML += \`<div>WASM log: \${value}</div>\`;
                            return value;
                        },
                        log_string: (ptr, len, memory) => {
                            const buffer = new Uint8Array(memory.buffer, ptr, len);
                            const text = new TextDecoder().decode(buffer);
                            console.log(\`WASM log: \${text}\`);
                            outputDiv.innerHTML += \`<div>WASM log: \${text}</div>\`;
                        }
                    }
                };

                wasmInstance = await WebAssembly.instantiate(wasmModule, imports);
                outputDiv.innerHTML = '';
                
                if (typeof wasmInstance.exports.main === 'function') {
                    const result = wasmInstance.exports.main();
                    outputDiv.innerHTML += \`<div class="success">Result: \${result}</div>\`;
                } else {
                    outputDiv.innerHTML += '<div class="error">No main function found in the WASM module</div>';
                }
            } catch (error) {
                console.error('Error running WASM:', error);
                outputDiv.innerHTML = \`<div class="error">Error: \${error.message}</div>\`;
            }
        }
    </script>
</body>
</html>`;
}
