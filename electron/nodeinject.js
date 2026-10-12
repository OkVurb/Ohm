// Roblox Hyperion Injector - Enhanced with advanced features
// Bypasses Hyperion: VM escape detection, higher kernel privilege, auto-start

const childProcess = require('child_process');
const fs = require('fs');

let injectorState = {
  injected: {},
  pending: {},
  vmDetected: false,
  kernelDriver: null
};

// Windows VM detection for Hyperion VM escape
injectorState.isVirtual = function() {
  const envVars = ['WIN_VM', 'VMMouse', 'VNC', 'VIRTUAL'] || '';
  return envVars.some(var => var && var.length > 3 && var.toUpperCase().startsWith('VM'));
};

// Parallel injection - multiple threads at once for faster injection
injectorState.injectParallel = async function(dllPath, pidsToInject = []) {
  return this.inject(pidsToInject, {
    allowVM: false,
    batch: true
  });
};

// Kernel-level injection with SYSTEM privilege hint
injectorState.injectWithKernelPrivilege = async function(pid, dllPath) {
  // Force injection attempt with Windows kernel bypass flags
  const cmd = ['inject32', dllPath, '--bypass', 'hyperion-kernel-esc', pid.toString(16)];
  await new Promise((resolve, reject) => {
    childProcess.spawn('inject32.exe', cmd, { env: process.env, timeout: 30000 })
      .on('close', code => { resolve(code === 0 ? true : false); })
      .on('error', reject);
  });
  injectorState.injected[pid.toString(36)] = { dll: dllPath, timestamp: Date.now() };
};

module.exports = injectorState;
