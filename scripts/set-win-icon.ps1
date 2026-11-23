param(
    [Parameter(Mandatory, Position = 0)][string]$Executable,
    [Parameter(Mandatory, Position = 1)][string]$Icon
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class WindowsIcon
{
    private delegate bool ResourceNameCallback(IntPtr module, IntPtr type, IntPtr name, IntPtr data);
    private delegate bool ResourceLanguageCallback(IntPtr module, IntPtr type, IntPtr name, ushort language, IntPtr data);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll", EntryPoint = "EnumResourceNamesW", SetLastError = true)]
    private static extern bool EnumResourceNames(IntPtr module, IntPtr type, ResourceNameCallback callback, IntPtr data);
    [DllImport("kernel32.dll", EntryPoint = "EnumResourceLanguagesW", SetLastError = true)]
    private static extern bool EnumResourceLanguages(IntPtr module, IntPtr type, IntPtr name, ResourceLanguageCallback callback, IntPtr data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr BeginUpdateResource(string file, bool deleteExistingResources);
    [DllImport("kernel32.dll", EntryPoint = "UpdateResourceW", SetLastError = true)]
    private static extern bool UpdateResource(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool EndUpdateResource(IntPtr handle, bool discard);

    private static readonly IntPtr IconType = new IntPtr(3);
    private static readonly IntPtr GroupType = new IntPtr(14);

    public static void Embed(string executable, string icon)
    {
        byte[] source = File.ReadAllBytes(icon);
        int count = BitConverter.ToUInt16(source, 4);
        if (BitConverter.ToUInt16(source, 0) != 0 || BitConverter.ToUInt16(source, 2) != 1 || count == 0)
            throw new InvalidDataException("Expected a Windows ICO file.");

        IntPtr group = IntPtr.Zero;
        var languages = new List<ushort>();
        var existingIcons = new HashSet<long>();
        // LOAD_LIBRARY_AS_DATAFILE maps the PE resources without running the executable.
        IntPtr module = LoadLibraryEx(executable, IntPtr.Zero, 2);
        if (module == IntPtr.Zero) throw new Win32Exception();
        try
        {
            EnumResourceNames(module, GroupType, (m, t, name, data) => {
                if (group == IntPtr.Zero && name.ToInt64() <= ushort.MaxValue) group = name;
                return true;
            }, IntPtr.Zero);
            if (group == IntPtr.Zero) throw new InvalidDataException("Electron has no numbered icon group.");
            if (!EnumResourceLanguages(module, GroupType, group, (m, t, n, language, data) => {
                languages.Add(language);
                return true;
            }, IntPtr.Zero)) throw new Win32Exception();
            EnumResourceNames(module, IconType, (m, t, name, data) => {
                existingIcons.Add(name.ToInt64());
                return true;
            }, IntPtr.Zero);
        }
        finally { FreeLibrary(module); }

        IntPtr update = BeginUpdateResource(executable, false);
        if (update == IntPtr.Zero) throw new Win32Exception();
        bool discard = true;
        try
        {
            using (var buffer = new MemoryStream())
            using (var writer = new BinaryWriter(buffer))
            {
                writer.Write(source, 0, 6);
                ushort id = 1000;
                for (int index = 0; index < count; index++)
                {
                    int entry = 6 + index * 16;
                    int length = BitConverter.ToInt32(source, entry + 8);
                    int offset = BitConverter.ToInt32(source, entry + 12);
                    var pixels = new byte[length];
                    Buffer.BlockCopy(source, offset, pixels, 0, length);
                    while (existingIcons.Contains(id)) id++;
                    writer.Write(source, entry, 12);
                    writer.Write(id);
                    foreach (ushort language in languages)
                        Write(update, IconType, new IntPtr(id), language, pixels);
                    id++;
                }
                byte[] directory = buffer.ToArray();
                foreach (ushort language in languages)
                    Write(update, GroupType, group, language, directory);
            }
            discard = false;
        }
        finally
        {
            if (!EndUpdateResource(update, discard) && !discard) throw new Win32Exception();
        }
    }

    private static void Write(IntPtr update, IntPtr type, IntPtr id, ushort language, byte[] data)
    {
        if (!UpdateResource(update, type, id, language, data, (uint)data.Length))
            throw new Win32Exception();
    }
}
'@

[WindowsIcon]::Embed((Resolve-Path -LiteralPath $Executable).Path, (Resolve-Path -LiteralPath $Icon).Path)
