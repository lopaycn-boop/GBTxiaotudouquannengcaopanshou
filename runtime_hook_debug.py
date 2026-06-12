"""PyInstaller runtime hook: log import errors to backend_import_debug.log"""
import sys
import os
import traceback
import builtins

_orig_import = builtins.__import__
_log_path = os.path.join(os.path.dirname(sys.executable), 'backend_import_debug.log')

# Only log errors for application modules, not PyInstaller internals
_SKIP_PREFIXES = ('pyi_', 'pyimod', 'pkg_resources', 'jaraco', 'setuptools', '_pyi_')

def _logging_import(name, *args, **kwargs):
    try:
        return _orig_import(name, *args, **kwargs)
    except ImportError as e:
        # Skip PyInstaller internal import errors
        if any(name.startswith(p) for p in _SKIP_PREFIXES):
            raise
        with open(_log_path, 'a', encoding='utf-8') as f:
            f.write(f'IMPORT ERROR: {name} -> {e}\n')
            traceback.print_exc(file=f)
            f.write('\n')
        raise

builtins.__import__ = _logging_import
