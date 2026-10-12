#ifndef DRIVER_H
#define DRIVER_H

#ifdef __cplusplus
extern "C" {
#endif

// Driver interface functions for Roblox DLL injection with Hyperion bypass
NTSTATUS InitializeDriver(PDRIVER_OBJECT DriverObject);
void UnloadDriver(PDRIVER_OBJECT DriverObject);

// Injection methods
NTSTATUS InjectDLLToProcess(HANDLE ProcessHandle, LPCWSTR DllPath);
NTSTATUS InjectDLLToProcessByPID(ULONG ProcessId, LPCWSTR DllPath);
NTSTATUS InjectMultipleDLLs(PLONG ProcessIds, ULONG Count, LPCWSTR DllPath);

// Hyperion bypass functions
BOOLEAN BypassCFGCache();
BOOLEAN BypassCFGGuard(PEPROCESS Process);
BOOLEAN DisableKernelProtection();

// Process utility functions
HANDLE GetProcessHandleById(ULONG ProcessId);
NTSTATUS EnumerateProcesses(PULONG* ProcessList, PULONG Count);
BOOLEAN IsRobloxProcess(HANDLE ProcessHandle);

// Error handling
NTSTATUS GetLastError();
void ClearLastError();

#ifdef __cplusplus
}
#endif

#endif // DRIVER_H