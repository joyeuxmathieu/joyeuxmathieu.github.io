import express from "express";
import cors from "cors";
import session from "express-session";
import crypto from "crypto";

const app = express();

const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURATION ALPHARK
// ======================================================

const DISCORD_GUILD_ID = "1496186723527426290";

const DISCORD_CLIENT_ID =
    process.env.DISCORD_CLIENT_ID;

const DISCORD_CLIENT_SECRET =
    process.env.DISCORD_CLIENT_SECRET;

const DISCORD_BOT_TOKEN =
    process.env.DISCORD_BOT_TOKEN;

const DISCORD_REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI;

const SESSION_SECRET =
    process.env.SESSION_SECRET;

// Salon Discord utilisé pour les patchs
const PATCH_CHANNEL_NAME = "patch-notes-ark";

// ======================================================
// VÉRIFICATION CONFIGURATION
// ======================================================

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

// ======================================================
// EXPRESS
// ======================================================

app.set("trust proxy", 1);

app.use(express.json());

// ======================================================
// CORS
// ======================================================

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

// ======================================================
// SESSION
// ======================================================

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

// ======================================================
// PAGE PRINCIPALE API
// ======================================================

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "ALPHARK API",
        version: "2.0.0"
    });

});

// ======================================================
// DIAGNOSTIC DISCORD
// ======================================================

app.get("/api/discord-status", async (req, res) => {

    try {

        if (!DISCORD_BOT_TOKEN) {

            return res.status(500).json({
                connected: false,
                error: "DISCORD_BOT_TOKEN manquant"
            });

        }

        const response = await fetch(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}`,
            {
                headers: {
                    Authorization:
                        `Bot ${DISCORD_BOT_TOKEN}`,

                    "User-Agent":
                        "ALPHARK-API/2.0"
                }
            }
        );

        if (!response.ok) {

            return res.status(response.status).json({
                connected: false,
                error: `Discord HTTP ${response.status}`
            });

        }

        const guild = await response.json();

        res.json({
            connected: true,
            guild: {
                id: guild.id,
                name: guild.name,
                icon: guild.icon
            }
        });

    }
    catch (error) {

        console.error(
            "❌ Discord status :",
            error
        );

        res.status(500).json({
            connected: false,
            error: "Impossible de contacter Discord"
        });

    }

});

// ======================================================
// CONNEXION DISCORD
// ======================================================

app.get("/auth/discord", (req, res) => {

    try {

        const state =
            crypto.randomBytes(32).toString("hex");

        req.session.oauthState = state;

        const params = new URLSearchParams({

            client_id:
                DISCORD_CLIENT_ID,

            response_type:
                "code",

            redirect_uri:
                DISCORD_REDIRECT_URI,

            scope:
                "identify",

            state:
                state,

            prompt:
                "consent"

        });

        const discordUrl =
            "https://discord.com/oauth2/authorize?" +
            params.toString();

        console.log(
            "🔵 Redirection vers Discord"
        );

        req.session.save((error) => {

            if (error) {

                console.error(
                    "❌ Erreur sauvegarde session OAuth :",
                    error
                );

                return res.status(500).send(
                    "Impossible de démarrer la connexion Discord."
                );

            }

            res.setHeader(
                "Cache-Control",
                "no-store"
            );

            res.redirect(discordUrl);

        });

    }
    catch (error) {

        console.error(
            "❌ Erreur OAuth :",
            error
        );

        res.status(500).send(
            "Impossible de démarrer la connexion Discord."
        );

    }

});

// ======================================================
// CALLBACK DISCORD
// ======================================================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            console.log(
                "=========================================="
            );

            console.log(
                "🟢 CALLBACK DISCORD REÇU"
            );

            console.log(
                "=========================================="
            );

            const code =
                req.query.code;

            const state =
                req.query.state;

            console.log(
                "Code reçu :",
                code ? "OUI" : "NON"
            );

            console.log(
                "State reçu :",
                state ? "OUI" : "NON"
            );

            // --------------------------------------------------
            // Vérification code
            // --------------------------------------------------

            if (!code) {

                return res.status(400).send(
                    "Code Discord manquant."
                );

            }

            // --------------------------------------------------
            // Vérification state
            // --------------------------------------------------

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

            // --------------------------------------------------
            // TOKEN DISCORD
            // --------------------------------------------------

            console.log(
                "🔐 Demande du token Discord..."
            );

            const tokenResponse =
                await fetch(
                    "https://discord.com/api/v10/oauth2/token",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded",

                            "User-Agent":
                                "ALPHARK-API/2.0"
                        },

                        body:
                            new URLSearchParams({

                                client_id:
                                    DISCORD_CLIENT_ID,

                                client_secret:
                                    DISCORD_CLIENT_SECRET,

                                grant_type:
                                    "authorization_code",

                                code:
                                    code,

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
                    errorText
                );

                return res.status(401).send(
                    "Impossible de valider la connexion Discord."
                );

            }

            const tokenData =
                await tokenResponse.json();

            // --------------------------------------------------
            // RÉCUPÉRATION DU COMPTE DISCORD
            // --------------------------------------------------

            const userResponse =
                await fetch(
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

                console.error(
                    "❌ Impossible de récupérer le compte Discord"
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

            // --------------------------------------------------
            // VÉRIFICATION MEMBRE ALPHARK
            // --------------------------------------------------

            console.log(
                "🔎 Vérification membre ALPHARK..."
            );

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

            console.log(
                "📡 Réponse membre ALPHARK :",
                memberResponse.status
            );

            // --------------------------------------------------
            // PAS MEMBRE
            // --------------------------------------------------

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

            // --------------------------------------------------
            // CRÉATION SESSION UTILISATEUR
            // --------------------------------------------------

            const avatar =
                user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
                    : "https://cdn.discordapp.com/embed/avatars/0.png";

            req.session.user = {

                id:
                    user.id,

                username:
                    user.global_name ||
                    user.username,

                avatar:
                    avatar

            };

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

        }
        catch (error) {

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

// ======================================================
// UTILISATEUR CONNECTÉ
// ======================================================

app.get("/api/me", (req, res) => {

    if (!req.session.user) {

        return res.status(401).json({

            loggedIn:
                false

        });

    }

    res.json({

        loggedIn:
            true,

        user:
            req.session.user

    });

});

// ======================================================
// SESSION
// ======================================================

app.get("/api/session", (req, res) => {

    if (!req.session.user) {

        return res.json({

            connected:
                false

        });

    }

    res.json({

        connected:
            true,

        user:
            req.session.user

    });

});

// ======================================================
// JOUEURS CONNECTÉS AU SITE
// ======================================================

const onlinePlayers =
    new Map();

const PRESENCE_TIMEOUT =
    5 * 60 * 1000;

// ======================================================
// ENREGISTRER PRÉSENCE
// ======================================================

app.post(
    "/api/presence",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({

                loggedIn:
                    false

            });

        }

        const user =
            req.session.user;

        onlinePlayers.set(
            user.id,
            {

                id:
                    user.id,

                username:
                    user.username,

                avatar:
                    user.avatar,

                lastSeen:
                    Date.now()

            }
        );

        res.json({

            success:
                true

        });

    }
);

// ======================================================
// LISTE JOUEURS CONNECTÉS
// ======================================================

app.get(
    "/api/online",
    (req, res) => {

        if (!req.session.user) {

            return res.status(401).json({

                loggedIn:
                    false

            });

        }

        const now =
            Date.now();

        // Nettoyage
        for (
            const [
                id,
                player
            ]
            of onlinePlayers.entries()
        ) {

            if (
                now -
                player.lastSeen
                >
                PRESENCE_TIMEOUT
            ) {

                onlinePlayers.delete(
                    id
                );

            }

        }

        const players =
            Array.from(
                onlinePlayers.values()
            ).map(
                player => ({

                    id:
                        player.id,

                    username:
                        player.username,

                    avatar:
                        player.avatar

                })
            );

        res.json({

            loggedIn:
                true,

            players:
                players

        });

    }
);

// ======================================================
// DERNIER PATCH DISCORD
// #patch-notes-ark
// ======================================================

let patchCache =
    null;

let patchCacheTime =
    0;

const PATCH_CACHE_DURATION =
    60 * 1000;

// ======================================================
// TROUVER LE SALON PATCH
// ======================================================

async function getPatchChannel() {

    const response =
        await fetch(
            `https://discord.com/api/v10/guilds/${DISCORD_GUILD_ID}/channels`,
            {
                headers: {

                    Authorization:
                        `Bot ${DISCORD_BOT_TOKEN}`,

                    "User-Agent":
                        "ALPHARK-API/2.0"

                }
            }
        );

    if (!response.ok) {

        throw new Error(
            `Discord channels error: ${response.status}`
        );

    }

    const channels =
        await response.json();

    return channels.find(
        channel =>

            channel.name ===
            PATCH_CHANNEL_NAME &&

            channel.type === 0
    );

}

// ======================================================
// API DERNIER PATCH
// ======================================================

app.get(
    "/api/latest-patch",
    async (req, res) => {

        try {

            // --------------------------------------------------
            // CACHE 60 SECONDES
            // --------------------------------------------------

            if (
                patchCache &&
                Date.now() -
                patchCacheTime
                <
                PATCH_CACHE_DURATION
            ) {

                return res.json(
                    patchCache
                );

            }

            // --------------------------------------------------
            // RECHERCHE DU SALON
            // --------------------------------------------------

            const channel =
                await getPatchChannel();

            if (!channel) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Salon #patch-notes-ark introuvable."

                });

            }

            console.log(
                `🛠️ Salon patch trouvé : ${channel.id}`
            );

            // --------------------------------------------------
            // RÉCUPÉRATION DES 20 DERNIERS MESSAGES
            // --------------------------------------------------

            const response =
                await fetch(
                    `https://discord.com/api/v10/channels/${channel.id}/messages?limit=20`,
                    {
                        headers: {

                            Authorization:
                                `Bot ${DISCORD_BOT_TOKEN}`,

                            "User-Agent":
                                "ALPHARK-API/2.0"

                        }
                    }
                );

            if (!response.ok) {

                throw new Error(
                    `Discord messages error: ${response.status}`
                );

            }

            const messages =
                await response.json();

            if (
                !Array.isArray(messages) ||
                messages.length === 0
            ) {

                return res.json({

                    success:
                        true,

                    patch:
                        null

                });

            }

            // --------------------------------------------------
            // PREMIER MESSAGE AVEC CONTENU
            // --------------------------------------------------

            const message =
                messages.find(
                    msg => {

                        const embed =
                            msg.embeds?.[0];

                        return (

                            msg.content?.trim() ||

                            embed?.title ||

                            embed?.description

                        );

                    }
                );

            if (!message) {

                return res.json({

                    success:
                        true,

                    patch:
                        null

                });

            }

            // --------------------------------------------------
            // EMBED
            // --------------------------------------------------

            const embed =
                message.embeds?.[0] || {};

            // --------------------------------------------------
            // TITRE
            // --------------------------------------------------

            const title =
                embed.title ||
                message.content
                    ?.split("\n")[0] ||
                "Nouveau patch ARK";

            // --------------------------------------------------
            // DESCRIPTION
            // --------------------------------------------------

            const description =
                (
                    embed.description ||
                    message.content ||
                    ""
                ).trim();

            // --------------------------------------------------
            // IMAGE
            // --------------------------------------------------

            let image =
                null;

            if (
                embed.image?.url
            ) {

                image =
                    embed.image.url;

            }
            else if (
                embed.thumbnail?.url
            ) {

                image =
                    embed.thumbnail.url;

            }

            // --------------------------------------------------
            // LIEN DISCORD
            // --------------------------------------------------

            const url =
                embed.url ||
                `https://discord.com/channels/${DISCORD_GUILD_ID}/${channel.id}/${message.id}`;

            // --------------------------------------------------
            // DATE
            // --------------------------------------------------

            const date =
                message.timestamp
                    ? new Date(
                        message.timestamp
                    ).toISOString()
                    : new Date().toISOString();

            // --------------------------------------------------
            // RÉSULTAT
            // --------------------------------------------------

            const result = {

                success:
                    true,

                patch: {

                    id:
                        message.id,

                    title:
                        title,

                    description:
                        description,

                    image:
                        image,

                    url:
                        url,

                    date:
                        date,

                    channel:
                        PATCH_CHANNEL_NAME

                }

            };

            // --------------------------------------------------
            // CACHE
            // --------------------------------------------------

            patchCache =
                result;

            patchCacheTime =
                Date.now();

            console.log(
                `✅ Dernier patch récupéré : ${title}`
            );

            res.json(
                result
            );

        }
        catch (error) {

            console.error(
                "❌ Erreur récupération dernier patch :",
                error
            );

            res.status(500).json({

                success:
                    false,

                error:
                    "Impossible de récupérer le dernier patch Discord."

            });

        }

    }
);

// ======================================================
// DÉCONNEXION
// ======================================================

app.get(
    "/auth/logout",
    (req, res) => {

        const userId =
            req.session.user?.id;

        if (userId) {

            onlinePlayers.delete(
                userId
            );

        }

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

// ======================================================
// DÉMARRAGE API
// ======================================================

app.listen(
    PORT,
    () => {

        console.log(
            "=========================================="
        );

        console.log(
            "🚀 API ALPHARK DÉMARRÉE"
        );

        console.log(
            `🌐 Port : ${PORT}`
        );

        console.log(
            `🏠 Guild : ${DISCORD_GUILD_ID}`
        );

        console.log(
            `🛠️ Patch : #${PATCH_CHANNEL_NAME}`
        );

        console.log(
            "=========================================="
        );

    }
);
