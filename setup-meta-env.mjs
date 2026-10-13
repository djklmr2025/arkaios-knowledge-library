#!/usr/bin/env node
// setup-meta-env.mjs
// Uso: node setup-meta-env.mjs
// Requiere Node 18+. Corre SOLO en tu máquina.
//
// Pide App ID, App Secret y el token corto del Graph API Explorer,
// obtiene el token largo y el token de tu página, y escribe .env.
// Nunca imprime tokens ni secretos.

import fs from "node:fs";
import readline from "node:readline";

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || "v26.0"}`;
const ENV_PATH = ".env";

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        // muestra la pregunta pero no lo que se escribe
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim().replace(/^["']|["']$/g, ""));
    });
  });
}

async function graph(path, params) {
  const url = `${GRAPH}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    throw new Error(`Graph API: ${e.message || res.status} (código ${e.code ?? "?"}${e.error_subcode ? "/" + e.error_subcode : ""})`);
  }
  return body;
}

function upsertEnv(values) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  if (!text.includes("META GRAPH API CREDENTIALS")) {
    text += (text && !text.endsWith("\n") ? "\n" : "") + "# META GRAPH API CREDENTIALS (LOCAL ONLY - NEVER COMMITTED)\n";
  }
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, "m");
    text = re.test(text) ? text.replace(re, line) : text + (text.endsWith("\n") ? "" : "\n") + line + "\n";
  }
  fs.writeFileSync(ENV_PATH, text, { mode: 0o600 });
  try { fs.chmodSync(ENV_PATH, 0o600); } catch {}
}

function ensureGitignore() {
  const p = ".gitignore";
  const text = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  if (!/^\.env\s*$/m.test(text)) {
    fs.appendFileSync(p, (text && !text.endsWith("\n") ? "\n" : "") + ".env\n");
    console.log("• Agregué .env a .gitignore");
  }
}

async function main() {
  console.log("Meta Graph API → .env (nada se muestra ni se envía a terceros)\n");
  ensureGitignore();

  const appId = await ask("App ID: ");
  const appSecret = await ask("App Secret (oculto): ", { hidden: true });
  const shortToken = await ask("Token corto del Explorador (oculto): ", { hidden: true });
  if (!appId || !appSecret || !shortToken) throw new Error("Faltan datos.");

  console.log("\n1/3 Cambiando por token largo de usuario…");
  const long = await graph("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  console.log("2/3 Pidiendo tokens de tus páginas…");
  const pages = await graph("/me/accounts", {
    fields: "id,name,access_token",
    access_token: long.access_token,
  });
  if (!pages.data?.length) {
    throw new Error("No salió ninguna página. Genera el token otra vez y marca tu fanpage en la ventana de Facebook.");
  }

  let page = pages.data[0];
  if (pages.data.length > 1) {
    pages.data.forEach((p, i) => console.log(`  [${i + 1}] ${p.name} (${p.id})`));
    const n = parseInt(await ask("Elige el número de tu fanpage: "), 10);
    page = pages.data[n - 1];
    if (!page) throw new Error("Selección inválida.");
  }

  console.log("3/3 Escribiendo .env…");
  upsertEnv({
    META_APP_ID: appId,
    META_APP_SECRET: appSecret,
    META_USER_TOKEN: long.access_token,
    FACEBOOK_PAGE_TOKEN: page.access_token,
    FACEBOOK_PAGE_ID: page.id,
  });

  // Prueba de lectura rápida (no imprime el token)
  const test = await graph(`/${page.id}/posts`, {
    fields: "id",
    limit: "1",
    access_token: page.access_token,
  });

  console.log(`\n✔ Listo. Página: ${page.name} (id ${page.id})`);
  console.log(`✔ Lectura de posts: ${test.data?.length ? "funciona" : "sin posts devueltos (revisa permisos si esperabas ver alguno)"}`);
  console.log("✔ .env creado con permisos restringidos. No lo subas a git.");
}

main().catch((e) => {
  console.error("\n✖", e.message);
  process.exit(1);
});
