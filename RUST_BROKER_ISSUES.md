# Rust WebSocket Broker Issues

## 🚨 Critical Issue: NAPI Threadsafe Function Not Working

### Problem Summary

The Rust WebSocket broker appears to be working correctly on the Rust side, but the JavaScript callback is never actually invoked, resulting in `null` events being received by the JavaScript event handler.

### Symptoms

- Rust logs show successful threadsafe function calls
- JavaScript receives `null` instead of the expected JSON strings
- JavaScript callback debugging logs never appear
- Events are lost, causing the LiveTS real-time updates to fail

### Detailed Investigation

#### What We Know Works ✅

1. **Rust WebSocket Connection Handling**: Successfully accepts WebSocket connections
2. **Rust Event Serialization**: JSON serialization works correctly
3. **Rust Threadsafe Function Creation**: `callback.create_threadsafe_function()` succeeds
4. **Rust Threadsafe Function Calls**: `tsfn.call()` returns `Status::Ok`
5. **Rust Threadsafe Callback Execution**: The callback closure executes successfully
6. **Rust JS String Creation**: `ctx.env.create_string()` works correctly

#### What's Broken ❌

1. **JavaScript Function Invocation**: The actual JavaScript function is never called
2. **Event Data Transfer**: `null` is received instead of the JSON string
3. **NAPI Return Value Mechanism**: The `Ok(vec![js_string])` return value doesn't reach JavaScript

### Debug Output Analysis

**Rust Side (Working):**

```
🚀 Sending Connected event: {"type":"Connected","connectionId":"..."}
✅ Successfully called JS handler for Connected
🔄 JS callback called #1 with value: "{\"type\":\"Connected\",\"connectionId\":\"...\"}"
✅ Successfully created JS string #1, calling JS function...
```

**JavaScript Side (Broken):**

```
📨 Received broker event: null
⚠️  Received empty or null event JSON: null
```

**Missing JavaScript Debug Logs:**

```
// These logs never appear, confirming the JS function is never called:
🎯 JavaScript callback received args: [...]
🎯 Number of arguments: ...
🎯 First arg type: ...
🎯 First arg value: ...
```

### Technical Details

#### NAPI-RS Configuration

- **Queue Size**: Tested with both `0` and `1024` - no difference
- **Call Mode**: Tested both `NonBlocking` and `Blocking` - no difference
- **Error Handling**: Proper error handling implemented, no errors reported

#### Code Structure

```rust
let tsfn: ThreadsafeFunction<String> = callback.create_threadsafe_function(0, |ctx| {
    println!("🔄 JS callback called with value: {:?}", ctx.value);
    match ctx.env.create_string(&ctx.value) {
        Ok(js_string) => {
            println!("✅ Successfully created JS string, returning it");
            Ok(vec![js_string])  // This should call the JS function with js_string
        }
        Err(e) => {
            println!("❌ Failed to create JS string: {:?}", e);
            Err(e)
        }
    }
})?;
```

```javascript
this.rustBroker.setEventHandler((...args: any[]) => {
    console.log('🎯 JavaScript callback received args:', args);  // Never called
    const evtJson = args[0];
    this.handleBrokerEvent(evtJson);
});
```

### Attempted Solutions

#### ❌ Failed Approaches

1. **Different Queue Sizes**: Tried 0, 1024 - no change
2. **Blocking vs NonBlocking**: No difference
3. **Error Handling**: Added comprehensive error checking
4. **Direct Function Calls**: Attempted `ctx.callback.call()` - not available
5. **Alternative NAPI APIs**: `env.create_threadsafe_function()` - compilation errors

#### 🔍 Working Debugging

- Added extensive Rust `println!` logging
- Added JavaScript callback argument inspection
- Confirmed Rust execution flow is correct
- Confirmed JavaScript function is never invoked

### Current Workaround

**Temporary Solution**: Disable Rust broker and fall back to Node.js WebSocket server

```typescript
// In server.ts constructor:
// Temporarily disable Rust broker due to NAPI threadsafe function bug
console.log('⚠️  Temporarily using Node.js WebSocket server instead of Rust broker');
this.rustBroker = undefined;
```

### Impact

- Real-time updates don't work with Rust broker
- Must use slower Node.js WebSocket fallback
- Performance benefits of Rust broker are lost
- Client-server communication is broken

### Next Steps for Resolution

#### Immediate Actions

1. **Test with Different NAPI-RS Versions**: Try downgrading/upgrading NAPI-RS
2. **Minimal Reproduction**: Create a simple test case outside LiveTS
3. **NAPI-RS Community**: Report the issue to NAPI-RS maintainers
4. **Alternative Threading Models**: Explore different callback mechanisms

#### Potential Root Causes

1. **NAPI-RS Bug**: Possible bug in threadsafe function return value handling
2. **Node.js Version Compatibility**: May be related to Node.js version
3. **Event Loop Issues**: JavaScript event loop might be blocked
4. **Memory Management**: Possible memory safety issue in NAPI bindings

#### Long-term Solutions

1. **Fix NAPI Implementation**: Work with NAPI-RS team to resolve
2. **Alternative Rust Integration**: Use different Rust-Node.js binding approach
3. **Hybrid Approach**: Use Rust for processing, Node.js for WebSocket handling
4. **Pure Node.js Solution**: Keep Node.js WebSocket server as primary

### Files Affected

- `packages/rust-core/src/lib.rs` - Threadsafe function implementation
- `packages/core/src/server.ts` - JavaScript callback setup
- `packages/core/src/server.ts:54-57` - Temporary workaround

### Environment

- **OS**: macOS 14.5.0 (darwin 24.5.0)
- **Node.js**: v22.11.0
- **NAPI-RS**: 2.13.0
- **Rust**: Latest stable

### Contact

This issue was discovered during LiveTS development. The Rust broker functionality works perfectly except for this critical NAPI threadsafe function callback issue.

---

**Status**: 🚨 **CRITICAL** - Blocking Rust broker functionality  
**Priority**: **HIGH** - Core feature broken  
**Workaround**: ✅ Node.js WebSocket fallback available
