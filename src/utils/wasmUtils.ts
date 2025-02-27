/**
 * Result type for WebAssembly compilation
 */
interface WasmCompileResult {
  module: WebAssembly.Module;
  binary: Uint8Array;
}

/**
 * Type for WebAssembly execution results
 */
interface WasmResults {
  [key: string]: number | undefined;
}

type ModuleImports = {
  [key: string]: WebAssembly.ModuleImports;
};

/**
 * Converts WebAssembly Text Format (WAT) to WebAssembly binary format
 * @param watCode WebAssembly Text Format code
 * @returns Promise resolving to a compiled WebAssembly module and its binary
 */
export async function compileWatToWasm(
  watCode: string
): Promise<WasmCompileResult> {
  try {
    // Load the WABT module (WebAssembly Binary Toolkit)
    const wabtModule = await import("wabt");
    const wabt = await wabtModule.default();

    // Parse and validate the WAT code
    const wasmModule = wabt.parseWat("input.wat", watCode);

    // Convert WAT to WASM binary
    const { buffer } = wasmModule.toBinary({});

    // Create a Uint8Array from the buffer for storage
    const binary = new Uint8Array(buffer);

    // Compile the WASM binary
    const module = await WebAssembly.compile(buffer);

    return { module, binary };
  } catch (error) {
    console.error("Error compiling WAT to WASM:", error);
    throw new Error(
      `Failed to compile WAT to WASM: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Runs a WebAssembly module with optional imports
 * @param wasmModule Compiled WebAssembly module
 * @param imports Optional imports for the WebAssembly module
 * @returns Results of the WebAssembly execution
 */
export async function runWasmModule(
  wasmModule: WebAssembly.Module,
  imports: Partial<ModuleImports> = {}
): Promise<{ instance: WebAssembly.Instance; results: WasmResults }> {
  try {
    // Add default imports for console logging
    const defaultImports = {
      env: {
        log: (value: number) => {
          console.log(`WASM log: ${value}`);
          return value;
        },
        log_string: (ptr: number, len: number, memory: WebAssembly.Memory) => {
          const buffer = new Uint8Array(memory.buffer, ptr, len);
          const text = new TextDecoder().decode(buffer);
          console.log(`WASM log: ${text}`);
        },
      },
    };

    // Merge default imports with provided imports
    const mergedImports = { ...defaultImports, ...imports };

    // Instantiate the WebAssembly module
    const instance = await WebAssembly.instantiate(wasmModule, mergedImports);

    // Get the exports from the instance
    const exports = instance.exports;

    // Try to call the main function if it exists
    const results: WasmResults = {};
    if (typeof exports.main === "function") {
      results.main = (exports.main as () => number)();
    }

    // Return the instance and any results
    return { instance, results };
  } catch (error) {
    console.error("Error running WASM module:", error);
    throw new Error(
      `Failed to run WASM module: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Example WAT code snippets for the playground
 */
export const examples = {
  hello: `(module
  (func $main (result i32)
    i32.const 42)
  (export "main" (func $main)))`,

  addition: `(module
  (func $add (param $a i32) (param $b i32) (result i32)
    (i32.add (local.get $a) (local.get $b)))
  (func $main (result i32)
    (call $add (i32.const 5) (i32.const 37)))
  (export "main" (func $main))
  (export "add" (func $add)))`,

  factorial: `(module
  (func $factorial (param $n i32) (result i32)
    (local $result i32)
    (local.set $result (i32.const 1))
    (block $done
      (br_if $done
        (i32.lt_s
          (local.get $n)
          (i32.const 2)))
      (local.set $result
        (i32.mul
          (local.get $n)
          (call $factorial
            (i32.sub
              (local.get $n)
              (i32.const 1))))))
    (local.get $result))
  (func $main (result i32)
    (call $factorial (i32.const 5)))
  (export "main" (func $main))
  (export "factorial" (func $factorial)))`,

  fibonacci: `(module
  (func $fibonacci (param $n i32) (result i32)
    (local $i i32)
    (local $a i32)
    (local $b i32)
    (local $temp i32)
    (local.set $i (i32.const 1))
    (local.set $a (i32.const 0))
    (local.set $b (i32.const 1))
    (if (i32.le_s (local.get $n) (i32.const 0))
      (then
        (return (i32.const 0))))
    (if (i32.eq (local.get $n) (i32.const 1))
      (then
        (return (i32.const 1))))
    (loop $fib_loop
      (if (i32.lt_s (local.get $i) (local.get $n))
        (then
          (local.set $temp (i32.add (local.get $a) (local.get $b)))
          (local.set $a (local.get $b))
          (local.set $b (local.get $temp))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $fib_loop))))
    (local.get $b))
  (func $main (result i32)
    (call $fibonacci (i32.const 10)))
  (export "main" (func $main))
  (export "fibonacci" (func $fibonacci)))`,
};
