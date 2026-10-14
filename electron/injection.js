// electron/injection.js - Export injection API for Electron IPC
// Re-exports from src/injector/injection.js for Electron window.ohm integration

const fs = require('fs');
const path = require('path');
const { RobloxInjector } = require('../src/injector/injection');

const injector = new RobloxInjector();

// Export the API functions that will be used by Electron IPC handlers
module.exports = {
  status: function() {
    return { available: false, code: 'BACKEND_UNAVAILABLE', message: 'No compatible live execution backend is configured.' };
  },
  inject: function(pid, dllPath, bypassCfG) {
    return injector.inject(pid, dllPath, bypassCfG);
  },
  uninject: function(pid) {
    return injector.unload(pid);
  },
  list: function() {
    return injector.list();
  },
  unloadAll: function() {
    return injector.unloadAll();
  },
  injectFromDirectory: async function(directory) {
    if (!module.exports.status().available) return injectFromDirectory._detectAndInject();
    if (!directory) {
      // Try to auto-detect Roblox installation
      return injectFromDirectory._detectAndInject();
    }
    
    try {
      // Discover DLLs in the directory
      const dllFiles = await injectFromDirectory._discoverDLLs(directory);
      
      if (!dllFiles || dllFiles.length === 0) {
        return { success: false, error: `No DLLs found in ${directory}` };
      }
      
      // Use the first DLL
      const dllToInject = dllFiles[0];
      const result = await inject.inject(dllToInject);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  injectFromDllDirectory: async function(directory) {
    if (!module.exports.status().available) return injectFromDirectory._detectAndInject();
    // Direct function - same logic as injectFromDirectory._injectFromDll
    if (!directory) {
      return injectFromDirectory._detectAndInject();
    }
    
    const dllFiles = await injectFromDirectory._discoverDLLs(directory);
    if (!dllFiles || dllFiles.length === 0) {
      return { success: false, error: `No DLLs found in ${directory}` };
    }
    
    const dllToInject = dllFiles[0];
    const result = await inject.inject(dllToInject);
    return {
      success: result.success,
      dll: dllToInject,
      dllName: path.basename(dllToInject),
      message: `✓ Injected ${path.basename(dllToInject)}`
    };
  }
};

// These are local bindings; object properties do not declare variables.
const inject = module.exports;
const injectFromDirectory = module.exports.injectFromDirectory;
injectFromDirectory._detectAndInject = async function() {
  return { success: false, code: 'BACKEND_UNAVAILABLE', error: module.exports.status().message };
};

// Private helper to detect and inject from Roblox's folder
injectFromDirectory._injectFromDll = async function(dllPath) {
  const dllName = path.basename(dllPath);
  try {
    const result = await inject.inject(dllPath);
    return {
      success: result.success,
      dll: dllPath,
      dllName,
      message: `✓ Injected ${dllName}`
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// EXTERNAL FUNCTION: Public alias for injecting DLL from directory path
injectFromDirectory.injectFromDllDirectory = async function(directory) {
  // Use the internal private method
  return await injectFromDirectory._injectFromDll(directory);
};

// Automatically inject DLLs from AutoExec folder
injectFromDirectory._injectFromAutoExec = async function(autoExecPath) {
  try {
    const dlls = await injectFromDirectory._discoverDLLs(autoExecPath);
    if (!dlls.length) {
      return { success: false, error: 'AutoExec folder exists but has no DLLs' };
    }
    const results = [];
    for (const dll of dlls) {
      const result = await injectFromDirectory._injectFromDll(dll);
      results.push(result);
    }
    return { success: true, results, autoInjected: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// Helper to discover DLL files in a directory
injectFromDirectory._discoverDLLs = async function(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return new Promise((resolve) => {
    fs.readdir(dirPath, async (err, files) => {
      if (err) {
        resolve([]);
        return;
      }
      
      const dlls = [];
      for (const f of files) {
        if (f.endsWith('.dll')) {
          dlls.push(path.join(dirPath, f));
        }
      }
      resolve(dlls);
    });
  });
};
