const c = @cImport({
    @cInclude("quickjs.h");
    @cInclude("stdlib.h");
    @cInclude("string.h");
    @cInclude("sting_quickjs_android.h");
});

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
    \\  getRuntimeInfo() { return globalThis.__stingHostCall("getRuntimeInfo"); },
    \\  createElement(id, type) { globalThis.__stingHostCall("createElement", id, type); },
    \\  createTextNode(id, value) { globalThis.__stingHostCall("createTextNode", id, value); },
    \\  replaceText(id, value) { globalThis.__stingHostCall("replaceText", id, value); },
    \\  setProperty(id, name, valueJSON) { globalThis.__stingHostCall("setProperty", id, name, valueJSON); },
    \\  insertNode(parentId, nodeId, anchorId) { globalThis.__stingHostCall("insertNode", parentId, nodeId, anchorId); },
    \\  removeNode(parentId, nodeId) { globalThis.__stingHostCall("removeNode", parentId, nodeId); },
    \\  setEventEnabled(id, event, enabled) { globalThis.__stingHostCall("setEventEnabled", id, event, enabled); },
    \\  callModuleSync(module, method, argsJSON) { return globalThis.__stingHostCall("callModuleSync", module, method, argsJSON); }
    \\};
;

const RuntimeState = struct {
    runtime: *c.JSRuntime,
    context: *c.JSContext,
    host: c.StingQuickJsAndroidHostCallbacks,
};

fn stateFromContext(ctx: *c.JSContext) ?*RuntimeState {
    const opaque = c.JS_GetContextOpaque(ctx) orelse return null;
    return @ptrCast(@alignCast(opaque));
}

fn stateFromHandle(handle: ?*anyopaque) ?*RuntimeState {
    const opaque = handle orelse return null;
    return @ptrCast(@alignCast(opaque));
}

fn fail(ctx: *c.JSContext, message: [*:0]const u8) c.JSValue {
    return c.JS_ThrowInternalError(ctx, message);
}

fn readInt32(ctx: *c.JSContext, value: c.JSValueConst) ?i32 {
    var result: i32 = 0;
    if (c.JS_ToInt32(ctx, &result, value) < 0) return null;
    return result;
}

fn releaseHostString(state: *RuntimeState, value: [*c]u8) void {
    if (value == null) return;
    if (state.host.release_string) |release| {
        release(state.host.context, value);
    }
}

fn bridgeCallFailed(ctx: *c.JSContext) c.JSValue {
    return fail(ctx, "Sting Android native bridge call failed");
}

fn jsHostCall(
    maybe_ctx: ?*c.JSContext,
    this_value: c.JSValueConst,
    argc: c_int,
    argv: [*c]c.JSValueConst,
) callconv(.c) c.JSValue {
    _ = this_value;

    const ctx = maybe_ctx orelse return c.JS_NewInt32(maybe_ctx, 0);
    const state = stateFromContext(ctx) orelse return fail(ctx, "Sting QuickJS runtime state is missing");
    if (argc < 1) return fail(ctx, "Sting host call is missing an operation");

    const operation = c.JS_ToCString(ctx, argv[0]);
    if (operation == null) return fail(ctx, "Sting host operation is not a string");
    defer c.JS_FreeCString(ctx, operation);

    if (c.strcmp(operation, "getRuntimeInfo") == 0) {
        const callback = state.host.get_runtime_info orelse return bridgeCallFailed(ctx);
        const value = callback(state.host.context);
        if (value == null) return bridgeCallFailed(ctx);
        defer releaseHostString(state, value);
        return c.JS_NewString(ctx, value);
    }

    if (c.strcmp(operation, "createElement") == 0) {
        if (argc < 3) return fail(ctx, "createElement requires id and type");
        const id = readInt32(ctx, argv[1]) orelse return fail(ctx, "createElement id is invalid");
        const element_type = c.JS_ToCString(ctx, argv[2]);
        if (element_type == null) return fail(ctx, "createElement type is invalid");
        defer c.JS_FreeCString(ctx, element_type);
        const callback = state.host.create_element orelse return bridgeCallFailed(ctx);
        if (callback(state.host.context, id, element_type) == 0) return bridgeCallFailed(ctx);
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "createTextNode") == 0 or c.strcmp(operation, "replaceText") == 0) {
        if (argc < 3) return fail(ctx, "text mutation requires id and value");
        const id = readInt32(ctx, argv[1]) orelse return fail(ctx, "text mutation id is invalid");
        const value = c.JS_ToCString(ctx, argv[2]);
        if (value == null) return fail(ctx, "text mutation value is invalid");
        defer c.JS_FreeCString(ctx, value);

        if (c.strcmp(operation, "createTextNode") == 0) {
            const callback = state.host.create_text_node orelse return bridgeCallFailed(ctx);
            if (callback(state.host.context, id, value) == 0) return bridgeCallFailed(ctx);
        } else {
            const callback = state.host.replace_text orelse return bridgeCallFailed(ctx);
            if (callback(state.host.context, id, value) == 0) return bridgeCallFailed(ctx);
        }
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "setProperty") == 0) {
        if (argc < 4) return fail(ctx, "setProperty requires id, name, and value");
        const id = readInt32(ctx, argv[1]) orelse return fail(ctx, "setProperty id is invalid");
        const name = c.JS_ToCString(ctx, argv[2]);
        if (name == null) return fail(ctx, "setProperty name is invalid");
        defer c.JS_FreeCString(ctx, name);
        const value_json = c.JS_ToCString(ctx, argv[3]);
        if (value_json == null) return fail(ctx, "setProperty value is invalid");
        defer c.JS_FreeCString(ctx, value_json);
        const callback = state.host.set_property orelse return bridgeCallFailed(ctx);
        if (callback(state.host.context, id, name, value_json) == 0) return bridgeCallFailed(ctx);
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "insertNode") == 0) {
        if (argc < 4) return fail(ctx, "insertNode requires parent, node, and anchor ids");
        const parent_id = readInt32(ctx, argv[1]) orelse return fail(ctx, "insertNode parent id is invalid");
        const node_id = readInt32(ctx, argv[2]) orelse return fail(ctx, "insertNode node id is invalid");
        const anchor_id = readInt32(ctx, argv[3]) orelse return fail(ctx, "insertNode anchor id is invalid");
        const callback = state.host.insert_node orelse return bridgeCallFailed(ctx);
        if (callback(state.host.context, parent_id, node_id, anchor_id) == 0) return bridgeCallFailed(ctx);
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "removeNode") == 0) {
        if (argc < 3) return fail(ctx, "removeNode requires parent and node ids");
        const parent_id = readInt32(ctx, argv[1]) orelse return fail(ctx, "removeNode parent id is invalid");
        const node_id = readInt32(ctx, argv[2]) orelse return fail(ctx, "removeNode node id is invalid");
        const callback = state.host.remove_node orelse return bridgeCallFailed(ctx);
        if (callback(state.host.context, parent_id, node_id) == 0) return bridgeCallFailed(ctx);
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "setEventEnabled") == 0) {
        if (argc < 4) return fail(ctx, "setEventEnabled requires id, event, and enabled");
        const id = readInt32(ctx, argv[1]) orelse return fail(ctx, "setEventEnabled id is invalid");
        const event = c.JS_ToCString(ctx, argv[2]);
        if (event == null) return fail(ctx, "setEventEnabled event is invalid");
        defer c.JS_FreeCString(ctx, event);
        const enabled = c.JS_ToBool(ctx, argv[3]);
        if (enabled < 0) return fail(ctx, "setEventEnabled enabled value is invalid");
        const callback = state.host.set_event_enabled orelse return bridgeCallFailed(ctx);
        if (callback(state.host.context, id, event, if (enabled != 0) 1 else 0) == 0) return bridgeCallFailed(ctx);
        return c.JS_NewInt32(ctx, 0);
    }

    if (c.strcmp(operation, "callModuleSync") == 0) {
        if (argc < 4) return fail(ctx, "callModuleSync requires module, method, and args");
        const module_name = c.JS_ToCString(ctx, argv[1]);
        if (module_name == null) return fail(ctx, "callModuleSync module is invalid");
        defer c.JS_FreeCString(ctx, module_name);
        const method_name = c.JS_ToCString(ctx, argv[2]);
        if (method_name == null) return fail(ctx, "callModuleSync method is invalid");
        defer c.JS_FreeCString(ctx, method_name);
        const args_json = c.JS_ToCString(ctx, argv[3]);
        if (args_json == null) return fail(ctx, "callModuleSync args are invalid");
        defer c.JS_FreeCString(ctx, args_json);

        const callback = state.host.call_module_sync orelse return bridgeCallFailed(ctx);
        const response = callback(state.host.context, module_name, method_name, args_json);
        if (response == null) return bridgeCallFailed(ctx);
        defer releaseHostString(state, response);
        return c.JS_NewString(ctx, response);
    }

    return fail(ctx, "Unknown Sting host operation");
}

fn copyException(ctx: *c.JSContext) [*c]u8 {
    const exception = c.JS_GetException(ctx);
    defer c.JS_FreeValue(ctx, exception);

    const message = c.JS_ToCString(ctx, exception);
    if (message == null) return c.strdup("Unknown JavaScript exception");
    defer c.JS_FreeCString(ctx, message);
    return c.strdup(message);
}

fn drainPendingJobs(state: *RuntimeState) [*c]u8 {
    while (c.JS_IsJobPending(state.runtime) != 0) {
        var job_ctx: ?*c.JSContext = null;
        const result = c.JS_ExecutePendingJob(state.runtime, &job_ctx);
        if (result < 0) return copyException(job_ctx orelse state.context);
    }
    return null;
}

fn evaluateSource(
    state: *RuntimeState,
    source: [*c]const u8,
    source_len: usize,
    filename: [*:0]const u8,
) [*c]u8 {
    const result = c.JS_Eval(
        state.context,
        source,
        source_len,
        filename,
        c.JS_EVAL_TYPE_GLOBAL,
    );
    defer c.JS_FreeValue(state.context, result);

    if (c.JS_IsException(result) != 0) return copyException(state.context);
    return drainPendingJobs(state);
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

export fn sting_qjs_android_create(
    callbacks: ?*const c.StingQuickJsAndroidHostCallbacks,
) ?*anyopaque {
    const host = callbacks orelse return null;
    const runtime = c.JS_NewRuntime() orelse return null;

    const ctx = c.JS_NewContext(runtime) orelse {
        c.JS_FreeRuntime(runtime);
        return null;
    };

    const raw_state = c.malloc(@sizeOf(RuntimeState)) orelse {
        c.JS_FreeContext(ctx);
        c.JS_FreeRuntime(runtime);
        return null;
    };
    const state: *RuntimeState = @ptrCast(@alignCast(raw_state));
    state.* = .{
        .runtime = runtime,
        .context = ctx,
        .host = host.*,
    };

    c.JS_SetContextOpaque(ctx, state);
    c.JS_SetRuntimeInfo(runtime, "stingjs-official-quickjs-android-candidate");
    installHostCall(ctx);

    const bootstrap_error = evaluateSource(
        state,
        bridge_bootstrap.ptr,
        bridge_bootstrap.len,
        "sting-quickjs-android-bridge.js",
    );
    if (bootstrap_error != null) {
        c.free(bootstrap_error);
        c.JS_SetContextOpaque(ctx, null);
        c.JS_FreeContext(ctx);
        c.JS_FreeRuntime(runtime);
        c.free(state);
        return null;
    }

    return state;
}

export fn sting_qjs_android_evaluate(
    handle: ?*anyopaque,
    source: [*c]const u8,
    source_len: usize,
) [*c]u8 {
    const state = stateFromHandle(handle) orelse return c.strdup("QuickJS runtime handle is null");
    if (source == null) return c.strdup("JavaScript source is null");
    return evaluateSource(state, source, source_len, "sting-app.js");
}

export fn sting_qjs_android_dispatch_event(
    handle: ?*anyopaque,
    node_id: c_int,
    event: [*c]const u8,
    payload_json: [*c]const u8,
) [*c]u8 {
    const state = stateFromHandle(handle) orelse return c.strdup("QuickJS runtime handle is null");
    if (event == null or payload_json == null) return c.strdup("Sting event payload is null");

    const global = c.JS_GetGlobalObject(state.context);
    defer c.JS_FreeValue(state.context, global);
    const dispatch = c.JS_GetPropertyStr(state.context, global, "__stingDispatchEvent");
    defer c.JS_FreeValue(state.context, dispatch);

    if (c.JS_IsFunction(state.context, dispatch) == 0) {
        return c.strdup("__stingDispatchEvent is not installed");
    }

    var args = [_]c.JSValue{
        c.JS_NewInt32(state.context, node_id),
        c.JS_NewString(state.context, event),
        c.JS_NewString(state.context, payload_json),
    };
    defer {
        for (&args) |*arg| c.JS_FreeValue(state.context, arg.*);
    }

    const result = c.JS_Call(
        state.context,
        dispatch,
        global,
        @intCast(args.len),
        &args[0],
    );
    defer c.JS_FreeValue(state.context, result);
    if (c.JS_IsException(result) != 0) return copyException(state.context);
    return drainPendingJobs(state);
}

export fn sting_qjs_android_destroy(handle: ?*anyopaque) void {
    const state = stateFromHandle(handle) orelse return;
    c.JS_SetContextOpaque(state.context, null);
    c.JS_FreeContext(state.context);
    c.JS_FreeRuntime(state.runtime);
    c.free(state);
}

export fn sting_qjs_android_free_error(error_message: [*c]u8) void {
    if (error_message != null) c.free(error_message);
}
