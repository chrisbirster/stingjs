const std = @import("std");

const c = @cImport({
    @cInclude("quickjs.h");
    @cInclude("stdio.h");
    @cInclude("string.h");
    @cInclude("time.h");
});

const benchmark_source = @embedFile("transport-bench.js");
const engine_name: [:0]const u8 = "__STING_ENGINE__";
const iterations: u32 = 5000;
const warmups: u32 = 5;
const samples: u32 = 30;

const BenchError = error{
    RuntimeCreationFailed,
    ContextCreationFailed,
    EvaluationFailed,
    PendingJobFailed,
    ClockFailed,
};

const Scenario = struct {
    name: [:0]const u8,
    json_script: []const u8,
    typed_script: []const u8,
};

const scenarios = [_]Scenario{
    .{
        .name = "text-property",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','text-property',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','text-property',5000);",
    },
    .{
        .name = "primitive-properties",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','primitive-properties',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','primitive-properties',5000);",
    },
    .{
        .name = "style-object",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','style-object',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','style-object',5000);",
    },
    .{
        .name = "module-call",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','module-call',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','module-call',5000);",
    },
    .{
        .name = "structured-module",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','structured-module',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','structured-module',5000);",
    },
    .{
        .name = "event-payload",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','event-payload',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','event-payload',5000);",
    },
    .{
        .name = "promise-result",
        .json_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('json','promise-result',5000);",
        .typed_script = "globalThis.__stingTransportBench.reset();globalThis.__stingTransportBench.run('typed','promise-result',5000);",
    },
};

var transport_checksum: u64 = 0;

fn dumpException(ctx: *c.JSContext) void {
    const exception = c.JS_GetException(ctx);
    defer c.JS_FreeValue(ctx, exception);

    const message = c.JS_ToCString(ctx, exception);
    if (message != null) {
        _ = c.fputs("transport benchmark exception: ", c.stderr);
        _ = c.fputs(message, c.stderr);
        _ = c.fputc('\n', c.stderr);
        c.JS_FreeCString(ctx, message);
    }
}

fn readInt32(ctx: *c.JSContext, value: c.JSValueConst) i32 {
    var result: i32 = 0;
    if (c.JS_ToInt32(ctx, &result, value) < 0) return 0;
    return result;
}

fn mixInt(value: i32) void {
    transport_checksum = (transport_checksum *% 1099511628211) ^ @as(u64, @bitCast(@as(i64, value)));
}

fn mixString(ctx: *c.JSContext, value: c.JSValueConst) void {
    const raw = c.JS_ToCString(ctx, value);
    if (raw == null) return;
    defer c.JS_FreeCString(ctx, raw);
    transport_checksum = (transport_checksum *% 1099511628211) ^ @as(u64, @intCast(c.strlen(raw)));
}

fn requestFromJSON(slice: []const u8) i32 {
    const marker = "\"request\":";
    const marker_index = std.mem.indexOf(u8, slice, marker) orelse return 0;
    var index = marker_index + marker.len;
    var result: i32 = 0;
    while (index < slice.len and slice[index] >= '0' and slice[index] <= '9') : (index += 1) {
        result = result * 10 + @as(i32, slice[index] - '0');
    }
    return result;
}

fn jsTransportJSON(
    maybe_ctx: ?*c.JSContext,
    this_value: c.JSValueConst,
    argc: c_int,
    argv: [*c]c.JSValueConst,
) callconv(.c) c.JSValue {
    _ = this_value;
    const ctx = maybe_ctx orelse return c.JS_NewInt32(maybe_ctx, -1);
    if (argc < 1) return c.JS_NewInt32(ctx, -1);

    const raw = c.JS_ToCString(ctx, argv[0]);
    if (raw == null) return c.JS_NewInt32(ctx, -1);
    defer c.JS_FreeCString(ctx, raw);

    const len: usize = @intCast(c.strlen(raw));
    const slice: []const u8 = raw[0..len];
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.c_allocator, slice, .{}) catch {
        return c.JS_NewInt32(ctx, -1);
    };
    defer parsed.deinit();

    // Retain an observable dependency on the parsed input while keeping the
    // benchmark agnostic to std.json.Value's internal tagged-union layout.
    transport_checksum = (transport_checksum *% 1099511628211) ^ @as(u64, @intCast(len));

    if (std.mem.indexOf(u8, slice, "\"asyncResult\"") != null) {
        const request = requestFromJSON(slice);
        var buffer: [64]u8 = undefined;
        const response = std.fmt.bufPrint(&buffer, "{{\"ok\":true,\"value\":{d}}}", .{request + 1}) catch {
            return c.JS_NewString(ctx, "{\"ok\":false,\"value\":0}");
        };
        return c.JS_NewStringLen(ctx, response.ptr, response.len);
    }

    return c.JS_NewInt32(ctx, @truncate(transport_checksum));
}

fn jsTransportTyped(
    maybe_ctx: ?*c.JSContext,
    this_value: c.JSValueConst,
    argc: c_int,
    argv: [*c]c.JSValueConst,
) callconv(.c) c.JSValue {
    _ = this_value;
    const ctx = maybe_ctx orelse return c.JS_NewInt32(maybe_ctx, -1);
    if (argc < 1) return c.JS_NewInt32(ctx, -1);

    const opcode = readInt32(ctx, argv[0]);
    mixInt(opcode);

    switch (opcode) {
        1 => {
            if (argc >= 3) {
                mixInt(readInt32(ctx, argv[1]));
                mixString(ctx, argv[2]);
            }
        },
        2 => {
            if (argc >= 5) {
                mixInt(readInt32(ctx, argv[1]));
                mixInt(readInt32(ctx, argv[2]));
                mixString(ctx, argv[3]);
                mixInt(c.JS_ToBool(ctx, argv[4]));
            }
        },
        3 => {
            if (argc >= 5) {
                mixInt(readInt32(ctx, argv[1]));
                mixString(ctx, argv[2]);
                mixInt(readInt32(ctx, argv[3]));
                mixInt(readInt32(ctx, argv[4]));
            }
        },
        4 => {
            if (argc >= 3) {
                mixInt(readInt32(ctx, argv[1]));
                mixString(ctx, argv[2]);
            }
        },
        5 => {
            if (argc >= 4) {
                mixInt(readInt32(ctx, argv[1]));
                mixInt(readInt32(ctx, argv[2]));
                mixString(ctx, argv[3]);
            }
        },
        6 => {
            if (argc >= 4) {
                mixInt(readInt32(ctx, argv[1]));
                mixString(ctx, argv[2]);
                mixInt(c.JS_ToBool(ctx, argv[3]));
            }
        },
        7 => {
            const request = if (argc >= 2) readInt32(ctx, argv[1]) else 0;
            mixInt(request);
            return c.JS_NewInt32(ctx, request + 1);
        },
        else => return c.JS_NewInt32(ctx, -1),
    }

    return c.JS_NewInt32(ctx, @truncate(transport_checksum));
}

fn installHostFunctions(ctx: *c.JSContext) void {
    const global = c.JS_GetGlobalObject(ctx);
    defer c.JS_FreeValue(ctx, global);

    const json_fn = c.JS_NewCFunction2(
        ctx,
        jsTransportJSON,
        "__stingTransportJSON",
        1,
        c.JS_CFUNC_generic,
        0,
    );
    _ = c.JS_SetPropertyStr(ctx, global, "__stingTransportJSON", json_fn);

    const typed_fn = c.JS_NewCFunction2(
        ctx,
        jsTransportTyped,
        "__stingTransportTyped",
        5,
        c.JS_CFUNC_generic,
        0,
    );
    _ = c.JS_SetPropertyStr(ctx, global, "__stingTransportTyped", typed_fn);
}

fn runPendingJobs(runtime: *c.JSRuntime, fallback_ctx: *c.JSContext) BenchError!void {
    while (c.JS_IsJobPending(runtime) != 0) {
        var job_ctx: ?*c.JSContext = null;
        const result = c.JS_ExecutePendingJob(runtime, &job_ctx);
        if (result < 0) {
            dumpException(job_ctx orelse fallback_ctx);
            return BenchError.PendingJobFailed;
        }
    }
}

fn evaluate(ctx: *c.JSContext, runtime: *c.JSRuntime, source: []const u8, filename: [*:0]const u8) BenchError!void {
    const result = c.JS_Eval(ctx, source.ptr, source.len, filename, c.JS_EVAL_TYPE_GLOBAL);
    defer c.JS_FreeValue(ctx, result);
    if (c.JS_IsException(result) != 0) {
        dumpException(ctx);
        return BenchError.EvaluationFailed;
    }
    try runPendingJobs(runtime, ctx);
}

fn monotonicNs() BenchError!u64 {
    var ts: c.struct_timespec = undefined;
    if (c.clock_gettime(c.CLOCK_MONOTONIC, &ts) != 0) return BenchError.ClockFailed;
    return @as(u64, @intCast(ts.tv_sec)) * 1_000_000_000 + @as(u64, @intCast(ts.tv_nsec));
}

fn runSamples(
    ctx: *c.JSContext,
    runtime: *c.JSRuntime,
    scenario: Scenario,
    mode: [:0]const u8,
    script: []const u8,
) !void {
    for (0..warmups) |_| {
        try evaluate(ctx, runtime, script, "sting-transport-warmup.js");
    }

    for (0..samples) |sample| {
        const started = try monotonicNs();
        try evaluate(ctx, runtime, script, "sting-transport-sample.js");
        const finished = try monotonicNs();
        const duration = finished - started;
        _ = c.printf(
            "STING_TRANSPORT_SAMPLE engine=%s scenario=%s mode=%s sample=%u duration_ns=%llu iterations=%u checksum=%llu\n",
            engine_name.ptr,
            scenario.name.ptr,
            mode.ptr,
            @as(c_uint, @intCast(sample)),
            @as(c_ulonglong, duration),
            @as(c_uint, iterations),
            @as(c_ulonglong, transport_checksum),
        );
    }
}

pub fn main() !void {
    const runtime = c.JS_NewRuntime() orelse return BenchError.RuntimeCreationFailed;
    defer c.JS_FreeRuntime(runtime);

    const ctx = c.JS_NewContext(runtime) orelse return BenchError.ContextCreationFailed;
    defer c.JS_FreeContext(ctx);

    installHostFunctions(ctx);
    try evaluate(ctx, runtime, benchmark_source, "sting-transport-bench.js");

    inline for (scenarios) |scenario| {
        try runSamples(ctx, runtime, scenario, "json", scenario.json_script);
        try runSamples(ctx, runtime, scenario, "typed", scenario.typed_script);
    }
}
