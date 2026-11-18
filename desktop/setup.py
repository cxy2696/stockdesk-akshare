"""Build the optional C++ model core (pybind11)."""

import sys

from pybind11.setup_helpers import Pybind11Extension, build_ext
from setuptools import setup

# MSVC uses / flags; clang/gcc use - flags. Passing -O3 to cl previously made
# the Windows build fail, so keep the platform split explicit.
if sys.platform == "win32":
    compile_args = ["/O2", "/DNDEBUG", "/EHsc"]
    link_args = []
else:
    compile_args = ["-O3", "-DNDEBUG", "-Wall", "-Wextra", "-fno-math-errno", "-flto"]
    link_args = ["-flto"]

ext = Pybind11Extension(
    "backend._native",
    [
        "backend/native_core/bindings.cpp",
        "backend/native_core/percolation.cpp",
        "backend/native_core/hmm.cpp",
        "backend/native_core/census.cpp",
    ],
    include_dirs=["backend/native_core"],
    cxx_std=17,
    extra_compile_args=compile_args,
    extra_link_args=link_args,
)
setup(
    name="stockdesk-native",
    version="1.2.6",
    ext_modules=[ext],
    cmdclass={"build_ext": build_ext},
)
