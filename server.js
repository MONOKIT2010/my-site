const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_TO = process.env.EMAIL_TO;
const EMAIL_FROM = process.env.EMAIL_FROM;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const PUBLIC_ROOT = __dirname;
const PUBLIC_DIRS = [PUBLIC_ROOT];
const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8"
};

function isInsideAnyDir(targetPath, directories) {
    return directories.some((baseDir) => {
        const relativePath = path.relative(baseDir, targetPath);
        return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
    });
}

function resolvePublicFilePath(relativePath) {
    return path.resolve(PUBLIC_ROOT, relativePath);
}

function loadEnvFile() {
    let contents;
    try {
        contents = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
    }

    for (const line of contents.split(/\r?\n/)) {
        const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!match || process.env[match[1]] !== undefined) continue;

        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
            if (match[2].startsWith('"')) value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
        } else {
            value = value.replace(/\s+#.*$/, "").trim();
        }
        process.env[match[1]] = value;
    }
}

function sendJson(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;

        req.on("data", (chunk) => {
            size += chunk.length;
            if (size <= 100_000) chunks.push(chunk);
        });
        req.on("end", () => {
            if (size > 100_000) {
                const error = new Error("Request body is too large");
                error.statusCode = 413;
                reject(error);
                return;
            }
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            } catch {
                const error = new Error("Invalid JSON body");
                error.statusCode = 400;
                reject(error);
            }
        });
        req.on("error", reject);
    });
}

async function sendTelegramMessage(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        throw new Error("Telegram bot is not configured");
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            disable_web_page_preview: true
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
        const errorMessage = data.description || response.statusText || "Telegram send failed";
        throw new Error(errorMessage);
    }
}

async function sendEmailMessage(message) {
    if (!RESEND_API_KEY || !EMAIL_TO || !EMAIL_FROM) {
        throw new Error("Resend email is not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: EMAIL_FROM,
            to: [EMAIL_TO],
            subject: "План побачення підтверджено",
            text: message
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const errorMessage = data.message || response.statusText || "Email send failed";
        throw new Error(errorMessage);
    }
}

async function handleSendResult(req, res) {
    const { place, food, day } = await readJsonBody(req);
    if (!place || !food || !day) {
        sendJson(res, 400, { success: false, message: "Заповніть всі поля" });
        return;
    }

    const emailConfig = [RESEND_API_KEY, EMAIL_TO, EMAIL_FROM];
    const emailConfigured = emailConfig.every(Boolean);
    const emailPartiallyConfigured = emailConfig.some(Boolean) && !emailConfigured;
    const telegramConfig = [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID];
    const telegramConfigured = telegramConfig.every(Boolean);
    const telegramPartiallyConfigured = telegramConfig.some(Boolean) && !telegramConfigured;

    if (!emailConfigured && !telegramConfigured) {
        const missing = [];
        if (emailPartiallyConfigured) missing.push("RESEND_API_KEY, EMAIL_TO і EMAIL_FROM");
        if (telegramPartiallyConfigured) missing.push("TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID");
        if (!missing.length) {
            missing.push("TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID або RESEND_API_KEY, EMAIL_TO, EMAIL_FROM");
        }
        sendJson(res, 503, {
            success: false,
            message: `Налаштуйте хоча б один канал: ${missing.join("; ")}`
        });
        return;
    }

    const message = `💌 НОВЕ ЗАПРОШЕННЯ!\n\n❤️ Вона погодилася!\n\n📍 Місце:\n${place}\n\n🍔 Їжа:\n${food}\n\n📅 День:\n${day}\n\n🥰 План підтверджено!`;

    const sentChannels = [];
    const deliveryErrors = [];

    for (const [channel, sender] of [
        ["telegram", () => sendTelegramMessage(message)],
        ["email", () => sendEmailMessage(message)]
    ]) {
        if (channel === "telegram" && !telegramConfigured) continue;
        if (channel === "email" && !emailConfigured) continue;

        try {
            await sender();
            sentChannels.push(channel);
            console.log(`Сповіщення надіслано через ${channel}.`);
        } catch (error) {
            deliveryErrors.push(`${channel}: ${error.message}`);
            console.error(`${channel} delivery failed:`, error.message);
        }
    }

    if (sentChannels.length > 0) {
        sendJson(res, 200, { success: true, channels: sentChannels });
        return;
    }

    sendJson(res, 502, {
        success: false,
        channels: [],
        message: deliveryErrors.join("; ") || "Не вдалося надіслати сповіщення"
    });
}

async function handleRequest(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "POST" && requestUrl.pathname === "/api/send-result") {
        await handleSendResult(req, res);
        return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
        sendJson(res, 405, { success: false, message: "Method not allowed" });
        return;
    }

    const requestedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
    const filePath = resolvePublicFilePath(relativePath);
    if (!isInsideAnyDir(filePath, PUBLIC_DIRS)) {
        res.writeHead(403).end("Forbidden");
        return;
    }

    try {
        const contents = await fs.promises.readFile(filePath);
        res.writeHead(200, {
            "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff"
        });
        res.end(req.method === "HEAD" ? undefined : contents);
    } catch (error) {
        if (error.code === "ENOENT" || error.code === "EISDIR") {
            res.writeHead(404).end("Not found");
            return;
        }
        throw error;
    }
}

const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
        if (res.headersSent) {
            res.destroy(error);
            return;
        }
        sendJson(res, error.statusCode || 500, { success: false, message: error.message });
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Запрошення запущено:");
    console.log(`На цьому комп’ютері: http://localhost:${PORT}`);
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses || []) {
            if (address.family === "IPv4" && !address.internal) {
                console.log(`На телефоні в цій Wi-Fi мережі: http://${address.address}:${PORT}`);
            }
        }
    }
});
