cmake_minimum_required(VERSION 3.20)

project(homepage LANGUAGES C CXX)

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
# Directory (relative to this file) that is recursively scanned for sources.
set(SRC_DIR "src" CACHE STRING "Directory scanned for source files")

# File extensions that are treated as translation units.
set(SRC_EXTENSIONS ".cc;.cpp;.cxx;.c++" CACHE STRING "Source file extensions to scan")

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Generate compile_commands.json for tooling (clangd, etc.).
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ---------------------------------------------------------------------------
# Per-toolchain warning / diagnostic flags
# ---------------------------------------------------------------------------
if(MSVC)
  # clang-cl on Windows accepts the MSVC-style driver.
  add_compile_options(/W4 /permissive-)
else()
  # clang++ (macOS) and clang (Linux) share the GNU-style driver.
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

# ---------------------------------------------------------------------------
# Collect candidate source files under SRC_DIR.
# ---------------------------------------------------------------------------
set(_scan_root "${CMAKE_CURRENT_SOURCE_DIR}/${SRC_DIR}")

set(_glob_patterns "")
foreach(_ext IN LISTS SRC_EXTENSIONS)
  list(APPEND _glob_patterns "${_scan_root}/*${_ext}")
endforeach()

# CONFIGURE_DEPENDS re-runs the glob when files are added/removed at build time.
file(GLOB_RECURSE _all_sources
  CONFIGURE_DEPENDS
  LIST_DIRECTORIES false
  ${_glob_patterns})

# Regex that matches a `int main(...)` definition while ignoring leading
# whitespace and tolerating `int   main (`. Comments/strings are not parsed,
# which is good enough for detecting entry points in ordinary sources.
set(_main_regex "(^|\n)[ \t]*int[ \t]+main[ \t]*\\(")

set(_executable_count 0)

foreach(_src IN LISTS _all_sources)
  file(READ "${_src}" _contents)

  if(_contents MATCHES "${_main_regex}")
    # Path of the source relative to the scan root, e.g. "hello/main.cc".
    file(RELATIVE_PATH _rel "${_scan_root}" "${_src}")

    get_filename_component(_rel_dir "${_rel}" DIRECTORY) # "hello" (or "")
    get_filename_component(_stem "${_rel}" NAME_WE) # "main"

    # Unique, valid target name derived from the relative path.
    if(_rel_dir STREQUAL "")
      set(_target_name "${_stem}")
      set(_out_dir "${CMAKE_BINARY_DIR}")
    else()
      string(REPLACE "/" "_" _target_name "${_rel_dir}_${_stem}")
      set(_out_dir "${CMAKE_BINARY_DIR}/${_rel_dir}")
    endif()

    add_executable("${_target_name}" "${_src}")

    # Emit ./build/path/to/main from ./src/path/to/main.cc
    set_target_properties("${_target_name}" PROPERTIES
      OUTPUT_NAME "${_stem}"
      RUNTIME_OUTPUT_DIRECTORY "${_out_dir}")

    # Let each entry point include headers relative to the scan root and to
    # its own directory, so `#include "lib/foo.h"` and `#include "foo.h"` work.
    get_filename_component(_src_dir "${_src}" DIRECTORY)
    target_include_directories("${_target_name}" PRIVATE
      "${_scan_root}"
      "${_src_dir}")

    message(STATUS "${_rel} -> ${_out_dir}/${_stem}")
    math(EXPR _executable_count "${_executable_count} + 1")
  endif()
endforeach()

if(_executable_count EQUAL 0)
  message(WARNING "no `int main()` found under ${_scan_root}")
else()
  message(STATUS "${_executable_count} executable(s)")
endif()
