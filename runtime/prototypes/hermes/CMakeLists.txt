cmake_minimum_required(VERSION 3.20)

project(StingHermesAdapter LANGUAGES C CXX)

if(NOT DEFINED HERMES_SOURCE_DIR)
  message(FATAL_ERROR "HERMES_SOURCE_DIR must point at the pinned Hermes checkout")
endif()

set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(HERMES_ENABLE_TEST_SUITE OFF CACHE BOOL "" FORCE)
set(HERMES_ENABLE_DEBUGGER OFF CACHE BOOL "" FORCE)
set(HERMES_ENABLE_INTL OFF CACHE BOOL "" FORCE)
set(HERMES_ENABLE_WERROR OFF CACHE BOOL "" FORCE)

add_subdirectory("${HERMES_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/hermes" EXCLUDE_FROM_ALL)

add_library(sting_hermes_adapter SHARED
  src/adapter.cpp
)

target_compile_features(sting_hermes_adapter PRIVATE cxx_std_17)
target_include_directories(sting_hermes_adapter
  PUBLIC
    "${CMAKE_CURRENT_SOURCE_DIR}/include"
)
target_link_libraries(sting_hermes_adapter PRIVATE hermesapi)

set_target_properties(sting_hermes_adapter PROPERTIES
  OUTPUT_NAME "sting_hermes_adapter"
)
