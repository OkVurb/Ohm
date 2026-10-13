// Roblox DLL Injector API - UI Bridge
// Injects DLL into Roblox processes via kernel driver for Hyperion/CFG bypass

class RobloxInjector {
  constructor() {
    // This bridge may be imported in Electron's main process, without a window.
    this.api = typeof window === 'undefined' ? null : window.ohm;
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

      if (typeof this.api?.injectRoblox !== 'function') {
        throw new Error('No compatible live execution backend is configured.');
      }
      const result = await this.api.injectRoblox({ pid, dllPath, bypassCfG });
      if (result?.success !== true) throw new Error(result?.error || 'Backend did not confirm injection');

      const entry = { pid, dll: dllPath, timestamp: Date.now() };
      this.injected.set(entry.pid, entry);
      
      this.pending.delete(pid);

      return { success: true, pid, dll: dllPath, timestamp: entry.timestamp };
    } catch (err) {
      const entry = { pid, dll: dllPath, timestamp: Date.now(), error: err.message };
      this.pending.set(entry.pid, entry);

      return { success: false, pid, error: err.message };
    }
  }

  /**
   * List all injected DLLs
   * @returns {Array<Object>} - Array of injection entries
   */
  list() {
    return Array.from(this.injected.values())
      .sort((a, b) => a.pid - b.pid);
  }

  /**
   * Remove injection from a process
   * @param {number} pid - Process ID to remove
   * @returns {boolean} - True if removed
   */
  async unload(pid) {
    try {
      if (typeof this.api?.uninjectRoblox !== 'function') return false;
      const result = await this.api.uninjectRoblox(pid);
      if (result !== true && result?.success !== true) return false;
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
if (typeof module !== 'undefined') module.exports = { RobloxInjector };
if (typeof window !== 'undefined') window.robloxInjector = new RobloxInjector();
