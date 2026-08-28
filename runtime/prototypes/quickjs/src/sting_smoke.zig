const std = @import("std");

const c = @cImport({
    @cInclude("quickjs.h");
    @cInclude("stdio.h");
    @cInclude("string.h");
});

const app_source = @embedFile("sting-app.js");
const benchmark_source = @embedFile("sting-benchmark.js");

const runtime_info_json =
    "{\"protocolVersion\":1,\"platform\":\"ios\",\"modules\":{\"Haptics\":\"0.1.0\"}}";
const module_success_json = "{\"ok\":true,\"value\":null}";

const bridge_bootstrap =
    \\if (typeof globalThis.queueMicrotask !== "function") {
    \\  globalThis.queueMicrotask = function queueMicrotask(callback) {
    \\    if (typeof callback !== "function") {
    \\      throw new TypeError("queueMicrotask callback must be a function");
    \\    }
    \\    Promise.resolve().then(callback);
    \\  };
    \\}
    \\globalThis.__stingNativeBridge = {
    \\  getRuntimeInfo() {
    \\    return globalThis.__stingHostCall("getRuntimeInfo");
    \\  },
    \\  createElement(id, type) {
    \\    globalThis.__stingHostCall("createElement", id, type);
    \\  },
    \\  createTextNode(id, value) {
    \\    globalThis.__stingHostCall("createTextNode", id, value);
    \\  },
    \\  replaceText(id, value) {
    \\    globalThis.__stingHostCall("replaceText", id, value);
    \\  },
    \\  setProperty(id, name, valueJSON) {
    \\    globalThis.__stingHostCall("setProperty", id, name, valueJSON);
    \\  },
    \\  insertNode(parentId, nodeId, anchorId) {
    \\    globalThis.__stingHostCall("insertNode", parentId, nodeId, anchorId);
    \\  },
    \\  removeNode(parentId, nodeId) {
    \\    globalThis.__stingHostCall("removeNode", parentId, nodeId);
    \\  },
    \\  setEventEnabled(id, event, enabled) {
    \\    globalThis.__stingHostCall("setEventEnabled", id, event, enabled);
    \\  },
    \\  callModuleSync(module, method, argsJSON) {
    \\    return globalThis.__stingHostCall("callModuleSync", module, method, argsJSON);
    \\  }
    \\};
;

const dispatch_press =
    \\globalThis.__stingDispatchEvent(
    \\  globalThis.__stingSmokeButtonId,
    \\  "press",
    \\  "null"
    \\);
;

const benchmark_mount = "globalThis.__stingBenchmark.mountRows();";
const benchmark_sparse = "globalThis.__stingBenchmark.updateSparse();";
const benchmark_dense = "globalThis.__stingBenchmark.updateDense();";

const SmokeError = error{
    RuntimeCreationFailed,
    ContextCreationFailed,
    EvaluationFailed,
    PendingJobFailed,
    InitialMountFailed,
    EventDispatchFailed,
    BenchmarkFailed,
};

const SmokeState = struct {
    button_id: i32 = -1,
    add_text_id: i32 = -1,
    count_text_id: i32 = -1,
    benchmark_target_text_id: i32 = -1,
    saw_initial_count: bool = false,
    saw_updated_count: bool = false,
    saw_benchmark_initial: bool = false,
    saw_benchmark_sparse: bool = false,
    saw_benchmark_dense: bool = false,
    replace_text_count: u32 = 0,
    unrelated_mutation_count: u32 = 0,
    haptics_calls: u32 = 0,
    saw_medium_haptics: bool = false,

    fn resetHotPathMeasurements(self: *SmokeState) void {
        self.saw_updated_count = false;
        self.saw_benchmark_sparse = false;
        self.saw_benchmark_dense = false;
        self.replace_text_count = 0;
        self.unrelated_mutation_count = 0;
        self.haptics_calls = 0;
        self.saw_medium_haptics = false;
    }
};

var smoke_state = SmokeState{};

fn dumpException(ctx: *c.JSContext) void {
    const exception = c.JS_GetException(ctx);
    defer c.JS_FreeValue(ctx, exception);

    const message = c.JS_ToCString(ctx, exception);
    if (message != null) {
        _ = c.fputs("QuickJS Sting smoke exception: ", c.stderr);
        _ = c.fputs(message, c.stderr);
        _ = c.fputc('\n', c.stderr);
        c.JS_FreeCString(ctx, message);
    }
}

fn readInt32(ctx: *c.JSContext, value: c.JSValueConst) ?i32 {
    var result: i32 = 0;
    if (c.JS_ToInt32(ctx, &result, value) < 0) return null;
    return result;
}

fn jsHostCall(
    maybe_ctx: ?*c.JSContext,
    this_value: c.JSValueConst,
    argc: c_int,
    argv: [*c]c.JSValueConst,
) callconv(.c) c.JSValue {
    _ = this_value;

    const ctx = maybe_ctx orelse return c.JS_NewInt32(maybe_ctx, 0);
    if (argc < 1) return c.JS_NewInt32(ctx, 0);

    const operation = c.JS_ToCString(ctx, argv[0]);
    if (operation == null) return c.JS_NewInt32(ctx, 0);
    defer c.JS_FreeCString(ctx, operation);

    if (c.strcmp(operation, "getRuntimeInfo") == 0) {
        return c.JS_NewString(ctx, runtime_info_json);
    }

    if (c.strcmp(operation, "createElement") == 0) {
        smoke_state.unrelated_mutation_count += 1;
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "createTextNode") == 0) {
        smoke_state.unrelated_mutation_count += 1;
        if (argc >= 3) {
            const id = readInt32(ctx, argv[1]);
            const value = c.JS_ToCString(ctx, argv[2]);
            if (value != null) {
                defer c.JS_FreeCString(ctx, value);
                if (id != null and c.strcmp(value, "Add") == 0) {
                    smoke_state.add_text_id = id.?;
                }
            }
        }
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "insertNode") == 0) {
        smoke_state.unrelated_mutation_count += 1;
        if (argc >= 3) {
            const parent_id = readInt32(ctx, argv[1]);
            const node_id = readInt32(ctx, argv[2]);
            if (parent_id != null and
                node_id != null and
                node_id.? == smoke_state.add_text_id)
            {
                smoke_state.button_id = parent_id.?;
            }
        }
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "setProperty") == 0 or
        c.strcmp(operation, "removeNode") == 0 or
        c.strcmp(operation, "setEventEnabled") == 0)
    {
        smoke_state.unrelated_mutation_count += 1;
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "replaceText") == 0) {
        smoke_state.replace_text_count += 1;
        if (argc >= 3) {
            const id = readInt32(ctx, argv[1]);
            const value = c.JS_ToCString(ctx, argv[2]);
            if (value != null) {
                defer c.JS_FreeCString(ctx, value);

                if (id != null and c.strcmp(value, "Count: 0") == 0) {
                    smoke_state.count_text_id = id.?;
                    smoke_state.saw_initial_count = true;
                } else if (id != null and
                    id.? == smoke_state.count_text_id and
                    c.strcmp(value, "Count: 1") == 0)
                {
                    smoke_state.saw_updated_count = true;
                } else if (id != null and c.strcmp(value, "Row 4281: 0") == 0) {
                    smoke_state.benchmark_target_text_id = id.?;
                    smoke_state.saw_benchmark_initial = true;
                } else if (id != null and
                    id.? == smoke_state.benchmark_target_text_id and
                    c.strcmp(value, "Row 4281: 1") == 0)
                {
                    smoke_state.saw_benchmark_sparse = true;
                } else if (id != null and
                    id.? == smoke_state.benchmark_target_text_id and
                    c.strcmp(value, "Row 4281: 2") == 0)
                {
                    smoke_state.saw_benchmark_dense = true;
                }
            }
        }
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "callModuleSync") == 0) {
        if (argc >= 4) {
            const module_name = c.JS_ToCString(ctx, argv[1]);
            if (module_name == null) return c.JS_NewString(ctx, module_success_json);
            defer c.JS_FreeCString(ctx, module_name);

            const method_name = c.JS_ToCString(ctx, argv[2]);
            if (method_name == null) return c.JS_NewString(ctx, module_success_json);
            defer c.JS_FreeCString(ctx, method_name);

            const args_json = c.JS_ToCString(ctx, argv[3]);
            if (args_json == null) return c.JS_NewString(ctx, module_success_json);
            defer c.JS_FreeCString(ctx, args_json);

            if (c.strcmp(module_name, "Haptics") == 0 and
                c.strcmp(method_name, "impact") == 0)
            {
                smoke_state.haptics_calls += 1;
                if (c.strcmp(args_json, "[\"medium\"]") == 0) {
                    smoke_state.saw_medium_haptics = true;
                }
            }
        }
        return c.JS_NewString(ctx, module_success_json);
    }

    return c.JS_NewInt32(ctx, 0);
}

fn installHostCall(ctx: *c.JSContext) void {
    const global = c.JS_GetGlobalObject(ctx);
    defer c.JS_FreeValue(ctx, global);

    const host_call = c.JS_NewCFunction2(
        ctx,
        jsHostCall,
        "__stingHostCall",
        4,
        c.JS_CFUNC_generic,
        0,
    );

    _ = c.JS_SetPropertyStr(ctx, global, "__stingHostCall", host_call);
}

fn exposeButtonId(ctx: *c.JSContext, button_id: i32) void {
    const global = c.JS_GetGlobalObject(ctx);
    defer c.JS_FreeValue(ctx, global);
    _ = c.JS_SetPropertyStr(
        ctx,
        global,
        "__stingSmokeButtonId",
        c.JS_NewInt32(ctx, button_id),
    );
}

fn evaluate(ctx: *c.JSContext, source: []const u8, filename: [*:0]const u8) SmokeError!void {
    const result = c.JS_Eval(
        ctx,
        source.ptr,
        source.len,
        filename,
        c.JS_EVAL_TYPE_GLOBAL,
    );
    defer c.JS_FreeValue(ctx, result);

    if (c.JS_IsException(result) != 0) {
        dumpException(ctx);
        return SmokeError.EvaluationFailed;
    }
}

fn runPendingJobs(runtime: *c.JSRuntime, fallback_ctx: *c.JSContext) SmokeError!void {
    while (c.JS_IsJobPending(runtime) != 0) {
        var job_ctx: ?*c.JSContext = null;
        const result = c.JS_ExecutePendingJob(runtime, &job_ctx);
        if (result < 0) {
            dumpException(job_ctx orelse fallback_ctx);
            return SmokeError.PendingJobFailed;
        }
    }
}

fn failEvent(message: []const u8) SmokeError {
    std.debug.print("QuickJS Sting smoke failed: {s}\n", .{message});
    return SmokeError.EventDispatchFailed;
}

fn failBenchmark(message: []const u8) SmokeError {
    std.debug.print("QuickJS 10k benchmark smoke failed: {s}\n", .{message});
    return SmokeError.BenchmarkFailed;
}

pub fn main() !void {
    smoke_state = SmokeState{};

    const runtime = c.JS_NewRuntime() orelse return SmokeError.RuntimeCreationFailed;
    defer c.JS_FreeRuntime(runtime);

    const ctx = c.JS_NewContext(runtime) orelse return SmokeError.ContextCreationFailed;
    defer c.JS_FreeContext(ctx);

    c.JS_SetRuntimeInfo(runtime, "stingjs-official-quickjs-sting-smoke");
    installHostCall(ctx);

    try evaluate(ctx, bridge_bootstrap, "sting-quickjs-bridge.js");
    try evaluate(ctx, app_source, "sting-app.js");
    try runPendingJobs(runtime, ctx);

    if (smoke_state.button_id < 0) {
        std.debug.print("QuickJS Sting smoke failed: native Add Button was not identified\n", .{});
        return SmokeError.InitialMountFailed;
    }
    if (!smoke_state.saw_initial_count or smoke_state.count_text_id < 0) {
        std.debug.print("QuickJS Sting smoke failed: native Count: 0 text was not mounted\n", .{});
        return SmokeError.InitialMountFailed;
    }

    smoke_state.resetHotPathMeasurements();
    exposeButtonId(ctx, smoke_state.button_id);

    try evaluate(ctx, dispatch_press, "sting-quickjs-dispatch.js");
    try runPendingJobs(runtime, ctx);

    if (!smoke_state.saw_updated_count) return failEvent("press did not produce Count: 1");
    if (smoke_state.replace_text_count != 1) return failEvent("press did not produce exactly one replaceText mutation");
    if (smoke_state.unrelated_mutation_count != 0) return failEvent("press replayed unrelated native mutations");
    if (smoke_state.haptics_calls != 1) return failEvent("press did not call Haptics exactly once");
    if (!smoke_state.saw_medium_haptics) return failEvent("Haptics impact did not receive medium");

    // Run the real 10k Solid/Sting application in the same engine. Initial
    // mount work is intentionally ignored; only the sparse/dense hot paths are
    // required to remain fine-grained.
    try evaluate(ctx, benchmark_source, "sting-benchmark.js");
    try runPendingJobs(runtime, ctx);
    try evaluate(ctx, benchmark_mount, "sting-benchmark-mount.js");
    try runPendingJobs(runtime, ctx);

    if (!smoke_state.saw_benchmark_initial or smoke_state.benchmark_target_text_id < 0) {
        return failBenchmark("row 4,281 was not mounted with revision 0");
    }

    smoke_state.resetHotPathMeasurements();
    try evaluate(ctx, benchmark_sparse, "sting-benchmark-sparse.js");
    try runPendingJobs(runtime, ctx);

    if (!smoke_state.saw_benchmark_sparse) return failBenchmark("sparse update did not produce Row 4281: 1");
    if (smoke_state.replace_text_count != 1) return failBenchmark("sparse update did not produce exactly one replaceText mutation");
    if (smoke_state.unrelated_mutation_count != 0) return failBenchmark("sparse update replayed unrelated native mutations");

    smoke_state.resetHotPathMeasurements();
    try evaluate(ctx, benchmark_dense, "sting-benchmark-dense.js");
    try runPendingJobs(runtime, ctx);

    if (!smoke_state.saw_benchmark_dense) return failBenchmark("dense update did not produce Row 4281: 2");
    if (smoke_state.replace_text_count != 100) return failBenchmark("dense update did not produce exactly 100 replaceText mutations");
    if (smoke_state.unrelated_mutation_count != 0) return failBenchmark("dense update replayed unrelated native mutations");

    std.debug.print(
        "QuickJS Sting smoke passed: counter replaceText=1 haptics=medium; 10k sparse=1 dense=100\n",
        .{},
    );
}
