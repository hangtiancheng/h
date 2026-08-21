cmake_minimum_required(VERSION 3.20)

project(homepage LANGUAGES C CXX)

if(NOT CMAKE_GENERATOR STREQUAL "Ninja")
  message(FATAL_ERROR
    "this project requires the Ninja generator, got '${CMAKE_GENERATOR}', remove the build directory and re-run: cmake -S . -B build -G Ninja")
endif()

# ---------------------------------------------------------------------------
# Options
# ---------------------------------------------------------------------------
# Directory (relative to this file) that is recursively scanned for sources.
set(SRC_DIR "src" CACHE STRING "directory scanned for source files")

# File extensions that are treated as translation units.
set(SRC_EXTENSIONS ".c;.cc;.cpp;.cxx;.c++" CACHE STRING "source file extensions to scan")

# Ninja is single-config, so an unset build type means no -O and no -g.
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE "Debug" CACHE STRING "Build type" FORCE)
endif()

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 17)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Generate compile_commands.json for tooling (clangd, etc.).
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ---------------------------------------------------------------------------
# Per-toolchain warning / diagnostic flags
# ---------------------------------------------------------------------------
# Carried as an INTERFACE target rather than add_compile_options() so the flags
# reach our own targets only, not third-party code pulled in later.
add_library(warnings INTERFACE)
if(MSVC)
  # clang-cl on Windows accepts the MSVC-style driver.
  target_compile_options(warnings INTERFACE /W4 /permissive-)
else()
  # clang++ (macOS) and clang (Linux) share the GNU-style driver.
  target_compile_options(warnings INTERFACE -Wall -Wextra -Wpedantic)
endif()

# ---------------------------------------------------------------------------
# Collect candidate source files under SRC_DIR.
# ---------------------------------------------------------------------------
set(__scan_root "${CMAKE_CURRENT_SOURCE_DIR}/${SRC_DIR}")

set(__glob_patterns "")
foreach(__ext IN LISTS SRC_EXTENSIONS)
  list(APPEND __glob_patterns "${__scan_root}/*${__ext}")
endforeach()

# CONFIGURE_DEPENDS re-runs the glob when files are added/removed at build time.
file(GLOB_RECURSE __all_sources
  CONFIGURE_DEPENDS
  LIST_DIRECTORIES false
  ${__glob_patterns})

# Entry-point detection reads file *contents*, which CONFIGURE_DEPENDS above
# does not track, so adding `int main()` to an existing file would otherwise be
# ignored until the next manual re-configure.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS ${__all_sources})

# Regex that matches a `int main(...)` definition while ignoring leading
# whitespace and tolerating `int   main (`. Comments/strings are not parsed,
# which is good enough for detecting entry points in ordinary sources.
set(__main_regex "(^|\n)[ \t]*int[ \t]+main[ \t]*\\(")

set(__entry_sources "")
set(__common_sources "")

foreach(__src IN LISTS __all_sources)
  file(READ "${__src}" __contents)

  if(__contents MATCHES "${__main_regex}")
    list(APPEND __entry_sources "${__src}")
  else()
    list(APPEND __common_sources "${__src}")
  endif()
endforeach()

# ---------------------------------------------------------------------------
# Sources without an entry point become a shared library every executable
# links, so `#include "lib/foo.h"` resolves at link time too.
# ---------------------------------------------------------------------------
# STATIC rather than OBJECT: the linker pulls in only the members an executable
# actually references, so unrelated helpers neither bloat every binary nor
# collide when two of them happen to define the same symbol.
if(__common_sources)
  add_library(common STATIC ${__common_sources})
  target_include_directories(common PUBLIC "${__scan_root}")
  target_link_libraries(common PRIVATE warnings)

  list(LENGTH __common_sources __common_count)
  message(STATUS "common library: ${__common_count} source(s)")
endif()

# ---------------------------------------------------------------------------
# One executable per entry point, mirroring the source tree in the build dir.
# ---------------------------------------------------------------------------
set(_used_target_names "")

foreach(__src IN LISTS __entry_sources)
  # Path of the source relative to the scan root, e.g. "hello/main.cc".
  file(RELATIVE_PATH __rel "${__scan_root}" "${__src}")

  get_filename_component(__rel_dir "${__rel}" DIRECTORY) # "hello" (or "")
  get_filename_component(__stem "${__rel}" NAME_WE) # "main"

  if(__rel_dir STREQUAL "")
    set(__out_dir "${CMAKE_BINARY_DIR}")
    set(__base_name "${__stem}")
  else()
    set(__out_dir "${CMAKE_BINARY_DIR}/${__rel_dir}")
    # "." keeps a/b/main, a_b/main and a/b_main distinct, unlike "_".
    string(REPLACE "/" "." __base_name "${__rel_dir}.${__stem}")
  endif()

  # Target names accept only [A-Za-z0-9_.+-].
  string(REGEX REPLACE "[^A-Za-z0-9_.+-]" "_" __base_name "${__base_name}")

  # A directory name containing "." can still collide; disambiguate rather than
  # letting add_executable() fail on a duplicate name.
  set(__target_name "${__base_name}")
  set(__suffix 2)
  while(__target_name IN_LIST _used_target_names)
    set(__target_name "${__base_name}-${__suffix}")
    math(EXPR __suffix "${__suffix} + 1")
  endwhile()
  list(APPEND _used_target_names "${__target_name}")

  add_executable("${__target_name}" "${__src}")

  # Emit ./build/path/to/main from ./src/path/to/main.cc
  set_target_properties("${__target_name}" PROPERTIES
    OUTPUT_NAME "${__stem}"
    RUNTIME_OUTPUT_DIRECTORY "${__out_dir}")

  # Let each entry point include headers relative to the scan root and to
  # its own directory, so `#include "lib/foo.h"` and `#include "foo.h"` work.
  get_filename_component(_src_dir "${__src}" DIRECTORY)
  target_include_directories("${__target_name}" PRIVATE
    "${__scan_root}"
    "${_src_dir}")

  target_link_libraries("${__target_name}" PRIVATE warnings)
  if(__common_sources)
    target_link_libraries("${__target_name}" PRIVATE common)
  endif()

  message(STATUS "${__rel} -> ${__out_dir}/${__stem}")
endforeach()

list(LENGTH __entry_sources __executable_count)
if(__executable_count EQUAL 0)
  message(WARNING "no `int main()` found under ${__scan_root}")
else()
  message(STATUS "${__executable_count} executable(s)")
endif()

# ---------------------------------------------------------------------------
# Formatting
# ---------------------------------------------------------------------------
# Not part of `all`: the build drives this explicitly once compilation
# succeeded, so a formatting pass never masks a compile error.
find_program(CLANG_FORMAT_EXE NAMES clang-format)

file(GLOB_RECURSE __header_files
  CONFIGURE_DEPENDS
  LIST_DIRECTORIES false
  "${__scan_root}/*.h"
  "${__scan_root}/*.hh"
  "${__scan_root}/*.hpp"
  "${__scan_root}/*.hxx"
  "${__scan_root}/*.h++")

set(__format_files ${__all_sources} ${__header_files})

if(NOT CLANG_FORMAT_EXE)
  add_custom_target(format
    COMMAND "${CMAKE_COMMAND}" -E echo "clang-format not found, skipping format")
elseif(NOT __format_files)
  add_custom_target(format
    COMMAND "${CMAKE_COMMAND}" -E echo "no files to format under ${__scan_root}")
else()
  add_custom_target(format
    COMMAND "${CLANG_FORMAT_EXE}" -i ${__format_files}
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    COMMENT "clang-format: formatting sources under ${SRC_DIR}"
    VERBATIM)
endif()
