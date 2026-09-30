#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/CATapDescription.h>
#import <CoreAudio/AudioHardwareTapping.h>
#include <node_api.h>
#include <atomic>
#include <vector>
#include <algorithm>

// One producer (Core Audio), one consumer (the main JS thread). Never allocate in the audio callback.
static constexpr uint32_t capacity = 32768;
static float ring[capacity];
static std::atomic<uint64_t> written{0}, consumed{0};
static AudioObjectID tap = kAudioObjectUnknown, device = kAudioObjectUnknown;
static AudioDeviceIOProcID proc = nullptr;
static AudioStreamBasicDescription format{};
static bool interleaved = true;

static AudioObjectPropertyAddress address(AudioObjectPropertySelector selector) {
  return {selector, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain};
}
static NSArray<NSNumber*>* spotifyProcesses() {
  auto a = address(kAudioHardwarePropertyProcessObjectList); UInt32 size = 0;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &a, 0, nullptr, &size)) return @[];
  std::vector<AudioObjectID> ids(size / sizeof(AudioObjectID));
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &a, 0, nullptr, &size, ids.data())) return @[];
  NSMutableArray* result = [NSMutableArray array];
  for (auto id : ids) {
    auto b = address(kAudioProcessPropertyBundleID); CFStringRef value = nullptr; UInt32 n = sizeof(value);
    if (!AudioObjectGetPropertyData(id, &b, 0, nullptr, &n, &value) && value) {
      NSString* bundle = (__bridge NSString*)value;
      if ([bundle isEqualToString:@"com.spotify.client"] || [bundle hasPrefix:@"com.spotify.client."]) [result addObject:@(id)];
      CFRelease(value);
    }
  }
  return result;
}
static void stopTap() {
  if (device != kAudioObjectUnknown && proc) { AudioDeviceStop(device, proc); AudioDeviceDestroyIOProcID(device, proc); }
  proc = nullptr;
  if (device != kAudioObjectUnknown) AudioHardwareDestroyAggregateDevice(device);
  if (tap != kAudioObjectUnknown) AudioHardwareDestroyProcessTap(tap);
  device = tap = kAudioObjectUnknown; written = 0; consumed = 0; std::fill(std::begin(ring), std::end(ring), 0.0f);
}
static OSStatus receive(AudioObjectID, const AudioTimeStamp*, const AudioBufferList* input, const AudioTimeStamp*, AudioBufferList*, const AudioTimeStamp*, void*) {
  if (!input || !input->mNumberBuffers) return noErr;
  const auto& first = input->mBuffers[0];
  const uint32_t channels = std::max(1u, first.mNumberChannels);
  const uint32_t frames = first.mDataByteSize / (sizeof(float) * channels);
  uint64_t write = written.load(std::memory_order_relaxed);
  const uint64_t read = consumed.load(std::memory_order_acquire);
  // Drop this block if the main thread is behind; never overwrite a buffer it is reading.
  if (write - read + frames * 2 > capacity) return noErr;
  for (uint32_t i = 0; i < frames; i++) for (uint32_t ch = 0; ch < 2; ch++) {
    const AudioBuffer& b = interleaved ? first : input->mBuffers[std::min(ch, input->mNumberBuffers - 1)];
    const float* samples = static_cast<const float*>(b.mData);
    const uint32_t index = interleaved ? i * channels + std::min(ch, channels - 1) : i;
    ring[write++ % capacity] = samples && index < b.mDataByteSize / sizeof(float) ? samples[index] : 0;
  }
  written.store(write, std::memory_order_release); return noErr;
}
static napi_value fail(napi_env env, const char* message, OSStatus status = 0) {
  stopTap(); NSString* text = status ? [NSString stringWithFormat:@"%s (Core Audio %d)", message, (int)status] : [NSString stringWithUTF8String:message];
  napi_throw_error(env, nullptr, text.UTF8String); return nullptr;
}
static napi_value start(napi_env env, napi_callback_info) {
  @autoreleasepool {
    if (@available(macOS 14.2, *)) {
      stopTap(); NSArray* processes = spotifyProcesses();
      if (!processes.count) return fail(env, "Open Spotify Desktop and play a track before enabling visualization.");
      CATapDescription* description = [[CATapDescription alloc] initStereoMixdownOfProcesses:processes];
      description.name = @"Music Spotify visualizer"; description.privateTap = YES; description.muteBehavior = CATapUnmuted;
      OSStatus status = AudioHardwareCreateProcessTap(description, &tap);
      if (status) return fail(env, "Spotify audio capture could not start. Allow Music in System Settings > Privacy & Security > Screen & System Audio Recording", status);
      auto a = address(kAudioTapPropertyFormat); UInt32 size = sizeof(format);
      status = AudioObjectGetPropertyData(tap, &a, 0, nullptr, &size, &format);
      if (status || format.mFormatID != kAudioFormatLinearPCM || !(format.mFormatFlags & kAudioFormatFlagIsFloat) || format.mBitsPerChannel != 32)
        return fail(env, "Spotify capture returned an unsupported audio format", status);
      interleaved = !(format.mFormatFlags & kAudioFormatFlagIsNonInterleaved);
      NSDictionary* spec = @{@kAudioAggregateDeviceNameKey: @"Music private analysis tap", @kAudioAggregateDeviceUIDKey: NSUUID.UUID.UUIDString,
        @kAudioAggregateDeviceIsPrivateKey: @YES, @kAudioAggregateDeviceTapAutoStartKey: @YES,
        @kAudioAggregateDeviceTapListKey: @[@{@kAudioSubTapUIDKey: description.UUID.UUIDString, @kAudioSubTapDriftCompensationKey: @YES}]};
      status = AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)spec, &device);
      if (status) return fail(env, "Could not create the private Spotify analysis device", status);
      status = AudioDeviceCreateIOProcID(device, receive, nullptr, &proc);
      if (!status) status = AudioDeviceStart(device, proc);
      if (status) return fail(env, "Spotify audio capture is unavailable; check macOS audio-capture permission", status);
      napi_value result; napi_create_double(env, format.mSampleRate, &result); return result;
    }
    return fail(env, "Spotify visualization requires macOS 14.2 or later.");
  }
}
static napi_value stop(napi_env env, napi_callback_info) { stopTap(); napi_value result; napi_get_undefined(env, &result); return result; }
static napi_value read(napi_env env, napi_callback_info) {
  uint64_t begin = consumed.load(std::memory_order_relaxed), end = written.load(std::memory_order_acquire);
  // Old analysis is useless. Bound latency as well as memory when the app is busy.
  if (end - begin > 8192) begin = end - 8192;
  const size_t count = end - begin; void* bytes; napi_value buffer, array;
  napi_create_arraybuffer(env, count * sizeof(float), &bytes, &buffer);
  for (size_t i = 0; i < count; i++) static_cast<float*>(bytes)[i] = ring[(begin + i) % capacity];
  consumed.store(end, std::memory_order_release);
  napi_create_typedarray(env, napi_float32_array, count, buffer, 0, &array); return array;
}
static napi_value signature(napi_env env, napi_callback_info) {
  @autoreleasepool {
    auto a = address(kAudioHardwarePropertyDefaultOutputDevice); AudioObjectID output = 0; UInt32 size = sizeof(output);
    AudioObjectGetPropertyData(kAudioObjectSystemObject, &a, 0, nullptr, &size, &output);
    NSString* text = [NSString stringWithFormat:@"%@:%u", [spotifyProcesses() componentsJoinedByString:@","], output];
    napi_value value; napi_create_string_utf8(env, text.UTF8String, NAPI_AUTO_LENGTH, &value); return value;
  }
}
static void cleanup(void*) { stopTap(); }
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {{"start", 0, start, 0, 0, 0, napi_default, 0}, {"stop", 0, stop, 0, 0, 0, napi_default, 0}, {"read", 0, read, 0, 0, 0, napi_default, 0}, {"signature", 0, signature, 0, 0, 0, napi_default, 0}};
  napi_define_properties(env, exports, 4, methods); napi_add_env_cleanup_hook(env, cleanup, nullptr); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
