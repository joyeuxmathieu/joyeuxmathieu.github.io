import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();

app.set("trust proxy", 1);
app.use(express.json());

const PORT = process.env.PORT || 10000;

const DISCORD_API = "https://discord.com/api/v10";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

const DISCORD_GUILD_ID =
    process.env.DISCORD_GUILD_ID || "1496186723527426290";

const DISCORD_REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI ||
    "https://api.alphark.fr/auth/discord/callback";

const PATCH_CHANNEL_ID = "1497971812267462708";

/* =========================================================
   CORS
========================================================= */

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

/* =========================================================
   SESSION
========================================================= */

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

/* =========================================================
   DISCORD HEADERS
========================================================= */

function discordHeaders() {
    return {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "User-Agent": "ALPHARK-API/2.0"
    };
}

/* =========================================================
   PROTECTION RATE LIMIT 429
========================================================= */

let discordRateLimitedUntil = 0;

async function discordFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...discordHeaders(),
            ...(options.headers || {})
        }
    });

    if (response.status === 429) {
        let retryAfterSeconds = Number(
            response.headers.get("retry-after") || 0
        );

        let bodyText = "";

        try {
            bodyText = await response.text();

            const body = JSON.parse(bodyText);

            if (body?.retry_after) {
                retryAfterSeconds = Number(body.retry_after);
            }
        } catch {
            // Discord peut renvoyer une page HTML Cloudflare.
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

/* =========================================================
   CACHE DERNIER PATCH
========================================================= */

let latestPatchCache = null;
let latestPatchCacheTime = 0;

const PATCH_CACHE_MS = 5 * 60 * 1000;

/* =========================================================
   ROUTE PRINCIPALE
========================================================= */

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.0.0",
        guild: DISCORD_GUILD_ID,
        patchChannel: PATCH_CHANNEL_ID
    });
});

/* =========================================================
   DISCORD STATUS
========================================================= */

app.get("/api/discord-status", async (req, res) => {
    try {
        if (!DISCORD_BOT_TOKEN) {
            return res.status(500).json({
                success: false,
                error: "DISCORD_BOT_TOKEN manquant."
            });
        }

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

        console.error("❌ Discord status :", error);

        res.status(500).json({
            success: false,
            error: "Impossible de contacter Discord."
        });
    }
});

/* =========================================================
   CONNEXION DISCORD
========================================================= */

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

/* =========================================================
   CALLBACK DISCORD
========================================================= */

app.get("/auth/discord/callback", async (req, res) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).send(
                "Code Discord manquant."
            );
        }

        if (!state || state !== req.session.oauthState) {
            return res.status(400).send(
                "Session OAuth invalide."
            );
        }

        delete req.session.oauthState;

        const tokenResponse = await fetch(
            `${DISCORD_API}/oauth2/token`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded",
                    "User-Agent": "ALPHARK-API/2.0"
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
                "❌ OAuth Discord :",
                tokenResponse.status,
                text.slice(0, 500)
            );

            return res.status(502).send(
                `Discord OAuth indisponible (${tokenResponse.status}). Réessaie plus tard.`
            );
        }

        const tokenData = await tokenResponse.json();

        /* =====================================================
           RÉCUPÉRATION UTILISATEUR
        ===================================================== */

        const userResponse = await fetch(
            `${DISCORD_API}/users/@me`,
            {
                headers: {
                    Authorization:
                        `Bearer ${tokenData.access_token}`,

                    "User-Agent":
                        "ALPHARK-API/2.0"
                }
            }
        );

        if (!userResponse.ok) {
            return res.status(502).send(
                "Impossible de récupérer ton compte Discord."
            );
        }

        const user = await userResponse.json();

        /* =====================================================
           VÉRIFICATION MEMBRE ALPHARK
        ===================================================== */

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

        /* =====================================================
           SESSION UTILISATEUR
        ===================================================== */

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

        console.error(
            "❌ Callback Discord :",
            error
        );

        res.status(500).send(
            "Erreur pendant la connexion Discord."
        );
    }
});

/* =========================================================
   SESSION
========================================================= */

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

/* =========================================================
   ME
========================================================= */

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

/* =========================================================
   LOGOUT
========================================================= */

app.get("/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("connect.sid", {
            domain: ".alphark.fr",
            secure: true,
            sameSite: "none"
        });

        res.redirect("https://www.alphark.fr/");
    });
});

/* =========================================================
   PRESENCE
========================================================= */

app.get("/api/presence", async (req, res) => {
    try {
        const response = await discordFetch(
            `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members?limit=1`
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `Discord a répondu ${response.status}.`
            });
        }

        res.json({
            success: true,
            online: null,
            note:
                "Les présences détaillées nécessitent le Gateway Discord."
        });
    } catch (error) {
        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds:
                    error.retryAfterSeconds
            });
        }

        console.error(
            "❌ Presence :",
            error
        );

        res.status(500).json({
            success: false,
            error:
                "Impossible de récupérer les présences."
        });
    }
});

/* =========================================================
   ONLINE
========================================================= */

app.get("/api/online", async (req, res) => {
    try {
        const response = await discordFetch(
            `${DISCORD_API}/guilds/${DISCORD_GUILD_ID}/members?limit=1`
        );

        if (!response.ok) {
            return res.status(response.status).json({
                success: false,
                error: `Discord a répondu ${response.status}.`
            });
        }

        res.json({
            success: true,
            online: null
        });
    } catch (error) {
        if (error.status === 429) {
            return res.status(429).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds:
                    error.retryAfterSeconds
            });
        }

        console.error(
            "❌ Online :",
            error
        );

        res.status(500).json({
            success: false,
            error:
                "Impossible de récupérer les joueurs."
        });
    }
});

/* =========================================================
   DERNIER PATCH
========================================================= */

app.get("/api/latest-patch", async (req, res) => {
    const now = Date.now();

    /* =====================================================
       CACHE VALIDE
    ===================================================== */

    if (
        latestPatchCache &&
        now - latestPatchCacheTime <
            PATCH_CACHE_MS
    ) {
        return res.json({
            success: true,
            cached: true,
            patch: latestPatchCache
        });
    }

    /* =====================================================
       DISCORD TEMPORAIREMENT BLOQUÉ
    ===================================================== */

    if (discordRateLimitedUntil > now) {
        const retryAfterSeconds =
            Math.ceil(
                (discordRateLimitedUntil - now) /
                    1000
            );

        if (latestPatchCache) {
            return res.json({
                success: true,
                cached: true,
                rateLimited: true,
                retryAfterSeconds,
                patch: latestPatchCache
            });
        }

        return res.status(503).json({
            success: false,
            rateLimited: true,
            retryAfterSeconds,
            error:
                "Discord est temporairement limité. Aucun patch en cache."
        });
    }

    try {
        /* =================================================
           RÉCUPÉRATION DU SALON
        ================================================= */

        const channelResponse =
            await discordFetch(
                `${DISCORD_API}/channels/${PATCH_CHANNEL_ID}`
            );

        if (!channelResponse.ok) {
            console.error(
                "❌ Salon patch Discord :",
                channelResponse.status
            );

            return res.status(
                channelResponse.status
            ).json({
                success: false,
                error:
                    `Discord a répondu ${channelResponse.status}.`
            });
        }

        const channel =
            await channelResponse.json();

        /* =================================================
           RÉCUPÉRATION DES MESSAGES
        ================================================= */

        const messagesResponse =
            await discordFetch(
                `${DISCORD_API}/channels/${PATCH_CHANNEL_ID}/messages?limit=20`
            );

        if (!messagesResponse.ok) {
            return res.status(
                messagesResponse.status
            ).json({
                success: false,
                error:
                    `Discord a répondu ${messagesResponse.status}.`
            });
        }

        const messages =
            await messagesResponse.json();

        /* =================================================
           CHOIX DU DERNIER MESSAGE UTILE
        ================================================= */

        const message =
            messages.find(
                (m) =>
                    (m.content &&
                        m.content.trim()) ||
                    (Array.isArray(m.embeds) &&
                        m.embeds.length > 0) ||
                    (Array.isArray(
                        m.attachments
                    ) &&
                        m.attachments.length > 0)
            );

        if (!message) {
            return res.json({
                success: true,
                patch: null,
                message:
                    "Aucun patch trouvé."
            });
        }

        const embed =
            message.embeds?.[0] || null;

        /* =================================================
           IMAGE
        ================================================= */

        let image = null;

        if (embed?.image?.url) {
            image = embed.image.url;
        } else if (
            embed?.thumbnail?.url
        ) {
            image =
                embed.thumbnail.url;
        } else if (
            message.attachments?.[0]?.url
        ) {
            image =
                message.attachments[0].url;
        }

        /* =================================================
           OBJET PATCH
        ================================================= */

        const patch = {
            id: message.id,

            title:
                embed?.title ||
                message.content
                    ?.split("\n")[0] ||
                "Dernier patch ALPHARK",

            description:
                embed?.description ||
                message.content ||
                "",

            image,

            date:
                message.timestamp ||
                null,

            url:
                `https://discord.com/channels/${DISCORD_GUILD_ID}/${PATCH_CHANNEL_ID}/${message.id}`,

            channel:
                channel.name ||
                "patch-notes-ark"
        };

        /* =================================================
           SAUVEGARDE CACHE
        ================================================= */

        latestPatchCache = patch;
        latestPatchCacheTime =
            Date.now();

        res.json({
            success: true,
            cached: false,
            patch
        });
    } catch (error) {
        /* =================================================
           429
        ================================================= */

        if (error.status === 429) {
            console.warn(
                `⚠️ Discord rate-limité pendant ${error.retryAfterSeconds}s`
            );

            /*
             * Si nous avons déjà un patch,
             * on continue à l'afficher.
             */

            if (latestPatchCache) {
                return res.json({
                    success: true,
                    cached: true,
                    rateLimited: true,
                    retryAfterSeconds:
                        error.retryAfterSeconds,
                    patch:
                        latestPatchCache
                });
            }

            return res.status(503).json({
                success: false,
                rateLimited: true,
                retryAfterSeconds:
                    error.retryAfterSeconds,
                error:
                    "Discord est temporairement limité. Aucun patch en cache."
            });
        }

        console.error(
            "❌ Erreur récupération dernier patch :",
            error
        );

        /* =================================================
           ANCIEN PATCH EN SECOURS
        ================================================= */

        if (latestPatchCache) {
            return res.json({
                success: true,
                cached: true,
                patch:
                    latestPatchCache
            });
        }

        res.status(500).json({
            success: false,
            error:
                "Impossible de récupérer le dernier patch Discord."
        });
    }
});

/* =========================================================
   404
========================================================= */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route introuvable."
    });
});

/* =========================================================
   ERREUR GLOBALE
========================================================= */

app.use((err, req, res, next) => {
    console.error(
        "❌ Erreur serveur :",
        err
    );

    res.status(500).json({
        success: false,
        error:
            "Erreur interne de l'API."
    });
});

/* =========================================================
   DÉMARRAGE
========================================================= */

app.listen(PORT, () => {
    console.log(
        "=========================================="
    );

    console.log(
        "🚀 API ALPHARK démarrée"
    );

    console.log(
        `🌐 Port : ${PORT}`
    );

    console.log(
        `🏰 Guild : ${DISCORD_GUILD_ID}`
    );

    console.log(
        `📢 Patch channel : ${PATCH_CHANNEL_ID}`
    );

    console.log(
        "=========================================="
    );
});
