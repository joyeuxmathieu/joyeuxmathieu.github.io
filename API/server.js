import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

const PORT = process.env.PORT || 10000;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

const DISCORD_GUILD_ID =
    process.env.DISCORD_GUILD_ID || "1496186723527426290";

const DISCORD_REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI ||
    "https://api.alphark.fr/auth/discord/callback";

/*
 * =========================================================
 * SALONS DISCORD
 * =========================================================
 */

const PATCH_CHANNEL_ID =
    process.env.PATCH_CHANNEL_ID || "1497971812267462708";

const NEWS_CHANNEL_ID =
    process.env.NEWS_CHANNEL_ID || "1547237082123079700";

/*
 * =========================================================
 * CORS
 * =========================================================
 */

const allowedOrigins = [
    "https://alphark.fr",
    "https://www.alphark.fr",
    "https://joyeuxmathieu.github.io"
];

app.use(
    cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Origine non autorisée"));
            }
        },
        credentials: true
    })
);

/*
 * =========================================================
 * SESSION
 * =========================================================
 */

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            crypto.randomBytes(32).toString("hex"),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            domain: ".alphark.fr",
            maxAge: 7 * 24 * 60 * 60 * 1000
        }
    })
);

/*
 * =========================================================
 * DISCORD API
 * =========================================================
 */

const DISCORD_API = "https://discord.com/api/v10";

function discordHeaders() {
    return {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "User-Agent": "ALPHARK-API/2.1"
    };
}

/*
 * =========================================================
 * CACHE DISCORD
 * =========================================================
 */

let latestPatchCache = null;
let latestPatchCacheTime = 0;

let latestNewsCache = null;
let latestNewsCacheTime = 0;

let discordRateLimitedUntil = 0;

const PATCH_CACHE_MS = 5 * 60 * 1000;
const NEWS_CACHE_MS = 5 * 60 * 1000;

/*
 * Appel sécurisé à Discord.
 * En cas de 429, on mémorise temporairement le blocage.
 */

async function discordFetch(url, options = {}) {
    if (!DISCORD_BOT_TOKEN) {
        throw new Error("DISCORD_BOT_TOKEN manquant.");
    }

    if (discordRateLimitedUntil > Date.now()) {
        const error = new Error("DISCORD_RATE_LIMITED");
        error.status = 429;
        error.retryAfterSeconds = Math.ceil(
            (discordRateLimitedUntil - Date.now()) / 1000
        );
        throw error;
    }

    const response = await fetch(url, {
        ...options,
        headers: {
            ...discordHeaders(),
            ...(options.headers || {})
        }
    });

    if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        let retryAfterSeconds = Number(retryAfterHeader || 0);

        let bodyText = "";

        try {
            bodyText = await response.text();
            const body = JSON.parse(bodyText);

            if (body?.retry_after) {
                retryAfterSeconds = Number(body.retry_after);
            }
        } catch {
            // Discord/Cloudflare peut retourner du HTML.
        }

        if (
            !Number.isFinite(retryAfterSeconds) ||
            retryAfterSeconds <= 0
        ) {
            retryAfterSeconds = 300;
        }

        discordRateLimitedUntil =
            Date.now() + Math.ceil(retryAfterSeconds * 1000);

        const error = new Error("DISCORD_RATE_LIMITED");
        error.status = 429;
        error.retryAfterSeconds = Math.ceil(retryAfterSeconds);

        throw error;
    }

    return response;
}

/*
 * =========================================================
 * ROUTE PRINCIPALE
 * =========================================================
 */

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.1.0",
        guild: DISCORD_GUILD_ID,
        patchChannel: PATCH_CHANNEL_ID,
        newsChannel: NEWS_CHANNEL_ID
    });
});

/*
 * =========================================================
 * DISCORD STATUS
 * =========================================================
 */

app.get("/api/discord-status", async (req, res) => {
    try {
        const response = await discordFetch(
            `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}`
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `Discord a répondu ${response.status}.`
            });
        }

        const guild = await response.json();

        res.json({
            success: true,
            online: true,
            guild: {
                id: guild.id,
                name: guild.name,
                icon: guild.icon
            }
        });
    } catch (error) {
        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds: error.retryAfterSeconds
            });
        }

        console.error("❌ Discord status:", error);

        res.status(500).json({
            success: false,
            error: "Impossible de contacter Discord."
        });
    }
});

/*
 * =========================================================
 * OAUTH DISCORD
 * =========================================================
 */

app.get("/auth/discord", (req, res) => {
    const state = crypto.randomBytes(24).toString("hex");

    req.session.oauthState = state;

    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        response_type: "code",
        redirect_uri: DISCORD_REDIRECT_URI,
        scope: "identify",
        state
    });

    res.redirect(
        `https://discord.com/oauth2/authorize?${params.toString()}`
    );
});

/*
 * =========================================================
 * CALLBACK OAUTH
 * =========================================================
 */

app.get("/auth/discord/callback", async (req, res) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).send("Code Discord manquant.");
        }

        if (!state || state !== req.session.oauthState) {
            return res.status(400).send("Session OAuth invalide.");
        }

        delete req.session.oauthState;

        const tokenResponse = await fetch(
            `${DISCORD_API}/oauth2/token`,
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded",
                    "User-Agent": "ALPHARK-API/2.1"
                },
                body: new URLSearchParams({
                    client_id: DISCORD_CLIENT_ID,
                    client_secret: DISCORD_CLIENT_SECRET,
                    grant_type: "authorization_code",
                    code,
                    redirect_uri: DISCORD_REDIRECT_URI
                })
            }
        );

        if (!tokenResponse.ok) {
            const text = await tokenResponse.text();

            console.error(
                "❌ OAuth Discord:",
                tokenResponse.status,
                text.slice(0, 500)
            );

            return res.status(502).send(
                `Discord OAuth indisponible (${tokenResponse.status}). Réessaie plus tard.`
            );
        }

        const tokenData = await tokenResponse.json();

        const userResponse = await fetch(
            `${DISCORD_API}/users/@me`,
            {
                headers: {
                    Authorization:
                        `Bearer ${tokenData.access_token}`,
                    "User-Agent": "ALPHARK-API/2.1"
                }
            }
        );

        if (!userResponse.ok) {
            return res.status(502).send(
                "Impossible de récupérer ton compte Discord."
            );
        }

        const user = await userResponse.json();

        /*
         * Vérification que le joueur appartient au serveur ALPHARK.
         */

        const memberResponse = await discordFetch(
            `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members/${user.id}`
        );

        if (!memberResponse.ok) {
            if (memberResponse.status === 404) {
                return res.status(403).send(
                    "Tu dois être membre du serveur Discord ALPHARK pour te connecter."
                );
            }

            return res.status(memberResponse.status).send(
                "Impossible de vérifier ton appartenance au serveur ALPHARK."
            );
        }

        const member = await memberResponse.json();

        req.session.user = {
            id: user.id,
            username: user.username,
            global_name: user.global_name,
            avatar: user.avatar,
            discriminator: user.discriminator,
            roles: member.roles || [],
            joined_at: member.joined_at || null
        };

        req.session.save(() => {
            res.redirect("https://www.alphark.fr/");
        });
    } catch (error) {
        if (error.status === 429) {
            return res.status(429).send(
                `Discord est temporairement limité. Réessaie dans environ ${error.retryAfterSeconds} secondes.`
            );
        }

        console.error("❌ Callback Discord:", error);

        res.status(500).send(
            "Erreur pendant la connexion Discord."
        );
    }
});

/*
 * =========================================================
 * SESSION
 * =========================================================
 */

app.get("/api/session", (req, res) => {
    if (!req.session.user) {
        return res.json({
            connected: false,
            user: null
        });
    }

    res.json({
        connected: true,
        user: req.session.user
    });
});

/*
 * =========================================================
 * ME
 * =========================================================
 */

app.get("/api/me", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            connected: false
        });
    }

    res.json({
        success: true,
        connected: true,
        user: req.session.user
    });
});

/*
 * =========================================================
 * LOGOUT
 * =========================================================
 */

app.get("/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid", {
            domain: ".alphark.fr",
            secure: true,
            sameSite: "none"
        });

        res.redirect("https://www.alphark.fr/");
    });

/*
 * =========================================================
 * PRÉSENCE / JOUEURS EN LIGNE
 * =========================================================
 */

app.get("/api/presence", async (req, res) => {
    try {
        const response = await discordFetch(
            `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members?limit=1000`
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: "Impossible de récupérer les membres Discord."
            });
        }

        const members = await response.json();

        res.json({
            success: true,
            count: members.length
        });
    } catch (error) {
        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds: error.retryAfterSeconds
            });
        }

        console.error("❌ Presence:", error);

        res.status(500).json({
            success: false,
            error: "Erreur présence Discord."
        });
    }
});

app.get("/api/online", async (req, res) => {
    try {
        const response = await discordFetch(
            `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members?limit=1000`
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                online: 0
            });
        }

        const members = await response.json();

        res.json({
            success: true,
            online: members.length
        });
    } catch (error) {
        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                online: 0,
                rateLimited: true
            });
        }

        res.status(500).json({
            success: false,
            online: 0
        });
    }
});

/*
 * =========================================================
 * IMAGE DISCORD
 * =========================================================
 */

function getDiscordMessageImage(message) {
    if (
        message.embeds &&
        message.embeds.length > 0
    ) {
        const embed = message.embeds[0];

        if (embed.image?.url) {
            return embed.image.url;
        }

        if (embed.thumbnail?.url) {
            return embed.thumbnail.url;
        }
    }

    if (
        message.attachments &&
        message.attachments.length > 0
    ) {
        const attachment = message.attachments[0];

        if (
            attachment.content_type?.startsWith("image/") ||
            /\.(jpg|jpeg|png|gif|webp)$/i.test(attachment.url)
        ) {
            return attachment.url;
        }
    }

    return null;
}

/*
 * =========================================================
 * NETTOYAGE TEXTE DISCORD
 * =========================================================
 */

function cleanDiscordText(text = "") {
    return String(text)
        .replace(/\r/g, "")
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/~~/g, "")
        .replace(/`/g, "")
        .replace(/<a?:\w+:\d+>/g, "")
        .trim();
}

/*
 * =========================================================
 * CONSTRUCTION D'UNE ACTUALITÉ
 * =========================================================
 */

function buildDiscordNews(message) {
    const embed =
        message.embeds?.[0] || null;

    const content =
        cleanDiscordText(message.content || "");

    let title = "";

    if (embed?.title) {
        title = cleanDiscordText(embed.title);
    }

    if (!title && content) {
        const lines = content
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        title = lines[0] || "";
    }

    if (!title) {
        title = "Actualité ALPHARK";
    }

    let text = "";

    if (embed?.description) {
        text = cleanDiscordText(embed.description);
    } else if (content) {
        const lines = content
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        text = lines
            .slice(1)
            .join(" ")
            .trim();

        if (!text) {
            text = content;
        }
    }

    if (!text) {
        text = "Nouvelle actualité sur ALPHARK.";
    }

    return {
        id: message.id,

        tag: "ACTUALITÉ",

        tagClass: "update",

        date: message.timestamp
            ? new Date(message.timestamp).toLocaleDateString(
                "fr-FR",
                {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                }
            )
            : "",

        title,

        text,

        image: getDiscordMessageImage(message),

        author: message.author
            ? {
                id: message.author.id,
                username:
                    message.author.global_name ||
                    message.author.username
            }
            : null,

        url:
            `https://discord.com/channels/${DISCORD_GUILD_ID}/${NEWS_CHANNEL_ID}/${message.id}`
    };
}

/*
 * =========================================================
 * DERNIÈRES ACTUALITÉS DISCORD
 * =========================================================
 */

app.get("/api/latest-news", async (req, res) => {
    try {
        /*
         * Retour du cache si disponible.
         */

        if (
            latestNewsCache &&
            Date.now() - latestNewsCacheTime < NEWS_CACHE_MS
        ) {
            return res.json({
                success: true,
                source: "discord",
                cached: true,
                channel: NEWS_CHANNEL_ID,
                news: latestNewsCache
            });
        }

        const response = await discordFetch(
            `${DISCORD_API}/channels/${NEWS_CHANNEL_ID}/messages?limit=20`
        );

        if (!response.ok) {
            const text = await response.text();

            console.error(
                "❌ Discord actualités:",
                response.status,
                text.slice(0, 500)
            );

            /*
             * Si on possède encore un ancien cache,
             * on le retourne plutôt que de casser le site.
             */

            if (latestNewsCache) {
                return res.json({
                    success: true,
                    source: "discord-cache",
                    cached: true,
                    channel: NEWS_CHANNEL_ID,
                    news: latestNewsCache
                });
            }

            return res.status(response.status).json({
                success: false,
                error:
                    "Impossible de récupérer les actualités Discord."
            });
        }

        const messages = await response.json();

        const news = messages
            .filter(message => {
                return (
                    message.content ||
                    message.embeds?.length ||
                    message.attachments?.length
                );
            })
            .map(buildDiscordNews)
            .slice(0, 5);

        latestNewsCache = news;
        latestNewsCacheTime = Date.now();

        res.json({
            success: true,
            source: "discord",
            cached: false,
            channel: NEWS_CHANNEL_ID,
            news
        });
    } catch (error) {
        if (error.status === 429) {
            console.warn(
                `⚠️ Discord rate-limit actualités. Réessai dans ${error.retryAfterSeconds}s.`
            );

            if (latestNewsCache) {
                return res.json({
                    success: true,
                    source: "discord-cache",
                    cached: true,
                    rateLimited: true,
                    channel: NEWS_CHANNEL_ID,
                    news: latestNewsCache
                });
            }

            return res.status(429).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds:
                    error.retryAfterSeconds,
                news: []
            });
        }

        console.error(
            "❌ /api/latest-news:",
            error
        );

        if (latestNewsCache) {
            return res.json({
                success: true,
                source: "discord-cache",
                cached: true,
                channel: NEWS_CHANNEL_ID,
                news: latestNewsCache
            });
        }

        res.status(500).json({
            success: false,
            news: [],
            error:
                "Erreur lors de la récupération des actualités."
        });
    }
});

/*
 * =========================================================
 * DERNIER PATCH ARK
 * =========================================================
 */

app.get("/api/latest-patch", async (req, res) => {
    try {
        if (
            latestPatchCache &&
            Date.now() - latestPatchCacheTime < PATCH_CACHE_MS
        ) {
            return res.json({
                success: true,
                source: "discord",
                cached: true,
                channel: PATCH_CHANNEL_ID,
                patch: latestPatchCache
            });
        }

        const response = await discordFetch(
            `${DISCORD_API}/channels/${PATCH_CHANNEL_ID}/messages?limit=10`
        );

        if (!response.ok) {
            const text = await response.text();

            console.error(
                "❌ Discord patch:",
                response.status,
                text.slice(0, 500)
            );

            if (latestPatchCache) {
                return res.json({
                    success: true,
                    source: "discord-cache",
                    cached: true,
                    channel: PATCH_CHANNEL_ID,
                    patch: latestPatchCache
                });
            }

            return res.status(response.status).json({
                success: false,
                error:
                    "Impossible de récupérer le dernier patch Discord."
            });
        }

        const messages = await response.json();

        const message = messages.find(item => {
            return (
                item.content ||
                item.embeds?.length ||
                item.attachments?.length
            );
        });

        if (!message) {
            return res.json({
                success: true,
                source: "discord",
                channel: PATCH_CHANNEL_ID,
                patch: null
            });
        }

        const embed =
            message.embeds?.[0] || null;

        const content =
            cleanDiscordText(message.content || "");

        let title =
            embed?.title ||
            "";

        let description =
            embed?.description ||
            "";

        if (!title && content) {
            const lines = content
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean);

            title = lines[0] || "Dernier patch ARK";

            description = lines
                .slice(1)
                .join("\n");
        }

        if (!title) {
            title = "Dernier patch ARK";
        }

        if (!description) {
            description =
                "Retrouvez les dernières informations ARK sur notre Discord.";
        }

        const patch = {
            id: message.id,

            title: cleanDiscordText(title),

            description:
                cleanDiscordText(description),

            date: message.timestamp
                ? new Date(
                    message.timestamp
                ).toLocaleDateString(
                    "fr-FR",
                    {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric"
                    }
                )
                : "",

            image:
                getDiscordMessageImage(message),

            url:
                `https://discord.com/channels/${DISCORD_GUILD_ID}/${PATCH_CHANNEL_ID}/${message.id}`
        };

        latestPatchCache = patch;
        latestPatchCacheTime = Date.now();

        res.json({
            success: true,
            source: "discord",
            cached: false,
            channel: PATCH_CHANNEL_ID,
            patch
        });
    } catch (error) {
        if (error.status === 429) {
            console.warn(
                `⚠️ Discord rate-limit patch. Réessai dans ${error.retryAfterSeconds}s.`
            );

            if (latestPatchCache) {
                return res.json({
                    success: true,
                    source: "discord-cache",
                    cached: true,
                    rateLimited: true,
                    channel: PATCH_CHANNEL_ID,
                    patch: latestPatchCache
                });
            }

            return res.status(429).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds:
                    error.retryAfterSeconds,
                patch: null
            });
        }

        console.error(
            "❌ /api/latest-patch:",
            error
        );

        if (latestPatchCache) {
            return res.json({
                success: true,
                source: "discord-cache",
                cached: true,
                channel: PATCH_CHANNEL_ID,
                patch: latestPatchCache
            });
        }

        res.status(500).json({
            success: false,
            patch: null,
            error:
                "Erreur lors de la récupération du patch."
        });
    }
});

/*
 * =========================================================
 * 404
 * =========================================================
 */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route introuvable."
    });
});

/*
 * =========================================================
 * ERREUR GLOBALE
 * =========================================================
 */

app.use((error, req, res, next) => {
    console.error("❌ Erreur API:", error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        success: false,
        error: "Erreur interne de l'API."
    });
});

/*
 * =========================================================
 * DÉMARRAGE
 * =========================================================
 */

app.listen(PORT, () => {
    console.log("========================================");
    console.log("🚀 ALPHARK API");
    console.log(`🌐 Port : ${PORT}`);
    console.log(`🏠 Guild : ${DISCORD_GUILD_ID}`);
    console.log(`📰 Actualités : ${NEWS_CHANNEL_ID}`);
    console.log(`📝 Patch : ${PATCH_CHANNEL_ID}`);
    console.log("========================================");
});
    
});
