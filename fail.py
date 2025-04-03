import ctypes
import os

if os.name == "posix" and os.uname().sysname == "Darwin":
    lib_path = os.path.join(os.environ.get("CACHE_DIR", ""), "libwebgpu_dawn.dylib")
else:
    lib_path = "/usr/lib/libwebgpu_dawn.so"

lib = ctypes.CDLL(lib_path)


class WGPUChainedStruct(ctypes.Structure):
    pass


class WGPUInstanceFeatures(ctypes.Structure):
    _fields_ = [
        ("nextInChain", ctypes.POINTER(WGPUChainedStruct)),
        ("timedWaitAnyEnable", ctypes.c_uint32),
        ("timedWaitAnyMaxCount", ctypes.c_size_t),
    ]


class WGPUInstanceDescriptor(ctypes.Structure):
    _fields_ = [
        ("nextInChain", ctypes.POINTER(WGPUChainedStruct)),
        ("features", WGPUInstanceFeatures),
    ]


class WGPURequestAdapterOptions(ctypes.Structure):
    _fields_ = [
        ("nextInChain", ctypes.POINTER(WGPUChainedStruct)),
        ("compatibleSurface", ctypes.c_void_p),
        ("featureLevel", ctypes.c_uint32),
        ("powerPreference", ctypes.c_uint32),
        ("backendType", ctypes.c_uint32),
        ("forceFallbackAdapter", ctypes.c_uint32),
        ("compatibilityMode", ctypes.c_uint32),
    ]


WGPURequestAdapterCallback = ctypes.CFUNCTYPE(
    None, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_char_p, ctypes.c_void_p
)


class WGPURequestAdapterCallbackInfo(ctypes.Structure):
    _fields_ = [
        ("nextInChain", ctypes.POINTER(WGPUChainedStruct)),
        ("mode", ctypes.c_uint32),
        ("callback", ctypes.c_void_p),
        ("userdata", ctypes.c_void_p),
    ]


features = WGPUInstanceFeatures()
features.nextInChain = None
features.timedWaitAnyEnable = 1
features.timedWaitAnyMaxCount = 1

desc = WGPUInstanceDescriptor()
desc.nextInChain = None
desc.features = features

lib.wgpuCreateInstance.argtypes = [ctypes.POINTER(WGPUInstanceDescriptor)]
lib.wgpuCreateInstance.restype = ctypes.c_void_p
instance = lib.wgpuCreateInstance(ctypes.byref(desc))
print(f"Instance: {instance}")

opts = WGPURequestAdapterOptions()
opts.nextInChain = None
opts.compatibleSurface = None
opts.featureLevel = 0
opts.powerPreference = 2
opts.backendType = 0
opts.forceFallbackAdapter = 0
opts.compatibilityMode = 0

callback_info = WGPURequestAdapterCallbackInfo()
callback_info.nextInChain = None
callback_info.mode = 1
callback_info.callback = None
callback_info.userdata = None

lib.wgpuInstanceRequestAdapterF.argtypes = [
    ctypes.c_void_p,
    ctypes.POINTER(WGPURequestAdapterOptions),
    WGPURequestAdapterCallbackInfo,
]
lib.wgpuInstanceRequestAdapterF.restype = ctypes.c_void_p

print(list(bytes(desc)), len(bytes(desc)))
print(list(bytes(opts)), len(bytes(opts)))
print(list(bytes(callback_info)), len(bytes(callback_info)))
future = lib.wgpuInstanceRequestAdapterF(instance, ctypes.byref(opts), callback_info)
print(f"Future: {future}")
