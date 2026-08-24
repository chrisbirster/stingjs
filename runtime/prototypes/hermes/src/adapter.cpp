#include "sting_hermes_adapter.h"

#include <hermes/hermes.h>
#include <jsi/jsi.h>

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
      state->error = "Hermes benchmark did not produce string output";
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
