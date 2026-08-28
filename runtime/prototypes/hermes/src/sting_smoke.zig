const std = @import("std");

const c = @cImport({
    @cInclude("sting_hermes_adapter.h");
    @cInclude("stdio.h");
    @cInclude("stdlib.h");
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
    \\    if (type === "button") globalThis.__stingSmokeButtonId = id;
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

const HermesSmokeError = error{
    RuntimeCreationFailed,
    HostInstallFailed,
    EvaluationFailed,
    InitialMountFailed,
    EventDispatchFailed,
    BenchmarkFailed,
};

const SmokeState = struct {
    button_id: i32 = -1,
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

fn hostCall(
    user_data: ?*anyopaque,
    operation: [*c]const u8,
    arg1: [*c]const u8,
    arg2: [*c]const u8,
    arg3: [*c]const u8,
) callconv(.c) [*c]const u8 {
    _ = user_data;

    if (c.strcmp(operation, "getRuntimeInfo") == 0) {
        return runtime_info_json;
    }

    if (c.strcmp(operation, "createElement") == 0) {
        smoke_state.unrelated_mutation_count += 1;
        if (c.strcmp(arg2, "button") == 0) {
            smoke_state.button_id = @intCast(c.atoi(arg1));
        }
        return null;
    }

    if (c.strcmp(operation, "createTextNode") == 0 or
        c.strcmp(operation, "setProperty") == 0 or
        c.strcmp(operation, "insertNode") == 0 or
        c.strcmp(operation, "removeNode") == 0 or
        c.strcmp(operation, "setEventEnabled") == 0)
    {
        smoke_state.unrelated_mutation_count += 1;
        return null;
    }

    if (c.strcmp(operation, "replaceText") == 0) {
        smoke_state.replace_text_count += 1;
        const id: i32 = @intCast(c.atoi(arg1));

        if (c.strcmp(arg2, "Count: 0") == 0) {
            smoke_state.count_text_id = id;
            smoke_state.saw_initial_count = true;
        } else if (id == smoke_state.count_text_id and c.strcmp(arg2, "Count: 1") == 0) {
            smoke_state.saw_updated_count = true;
        } else if (c.strcmp(arg2, "Row 4281: 0") == 0) {
            smoke_state.benchmark_target_text_id = id;
            smoke_state.saw_benchmark_initial = true;
        } else if (id == smoke_state.benchmark_target_text_id and c.strcmp(arg2, "Row 4281: 1") == 0) {
            smoke_state.saw_benchmark_sparse = true;
        } else if (id == smoke_state.benchmark_target_text_id and c.strcmp(arg2, "Row 4281: 2") == 0) {
            smoke_state.saw_benchmark_dense = true;
        }
        return null;
    }

    if (c.strcmp(operation, "callModuleSync") == 0) {
        if (c.strcmp(arg1, "Haptics") == 0 and c.strcmp(arg2, "impact") == 0) {
            smoke_state.haptics_calls += 1;
            if (c.strcmp(arg3, "[\"medium\"]") == 0) {
                smoke_state.saw_medium_haptics = true;
            }
        }
        return module_success_json;
    }

    return null;
}

fn runSource(
    runtime: *c.StingHermesRuntime,
    source: []const u8,
    source_url: [*:0]const u8,
) HermesSmokeError!void {
    const status = c.sting_hermes_runtime_run(
        runtime,
        source.ptr,
        source.len,
        source_url,
    );

    if (status != 0) {
        _ = c.fputs("Hermes Sting smoke adapter error: ", c.stderr);
        _ = c.fputs(c.sting_hermes_runtime_last_error(runtime), c.stderr);
        _ = c.fputc('\n', c.stderr);
        return HermesSmokeError.EvaluationFailed;
    }
}

fn failEvent(message: []const u8) HermesSmokeError {
    std.debug.print("Hermes Sting smoke failed: {s}\n", .{message});
    return HermesSmokeError.EventDispatchFailed;
}

fn failBenchmark(message: []const u8) HermesSmokeError {
    std.debug.print("Hermes 10k benchmark smoke failed: {s}\n", .{message});
    return HermesSmokeError.BenchmarkFailed;
}

pub fn main() !void {
    smoke_state = SmokeState{};

    const runtime = c.sting_hermes_runtime_create() orelse
        return HermesSmokeError.RuntimeCreationFailed;
    defer c.sting_hermes_runtime_destroy(runtime);

    const install_status = c.sting_hermes_runtime_install_host_call(
        runtime,
        hostCall,
        null,
    );
    if (install_status != 0) {
        _ = c.fputs("Hermes host callback install error: ", c.stderr);
        _ = c.fputs(c.sting_hermes_runtime_last_error(runtime), c.stderr);
        _ = c.fputc('\n', c.stderr);
        return HermesSmokeError.HostInstallFailed;
    }

    try runSource(runtime, bridge_bootstrap, "sting-hermes-bridge.js");
    try runSource(runtime, app_source, "sting-app.js");

    if (smoke_state.button_id < 0) {
        std.debug.print("Hermes Sting smoke failed: native Button was not created\n", .{});
        return HermesSmokeError.InitialMountFailed;
    }
    if (!smoke_state.saw_initial_count or smoke_state.count_text_id < 0) {
        std.debug.print("Hermes Sting smoke failed: native Count: 0 text was not mounted\n", .{});
        return HermesSmokeError.InitialMountFailed;
    }

    smoke_state.resetHotPathMeasurements();
    try runSource(runtime, dispatch_press, "sting-hermes-dispatch.js");

    if (!smoke_state.saw_updated_count) return failEvent("press did not produce Count: 1");
    if (smoke_state.replace_text_count != 1) return failEvent("press did not produce exactly one replaceText mutation");
    if (smoke_state.unrelated_mutation_count != 0) return failEvent("press replayed unrelated native mutations");
    if (smoke_state.haptics_calls != 1) return failEvent("press did not call Haptics exactly once");
    if (!smoke_state.saw_medium_haptics) return failEvent("Haptics impact did not receive medium");

    try runSource(runtime, benchmark_source, "sting-benchmark.js");
    try runSource(runtime, benchmark_mount, "sting-benchmark-mount.js");

    if (!smoke_state.saw_benchmark_initial or smoke_state.benchmark_target_text_id < 0) {
        return failBenchmark("row 4,281 was not mounted with revision 0");
    }

    smoke_state.resetHotPathMeasurements();
    try runSource(runtime, benchmark_sparse, "sting-benchmark-sparse.js");

    if (!smoke_state.saw_benchmark_sparse) return failBenchmark("sparse update did not produce Row 4281: 1");
    if (smoke_state.replace_text_count != 1) return failBenchmark("sparse update did not produce exactly one replaceText mutation");
    if (smoke_state.unrelated_mutation_count != 0) return failBenchmark("sparse update replayed unrelated native mutations");

    smoke_state.resetHotPathMeasurements();
    try runSource(runtime, benchmark_dense, "sting-benchmark-dense.js");

    if (!smoke_state.saw_benchmark_dense) return failBenchmark("dense update did not produce Row 4281: 2");
    if (smoke_state.replace_text_count != 100) return failBenchmark("dense update did not produce exactly 100 replaceText mutations");
    if (smoke_state.unrelated_mutation_count != 0) return failBenchmark("dense update replayed unrelated native mutations");

    std.debug.print(
        "Hermes Sting smoke passed: counter replaceText=1 haptics=medium; 10k sparse=1 dense=100\n",
        .{},
    );
}
