#ifndef STING_QUICKJS_ANDROID_H
#define STING_QUICKJS_ANDROID_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct StingQuickJsAndroidHostCallbacks {
    void *context;
    char *(*get_runtime_info)(void *context);
    int (*create_element)(void *context, int id, const char *type);
    int (*create_text_node)(void *context, int id, const char *value);
    int (*replace_text)(void *context, int id, const char *value);
    int (*set_property)(void *context, int id, const char *name, const char *value_json);
    int (*insert_node)(void *context, int parent_id, int node_id, int anchor_id);
    int (*remove_node)(void *context, int parent_id, int node_id);
    int (*set_event_enabled)(void *context, int id, const char *event, int enabled);
    char *(*call_module_sync)(void *context, const char *module, const char *method, const char *args_json);
    int (*call_module_async)(
        void *context,
        const char *module,
        const char *method,
        const char *args_json,
        int request_id
    );
    void (*release_string)(void *context, char *value);
} StingQuickJsAndroidHostCallbacks;

void *sting_qjs_android_create(const StingQuickJsAndroidHostCallbacks *callbacks);
char *sting_qjs_android_evaluate(void *runtime, const char *source, size_t source_len);
char *sting_qjs_android_dispatch_event(
    void *runtime,
    int node_id,
    const char *event,
    const char *payload_json
);
char *sting_qjs_android_complete_module_call(
    void *runtime,
    int request_id,
    const char *response_json
);
char *sting_qjs_android_dispose_runtime(void *runtime);
void sting_qjs_android_destroy(void *runtime);
void sting_qjs_android_free_error(char *error_message);

#ifdef __cplusplus
}
#endif

#endif
