import { env } from './jsgrad/node.ts'
import { dlopen, ptr } from 'bun:ffi'

const PATH = env.OSX ? `${env.CACHE_DIR}/libwebgpu_dawn.dylib` : '/usr/lib/libwebgpu_dawn.so'

const lib = dlopen(PATH, {
  wgpuCreateInstance: { args: ['pointer'], returns: 'pointer' },
  wgpuInstanceRequestAdapterF: { args: ['pointer', 'pointer', 'buffer'], returns: 'pointer' },
})

// typedef uint32_t WGPUBool;
// typedef struct WGPUInstanceFeatures {
//     WGPUChainedStruct const * nextInChain;
//     WGPUBool timedWaitAnyEnable;
//     size_t timedWaitAnyMaxCount;
// } WGPUInstanceFeatures WGPU_STRUCTURE_ATTRIBUTE;
const features = new Uint8Array(20)
features.set([0, 0, 0, 0, 0, 0, 0, 0], 0) //nextInChain
features.set([1, 0, 0, 0], 8) //timedWaitAnyEnable
features.set([1, 0, 0, 0, 0, 0, 0, 0], 12) //timedWaitAnyMaxCount

// typedef struct WGPUInstanceDescriptor {
//     WGPUChainedStruct const * nextInChain;
//     WGPUInstanceFeatures features;
// } WGPUInstanceDescriptor WGPU_STRUCTURE_ATTRIBUTE;
const desc = new Uint8Array(32)
desc.set([0, 0, 0, 0, 0, 0, 0, 0], 0) //nextInChain
desc.set(features, 8) // features

// WGPU_EXPORT WGPUInstance wgpuCreateInstance(WGPU_NULLABLE WGPUInstanceDescriptor const * descriptor) WGPU_FUNCTION_ATTRIBUTE;
const instance = lib.symbols.wgpuCreateInstance(ptr(desc))
console.log(instance)
// typedef enum WGPUFeatureLevel {
//     WGPUFeatureLevel_Undefined = 0x00000000,
//     WGPUFeatureLevel_Compatibility = 0x00000001,
//     WGPUFeatureLevel_Core = 0x00000002,
//     WGPUFeatureLevel_Force32 = 0x7FFFFFFF
// }
// typedef enum WGPUPowerPreference {
//     WGPUPowerPreference_Undefined = 0x00000000,
//     WGPUPowerPreference_LowPower = 0x00000001,
//     WGPUPowerPreference_HighPerformance = 0x00000002,
//     WGPUPowerPreference_Force32 = 0x7FFFFFFF
// } WGPUPowerPreference WGPU_ENUM_ATTRIBUTE;
// typedef enum WGPUBackendType {
//     WGPUBackendType_Undefined = 0x00000000,
//     WGPUBackendType_Null = 0x00000001,
//     WGPUBackendType_WebGPU = 0x00000002,
//     WGPUBackendType_D3D11 = 0x00000003,
//     WGPUBackendType_D3D12 = 0x00000004,
//     WGPUBackendType_Metal = 0x00000005,
//     WGPUBackendType_Vulkan = 0x00000006,
//     WGPUBackendType_OpenGL = 0x00000007,
//     WGPUBackendType_OpenGLES = 0x00000008,
//     WGPUBackendType_Force32 = 0x7FFFFFFF
// } WGPUBackendType WGPU_ENUM_ATTRIBUTE;
// typedef struct WGPURequestAdapterOptions {
//     WGPUChainedStruct const * nextInChain;
//     WGPU_NULLABLE WGPUSurface compatibleSurface;
//     WGPUFeatureLevel featureLevel;
//     WGPUPowerPreference powerPreference;
//     WGPUBackendType backendType;
//     WGPUBool forceFallbackAdapter;
//     WGPUBool compatibilityMode;
// } WGPURequestAdapterOptions WGPU_STRUCTURE_ATTRIBUTE;
const opts = new Uint8Array(40)
opts.set([0, 0, 0, 0, 0, 0, 0, 0], 0) //nextInChain
opts.set([0, 0, 0, 0, 0, 0, 0, 0], 8) //compatibleSurface
opts.set([0, 0, 0, 0], 16) //featureLevel
opts.set([2, 0, 0, 0], 20) //powerPreference
opts.set([0, 0, 0, 0], 24) //backendType
opts.set([0, 0, 0, 0], 28) //forceFallbackAdapter
opts.set([0, 0, 0, 0], 32) //compatibilityMode

// typedef enum WGPUCallbackMode {
//     WGPUCallbackMode_WaitAnyOnly = 0x00000001,
//     WGPUCallbackMode_AllowProcessEvents = 0x00000002,
//     WGPUCallbackMode_AllowSpontaneous = 0x00000003,
//     WGPUCallbackMode_Force32 = 0x7FFFFFFF
// typedef void (*WGPURequestAdapterCallback)(WGPURequestAdapterStatus status, WGPUAdapter adapter, struct WGPUStringView message, void * userdata) WGPU_FUNCTION_ATTRIBUTE;
// typedef struct WGPURequestAdapterCallbackInfo {
//     WGPUChainedStruct const * nextInChain;
//     WGPUCallbackMode mode;
//     WGPURequestAdapterCallback callback;
//     void * userdata;
// } WGPURequestAdapterCallbackInfo WGPU_STRUCTURE_ATTRIBUTE;
const cb = new Uint8Array(32)
cb.set([0, 0, 0, 0, 0, 0, 0, 0], 0) // nextInChain
cb.set([1, 0, 0, 0], 8) // mode
cb.set([0, 0, 0, 0, 0, 0, 0, 0], 16) // callback
cb.set([0, 0, 0, 0, 0, 0, 0, 0], 24) // userdata

//WGPU_EXPORT WGPUFuture wgpuInstanceRequestAdapterF(WGPUInstance instance, WGPU_NULLABLE WGPURequestAdapterOptions const * options, WGPURequestAdapterCallbackInfo callbackInfo) WGPU_FUNCTION_ATTRIBUTE;
const future = lib.symbols.wgpuInstanceRequestAdapterF(instance, ptr(opts), cb)

console.log(future)
