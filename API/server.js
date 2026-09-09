import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();

// =====================================================
// CONFIGURATION
// =====================================================

const PORT = process.env.PORT || 3000;

// Serveur Discord ALPHARK
const DISCORD_GUILD_ID = "1496186723527426290";

// Salon Discord #patch-notes-ark
const PATCH_CHANNEL_ID = "1497971812267462708";

// Variables Render
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

// =====================================================
// VÉRIFICATION CONFIGURATION
// =====================================================

if (!DISCORD_CLIENT_ID) {
    console.error("❌ DISCORD_CLIENT_ID manquant");
}

if (!DISCORD_CLIENT_SECRET) {
    console.error("❌ DISCORD_CLIENT_SECRET manquant");
}

if (!DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN manquant");
}

if (!DISCORD_REDIRECT_URI) {
    console.error("❌ DISCORD_REDIRECT_URI manquant");
}

if (!SESSION_SECRET) {
    console.error("❌ SESSION_SECRET manquant");
}

// =====================================================
// EXPRESS
// =====================================================

app.set("trust proxy", 1);

app.use(express.json());

// =====================================================
// CORS
// =====================================================

app.use(
    cors({
        origin: [
            "https://alphark.fr",
            "https://www.alphark.fr",
            "https://joyeuxmathieu.github.io"
        ],
        credentials: true
    })
);

// =====================================================
// SESSION
// =====================================================

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,

        cookie: {
            secure: true,
            httpOnly: true,
            sameSite: "none",
            domain: ".alphark.fr",
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

// =====================================================
// ACCUEIL API
// =====================================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.0.0",
        guild: DISCORD_GUILD_ID,
        patchChannel: PATCH_CHANNEL_ID
    });
});

// =====================================================
// STATUT API / DISCORD
// =====================================================

app.get("/api/discord-status", async (req, res) => {
    try {
        if (!DISCORD_BOT_TOKEN) {
            return res.status(500).json({
                success: false,
                online: false,
                error: "DISCORD_BOT_TOKEN manquant."
            });
        }

        const response = await fetch(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}`,
            {
                headers: {
                    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                    "User-Agent": "ALPHARK-API/2.0"
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            console.error(
                "❌ Discord status :",
                response.status,
                errorText
            );

            return res.status(500).json({
                success: false,
                online: false,
                error: `Discord a répondu ${response.status}.`
            });
        }

        const guild = await response.json();

        res.json({
            success: true,
            online: true,
            guildId: guild.id,
            guildName: guild.name,
            icon: guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
                : null
        });

    } catch (error) {
        console.error(
            "❌ Erreur /api/discord-status :",
            error
        );

        res.status(500).json({
            success: false,
            online: false,
            error: "Impossible de contacter Discord."
        });
    }
});

// =====================================================
// CONNEXION DISCORD
// =====================================================

app.get("/auth/discord", (req, res) => {

    try {

        if (
            !DISCORD_CLIENT_ID ||
            !DISCORD_REDIRECT_URI
        ) {
            return res.status(500).send(
                "Configuration Discord incomplète."
            );
        }

        const state = crypto
            .randomBytes(32)
            .toString("hex");

        req.session.oauthState = state;

        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            response_type: "code",
            redirect_uri: DISCORD_REDIRECT_URI,

            // Seulement l'identité Discord est nécessaire
            scope: "identify",

            state: state,

            prompt: "consent"
        });

        const discordUrl =
            "https://discord.com/oauth2/authorize?" +
            params.toString();

        console.log(
            "🔵 Redirection vers Discord"
        );

        res.redirect(discordUrl);

    } catch (error) {

        console.error(
            "❌ Erreur /auth/discord :",
            error
        );

        res.status(500).send(
            "Impossible de lancer la connexion Discord."
        );
    }
});

// =====================================================
// CALLBACK DISCORD
// =====================================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            console.log(
                "🟢 CALLBACK DISCORD REÇU"
            );

            const code = req.query.code;
            const state = req.query.state;

            console.log(
                "Code reçu :",
                code ? "OUI" : "NON"
            );

            console.log(
                "State reçu :",
                state ? "OUI" : "NON"
            );

            // -------------------------------------------------
            // CODE MANQUANT
            // -------------------------------------------------

            if (!code) {

                return res.status(400).send(
                    "Code Discord manquant."
                );
            }

            // -------------------------------------------------
            // VÉRIFICATION STATE
            // -------------------------------------------------

            if (
                !state ||
                state !== req.session.oauthState
            ) {

                console.error(
                    "❌ State Discord invalide"
                );

                return res.status(400).send(
                    "Connexion Discord invalide ou expirée."
                );
            }

            delete req.session.oauthState;

            // -------------------------------------------------
            // RÉCUPÉRATION TOKEN DISCORD
            // -------------------------------------------------

            const tokenResponse = await fetch(
                "https://discord.com/api/v10/oauth2/token",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                        "User-Agent":
                            "ALPHARK-API/2.0"
                    },

                    body: new URLSearchParams({
                        client_id:
                            DISCORD_CLIENT_ID,

                        client_secret:
                            DISCORD_CLIENT_SECRET,

                        grant_type:
                            "authorization_code",

                        code: code,

                        redirect_uri:
                            DISCORD_REDIRECT_URI
                    })
                }
            );

            if (!tokenResponse.ok) {

                const errorText =
                    await tokenResponse.text();

                console.error(
                    "❌ Erreur token Discord :",
                    tokenResponse.status,
                    errorText
                );

                return res.status(401).send(
                    "Impossible de valider la connexion Discord."
                );
            }

            const tokenData =
                await tokenResponse.json();

            // -------------------------------------------------
            // RÉCUPÉRATION COMPTE DISCORD
            // -------------------------------------------------

            const userResponse = await fetch(
                "https://discord.com/api/v10/users/@me",
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

                const errorText =
                    await userResponse.text();

                console.error(
                    "❌ Impossible de récupérer le compte Discord :",
                    errorText
                );

                return res.status(401).send(
                    "Impossible de récupérer votre compte Discord."
                );
            }

            const user =
                await userResponse.json();

            console.log(
                `👤 Discord : ${user.username} (${user.id})`
            );

            // -------------------------------------------------
            // VÉRIFICATION MEMBRE ALPHARK
            // -------------------------------------------------

            const memberResponse =
                await fetch(
                    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
                    {
                        headers: {
                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        }
                    }
                );

            // -------------------------------------------------
            // PAS MEMBRE
            // -------------------------------------------------

            if (!memberResponse.ok) {

                if (
                    memberResponse.status === 404
                ) {

                    console.log(
                        `❌ ${user.username} n'est pas membre d'ALPHARK`
                    );

                    return res.redirect(
                        "https://www.alphark.fr/?discord=not_member"
                    );
                }

                const memberError =
                    await memberResponse.text();

                console.error(
                    "❌ Erreur vérification membre :",
                    memberError
                );

                return res.status(500).send(
                    "Impossible de vérifier votre appartenance au serveur ALPHARK."
                );
            }

            // -------------------------------------------------
            // MEMBRE ALPHARK
            // -------------------------------------------------

            console.log(
                `✅ ${user.username} est membre d'ALPHARK`
            );

            req.session.user = {

                id: user.id,

                username:
                    user.global_name ||
                    user.username,

                avatar:
                    user.avatar
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                        : `https://cdn.discordapp.com/embed/avatars/0.png`
            };

            // -------------------------------------------------
            // SAUVEGARDE SESSION
            // -------------------------------------------------

            req.session.save(
                (error) => {

                    if (error) {

                        console.error(
                            "❌ Erreur sauvegarde session :",
                            error
                        );

                        return res.status(500).send(
                            "Impossible de créer votre session."
                        );
                    }

                    console.log(
                        `🎉 Connexion ALPHARK réussie : ${user.username}`
                    );

                    res.redirect(
                        "https://www.alphark.fr/?discord=connected"
                    );
                }
            );

        } catch (error) {

            console.error(
                "❌ Erreur connexion Discord :",
                error
            );

            res.status(500).send(
                "Erreur interne ALPHARK."
            );
        }
    }
);

// =====================================================
// SESSION UTILISATEUR
// =====================================================

app.get("/api/session", (req, res) => {

    if (!req.session.user) {

        return res.json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

// =====================================================
// UTILISATEUR CONNECTÉ
// =====================================================

app.get("/api/me", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

// =====================================================
// JOUEURS CONNECTÉS AU SITE
// =====================================================

const onlinePlayers = new Map();

const PRESENCE_TIMEOUT =
    5 * 60 * 1000;

// =====================================================
// ENREGISTRER PRÉSENCE
// =====================================================

app.post(
    "/api/presence",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({
                loggedIn: false
            });
        }

        const user =
            req.session.user;

        onlinePlayers.set(
            user.id,
            {
                id: user.id,

                username:
                    user.username,

                avatar:
                    user.avatar,

                lastSeen:
                    Date.now()
            }
        );

        res.json({
            success: true
        });
    }
);

// =====================================================
// LISTE JOUEURS EN LIGNE
// =====================================================

app.get(
    "/api/online",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({
                loggedIn: false
            });
        }

        const now =
            Date.now();

        // Supprimer les présences expirées
        for (
            const [
                id,
                player
            ]
            of onlinePlayers.entries()
        ) {

            if (
                now - player.lastSeen >
                PRESENCE_TIMEOUT
            ) {

                onlinePlayers.delete(id);
            }
        }

        const players =
            Array.from(
                onlinePlayers.values()
            ).map(
                player => ({
                    id: player.id,
                    username: player.username,
                    avatar: player.avatar
                })
            );

        res.json({
            loggedIn: true,
            players: players
        });
    }
);

// =====================================================
// DERNIER PATCH ARK
// =====================================================
//
// Le site récupère automatiquement le dernier message
// publié dans #patch-notes-ark.
//
// ID du salon : 1497971812267462708
//
// Actualisation du cache : 60 secondes
// =====================================================

let latestPatchCache = null;
let latestPatchCacheTime = 0;

const PATCH_CACHE_TIME =
    60 * 1000;

// =====================================================
// ROUTE /api/latest-patch
// =====================================================

app.get(
    "/api/latest-patch",
    async (req, res) => {

        try {

            // -------------------------------------------------
            // CACHE
            // -------------------------------------------------

            if (
                latestPatchCache &&
                Date.now() -
                    latestPatchCacheTime <
                    PATCH_CACHE_TIME
            ) {

                return res.json({
                    success: true,
                    ...latestPatchCache
                });
            }

            // -------------------------------------------------
            // VÉRIFICATION TOKEN
            // -------------------------------------------------

            if (!DISCORD_BOT_TOKEN) {

                return res.status(500).json({
                    success: false,
                    error:
                        "DISCORD_BOT_TOKEN manquant."
                });
            }

            // -------------------------------------------------
            // RÉCUPÉRATION DU SALON
            // -------------------------------------------------

            const channelResponse =
                await fetch(
                    `https://discord.com/api/v10/channels/${PATCH_CHANNEL_ID}`,
                    {
                        headers: {
                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        }
                    }
                );

            if (!channelResponse.ok) {

                const errorText =
                    await channelResponse.text();

                console.error(
                    "❌ Erreur récupération salon patch :",
                    channelResponse.status,
                    errorText
                );

                if (
                    channelResponse.status === 403
                ) {

                    return res.status(500).json({
                        success: false,
                        error:
                            "Le bot n'a pas accès au salon #patch-notes-ark."
                    });
                }

                if (
                    channelResponse.status === 404
                ) {

                    return res.status(500).json({
                        success: false,
                        error:
                            "Le salon #patch-notes-ark est introuvable avec cet ID."
                    });
                }

                return res.status(500).json({
                    success: false,
                    error:
                        `Discord a répondu ${channelResponse.status}.`
                });
            }

            const channel =
                await channelResponse.json();

            console.log(
                `📢 Salon patch trouvé : #${channel.name}`
            );

            // -------------------------------------------------
            // RÉCUPÉRATION DES 20 DERNIERS MESSAGES
            // -------------------------------------------------

            const messagesResponse =
                await fetch(
                    `https://discord.com/api/v10/channels/${PATCH_CHANNEL_ID}/messages?limit=20`,
                    {
                        headers: {
                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        }
                    }
                );

            if (!messagesResponse.ok) {

                const errorText =
                    await messagesResponse.text();

                console.error(
                    "❌ Erreur récupération messages patch :",
                    messagesResponse.status,
                    errorText
                );

                if (
                    messagesResponse.status === 403
                ) {

                    return res.status(500).json({
                        success: false,
                        error:
                            "Le bot n'a pas la permission de lire l'historique de #patch-notes-ark."
                    });
                }

                return res.status(500).json({
                    success: false,
                    error:
                        `Impossible de récupérer les messages Discord (${messagesResponse.status}).`
                });
            }

            const messages =
                await messagesResponse.json();

            // -------------------------------------------------
            // AUCUN MESSAGE
            // -------------------------------------------------

            if (
                !Array.isArray(messages) ||
                messages.length === 0
            ) {

                return res.json({
                    success: true,
                    found: false,
                    message:
                        "Aucun patch trouvé dans #patch-notes-ark."
                });
            }

            // -------------------------------------------------
            // RECHERCHE DERNIER MESSAGE
            // -------------------------------------------------

            let patchMessage = null;

            for (
                const message
                of messages
            ) {

                const hasText =
                    typeof message.content ===
                        "string" &&
                    message.content.trim()
                        .length > 0;

                const hasEmbed =
                    Array.isArray(
                        message.embeds
                    ) &&
                    message.embeds.length > 0;

                const hasAttachment =
                    Array.isArray(
                        message.attachments
                    ) &&
                    message.attachments.length > 0;

                if (
                    hasText ||
                    hasEmbed ||
                    hasAttachment
                ) {

                    patchMessage =
                        message;

                    break;
                }
            }

            // -------------------------------------------------
            // AUCUN PATCH EXPLOITABLE
            // -------------------------------------------------

            if (!patchMessage) {

                return res.json({
                    success: true,
                    found: false,
                    message:
                        "Aucun patch exploitable trouvé."
                });
            }

            // -------------------------------------------------
            // EMBED
            // -------------------------------------------------

            const embed =
                Array.isArray(
                    patchMessage.embeds
                ) &&
                patchMessage.embeds.length > 0
                    ? patchMessage.embeds[0]
                    : null;

            // -------------------------------------------------
            // TITRE
            // -------------------------------------------------

            const title =
                embed?.title ||
                "Dernier patch ARK";

            // -------------------------------------------------
            // DESCRIPTION
            // -------------------------------------------------

            const description =
                embed?.description ||
                patchMessage.content ||
                "";

            // -------------------------------------------------
            // IMAGE
            // -------------------------------------------------

            let image = null;

            if (
                embed?.image?.url
            ) {

                image =
                    embed.image.url;

            } else if (
                embed?.thumbnail?.url
            ) {

                image =
                    embed.thumbnail.url;

            } else if (
                Array.isArray(
                    patchMessage.attachments
                ) &&
                patchMessage.attachments.length > 0
            ) {

                image =
                    patchMessage
                        .attachments[0]
                        .url;
            }

            // -------------------------------------------------
            // DATE
            // -------------------------------------------------

            const date =
                patchMessage.timestamp ||
                null;

            // -------------------------------------------------
            // LIEN DISCORD
            // -------------------------------------------------

            const discordUrl =
                `https://discord.com/channels/${DISCORD_GUILD_ID}/${PATCH_CHANNEL_ID}/${patchMessage.id}`;

            // -------------------------------------------------
            // RÉSULTAT
            // -------------------------------------------------

            const result = {

                found: true,

                id:
                    patchMessage.id,

                title:
                    title,

                description:
                    description,

                image:
                    image,

                date:
                    date,

                discordUrl:
                    discordUrl,

                channelId:
                    PATCH_CHANNEL_ID,

                channelName:
                    channel.name ||
                    "patch-notes-ark"
            };

            // -------------------------------------------------
            // CACHE
            // -------------------------------------------------

            latestPatchCache =
                result;

            latestPatchCacheTime =
                Date.now();

            console.log(
                `✅ Dernier patch récupéré : ${title}`
            );

            // -------------------------------------------------
            // RÉPONSE
            // -------------------------------------------------

            res.json({
                success: true,
                ...result
            });

        } catch (error) {

            console.error(
                "❌ Erreur /api/latest-patch :",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Erreur serveur lors de la récupération du patch."
            });
        }
    }
);

// =====================================================
// DÉCONNEXION
// =====================================================

app.get(
    "/auth/logout",
    (req, res) => {

        // Retirer le joueur de la liste
        // des joueurs actuellement présents

        const userId =
            req.session.user?.id;

        if (userId) {

            onlinePlayers.delete(
                userId
            );
        }

        // Détruire la session

        req.session.destroy(
            (error) => {

                if (error) {

                    console.error(
                        "❌ Erreur déconnexion :",
                        error
                    );

                    return res.status(500).send(
                        "Erreur lors de la déconnexion."
                    );
                }

                res.redirect(
                    "https://www.alphark.fr/"
                );
            }
        );
    }
);

// =====================================================
// GESTION 404 API
// =====================================================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            error: "Route API introuvable.",
            path: req.originalUrl
        });
    }
);

// =====================================================
// GESTION ERREUR GÉNÉRALE
// =====================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "❌ Erreur Express :",
            error
        );

        res.status(500).json({
            success: false,
            error: "Erreur interne du serveur."
        });
    }
);

// =====================================================
// DÉMARRAGE
// =====================================================

app.listen(
    PORT,
    () => {

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
    }
);import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();

// =====================================================
// CONFIGURATION
// =====================================================

const PORT = process.env.PORT || 3000;

// Serveur Discord ALPHARK
const DISCORD_GUILD_ID = "1496186723527426290";

// Salon Discord #patch-notes-ark
const PATCH_CHANNEL_ID = "1497971812267462708";

// Variables Render
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

// =====================================================
// VÉRIFICATION CONFIGURATION
// =====================================================

if (!DISCORD_CLIENT_ID) {
    console.error("❌ DISCORD_CLIENT_ID manquant");
}

if (!DISCORD_CLIENT_SECRET) {
    console.error("❌ DISCORD_CLIENT_SECRET manquant");
}

if (!DISCORD_BOT_TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN manquant");
}

if (!DISCORD_REDIRECT_URI) {
    console.error("❌ DISCORD_REDIRECT_URI manquant");
}

if (!SESSION_SECRET) {
    console.error("❌ SESSION_SECRET manquant");
}

// =====================================================
// EXPRESS
// =====================================================

app.set("trust proxy", 1);

app.use(express.json());

// =====================================================
// CORS
// =====================================================

app.use(
    cors({
        origin: [
            "https://alphark.fr",
            "https://www.alphark.fr",
            "https://joyeuxmathieu.github.io"
        ],
        credentials: true
    })
);

// =====================================================
// SESSION
// =====================================================

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,

        cookie: {
            secure: true,
            httpOnly: true,
            sameSite: "none",
            domain: ".alphark.fr",
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

// =====================================================
// ACCUEIL API
// =====================================================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.0.0",
        guild: DISCORD_GUILD_ID,
        patchChannel: PATCH_CHANNEL_ID
    });
});

// =====================================================
// STATUT API / DISCORD
// =====================================================

app.get("/api/discord-status", async (req, res) => {
    try {
        if (!DISCORD_BOT_TOKEN) {
            return res.status(500).json({
                success: false,
                online: false,
                error: "DISCORD_BOT_TOKEN manquant."
            });
        }

        const response = await fetch(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}`,
            {
                headers: {
                    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                    "User-Agent": "ALPHARK-API/2.0"
                }
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            console.error(
                "❌ Discord status :",
                response.status,
                errorText
            );

            return res.status(500).json({
                success: false,
                online: false,
                error: `Discord a répondu ${response.status}.`
            });
        }

        const guild = await response.json();

        res.json({
            success: true,
            online: true,
            guildId: guild.id,
            guildName: guild.name,
            icon: guild.icon
                ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
                : null
        });

    } catch (error) {
        console.error(
            "❌ Erreur /api/discord-status :",
            error
        );

        res.status(500).json({
            success: false,
            online: false,
            error: "Impossible de contacter Discord."
        });
    }
});

// =====================================================
// CONNEXION DISCORD
// =====================================================

app.get("/auth/discord", (req, res) => {

    try {

        if (
            !DISCORD_CLIENT_ID ||
            !DISCORD_REDIRECT_URI
        ) {
            return res.status(500).send(
                "Configuration Discord incomplète."
            );
        }

        const state = crypto
            .randomBytes(32)
            .toString("hex");

        req.session.oauthState = state;

        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            response_type: "code",
            redirect_uri: DISCORD_REDIRECT_URI,

            // Seulement l'identité Discord est nécessaire
            scope: "identify",

            state: state,

            prompt: "consent"
        });

        const discordUrl =
            "https://discord.com/oauth2/authorize?" +
            params.toString();

        console.log(
            "🔵 Redirection vers Discord"
        );

        res.redirect(discordUrl);

    } catch (error) {

        console.error(
            "❌ Erreur /auth/discord :",
            error
        );

        res.status(500).send(
            "Impossible de lancer la connexion Discord."
        );
    }
});

// =====================================================
// CALLBACK DISCORD
// =====================================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            console.log(
                "🟢 CALLBACK DISCORD REÇU"
            );

            const code = req.query.code;
            const state = req.query.state;

            console.log(
                "Code reçu :",
                code ? "OUI" : "NON"
            );

            console.log(
                "State reçu :",
                state ? "OUI" : "NON"
            );

            // -------------------------------------------------
            // CODE MANQUANT
            // -------------------------------------------------

            if (!code) {

                return res.status(400).send(
                    "Code Discord manquant."
                );
            }

            // -------------------------------------------------
            // VÉRIFICATION STATE
            // -------------------------------------------------

            if (
                !state ||
                state !== req.session.oauthState
            ) {

                console.error(
                    "❌ State Discord invalide"
                );

                return res.status(400).send(
                    "Connexion Discord invalide ou expirée."
                );
            }

            delete req.session.oauthState;

            // -------------------------------------------------
            // RÉCUPÉRATION TOKEN DISCORD
            // -------------------------------------------------

            const tokenResponse = await fetch(
                "https://discord.com/api/v10/oauth2/token",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded",
                        "User-Agent":
                            "ALPHARK-API/2.0"
                    },

                    body: new URLSearchParams({
                        client_id:
                            DISCORD_CLIENT_ID,

                        client_secret:
                            DISCORD_CLIENT_SECRET,

                        grant_type:
                            "authorization_code",

                        code: code,

                        redirect_uri:
                            DISCORD_REDIRECT_URI
                    })
                }
            );

            if (!tokenResponse.ok) {

                const errorText =
                    await tokenResponse.text();

                console.error(
                    "❌ Erreur token Discord :",
                    tokenResponse.status,
                    errorText
                );

                return res.status(401).send(
                    "Impossible de valider la connexion Discord."
                );
            }

            const tokenData =
                await tokenResponse.json();

            // -------------------------------------------------
            // RÉCUPÉRATION COMPTE DISCORD
            // -------------------------------------------------

            const userResponse = await fetch(
                "https://discord.com/api/v10/users/@me",
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

                const errorText =
                    await userResponse.text();

                console.error(
                    "❌ Impossible de récupérer le compte Discord :",
                    errorText
                );

                return res.status(401).send(
                    "Impossible de récupérer votre compte Discord."
                );
            }

            const user =
                await userResponse.json();

            console.log(
                `👤 Discord : ${user.username} (${user.id})`
            );

            // -------------------------------------------------
            // VÉRIFICATION MEMBRE ALPHARK
            // -------------------------------------------------

            const memberResponse =
                await fetch(
                    `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/members/${user.id}`,
                    {
                        headers: {
                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        }
                    }
                );

            // -------------------------------------------------
            // PAS MEMBRE
            // -------------------------------------------------

            if (!memberResponse.ok) {

                if (
                    memberResponse.status === 404
                ) {

                    console.log(
                        `❌ ${user.username} n'est pas membre d'ALPHARK`
                    );

                    return res.redirect(
                        "https://www.alphark.fr/?discord=not_member"
                    );
                }

                const memberError =
                    await memberResponse.text();

                console.error(
                    "❌ Erreur vérification membre :",
                    memberError
                );

                return res.status(500).send(
                    "Impossible de vérifier votre appartenance au serveur ALPHARK."
                );
            }

            // -------------------------------------------------
            // MEMBRE ALPHARK
            // -------------------------------------------------

            console.log(
                `✅ ${user.username} est membre d'ALPHARK`
            );

            req.session.user = {

                id: user.id,

                username:
                    user.global_name ||
                    user.username,

                avatar:
                    user.avatar
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                        : `https://cdn.discordapp.com/embed/avatars/0.png`
            };

            // -------------------------------------------------
            // SAUVEGARDE SESSION
            // -------------------------------------------------

            req.session.save(
                (error) => {

                    if (error) {

                        console.error(
                            "❌ Erreur sauvegarde session :",
                            error
                        );

                        return res.status(500).send(
                            "Impossible de créer votre session."
                        );
                    }

                    console.log(
                        `🎉 Connexion ALPHARK réussie : ${user.username}`
                    );

                    res.redirect(
                        "https://www.alphark.fr/?discord=connected"
                    );
                }
            );

        } catch (error) {

            console.error(
                "❌ Erreur connexion Discord :",
                error
            );

            res.status(500).send(
                "Erreur interne ALPHARK."
            );
        }
    }
);

// =====================================================
// SESSION UTILISATEUR
// =====================================================

app.get("/api/session", (req, res) => {

    if (!req.session.user) {

        return res.json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

// =====================================================
// UTILISATEUR CONNECTÉ
// =====================================================

app.get("/api/me", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({
            loggedIn: false
        });
    }

    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

// =====================================================
// JOUEURS CONNECTÉS AU SITE
// =====================================================

const onlinePlayers = new Map();

const PRESENCE_TIMEOUT =
    5 * 60 * 1000;

// =====================================================
// ENREGISTRER PRÉSENCE
// =====================================================

app.post(
    "/api/presence",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({
                loggedIn: false
            });
        }

        const user =
            req.session.user;

        onlinePlayers.set(
            user.id,
            {
                id: user.id,

                username:
                    user.username,

                avatar:
                    user.avatar,

                lastSeen:
                    Date.now()
            }
        );

        res.json({
            success: true
        });
    }
);

// =====================================================
// LISTE JOUEURS EN LIGNE
// =====================================================

app.get(
    "/api/online",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({
                loggedIn: false
            });
        }

        const now =
            Date.now();

        // Supprimer les présences expirées
        for (
            const [
                id,
                player
            ]
            of onlinePlayers.entries()
        ) {

            if (
                now - player.lastSeen >
                PRESENCE_TIMEOUT
            ) {

                onlinePlayers.delete(id);
            }
        }

        const players =
            Array.from(
                onlinePlayers.values()
            ).map(
                player => ({
                    id: player.id,
                    username: player.username,
                    avatar: player.avatar
                })
            );

        res.json({
            loggedIn: true,
            players: players
        });
    }
);

// =====================================================
// DERNIER PATCH ARK
// =====================================================
//
// Le site récupère automatiquement le dernier message
// publié dans #patch-notes-ark.
//
// ID du salon : 1497971812267462708
//
// Actualisation du cache : 60 secondes
// =====================================================

let latestPatchCache = null;
let latestPatchCacheTime = 0;

const PATCH_CACHE_TIME =
    60 * 1000;

// =====================================================
// ROUTE /api/latest-patch
// =====================================================

app.get(
    "/api/latest-patch",
    async (req, res) => {

        try {

            // -------------------------------------------------
            // CACHE
            // -------------------------------------------------

            if (
                latestPatchCache &&
                Date.now() -
                    latestPatchCacheTime <
                    PATCH_CACHE_TIME
            ) {

                return res.json({
                    success: true,
                    ...latestPatchCache
                });
            }

            // -------------------------------------------------
            // VÉRIFICATION TOKEN
            // -------------------------------------------------

            if (!DISCORD_BOT_TOKEN) {

                return res.status(500).json({
                    success: false,
                    error:
                        "DISCORD_BOT_TOKEN manquant."
                });
            }

            // -------------------------------------------------
            // RÉCUPÉRATION DU SALON
            // -------------------------------------------------

            const channelResponse =
                await fetch(
                    `https://discord.com/api/v10/channels/${PATCH_CHANNEL_ID}`,
                    {
                        headers: {
                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        }
                    }
                );

            if (!channelResponse.ok) {

                const errorText =
                    await channelResponse.text();

                console.error(
                    "❌ Erreur récupération salon patch :",
                    channelResponse.status,
                    errorText
                );

                if (
                    channelResponse.status === 403
                ) {

                    return res.status(500).json({
                        success: false,
                        error:
                            "Le bot n'a pas accès au salon #patch-notes-ark."
                    });
                }

                if (
                    channelResponse.status === 404
                ) {

                    return res.status(500).json({
                        success: false,
                        error:
                            "Le salon #patch-notes-ark est introuvable avec cet ID."
                    });
                }

                return res.status(500).json({
                    success: false,
                    error:
                        `Discord a répondu ${channelResponse.status}.`
                });
            }

            const channel =
                await channelResponse.json();

            console.log(
                `📢 Salon patch trouvé : #${channel.name}`
            );

            // -------------------------------------------------
            // RÉCUPÉRATION DES 20 DERNIERS MESSAGES
            // -------------------------------------------------

            const messagesResponse =
                await fetch(
                    `https://discord.com/api/v10/channels/${PATCH_CHANNEL_ID}/messages?limit=20`,
                    {
                        headers: {
                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        }
                    }
                );

            if (!messagesResponse.ok) {

                const errorText =
                    await messagesResponse.text();

                console.error(
                    "❌ Erreur récupération messages patch :",
                    messagesResponse.status,
                    errorText
                );

                if (
                    messagesResponse.status === 403
                ) {

                    return res.status(500).json({
                        success: false,
                        error:
                            "Le bot n'a pas la permission de lire l'historique de #patch-notes-ark."
                    });
                }

                return res.status(500).json({
                    success: false,
                    error:
                        `Impossible de récupérer les messages Discord (${messagesResponse.status}).`
                });
            }

            const messages =
                await messagesResponse.json();

            // -------------------------------------------------
            // AUCUN MESSAGE
            // -------------------------------------------------

            if (
                !Array.isArray(messages) ||
                messages.length === 0
            ) {

                return res.json({
                    success: true,
                    found: false,
                    message:
                        "Aucun patch trouvé dans #patch-notes-ark."
                });
            }

            // -------------------------------------------------
            // RECHERCHE DERNIER MESSAGE
            // -------------------------------------------------

            let patchMessage = null;

            for (
                const message
                of messages
            ) {

                const hasText =
                    typeof message.content ===
                        "string" &&
                    message.content.trim()
                        .length > 0;

                const hasEmbed =
                    Array.isArray(
                        message.embeds
                    ) &&
                    message.embeds.length > 0;

                const hasAttachment =
                    Array.isArray(
                        message.attachments
                    ) &&
                    message.attachments.length > 0;

                if (
                    hasText ||
                    hasEmbed ||
                    hasAttachment
                ) {

                    patchMessage =
                        message;

                    break;
                }
            }

            // -------------------------------------------------
            // AUCUN PATCH EXPLOITABLE
            // -------------------------------------------------

            if (!patchMessage) {

                return res.json({
                    success: true,
                    found: false,
                    message:
                        "Aucun patch exploitable trouvé."
                });
            }

            // -------------------------------------------------
            // EMBED
            // -------------------------------------------------

            const embed =
                Array.isArray(
                    patchMessage.embeds
                ) &&
                patchMessage.embeds.length > 0
                    ? patchMessage.embeds[0]
                    : null;

            // -------------------------------------------------
            // TITRE
            // -------------------------------------------------

            const title =
                embed?.title ||
                "Dernier patch ARK";

            // -------------------------------------------------
            // DESCRIPTION
            // -------------------------------------------------

            const description =
                embed?.description ||
                patchMessage.content ||
                "";

            // -------------------------------------------------
            // IMAGE
            // -------------------------------------------------

            let image = null;

            if (
                embed?.image?.url
            ) {

                image =
                    embed.image.url;

            } else if (
                embed?.thumbnail?.url
            ) {

                image =
                    embed.thumbnail.url;

            } else if (
                Array.isArray(
                    patchMessage.attachments
                ) &&
                patchMessage.attachments.length > 0
            ) {

                image =
                    patchMessage
                        .attachments[0]
                        .url;
            }

            // -------------------------------------------------
            // DATE
            // -------------------------------------------------

            const date =
                patchMessage.timestamp ||
                null;

            // -------------------------------------------------
            // LIEN DISCORD
            // -------------------------------------------------

            const discordUrl =
                `https://discord.com/channels/${DISCORD_GUILD_ID}/${PATCH_CHANNEL_ID}/${patchMessage.id}`;

            // -------------------------------------------------
            // RÉSULTAT
            // -------------------------------------------------

            const result = {

                found: true,

                id:
                    patchMessage.id,

                title:
                    title,

                description:
                    description,

                image:
                    image,

                date:
                    date,

                discordUrl:
                    discordUrl,

                channelId:
                    PATCH_CHANNEL_ID,

                channelName:
                    channel.name ||
                    "patch-notes-ark"
            };

            // -------------------------------------------------
            // CACHE
            // -------------------------------------------------

            latestPatchCache =
                result;

            latestPatchCacheTime =
                Date.now();

            console.log(
                `✅ Dernier patch récupéré : ${title}`
            );

            // -------------------------------------------------
            // RÉPONSE
            // -------------------------------------------------

            res.json({
                success: true,
                ...result
            });

        } catch (error) {

            console.error(
                "❌ Erreur /api/latest-patch :",
                error
            );

            res.status(500).json({
                success: false,
                error:
                    "Erreur serveur lors de la récupération du patch."
            });
        }
    }
);

// =====================================================
// DÉCONNEXION
// =====================================================

app.get(
    "/auth/logout",
    (req, res) => {

        // Retirer le joueur de la liste
        // des joueurs actuellement présents

        const userId =
            req.session.user?.id;

        if (userId) {

            onlinePlayers.delete(
                userId
            );
        }

        // Détruire la session

        req.session.destroy(
            (error) => {

                if (error) {

                    console.error(
                        "❌ Erreur déconnexion :",
                        error
                    );

                    return res.status(500).send(
                        "Erreur lors de la déconnexion."
                    );
                }

                res.redirect(
                    "https://www.alphark.fr/"
                );
            }
        );
    }
);

// =====================================================
// GESTION 404 API
// =====================================================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            error: "Route API introuvable.",
            path: req.originalUrl
        });
    }
);

// =====================================================
// GESTION ERREUR GÉNÉRALE
// =====================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "❌ Erreur Express :",
            error
        );

        res.status(500).json({
            success: false,
            error: "Erreur interne du serveur."
        });
    }
);

// =====================================================
// DÉMARRAGE
// =====================================================

app.listen(
    PORT,
    () => {

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
    }
);
