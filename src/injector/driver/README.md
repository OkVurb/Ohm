# Kernel Driver

This directory contains the driver code and build configuration for the 
Roblox injector kernel-mode driver that bypasses Byfron/Hyperion protections.

The driver implements bypass techniques for Windows Control Flow Guard (CFG) to 
allow DLL injection into Hyperion-protected Roblox processes.

## Files
- `driver.c` - Driver entry point and main logic
- `driver.h` - Header file with declarations
- `build.sln` - Visual Studio solution for building the driver
- `build.vcxproj` - Project configuration for driver compilation