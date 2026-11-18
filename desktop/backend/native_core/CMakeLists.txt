# Standalone build for the pure C++ model core.
#
# The Python package normally builds these files through desktop/setup.py.
# This CMake project exists so the algorithms can be compiled, fuzz-tested and
# benchmarked without CPython/pybind11:
#
#   cmake -S backend/native_core -B build/native-cpp -DCMAKE_BUILD_TYPE=Release
#   cmake --build build/native-cpp -j
#   ctest --test-dir build/native-cpp --output-on-failure
#   ./build/native-cpp/native_bench
#
cmake_minimum_required(VERSION 3.16)
project(stockdesk_native VERSION 1.2.6 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

option(STOCKDESK_NATIVE_SANITIZE "Build with ASan/UBSan" OFF)

if(STOCKDESK_NATIVE_SANITIZE)
    if(MSVC)
        message(FATAL_ERROR "STOCKDESK_NATIVE_SANITIZE currently requires clang/gcc")
    endif()
    add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
    add_link_options(-fsanitize=address,undefined)
endif()

add_library(stockdesk_native STATIC
    percolation.cpp
    hmm.cpp
    census.cpp
)
target_include_directories(stockdesk_native PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

if(MSVC)
    target_compile_options(stockdesk_native PRIVATE /O2 /W4 /DNDEBUG)
elseif(STOCKDESK_NATIVE_SANITIZE)
    target_compile_options(stockdesk_native PRIVATE
        -O1 -g -Wall -Wextra -fno-math-errno
    )
else()
    target_compile_options(stockdesk_native PRIVATE
        -O3 -DNDEBUG -Wall -Wextra -fno-math-errno
    )
endif()

# Link-time optimisation lets the compiler inline the small per-state kernels
# across translation units without changing the numerical contract.
set_property(TARGET stockdesk_native PROPERTY INTERPROCEDURAL_OPTIMIZATION_RELEASE TRUE)

add_executable(native_selftest selftest.cpp)
target_link_libraries(native_selftest PRIVATE stockdesk_native)

add_executable(native_bench bench.cpp)
target_link_libraries(native_bench PRIVATE stockdesk_native)

enable_testing()
add_test(NAME native_selftest COMMAND native_selftest)
