from pybind11.setup_helpers import Pybind11Extension, build_ext
from setuptools import setup

ext = Pybind11Extension("backend._native", ["backend/native.cpp"], cxx_std=17,
                        extra_compile_args=["-O3", "-DNDEBUG"])
setup(name="stockdesk-native", version="1.0.0", ext_modules=[ext],
      cmdclass={"build_ext": build_ext})
