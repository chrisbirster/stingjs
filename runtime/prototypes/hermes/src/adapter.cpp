#include "sting_hermes_adapter.h"

#include <hermes/hermes.h>
#include <jsi/jsi.h>

#include <cmath>
#include <cstdint>
#include <memory>
#include <string>

namespace jsi = facebook::jsi;

struct StingHermesRuntime {
  std::unique_ptr<facebook::hermes::HermesRuntime> runtime;
  std::string output;
  std::string error;
};

namespace {

std::shared_ptr<const jsi::Buffer> stringBuffer(std::string source) {
  return std::make_shared<const jsi::StringBuffer>(std::move(source));
}

void evaluate(
    StingHermesRuntime *state,
    std::string source,
    const std::string &source_url) {
  state->runtime->evaluateJavaScript(stringBuffer(std::move(source)), source_url);
}

std::string hostArgument(jsi::Runtime &runtime, const jsi::Value &value) {
  if (value.isUndefined()) {
    return "";
  }
  if (value.isNull()) {
    return "null";
  }
  if (value.isBool()) {
    return value.getBool() ? "true" : "false";
  }
  if (value.isNumber()) {
    const double number = value.asNumber();
    if (std::isfinite(number) && std::floor(number) == number) {
      return std::to_string(static_cast<int64_t>(number));
    }
    return std::to_string(number);
  }
  if (value.isString()) {
    return value.asString(runtime).utf8(runtime);
  }

  // The current Sting bridge contract passes only primitive values to this
  // host entry point; structured module values are already JSON strings.
  return "";
}

} // namespace

extern "C" StingHermesRuntime *sting_hermes_runtime_create(void) {
  try {
    auto runtime = facebook::hermes::makeHermesRuntimeNoThrow();
    if (!runtime) {
      return nullptr;
    }

    auto *state = new StingHermesRuntime();
    state->runtime = std::move(runtime);
    return state;
  } catch (...) {
    return nullptr;
  }
}

extern "C" void sting_hermes_runtime_destroy(StingHermesRuntime *runtime) {
  delete runtime;
}

extern "C" int sting_hermes_runtime_install_host_call(
    StingHermesRuntime *state,
    StingHermesHostCall host_call,
    void *user_data) {
  if (state == nullptr || state->runtime == nullptr || host_call == nullptr) {
    return 1;
  }

  state->error.clear();

  try {
    auto &runtime = *state->runtime;
    auto function = jsi::Function::createFromHostFunction(
        runtime,
        jsi::PropNameID::forAscii(runtime, "__stingHostCall"),
        4,
        [host_call, user_data](
            jsi::Runtime &js_runtime,
            const jsi::Value &,
            const jsi::Value *args,
            size_t count) -> jsi::Value {
          if (count == 0 || !args[0].isString()) {
            return jsi::Value::undefined();
          }

          const std::string operation = args[0].asString(js_runtime).utf8(js_runtime);
          const std::string arg1 = count > 1 ? hostArgument(js_runtime, args[1]) : "";
          const std::string arg2 = count > 2 ? hostArgument(js_runtime, args[2]) : "";
          const std::string arg3 = count > 3 ? hostArgument(js_runtime, args[3]) : "";

          const char *result = host_call(
              user_data,
              operation.c_str(),
              arg1.c_str(),
              arg2.c_str(),
              arg3.c_str());

          if (result == nullptr) {
            return jsi::Value::undefined();
          }

          return jsi::String::createFromUtf8(js_runtime, std::string(result));
        });

    runtime.global().setProperty(
        runtime,
        "__stingHostCall",
        std::move(function));
    return 0;
  } catch (const std::exception &exception) {
    state->error = exception.what();
    return 2;
  } catch (...) {
    state->error = "unknown Hermes exception while installing host callback";
    return 3;
  }
}

extern "C" int sting_hermes_runtime_run(
    StingHermesRuntime *state,
    const uint8_t *source,
    size_t source_length,
    const char *source_url) {
  if (state == nullptr || source == nullptr) {
    return 1;
  }

  state->output.clear();
  state->error.clear();

  try {
    evaluate(
        state,
        R"JS(
          globalThis.__stingOutput = "";
          globalThis.print = function(value) {
            globalThis.__stingOutput = String(value);
          };
        )JS",
        "sting-hermes-bootstrap.js");

    evaluate(
        state,
        std::string(reinterpret_cast<const char *>(source), source_length),
        source_url == nullptr ? "sting-js-engine-bench.js" : source_url);

    while (!state->runtime->drainMicrotasks()) {
    }

    const auto output_value = state->runtime->evaluateJavaScript(
        stringBuffer("globalThis.__stingOutput"),
        "sting-hermes-output.js");

    if (!output_value.isString()) {
      state->error = "Hermes evaluation did not produce string output state";
      return 2;
    }

    state->output = output_value.asString(*state->runtime).utf8(*state->runtime);
    return 0;
  } catch (const std::exception &exception) {
    state->error = exception.what();
    return 3;
  } catch (...) {
    state->error = "unknown Hermes exception";
    return 4;
  }
}

extern "C" const char *sting_hermes_runtime_last_output(
    const StingHermesRuntime *runtime) {
  return runtime == nullptr ? "" : runtime->output.c_str();
}

extern "C" const char *sting_hermes_runtime_last_error(
    const StingHermesRuntime *runtime) {
  return runtime == nullptr ? "Hermes runtime is null" : runtime->error.c_str();
}
