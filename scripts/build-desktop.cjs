"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {packager} = require("@electron/packager");
const pkg = require("../package.json");

const root = path.resolve(__dirname, "..");
const platform = process.platform;
const arch = process.arch;
const payload = ["src", "characters", "package.json", "LICENSE", "ARTWORK.md", "NOTICE.md"];
const output = path.resolve(process.env.AGENTWHISKER_DIST_DIR || path.join(root, "dist"));

async function buildMacIcon(temporary) {
    const iconset = path.join(temporary, "AgentWhisker.iconset");
    await fs.mkdir(iconset);
    const brand = path.join(root, "docs/media/agentwhisker.png");
    for (const size of [16, 32, 128, 256, 512]) {
        for (const scale of [1, 2]) {
            const suffix = scale === 2 ? "@2x" : "";
            const pixels = String(size * scale);
            execFileSync("sips", ["-z", pixels, pixels, brand, "--out",
                path.join(iconset, `icon_${size}x${size}${suffix}.png`)], {stdio:"ignore"});
        }
    }
    const icon = path.join(temporary, "AgentWhisker.icns");
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", icon]);
    return icon;
}

async function main() {
    if (!((platform === "linux" && arch === "x64") || (platform === "darwin" && arch === "arm64"))) {
        throw new Error("Use a native Linux x64 or macOS arm64 host. On Windows, run npm run build:win.");
    }
    const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "agentwhisker-desktop-build-"));
    try {
        const input = path.join(scratch, "app");
        await fs.mkdir(input);
        for (const entry of payload) await fs.cp(path.join(root, entry), path.join(input, entry), {recursive:true});
        const mac = platform === "darwin";
        const [destination] = await packager({
            dir:input, name:pkg.productName, platform, arch, out:output, overwrite:true,
            electronVersion:pkg.devDependencies.electron, appVersion:pkg.version,
            electronZipDir:process.env.AGENTWHISKER_ELECTRON_ZIP_DIR,
            ...(mac ? {appBundleId:"com.chronocatlabs.agentwhisker", extendInfo:{LSUIElement:true},
                icon:await buildMacIcon(scratch)} : {}),
        });
        const exe = mac ? path.join(destination, `${pkg.productName}.app`, "Contents", "MacOS", pkg.productName)
            : path.join(destination, pkg.productName);
        const app = mac ? path.join(destination, `${pkg.productName}.app`) : null;
        if (app) {
            execFileSync("codesign", ["--force", "--deep", "--sign", "-", app]);
            execFileSync("codesign", ["--verify", "--deep", "--strict", app]);
        }
        await fs.access(exe, fs.constants.X_OK);
        console.log(exe);
    } finally {
        await fs.rm(scratch, {recursive:true, force:true});
    }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
