"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readActivity = readActivity;
const index_1 = require("./providers/index");
async function readActivity(options) {
    return (0, index_1.readProviderActivity)(options);
}
