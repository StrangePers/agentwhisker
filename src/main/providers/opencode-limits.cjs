"use strict";

const {connectOpenCodeService} = require("./opencode-service.cjs");
const {createLimitsSource} = require("./limits-source.cjs");

const PERIODS = [["rolling","five_hour",300], ["weekly","seven_day",10080], ["monthly","month",null]];

function normalizeGoLimits(go, now = new Date()) {
    return PERIODS.flatMap(([field,id,minutes]) => {
        const meter = go?.[field];
        if (!meter || !Number.isFinite(meter.percent) || meter.percent < 0 || meter.percent > 100) return [];
        const reset = Number.isFinite(meter.resetsAt) && meter.resetsAt > 0 ? new Date(meter.resetsAt) : null;
        return [{id, kind:id, window_minutes:minutes, remaining_percent:meter.limited === true ? 0 : 100 - meter.percent,
            resets_at:reset && Number.isFinite(+reset) ? reset.toISOString() : null,
            status:reset && +reset <= +now ? "expired" : "known"}];
    });
}

function createOpenCodeLimits(serviceFile) {
    return createLimitsSource(async () => {
        let request;
        try { request = await connectOpenCodeService(serviceFile); }
        catch (error) {
            if (error.code !== "ENOENT") throw error;
            return {providers:[],unavailable:"opencode_service"};
        }
        const response = await request("/api/experimental/usage/limits", 8000);
        if (response.status === 404) return {providers:[],unavailable:"opencode_version"};
        if (!response.ok) throw new Error("Could not read OpenCode limits");
        const envelope = await response.json();
        if (!envelope || !Object.hasOwn(envelope,"data")) throw new Error("Invalid OpenCode limits response");
        const windows = normalizeGoLimits(envelope.data?.go);
        return windows.length ? {providers:[{id:"opencode_go",name:"OpenCode Go",connected:true,status:"known",
            observed_at:new Date().toISOString(),windows}]} : {providers:[],unavailable:"opencode_go_account"};
    });
}

module.exports = {createOpenCodeLimits,normalizeGoLimits};
