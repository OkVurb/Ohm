# Injector Integration

This module handles the Roblox DLL injection with bypass of Byfron/Hyperion anti-cheat.
It integrates directly with Ohm's application framework and includes kernel-mode driver support.

## Features
- Selects running Roblox processes 
- Supports multiple injection methods (kernel-mode driver, manual mapping)
- Bypasses Hyperion's CFG protections
- Multi-process injection capability
- Comprehensive error handling

## Files
- `electron/injector.cjs` - Electron backend for injector operations
- `src/injector/injection.js` - Frontend UI integration