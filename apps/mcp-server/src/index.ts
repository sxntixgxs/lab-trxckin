#!/usr/bin/env node
import { existsSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { leerConfig } from "./config.js";
import { crearLabData } from "./lab-data.js";
import { crearServidor } from "./server.js";

// Local runs read apps/mcp-server/.env; MCP clients usually pass the variables themselves.
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

// stdout carries the protocol, so anything human-readable goes to stderr.
try {
  const config = leerConfig();
  const server = crearServidor(crearLabData(config));
  await server.connect(new StdioServerTransport());
  console.error(`lab-trxckin MCP server ready (stdio; supplier catalog ${config.api ? "on" : "off"})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
