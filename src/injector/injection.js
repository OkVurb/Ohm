// Roblox DLL Injector API - UI Bridge
// Injects DLL into Roblox processes via kernel driver for Hyperion/CFG bypass

class RobloxInjector {
  constructor() {
    this.injected = new Map();
    this.pending = new Map();
  }

  /**
   * Inject DLL into Roblox process
   * @param {number} pid - Process ID
   * @param {string} dllPath - Local path to DLL
   * @param {boolean} bypassCfG - Enable CFG bypass (true for Hyperion-protected)
   * @returns {Promise<Object>} - { success, pid, dll, timestamp, message }
   */
  async inject(pid, dllPath, bypassCfG = true) {
    try {
      if (typeof pid !== 'number' || pid < 1) throw new Error('Invalid PID');
      if (!dllPath || dllPath.length > 1024) throw new Error('Invalid DLL path');
      if (typeof bypassCfG !== 'boolean') bypassCfG = true;

      await window.ohm.injectRoblox({ pid, dllPath, bypassCfG });

      const entry = { pid, dll: dllPath, timestamp: Date.now() };
      this.injected.set(entry.pid, entry);
      
      log(`[Injector] Injected ${dllPath} into PID ${pid}`);

      return { success: true, pid, dll: dllPath, timestamp: entry.timestamp };
    } catch (err) {
      const entry = { pid, dll: dllPath, timestamp: Date.now(), error: err.message };
      this.pending.set(entry.pid, entry);
      log(`[Injector] Failed to inject PID ${pid}: ${err.message}`, 'error');
      return { success: false, pid, error: err.message };
    }
  }

  /**
   * List all injected DLLs
   * @returns {Array<Object>} - Array of injection entries
   */
  list() {
    return Array.from(this.injected.entries())
      .sort((a, b) => a[0] - b[0]);
  }

  /**
   * Remove injection from a process
   * @param {number} pid - Process ID to remove
   * @returns {boolean} - True if removed
   */
  async unload(pid) {
    try {
      await window.ohm.uninjectRoblox(pid);
      this.injected.delete(pid);
      return true;
    } catch {
      this.pending.delete(pid);
      return false;
    }
  }

  /**
   * Remove all injections
   */
  async unloadAll() {
    const pids = [...this.injected.keys()];
    for (const pid of pids) {
      await this.unload(pid);
    }
  }
}

// Export global instances
window.robloxInjector = new RobloxInjector();
