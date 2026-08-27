#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include "sting_quickjs_android.h"

typedef struct AndroidHostContext {
    JNIEnv *env;
    jobject bridge;
    jmethodID get_runtime_info;
    jmethodID create_element;
    jmethodID create_text_node;
    jmethodID replace_text;
    jmethodID set_property;
    jmethodID insert_node;
    jmethodID remove_node;
    jmethodID set_event_enabled;
    jmethodID call_module_sync;
    jmethodID call_module_async;
    jmethodID set_module_event_enabled;
    void *runtime;
} AndroidHostContext;

static char *copy_jstring(JNIEnv *env, jstring value) {
    if (value == NULL) return NULL;
    const char *utf8 = (*env)->GetStringUTFChars(env, value, NULL);
    if (utf8 == NULL) return NULL;
    const size_t length = strlen(utf8);
    char *copy = (char *)malloc(length + 1);
    if (copy != NULL) memcpy(copy, utf8, length + 1);
    (*env)->ReleaseStringUTFChars(env, value, utf8);
    return copy;
}

static int consume_java_exception(AndroidHostContext *context) {
    if (!(*context->env)->ExceptionCheck(context->env)) return 0;
    (*context->env)->ExceptionDescribe(context->env);
    (*context->env)->ExceptionClear(context->env);
    return 1;
}

static char *host_get_runtime_info(void *opaque) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    jstring value = (jstring)(*context->env)->CallObjectMethod(
        context->env,
        context->bridge,
        context->get_runtime_info
    );
    if (consume_java_exception(context)) return NULL;
    char *copy = copy_jstring(context->env, value);
    if (value != NULL) (*context->env)->DeleteLocalRef(context->env, value);
    return copy;
}

static int call_id_string(
    AndroidHostContext *context,
    jmethodID method,
    int id,
    const char *value
) {
    jstring java_value = (*context->env)->NewStringUTF(context->env, value);
    if (java_value == NULL) return 0;
    (*context->env)->CallVoidMethod(context->env, context->bridge, method, (jint)id, java_value);
    (*context->env)->DeleteLocalRef(context->env, java_value);
    return consume_java_exception(context) ? 0 : 1;
}

static int host_create_element(void *opaque, int id, const char *type) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    return call_id_string(context, context->create_element, id, type);
}

static int host_create_text_node(void *opaque, int id, const char *value) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    return call_id_string(context, context->create_text_node, id, value);
}

static int host_replace_text(void *opaque, int id, const char *value) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    return call_id_string(context, context->replace_text, id, value);
}

static int host_set_property(void *opaque, int id, const char *name, const char *value_json) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    jstring java_name = (*context->env)->NewStringUTF(context->env, name);
    jstring java_value = (*context->env)->NewStringUTF(context->env, value_json);
    if (java_name == NULL || java_value == NULL) {
        if (java_name != NULL) (*context->env)->DeleteLocalRef(context->env, java_name);
        if (java_value != NULL) (*context->env)->DeleteLocalRef(context->env, java_value);
        return 0;
    }
    (*context->env)->CallVoidMethod(
        context->env,
        context->bridge,
        context->set_property,
        (jint)id,
        java_name,
        java_value
    );
    (*context->env)->DeleteLocalRef(context->env, java_name);
    (*context->env)->DeleteLocalRef(context->env, java_value);
    return consume_java_exception(context) ? 0 : 1;
}

static int host_insert_node(void *opaque, int parent_id, int node_id, int anchor_id) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    (*context->env)->CallVoidMethod(
        context->env,
        context->bridge,
        context->insert_node,
        (jint)parent_id,
        (jint)node_id,
        (jint)anchor_id
    );
    return consume_java_exception(context) ? 0 : 1;
}

static int host_remove_node(void *opaque, int parent_id, int node_id) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    (*context->env)->CallVoidMethod(
        context->env,
        context->bridge,
        context->remove_node,
        (jint)parent_id,
        (jint)node_id
    );
    return consume_java_exception(context) ? 0 : 1;
}

static int host_set_event_enabled(void *opaque, int id, const char *event, int enabled) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    jstring java_event = (*context->env)->NewStringUTF(context->env, event);
    if (java_event == NULL) return 0;
    (*context->env)->CallVoidMethod(
        context->env,
        context->bridge,
        context->set_event_enabled,
        (jint)id,
        java_event,
        enabled ? JNI_TRUE : JNI_FALSE
    );
    (*context->env)->DeleteLocalRef(context->env, java_event);
    return consume_java_exception(context) ? 0 : 1;
}

static char *host_call_module_sync(
    void *opaque,
    const char *module,
    const char *method,
    const char *args_json
) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    jstring java_module = (*context->env)->NewStringUTF(context->env, module);
    jstring java_method = (*context->env)->NewStringUTF(context->env, method);
    jstring java_args = (*context->env)->NewStringUTF(context->env, args_json);
    if (java_module == NULL || java_method == NULL || java_args == NULL) return NULL;

    jstring result = (jstring)(*context->env)->CallObjectMethod(
        context->env,
        context->bridge,
        context->call_module_sync,
        java_module,
        java_method,
        java_args
    );
    (*context->env)->DeleteLocalRef(context->env, java_module);
    (*context->env)->DeleteLocalRef(context->env, java_method);
    (*context->env)->DeleteLocalRef(context->env, java_args);
    if (consume_java_exception(context)) return NULL;

    char *copy = copy_jstring(context->env, result);
    if (result != NULL) (*context->env)->DeleteLocalRef(context->env, result);
    return copy;
}

static int host_call_module_async(
    void *opaque,
    const char *module,
    const char *method,
    const char *args_json,
    int request_id
) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    jstring java_module = (*context->env)->NewStringUTF(context->env, module);
    jstring java_method = (*context->env)->NewStringUTF(context->env, method);
    jstring java_args = (*context->env)->NewStringUTF(context->env, args_json);
    if (java_module == NULL || java_method == NULL || java_args == NULL) {
        if (java_module != NULL) (*context->env)->DeleteLocalRef(context->env, java_module);
        if (java_method != NULL) (*context->env)->DeleteLocalRef(context->env, java_method);
        if (java_args != NULL) (*context->env)->DeleteLocalRef(context->env, java_args);
        return 0;
    }

    (*context->env)->CallVoidMethod(
        context->env,
        context->bridge,
        context->call_module_async,
        java_module,
        java_method,
        java_args,
        (jint)request_id
    );
    (*context->env)->DeleteLocalRef(context->env, java_module);
    (*context->env)->DeleteLocalRef(context->env, java_method);
    (*context->env)->DeleteLocalRef(context->env, java_args);
    return consume_java_exception(context) ? 0 : 1;
}

static char *host_set_module_event_enabled(
    void *opaque,
    const char *module,
    const char *event,
    int enabled
) {
    AndroidHostContext *context = (AndroidHostContext *)opaque;
    jstring java_module = (*context->env)->NewStringUTF(context->env, module);
    jstring java_event = (*context->env)->NewStringUTF(context->env, event);
    if (java_module == NULL || java_event == NULL) {
        if (java_module != NULL) (*context->env)->DeleteLocalRef(context->env, java_module);
        if (java_event != NULL) (*context->env)->DeleteLocalRef(context->env, java_event);
        return NULL;
    }

    jstring result = (jstring)(*context->env)->CallObjectMethod(
        context->env,
        context->bridge,
        context->set_module_event_enabled,
        java_module,
        java_event,
        enabled ? JNI_TRUE : JNI_FALSE
    );
    (*context->env)->DeleteLocalRef(context->env, java_module);
    (*context->env)->DeleteLocalRef(context->env, java_event);
    if (consume_java_exception(context)) return NULL;

    char *copy = copy_jstring(context->env, result);
    if (result != NULL) (*context->env)->DeleteLocalRef(context->env, result);
    return copy;
}

static void host_release_string(void *opaque, char *value) {
    (void)opaque;
    free(value);
}

static void throw_illegal_state(JNIEnv *env, const char *message) {
    jclass exception_class = (*env)->FindClass(env, "java/lang/IllegalStateException");
    if (exception_class != NULL) {
        (*env)->ThrowNew(env, exception_class, message);
        (*env)->DeleteLocalRef(env, exception_class);
    }
}

static int load_bridge_methods(JNIEnv *env, AndroidHostContext *context) {
    jclass bridge_class = (*env)->GetObjectClass(env, context->bridge);
    if (bridge_class == NULL) return 0;

    context->get_runtime_info = (*env)->GetMethodID(env, bridge_class, "getRuntimeInfo", "()Ljava/lang/String;");
    context->create_element = (*env)->GetMethodID(env, bridge_class, "createElement", "(ILjava/lang/String;)V");
    context->create_text_node = (*env)->GetMethodID(env, bridge_class, "createTextNode", "(ILjava/lang/String;)V");
    context->replace_text = (*env)->GetMethodID(env, bridge_class, "replaceText", "(ILjava/lang/String;)V");
    context->set_property = (*env)->GetMethodID(env, bridge_class, "setProperty", "(ILjava/lang/String;Ljava/lang/String;)V");
    context->insert_node = (*env)->GetMethodID(env, bridge_class, "insertNode", "(III)V");
    context->remove_node = (*env)->GetMethodID(env, bridge_class, "removeNode", "(II)V");
    context->set_event_enabled = (*env)->GetMethodID(env, bridge_class, "setEventEnabled", "(ILjava/lang/String;Z)V");
    context->call_module_sync = (*env)->GetMethodID(
        env,
        bridge_class,
        "callModuleSync",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;"
    );
    context->call_module_async = (*env)->GetMethodID(
        env,
        bridge_class,
        "callModuleAsync",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;I)V"
    );
    context->set_module_event_enabled = (*env)->GetMethodID(
        env,
        bridge_class,
        "setModuleEventEnabled",
        "(Ljava/lang/String;Ljava/lang/String;Z)Ljava/lang/String;"
    );

    (*env)->DeleteLocalRef(env, bridge_class);
    if ((*env)->ExceptionCheck(env)) return 0;

    return context->get_runtime_info != NULL &&
        context->create_element != NULL &&
        context->create_text_node != NULL &&
        context->replace_text != NULL &&
        context->set_property != NULL &&
        context->insert_node != NULL &&
        context->remove_node != NULL &&
        context->set_event_enabled != NULL &&
        context->call_module_sync != NULL &&
        context->call_module_async != NULL &&
        context->set_module_event_enabled != NULL;
}

JNIEXPORT jlong JNICALL
Java_run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime_nativeCreate(
    JNIEnv *env,
    jobject self,
    jobject bridge
) {
    (void)self;
    AndroidHostContext *context = (AndroidHostContext *)calloc(1, sizeof(AndroidHostContext));
    if (context == NULL) return 0;

    context->env = env;
    context->bridge = (*env)->NewGlobalRef(env, bridge);
    if (context->bridge == NULL || !load_bridge_methods(env, context)) {
        if (context->bridge != NULL) (*env)->DeleteGlobalRef(env, context->bridge);
        free(context);
        throw_illegal_state(env, "Unable to resolve StingNativeBridge JNI methods");
        return 0;
    }

    StingQuickJsAndroidHostCallbacks callbacks = {
        .context = context,
        .get_runtime_info = host_get_runtime_info,
        .create_element = host_create_element,
        .create_text_node = host_create_text_node,
        .replace_text = host_replace_text,
        .set_property = host_set_property,
        .insert_node = host_insert_node,
        .remove_node = host_remove_node,
        .set_event_enabled = host_set_event_enabled,
        .call_module_sync = host_call_module_sync,
        .call_module_async = host_call_module_async,
        .set_module_event_enabled = host_set_module_event_enabled,
        .release_string = host_release_string,
    };

    context->runtime = sting_qjs_android_create(&callbacks);
    if (context->runtime == NULL) {
        (*env)->DeleteGlobalRef(env, context->bridge);
        free(context);
        throw_illegal_state(env, "Unable to initialize official QuickJS Android runtime");
        return 0;
    }

    return (jlong)(intptr_t)context;
}

JNIEXPORT jstring JNICALL
Java_run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime_nativeEvaluate(
    JNIEnv *env,
    jobject self,
    jlong handle,
    jstring source
) {
    (void)self;
    AndroidHostContext *context = (AndroidHostContext *)(intptr_t)handle;
    if (context == NULL || source == NULL) return (*env)->NewStringUTF(env, "QuickJS runtime or source is null");
    context->env = env;

    const char *utf8 = (*env)->GetStringUTFChars(env, source, NULL);
    if (utf8 == NULL) return (*env)->NewStringUTF(env, "Unable to read JavaScript source");
    const size_t length = (size_t)(*env)->GetStringUTFLength(env, source);
    char *error = sting_qjs_android_evaluate(context->runtime, utf8, length);
    (*env)->ReleaseStringUTFChars(env, source, utf8);

    if (error == NULL) return NULL;
    jstring result = (*env)->NewStringUTF(env, error);
    sting_qjs_android_free_error(error);
    return result;
}

JNIEXPORT jstring JNICALL
Java_run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime_nativeDispatchEvent(
    JNIEnv *env,
    jobject self,
    jlong handle,
    jint node_id,
    jstring event,
    jstring payload_json
) {
    (void)self;
    AndroidHostContext *context = (AndroidHostContext *)(intptr_t)handle;
    if (context == NULL || event == NULL || payload_json == NULL) {
        return (*env)->NewStringUTF(env, "QuickJS runtime or event payload is null");
    }
    context->env = env;

    const char *event_utf8 = (*env)->GetStringUTFChars(env, event, NULL);
    const char *payload_utf8 = (*env)->GetStringUTFChars(env, payload_json, NULL);
    if (event_utf8 == NULL || payload_utf8 == NULL) {
        if (event_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, event, event_utf8);
        if (payload_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, payload_json, payload_utf8);
        return (*env)->NewStringUTF(env, "Unable to read Sting event payload");
    }

    char *error = sting_qjs_android_dispatch_event(
        context->runtime,
        (int)node_id,
        event_utf8,
        payload_utf8
    );
    (*env)->ReleaseStringUTFChars(env, event, event_utf8);
    (*env)->ReleaseStringUTFChars(env, payload_json, payload_utf8);

    if (error == NULL) return NULL;
    jstring result = (*env)->NewStringUTF(env, error);
    sting_qjs_android_free_error(error);
    return result;
}

JNIEXPORT jstring JNICALL
Java_run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime_nativeCompleteModuleCall(
    JNIEnv *env,
    jobject self,
    jlong handle,
    jint request_id,
    jstring response_json
) {
    (void)self;
    AndroidHostContext *context = (AndroidHostContext *)(intptr_t)handle;
    if (context == NULL || response_json == NULL) {
        return (*env)->NewStringUTF(env, "QuickJS runtime or async module response is null");
    }
    context->env = env;

    const char *response_utf8 = (*env)->GetStringUTFChars(env, response_json, NULL);
    if (response_utf8 == NULL) {
        return (*env)->NewStringUTF(env, "Unable to read Sting async module response");
    }

    char *error = sting_qjs_android_complete_module_call(
        context->runtime,
        (int)request_id,
        response_utf8
    );
    (*env)->ReleaseStringUTFChars(env, response_json, response_utf8);

    if (error == NULL) return NULL;
    jstring result = (*env)->NewStringUTF(env, error);
    sting_qjs_android_free_error(error);
    return result;
}

JNIEXPORT jstring JNICALL
Java_run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime_nativeDispatchModuleEvent(
    JNIEnv *env,
    jobject self,
    jlong handle,
    jstring module,
    jstring event,
    jstring payload_json
) {
    (void)self;
    AndroidHostContext *context = (AndroidHostContext *)(intptr_t)handle;
    if (context == NULL || module == NULL || event == NULL || payload_json == NULL) {
        return (*env)->NewStringUTF(env, "QuickJS runtime or module event payload is null");
    }
    context->env = env;

    const char *module_utf8 = (*env)->GetStringUTFChars(env, module, NULL);
    const char *event_utf8 = (*env)->GetStringUTFChars(env, event, NULL);
    const char *payload_utf8 = (*env)->GetStringUTFChars(env, payload_json, NULL);
    if (module_utf8 == NULL || event_utf8 == NULL || payload_utf8 == NULL) {
        if (module_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, module, module_utf8);
        if (event_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, event, event_utf8);
        if (payload_utf8 != NULL) (*env)->ReleaseStringUTFChars(env, payload_json, payload_utf8);
        return (*env)->NewStringUTF(env, "Unable to read Sting module event payload");
    }

    char *error = sting_qjs_android_dispatch_module_event(
        context->runtime,
        module_utf8,
        event_utf8,
        payload_utf8
    );
    (*env)->ReleaseStringUTFChars(env, module, module_utf8);
    (*env)->ReleaseStringUTFChars(env, event, event_utf8);
    (*env)->ReleaseStringUTFChars(env, payload_json, payload_utf8);

    if (error == NULL) return NULL;
    jstring result = (*env)->NewStringUTF(env, error);
    sting_qjs_android_free_error(error);
    return result;
}

JNIEXPORT void JNICALL
Java_run_stingjs_runtime_candidates_quickjs_OfficialQuickJsCandidateRuntime_nativeDestroy(
    JNIEnv *env,
    jobject self,
    jlong handle
) {
    (void)self;
    AndroidHostContext *context = (AndroidHostContext *)(intptr_t)handle;
    if (context == NULL) return;
    context->env = env;

    char *dispose_error = sting_qjs_android_dispose_runtime(context->runtime);
    if (dispose_error != NULL) {
        throw_illegal_state(env, dispose_error);
        sting_qjs_android_free_error(dispose_error);
    }

    sting_qjs_android_destroy(context->runtime);
    (*env)->DeleteGlobalRef(env, context->bridge);
    free(context);
}
